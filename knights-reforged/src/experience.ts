import {type Database,type Sql,transaction} from './db.js';
import {experienceRules,type AchievementMetric} from './experience-rules.js';
import {alpha} from './alpha-rules.js';
import {GameError} from './errors.js';

export async function experienceMetrics(sql:Sql,id:string){
 const row=(await sql.query(`SELECT c.attained_level AS level,
 (SELECT count(*)::int FROM battles WHERE (attacker_id=c.id AND outcome='attacker_win') OR (defender_id=c.id AND outcome='defender_win')) AS wins,
 (SELECT count(*)::int FROM bounty_kills WHERE claimant_id=c.id) AS bounties,
 (SELECT COALESCE(sum(completions),0)::int FROM character_quest_progress WHERE character_id=c.id) AS quests,
 (SELECT COALESCE(sum(original_quantity),0)::int FROM land_holdings WHERE character_id=c.id) AS "landPurchased",
 (SELECT COALESCE(sum(quantity),0)::int FROM land_holdings WHERE character_id=c.id) AS "landOwned",
 (SELECT COALESCE(sum(quantity*(hourly_income-hourly_upkeep)),0)::bigint FROM land_holdings WHERE character_id=c.id)-COALESCE((SELECT CASE WHEN paused THEN 0 ELSE hourly_rate END FROM maintenance_accounts WHERE character_id=c.id),0) AS "netIncome",
 (SELECT COALESCE(sum(quantity),0)::int FROM army_stacks WHERE character_id=c.id)+(SELECT count(*)::int FROM army_links WHERE c.id IN(low_id,high_id) AND status='accepted') AS recruits,
 EXISTS(SELECT 1 FROM inventory_transactions WHERE character_id=c.id AND kind='buy') AS bought,
 EXISTS(SELECT 1 FROM inventory_entries WHERE character_id=c.id AND quantity>0) AS equipped,
 EXISTS(SELECT 1 FROM battles WHERE attacker_id=c.id) AS attacked,
 EXISTS(SELECT 1 FROM skill_allocations WHERE character_id=c.id) AS trained,
 EXISTS(SELECT 1 FROM development_bots WHERE character_id=c.id) AS bot
 FROM characters c WHERE c.id=$1`,[id])).rows[0];
 if(!row)throw new GameError('CHARACTER_NOT_FOUND','That warrior was not found.',404);
 return row as Record<AchievementMetric,number>&{bought:boolean;equipped:boolean;attacked:boolean;trained:boolean;bot:boolean};
}
export async function syncExperience(sql:Sql,id:string,now:Date,evidence:'retroactive'|'gameplay'='retroactive'){
 const metrics=await experienceMetrics(sql,id);const awarded:string[]=[];
 if(metrics.bot)return {awarded,metrics};
 for(const definition of experienceRules.achievements){
  if(Number(metrics[definition.metric])<definition.threshold)continue;
  const saved=await sql.query(`INSERT INTO character_achievements(character_id,achievement_id,ruleset_id,metric_at_unlock,earned_at,evidence)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING achievement_id`,[id,definition.id,experienceRules.id,String(metrics[definition.metric]),now,evidence]);
  if(saved.rows.length)awarded.push(definition.id);
 }
 const facts:Record<string,boolean>={quest:metrics.quests>0,rewards:metrics.quests>0,equipment:metrics.bought,automatic:metrics.bought&&metrics.equipped,attack:metrics.attacked,victory:metrics.wins>0,land:metrics.landPurchased>0,skills:metrics.trained};
 for(const [step,complete] of Object.entries(facts))if(complete)await sql.query('INSERT INTO tutorial_steps(character_id,step_id,completed_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,step,now]);
 await sql.query(`UPDATE player_preferences SET tutorial_status='completed',updated_at=$2 WHERE character_id=$1 AND tutorial_status='active'
  AND (SELECT count(*) FROM tutorial_steps WHERE character_id=$1)=8`,[id,now]);
 return {awarded,metrics};
}
export async function experienceView(db:Database,id:string){
 return transaction(db,async sql=>{
  await sql.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[id]);
  const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
  const {metrics}=await syncExperience(sql,id,now);
  const preferences=(await sql.query('SELECT quest_region,tutorial_status FROM player_preferences WHERE character_id=$1',[id])).rows[0];
  const awards=(await sql.query('SELECT achievement_id,earned_at,evidence FROM character_achievements WHERE character_id=$1 ORDER BY earned_at,achievement_id',[id])).rows;
  const done=new Set((await sql.query('SELECT step_id FROM tutorial_steps WHERE character_id=$1',[id])).rows.map(row=>row.step_id));
  return {rulesetId:experienceRules.id,region:preferences?.quest_region??'all',
   tutorial:{status:preferences?.tutorial_status??'not_started',completed:done.size,steps:experienceRules.tutorial.map(step=>({...step,done:done.has(step.id)}))},
   achievements:experienceRules.achievements.map(definition=>{const award=awards.find(row=>row.achievement_id===definition.id);return {...definition,progress:Math.min(definition.threshold,Math.max(0,Number(metrics[definition.metric]))),earnedAt:award?new Date(award.earned_at).toISOString():null,evidence:award?.evidence??null};})};
 });
}
export async function tutorialAction(sql:Sql,id:string,action:string,now:Date){
 if(!['start','skip'].includes(action))throw new GameError('INVALID_TUTORIAL','Choose Start or Skip.');
 await sql.query(`INSERT INTO player_preferences(character_id,tutorial_status,updated_at) VALUES($1,$2,$3)
 ON CONFLICT(character_id) DO UPDATE SET tutorial_status=CASE WHEN player_preferences.tutorial_status='completed' THEN 'completed' ELSE EXCLUDED.tutorial_status END,updated_at=$3`,[id,action==='start'?'active':'skipped',now]);
}
export function regionFilter(value:unknown){return typeof value==='string'&&(value==='all'||value==='nearby'||alpha.content!.areas.some(area=>area.id===value))?value:null;}
export async function rememberRegion(sql:Sql,id:string,region:string){
 await sql.query(`INSERT INTO player_preferences(character_id,quest_region) VALUES($1,$2) ON CONFLICT(character_id)
 DO UPDATE SET quest_region=$2,updated_at=clock_timestamp() WHERE player_preferences.quest_region IS DISTINCT FROM $2`,[id,region]);
}
export function levelCelebration(before:number,after:number,points:number){
 if(after<=before)return null;
 return {before,level:after,points:Math.max(0,points),equipment:alpha.items.filter(item=>item.level>before&&item.level<=after).map(item=>item.name),
 quests:alpha.quests.filter(item=>item.level>before&&item.level<=after).map(item=>item.name),land:alpha.properties.filter(item=>item.level>before&&item.level<=after).map(item=>item.name)};
}
