import {z} from 'zod';
import {GameError} from './errors.js';
import {directedRivalry} from './competitive-records.js';
import {type Database,type Sql,transaction} from './db.js';
import {regenerate} from './rules.js';
import {alpha} from './alpha-rules.js';
import {recoverySeconds} from './strategy-rules.js';
import {attackAvailability} from './profiles.js';
import type {CharacterState} from './game.js';

export const championCategories=[
 {id:'victories',name:'Battle Victories',column:'battle_victories',unit:'victories',help:'Attacking and defending victories under the existing rules, including temporary-rival encounters. Only humans are ranked.'},
 {id:'kills',name:'Player Kills',column:'bounty_claims',unit:'kills',help:'Successful recorded bounty claims, including historical claims. Ordinary battle victories do not create kills.'},
 {id:'kd',name:'Best K/D',column:'bounty_claims',unit:'K/D',help:'Successful bounty claims made divided by successful claims against you. At least one of each is required to rank; zero deaths never produce an infinite score.'},
 {id:'bounties',name:'Bounty Hunters',column:'bounty_claims',unit:'claims',help:'Successful recorded bounty claims, including historical claims. Each completed contract counts once as a kill.'},
 {id:'wanted',name:'Most Wanted',column:'amount',unit:'active gold',help:'Current unexpired human-target bounty principal. Expired and settled contracts do not rank. Fees are not rewards.'},
 {id:'land',name:'Wealthiest Kingdoms',column:'land_value',unit:'gold in Land',help:'Remaining Land at actual recorded acquisition costs; no wallet or Vault disclosure.'},
 {id:'level',name:'Highest Level',column:'attained_level',unit:'level',help:'Attained level, then lifetime XP. Earned progression is never recomputed.'},
] as const;
export function championCategory(value:unknown){return championCategories.find(category=>category.id===value)??championCategories[0];}
export function formatStanding(value:string|number){const [whole,fraction]=String(value).split('.');return BigInt(whole!).toLocaleString('en')+(fraction?'.'+fraction.slice(0,2).padEnd(2,'0'):'');}
const boardCursor=z.object({category:z.string(),score:z.string().regex(/^\d{1,40}(\.\d{1,30})?$/),xp:z.string().regex(/^\d{1,20}$/),at:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),id:z.uuid()});
export async function hallOfChampions(db:Database,viewerId:string,selection?:unknown,after?:unknown){
 const category=championCategory(selection),level=category.id==='level',ratio=category.id==='kd',wanted=category.id==='wanted';
 let cursor:z.infer<typeof boardCursor>|null=null;
 if(after!==undefined){try{if(typeof after!=='string'||after.length>800||!/^[A-Za-z0-9_-]+$/.test(after))throw 0;cursor=boardCursor.parse(JSON.parse(Buffer.from(after,'base64url').toString()));if(cursor.category!==category.id||!Number.isFinite(Date.parse(cursor.at)))throw 0;}catch{throw new GameError('INVALID_CURSOR','Invalid champion page.');}}
 const metric=wanted?'b.amount':ratio?'(s.bounty_claims::numeric/NULLIF(s.bounty_deaths,0))':`s.${category.column}`;
 const from=`champion_standings s JOIN characters c ON c.id=s.character_id ${wanted?"JOIN bounties b ON b.target_id=s.character_id AND b.status='active' AND b.expires_at>transaction_timestamp()":''}`;
 const filter=`s.eligible${level?'':` AND ${metric}>0`}${ratio?' AND s.bounty_deaths>0':''}`;
 const order=`${metric} DESC,${level?'s.xp DESC,':''}s.created_at,s.character_id`;
 const ahead=`${metric}>$1::numeric OR (${metric}=$1::numeric AND (${level?'s.xp>$4::bigint OR (s.xp=$4::bigint AND ':''}(s.created_at,s.character_id)<($2::timestamptz,$3::uuid)${level?')':''}))`;
 const behind=`${metric}<$1::numeric OR (${metric}=$1::numeric AND (${level?'s.xp<$4::bigint OR (s.xp=$4::bigint AND ':''}(s.created_at,s.character_id)>($2::timestamptz,$3::uuid)${level?')':''}))`;
 const params=(r:{score:string;at:string;id:string;xp?:string})=>level?[r.score,r.at,r.id,r.xp??'0']:[r.score,r.at,r.id];
 return transaction(db,async sql=>{
  const rows=(await sql.query(`SELECT s.character_id AS id,c.name,c.attained_level AS level,${metric}::text AS score${level?',s.xp::text AS xp':''},
   to_char(s.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
   FROM ${from} WHERE ${filter}${cursor?` AND (${behind})`:''} ORDER BY ${order} LIMIT 21`,cursor?params(cursor):[])).rows;
  const mine=(await sql.query(`SELECT s.character_id AS id,${metric}::text AS score${level?',s.xp::text AS xp':''},
   to_char(s.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM ${from} WHERE s.character_id=$1 AND ${filter}`,[viewerId])).rows[0];
  const rank=async(row:Record<string,any>)=>String((await sql.query(`SELECT (count(*)+1)::text AS rank FROM ${from} WHERE ${filter} AND (${ahead})`,params(row as any))).rows[0]!.rank);
  const first=cursor&&rows[0]?Number(await rank(rows[0])):1;
  const page=rows.slice(0,20),last=page.at(-1);
  const nextCursor=rows.length>20&&last?Buffer.from(JSON.stringify({category:category.id,score:last.score,xp:last.xp??'0',at:last.at,id:last.id})).toString('base64url'):null;
  return {category,entries:page.map((row,index)=>({id:row.id as string,name:row.name as string,level:Number(row.level),score:row.score as string,xp:row.xp as string|undefined,rank:first+index,self:row.id===viewerId})),
   own:mine?{rank:await rank(mine),score:mine.score as string,xp:mine.xp as string|undefined}:null,nextCursor};
 },{mode:'repeatable-read-only'});
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
 return {...await directedRivalry(sql,viewerId,opponentId),opponentId,wins:value('wins'),losses:other('wins'),goldTaken:value('gold'),goldLost:other('gold'),bountiesClaimed:value('bounties'),bountiesLost:other('bounties'),
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
export function opponentUnavailable(id:string){return {targetId:id,name:'Unavailable warrior',unavailable:true,health:0,maxHealth:100,allowed:false,eligible:false,reason:'This opponent is no longer available for battle.'};}
