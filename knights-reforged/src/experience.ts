import {type Database,type Sql,transaction} from './db.js';
import {experienceRules,type AchievementMetric} from './experience-rules.js';
import {alpha} from './alpha-rules.js';
import {GameError} from './errors.js';
import {guideSteps} from './guide.js';

export async function experienceMetrics(sql:Sql,id:string){
 const row=(await sql.query(`SELECT c.attained_level AS level,
 (SELECT battle_victories::int FROM champion_standings WHERE character_id=c.id) AS wins,
 (SELECT bounty_claims::int FROM champion_standings WHERE character_id=c.id) AS bounties,
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
 const newSteps:string[]=[];
 for(const [step,complete] of Object.entries(facts))if(complete){const saved=await sql.query('INSERT INTO tutorial_steps(character_id,step_id,completed_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING step_id',[id,step,now]);if(saved.rows.length)newSteps.push(step);}
 const guide=(await sql.query('SELECT step_index,replaying FROM tutorial_guides WHERE character_id=$1',[id])).rows[0];
 if(guide&&!guide.replaying&&newSteps.includes(guideSteps[guide.step_index-1]!.id)){
  const done=new Set((await sql.query('SELECT step_id FROM tutorial_steps WHERE character_id=$1',[id])).rows.map(row=>row.step_id));
  let next=guide.step_index;while(next<8&&done.has(guideSteps[next-1]!.id))next++;
  await sql.query('UPDATE tutorial_guides SET step_index=$2,updated_at=$3 WHERE character_id=$1',[id,next,now]);
 }
 const complete=await sql.query(`UPDATE player_preferences SET tutorial_status='completed',updated_at=$2 WHERE character_id=$1 AND tutorial_status='active'
  AND (SELECT count(*) FROM tutorial_steps WHERE character_id=$1 AND step_id=ANY($3::text[]))=8 RETURNING character_id`,[id,now,guideSteps.map(step=>step.id)]);
 if(complete.rows.length)await sql.query(`INSERT INTO tutorial_guides(character_id,step_index,completed_at,updated_at) VALUES($1,8,$2,$2)
  ON CONFLICT(character_id) DO UPDATE SET completed_at=COALESCE(tutorial_guides.completed_at,$2),updated_at=$2`,[id,now]);
 return {awarded,metrics,tutorialCompleted:!!complete.rows.length};
}
export async function experienceView(db:Database,id:string){
 return transaction(db,async sql=>{
  await sql.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[id]);
  const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
  const {metrics}=await syncExperience(sql,id,now);
  const preferences=(await sql.query('SELECT quest_region,tutorial_status FROM player_preferences WHERE character_id=$1',[id])).rows[0];
  const awards=(await sql.query('SELECT achievement_id,earned_at,evidence FROM character_achievements WHERE character_id=$1 ORDER BY earned_at,achievement_id',[id])).rows;
  const done=new Set((await sql.query('SELECT step_id FROM tutorial_steps WHERE character_id=$1',[id])).rows.map(row=>row.step_id));
  const guide=(await sql.query('SELECT step_index,replaying,completed_at FROM tutorial_guides WHERE character_id=$1',[id])).rows[0];
  const firstMissing=Math.max(0,guideSteps.findIndex(step=>!done.has(step.id)));
  const position=guide?.step_index??firstMissing+1;
  return {rulesetId:experienceRules.id,region:preferences?.quest_region??'all',
   tutorial:{status:preferences?.tutorial_status??'not_started',completed:guideSteps.filter(step=>done.has(step.id)).length,position,replaying:guide?.replaying??false,completedAt:guide?.completed_at?new Date(guide.completed_at).toISOString():null,
    steps:guideSteps.map(step=>({...step,done:done.has(step.id)}))},
   achievements:experienceRules.achievements.map(definition=>{const award=awards.find(row=>row.achievement_id===definition.id);return {...definition,progress:Math.min(definition.threshold,Math.max(0,Number(metrics[definition.metric]))),earnedAt:award?new Date(award.earned_at).toISOString():null,evidence:award?.evidence??null};})};
 });
}
export async function tutorialAction(sql:Sql,id:string,action:string,now:Date){
 if(!['start','resume','skip','next','back','finish','replay'].includes(action))throw new GameError('INVALID_TUTORIAL','Choose an action from the tutorial.');
 const preferences=(await sql.query('SELECT tutorial_status FROM player_preferences WHERE character_id=$1',[id])).rows[0];
 const status=preferences?.tutorial_status??'not_started';
 const done=new Set((await sql.query('SELECT step_id FROM tutorial_steps WHERE character_id=$1',[id])).rows.map(row=>row.step_id));
 const first=Math.max(0,guideSteps.findIndex(step=>!done.has(step.id)))+1;
 const guide=(await sql.query('SELECT step_index,replaying FROM tutorial_guides WHERE character_id=$1',[id])).rows[0];
 const position=guide?.step_index??first;
 if(['next','back','finish'].includes(action)&&status!=='active'&&!guide?.replaying)throw new GameError('TUTORIAL_NOT_ACTIVE','Start or resume the tutorial first.',409);
 if(action==='finish'&&position!==8)throw new GameError('TUTORIAL_NOT_FINISHED','Read the final step before finishing the guide.',409);
 const replaying=action==='replay'||(!!guide?.replaying&&!['skip','finish'].includes(action));
 const nextPosition=action==='replay'?1:action==='next'?Math.min(8,position+1):action==='back'?Math.max(1,position-1):position;
 await sql.query(`INSERT INTO tutorial_guides(character_id,step_index,replaying,completed_at,updated_at) VALUES($1,$2,$3,$4,$5)
  ON CONFLICT(character_id) DO UPDATE SET step_index=$2,replaying=$3,completed_at=COALESCE(tutorial_guides.completed_at,$4),updated_at=$5`,[id,nextPosition,replaying,action==='finish'?now:null,now]);
 const nextStatus=status==='completed'?'completed':action==='finish'?'completed':action==='skip'?'skipped':'active';
 await sql.query(`INSERT INTO player_preferences(character_id,tutorial_status,updated_at) VALUES($1,$2,$3)
 ON CONFLICT(character_id) DO UPDATE SET tutorial_status=CASE WHEN player_preferences.tutorial_status='completed' THEN 'completed' ELSE EXCLUDED.tutorial_status END,updated_at=$3`,[id,nextStatus,now]);
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
