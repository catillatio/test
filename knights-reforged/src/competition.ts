import {type Database,type Sql,transaction} from './db.js';
import {regenerate} from './rules.js';
import {alpha} from './alpha-rules.js';
import {recoverySeconds} from './strategy-rules.js';
import {attackAvailability} from './profiles.js';
import type {CharacterState} from './game.js';

export const championCategories=[
 {id:'victories',name:'Battle Victories',column:'battle_victories',unit:'victories',help:'Actual attacking and defending victories, including eligible temporary-rival encounters. Only human champions are ranked.'},
 {id:'bounties',name:'Bounty Hunters',column:'bounty_claims',unit:'claims',help:'Completed, recorded bounty claims. Ordinary wins and knockouts do not count.'},
 {id:'land',name:'Wealthiest Kingdoms',column:'land_value',unit:'gold in Land',help:'Owned plots valued at their recorded purchase costs. Sold plots, carried gold and Vault savings do not count.'},
 {id:'level',name:'Highest Level',column:'attained_level',unit:'level',help:'Attained character level, then accumulated experience. Character levels remain uncapped.'},
] as const;
export function championCategory(value:unknown){return championCategories.find(category=>category.id===value)??championCategories[0];}
export const formatStanding=(value:string|number)=>BigInt(value).toLocaleString('en');
export async function hallOfChampions(db:Database,viewerId:string,selection?:unknown){
 const category=championCategory(selection),column=category.column,level=category.id==='level';
 const filter='s.eligible'+(level?'':` AND s.${column}>0`);
 const order=`s.${column} DESC,${level?'s.xp DESC,':''}s.created_at,s.character_id`;
 return transaction(db,async sql=>{
  await sql.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const rows=(await sql.query(`SELECT s.character_id AS id,c.name,s.${column}::text AS score${level?',s.xp::text AS xp':''}
   FROM champion_standings s JOIN characters c ON c.id=s.character_id WHERE ${filter} ORDER BY ${order} LIMIT 20`)).rows;
  const mine=(await sql.query(`SELECT s.${column}::text AS score${level?',s.xp::text AS xp':''},s.created_at::text AS created_at,s.character_id
   FROM champion_standings s WHERE s.character_id=$1 AND ${filter}`,[viewerId])).rows[0];
  let ownRank:string|null=null;
  if(mine){
   const ahead=`s.${column}>$1 OR (s.${column}=$1 AND ${level?'(s.xp>$4 OR (s.xp=$4 AND ':''}(s.created_at,s.character_id)<($2::timestamptz,$3::uuid)${level?'))':''})`;
   ownRank=(await sql.query(`SELECT (count(*)+1)::text AS rank FROM champion_standings s WHERE ${filter} AND (${ahead})`,
    level?[mine.score,mine.created_at,viewerId,mine.xp]:[mine.score,mine.created_at,viewerId])).rows[0]!.rank;
  }
  return {category,entries:rows.map((row,index)=>({id:row.id as string,name:row.name as string,score:row.score as string,xp:row.xp as string|undefined,rank:index+1,self:row.id===viewerId})),
   own:mine&&ownRank?{rank:ownRank,score:mine.score as string,xp:mine.xp as string|undefined}:null};
 });
}
export async function visibleHuman(sql:Sql,id:string){
 return !!(await sql.query(`SELECT 1 FROM champion_standings WHERE character_id=$1 AND eligible`,[id])).rows.length;
}
export async function rivalryHistory(sql:Sql,viewerId:string,opponentId:string){
 viewerId=viewerId.toLowerCase();opponentId=opponentId.toLowerCase();
 if(viewerId===opponentId||!await visibleHuman(sql,opponentId)||!await visibleHuman(sql,viewerId))return null;
 const pair=[viewerId,opponentId].sort(),ownLow=pair[0]===viewerId;
 const total=(await sql.query('SELECT * FROM rivalry_totals WHERE low_id=$1 AND high_id=$2',pair)).rows[0];
 const rows=(await sql.query(`SELECT b.id,b.created_at,b.outcome,b.attacker_id,b.defender_id,a.name AS attacker_name,d.name AS defender_name,
  rivalry_recorded_gold(b.result)::text AS ordinary_gold,k.claimant_id,k.bounty_id
  FROM battles b JOIN characters a ON a.id=b.attacker_id JOIN characters d ON d.id=b.defender_id
  LEFT JOIN bounty_kills k ON k.battle_id=b.id
  WHERE LEAST(b.attacker_id,b.defender_id)=$1 AND GREATEST(b.attacker_id,b.defender_id)=$2
  ORDER BY b.created_at DESC,b.id DESC LIMIT 5`,pair)).rows;
 const value=(key:string)=>String(total?.[(ownLow?'low_':'high_')+key]??0),other=(key:string)=>String(total?.[(ownLow?'high_':'low_')+key]??0);
 return {opponentId,wins:value('wins'),losses:other('wins'),goldTaken:value('gold'),goldLost:other('gold'),bountiesClaimed:value('bounties'),bountiesLost:other('bounties'),
  unrecordedGold:String(total?.unrecorded_gold??0),
  battles:rows.map(row=>({id:row.id as string,createdAt:new Date(row.created_at).toISOString(),attackerId:row.attacker_id as string,defenderId:row.defender_id as string,
   attackerName:row.attacker_name as string,defenderName:row.defender_name as string,won:(row.outcome==='attacker_win'?row.attacker_id:row.defender_id)===viewerId,
   gold:row.ordinary_gold as string|null,claimantId:row.claimant_id as string|null,bountyId:row.bounty_id as string|null}))};
}
export async function recentHumanRivals(sql:Sql,actor:CharacterState){
 // Two indexed, bounded pair lookups, not one history query per opponent.
 const rows=(await sql.query(`WITH candidates AS (
  (SELECT r.* FROM rivalry_totals r JOIN champion_standings s ON s.character_id=r.high_id AND s.eligible
   WHERE r.low_id=$1 ORDER BY r.last_at DESC,r.last_battle_id DESC LIMIT 5)
  UNION ALL
  (SELECT r.* FROM rivalry_totals r JOIN champion_standings s ON s.character_id=r.low_id AND s.eligible
   WHERE r.high_id=$1 ORDER BY r.last_at DESC,r.last_battle_id DESC LIMIT 5)
 ) SELECT r.*,c.id,c.name,c.attained_level,c.health,c.max_health,c.health_updated_at,c.profile_class,b.outcome,b.attacker_id,b.defender_id
 FROM candidates r JOIN characters c ON c.id=CASE WHEN r.low_id=$1 THEN r.high_id ELSE r.low_id END
 JOIN battles b ON b.id=r.last_battle_id ORDER BY r.last_at DESC,r.last_battle_id DESC LIMIT 5`,[actor.id])).rows;
 return rows.map(row=>{
  const health=regenerate(row.health,row.max_health,new Date(row.health_updated_at),new Date(actor.serverTime),recoverySeconds(row.profile_class,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount).value;
  const target={id:row.id,name:row.name,level:row.attained_level,health,maxHealth:row.max_health,temporaryRival:false,botActive:false};
  return {id:row.id as string,name:row.name as string,level:row.attained_level as number,wins:String(actor.id===row.low_id?row.low_wins:row.high_wins),losses:String(actor.id===row.low_id?row.high_wins:row.low_wins),
   won:(row.outcome==='attacker_win'?row.attacker_id:row.defender_id)===actor.id,createdAt:new Date(row.last_at).toISOString(),battleId:row.last_battle_id as string,combat:attackAvailability(actor,target,false)};
 });
}
export function opponentUnavailable(id:string){return {targetId:id,name:'Unavailable warrior',health:0,maxHealth:100,allowed:false,eligible:false,reason:'This opponent is no longer available for battle.'};}
