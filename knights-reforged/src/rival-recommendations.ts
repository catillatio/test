import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {type Database,type Sql,transaction} from './db.js';
import {GameError} from './errors.js';
import {rules,regenerate} from './rules.js';
import {alpha,selectEquipment,trainedPower,type OwnedItem} from './alpha-rules.js';
import {realmPolicy} from './realm-policy.js';
import {equipmentCatalogFor} from './expansion-content.js';
import {resolveArmy} from './compatibility-rules.js';
import {botArmy,cohortMembers} from './expansion-bot-rules.js';
import {callingPower,callingFor,recoverySeconds} from './strategy-rules.js';
import {botVictoryRewards} from './bot-combat-rules.js';
import {victoryExperience47} from './game-feel-rules.js';
import {upkeepExemptions} from './equipment-entitlements.js';
export const rivalRecommendationPolicy=Object.freeze({id:'attainable-rivals-1',pageSize:20,snapshotSeconds:600,snapshotsPerActor:3});
/** Exact current roll grid and XP functions; never predicts a guaranteed reward. */
export function scoreRival(a:{level:number;attack:number;health:number},d:{level:number;defense:number;health:number;bot:boolean;pairVictory:number;rewardedWins:number}){
 let winning=0;const v=alpha.combat.variation;
 for(let attack=-v;attack<=v;attack++)for(let defense=-v;defense<=v;defense++)if(Math.round(a.attack*(100+attack))>Math.round(d.defense*(100+defense)))winning++;
 const xp=d.bot?botVictoryRewards(0,a.level,d.level,d.pairVictory,a.attack,d.defense).xp.amount:victoryExperience47(a.level,d.level,d.rewardedWins<alpha.combat.rewardedPerTarget,a.attack,d.defense).amount;
 const available=a.health>=alpha.combat.minimumHealth&&d.health>=1;
 return {expectedNumerator:available?xp*winning:0,xp,winningRolls:winning,totalRolls:(v*2+1)**2,healthy:d.health>=1,similarity:Math.abs(a.attack-d.defense)};
}
async function population(sql:Sql,id:string,bots:boolean,recruitment:boolean){
 const actor=(await sql.query('SELECT attained_level FROM characters WHERE id=$1',[id])).rows[0];if(!actor)throw new GameError('CHARACTER_NOT_FOUND','Your warrior was not found.',404);
 const range=Math.max(2,Math.ceil(actor.attained_level*.2));
 // The full indexed legal level window, never a randomly truncated UUID block.
 return (await sql.query(`SELECT c.*,b.tier AS bot_tier,b.active AS bot_active,m.paused,
  coalesce((SELECT sum(quantity) FROM army_stacks WHERE character_id=c.id),0)::int AS units,
  (SELECT count(*)::int FROM army_links l WHERE b.character_id IS NULL AND c.id IN(l.low_id,l.high_id) AND l.status='accepted' AND (NOT EXISTS(SELECT 1 FROM development_bots x WHERE x.character_id=CASE WHEN l.low_id=c.id THEN l.high_id ELSE l.low_id END) OR ($5 AND EXISTS(SELECT 1 FROM development_bots x WHERE x.character_id=CASE WHEN l.low_id=c.id THEN l.high_id ELSE l.low_id END AND x.active)))) AS allies
  FROM characters c JOIN accounts a ON a.id=c.account_id LEFT JOIN development_bots b ON b.character_id=c.id LEFT JOIN maintenance_accounts m ON m.character_id=c.id
  WHERE c.id=$1 OR(c.id<>$1 AND (NOT a.login_disabled OR b.character_id IS NOT NULL) AND c.attained_level BETWEEN $2 AND $3 AND abs(c.attained_level-$4)<=greatest(2,ceil(c.attained_level*.2)) AND(b.character_id IS NULL OR($6 AND b.active))) ORDER BY c.id`,[id,actor.attained_level-range,actor.attained_level+range,actor.attained_level,recruitment,bots])).rows;
}
async function ranking(sql:Sql,id:string,now:Date,bots:boolean,recruitment:boolean,rotation:string){
 const world=await realmPolicy(sql),rows=await population(sql,id,bots,recruitment),ids=rows.map(r=>r.id as string),catalog=equipmentCatalogFor(world.catalogId);
 const inventoryRows=(await sql.query('SELECT id,character_id,item_definition_id,quantity FROM inventory_entries WHERE character_id=ANY($1::uuid[]) AND quantity>0',[ids])).rows;
 const inventories=new Map<string,OwnedItem[]>();
 for(const r of inventoryRows){const item=catalog.definition(r.item_definition_id);if(!item)throw new GameError('CATALOG_MISSING','A saved equipment definition is unavailable.',503);const list=inventories.get(r.character_id)??[];list.push({...item,inventoryId:r.id,quantity:r.quantity});inventories.set(r.character_id,list);}
 const cohorts=world.expanded?await cohortMembers(sql,ids):new Map<string,number>();
 // Only the reviewed, single entitled identity can have upkeep exemptions.
 for(const r of rows){const exempt=await upkeepExemptions(sql,r.id,world.expanded);if(exempt.size)for(const i of inventories.get(r.id)??[])if(exempt.has(i.id))i.maintenanceExempt=true;}
 const pairRows=(await sql.query('SELECT defender_id,victories,window_started_at FROM pvp_loot_sequences WHERE attacker_id=$1',[id])).rows;
 const humanWins=(await sql.query("SELECT defender_id,count(*)::int AS wins FROM battles WHERE attacker_id=$1 AND rewarded AND outcome='attacker_win' AND created_at>$2 GROUP BY defender_id",[id,new Date(+now-alpha.combat.rewardWindowSeconds*1000)])).rows;
 const pairs=new Map(pairRows.map(r=>[r.defender_id,r])),wins=new Map(humanWins.map(r=>[r.defender_id,r.wins]));
 const values=new Map<string,{level:number;attack:number;defense:number;health:number;army:number}>();
 for(const r of rows){const bot=r.bot_tier!==null,contingent=cohorts.get(r.id),army=bot?botArmy(r.attained_level,r.units,r.allies,r.legacy_army_floor,contingent):resolveArmy(r.attained_level,r.units,r.allies,r.legacy_army_floor,world.armyPolicy),policy=bot&&contingent===undefined?'army-legacy-1':world.armyPolicy;
  const gear=inventories.get(r.id)??[],attack=selectEquipment(gear,army.participants,'attack',!r.paused,policy),defense=selectEquipment(gear,army.participants,'defense',!r.paused,policy),calling=callingFor(r.profile_class);
  values.set(r.id,{level:r.attained_level,army:army.participants,health:regenerate(r.health,r.max_health,new Date(r.health_updated_at),now,recoverySeconds(r.profile_class,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount).value,
   attack:callingPower(trainedPower(rules.baseAttack+(r.attained_level-1)*rules.attackPerLevel+(army.participants-1)*rules.unit.attack+attack.attack,r.attack_training),calling.attackPercent),
   defense:callingPower(trainedPower(rules.baseDefense+(r.attained_level-1)*rules.defensePerLevel+(army.participants-1)*rules.unit.defense+defense.defense,r.defense_training),calling.defensePercent)});
 }
 const a=values.get(id)!;
 return rows.filter(r=>r.id!==id).map(r=>{const pair=pairs.get(r.id),victory=pair&&+new Date(pair.window_started_at)>+now-86400000?pair.victories+1:1;
  const score=scoreRival(a,{...values.get(r.id)!,bot:r.bot_tier!==null,pairVictory:victory,rewardedWins:wins.get(r.id)??0});
  return {id:r.id as string,...score,tie:createHash('sha256').update(id+'|'+rotation+'|'+r.id).digest('hex')};
 }).sort((a,b)=>Number(b.healthy)-Number(a.healthy)||b.expectedNumerator-a.expectedNumerator||a.similarity-b.similarity||a.tie.localeCompare(b.tie)||a.id.localeCompare(b.id));
}
export async function recommendedOpponents(db:Database,id:string,cursor:string|undefined,bots:boolean,recruitment:boolean,rotation:unknown){return transaction(db,async sql=>{
 if(rotation!==undefined&&!z.uuid().safeParse(rotation).success)throw new GameError('INVALID_CURSOR','Invalid rival refresh.');
 const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);let snapshot:string,offset=0;
 if(cursor!==undefined){const p=cursor.split('~');if(p.length!==3||p[0]!=='r2'||!z.uuid().safeParse(p[1]).success||!/^\d{1,9}$/.test(p[2]!))throw new GameError('INVALID_CURSOR','Invalid rival page.');snapshot=p[1]!;offset=Number(p[2]);
  if(!(await sql.query('SELECT 1 FROM rival_recommendation_snapshots s JOIN characters c ON c.id=s.actor_id WHERE s.id=$1 AND s.actor_id=$2 AND s.expires_at>$3 AND s.actor_level=c.attained_level AND s.policy_id=$4',[snapshot,id,now,rivalRecommendationPolicy.id])).rows.length)throw new GameError('INVALID_CURSOR','This rival list expired. Refresh Rivals for a new recommendation.',409);
  if(offset>0&&!(await sql.query('SELECT 1 FROM rival_recommendation_entries WHERE snapshot_id=$1 AND ordinal=$2',[snapshot,offset])).rowCount)throw new GameError('INVALID_CURSOR','Invalid rival position.');
 }else{
  const actor=(await sql.query('SELECT id,attained_level FROM characters WHERE id=$1 FOR UPDATE',[id])).rows[0]!;snapshot=randomUUID();
  await sql.query('DELETE FROM rival_recommendation_snapshots WHERE actor_id=$1 AND(expires_at<=$2 OR id IN(SELECT id FROM rival_recommendation_snapshots WHERE actor_id=$1 ORDER BY sequence DESC OFFSET 2))',[id,now]);
  const ordered=await ranking(sql,id,now,bots,recruitment,String(rotation??now.toISOString().slice(0,10)));
  await sql.query('INSERT INTO rival_recommendation_snapshots(id,actor_id,created_at,expires_at,policy_id,actor_level) VALUES($1,$2,$3,$4,$5,$6)',[snapshot,id,now,new Date(+now+600000),rivalRecommendationPolicy.id,actor.attained_level]);
  for(let i=0;i<ordered.length;i+=1000)await sql.query('INSERT INTO rival_recommendation_entries(snapshot_id,ordinal,target_id) SELECT $1,($2+ordinality)::int,id FROM unnest($3::uuid[]) WITH ORDINALITY AS a(id,ordinality)',[snapshot,i,ordered.slice(i,i+1000).map(r=>r.id)]);
 }
 const page=(await sql.query(`SELECT e.ordinal,c.id,c.name,c.attained_level,c.profile_class,c.health,c.max_health,c.health_updated_at,c.legacy_army_floor,b.tier AS bot_tier,
 coalesce((SELECT sum(quantity) FROM army_stacks WHERE character_id=c.id),0)::int AS units,
 (SELECT count(*)::int FROM army_links l WHERE b.character_id IS NULL AND c.id IN(l.low_id,l.high_id) AND l.status='accepted' AND (NOT EXISTS(SELECT 1 FROM development_bots x WHERE x.character_id=CASE WHEN l.low_id=c.id THEN l.high_id ELSE l.low_id END) OR($4 AND EXISTS(SELECT 1 FROM development_bots x WHERE x.character_id=CASE WHEN l.low_id=c.id THEN l.high_id ELSE l.low_id END AND x.active)))) AS allies FROM rival_recommendation_entries e JOIN characters c ON c.id=e.target_id JOIN accounts a ON a.id=c.account_id LEFT JOIN development_bots b ON b.character_id=c.id JOIN rival_recommendation_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE e.snapshot_id=$1 AND e.ordinal>$2 AND abs(c.attained_level-snapshot.actor_level)<=greatest(2,ceil(snapshot.actor_level*.2)) AND abs(c.attained_level-snapshot.actor_level)<=greatest(2,ceil(c.attained_level*.2)) AND(NOT a.login_disabled OR(b.active AND $3)) ORDER BY e.ordinal LIMIT 21`,[snapshot,offset,bots,recruitment])).rows;
 const world=await realmPolicy(sql),cohorts=world.expanded?await cohortMembers(sql,page.map(r=>r.id)):new Map<string,number>();
 const opponents=page.slice(0,20).map(r=>({id:r.id as string,name:r.name as string,level:r.attained_level as number,className:r.profile_class as string,units:r.units as number,armySize:(r.bot_tier!==null?botArmy(r.attained_level,r.units,r.allies,r.legacy_army_floor,cohorts.get(r.id)):resolveArmy(r.attained_level,r.units,r.allies,r.legacy_army_floor,world.armyPolicy)).participants,maxHealth:r.max_health as number,health:regenerate(r.health,r.max_health,new Date(r.health_updated_at),now,recoverySeconds(r.profile_class,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount).value,botTier:r.bot_tier as string|null,cursor:'r2~'+snapshot+'~'+r.ordinal}));
 return {opponents,nextCursor:page.length>20?opponents.at(-1)!.cursor:null};
},{mode:'repeatable-read'});}
