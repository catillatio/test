import {type Sql} from './db.js';
import {GameError} from './errors.js';
import {community} from './community-rules.js';
export type FeedCategory='all'|'battles'|'comments'|'broadcasts';
export const feedCategories=['all','battles','comments','broadcasts'] as const;
export function feedCategory(value:unknown):FeedCategory{return typeof value==='string'&&feedCategories.includes(value as FeedCategory)?value as FeedCategory:'all';}
function cursorParts(value:unknown):[string|null,string|null]{
  if(value===undefined)return [null,null];
  if(typeof value!=='string')throw new GameError('INVALID_CURSOR','Invalid activity page.');
  const [at,id,...extra]=value.split('~');
  if(extra.length||!at||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(at)||!Number.isFinite(Date.parse(at))||!id||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw new GameError('INVALID_CURSOR','Invalid activity page.');
  return [at,id];
}
export interface FeedEntry {id:string;kind:'battle'|'comment'|'broadcast'|'bounty'|'army';createdAt:string;cursor:string;data:Record<string,any>;}
export async function activityFeed(sql:Sql,viewerId:string,category:FeedCategory,cursor?:unknown,profileId?:string){
  const [after,afterId]=cursorParts(cursor);
  const queries:string[]=[];
  if(category==='all'||category==='battles')queries.push(`SELECT b.id,b.created_at,'battle' AS kind,
    jsonb_build_object('attackerId',b.attacker_id,'defenderId',b.defender_id,'attackerName',a.name,'defenderName',d.name,'outcome',b.outcome,
    'winnerId',CASE WHEN b.outcome='attacker_win' THEN b.attacker_id ELSE b.defender_id END,
    'loot',b.result->'loot','xp',b.result->'attackerXp','attackerDamage',b.result->'attackerDamage','defenderDamage',b.result->'defenderDamage') AS data
    FROM battles b JOIN characters a ON a.id=b.attacker_id JOIN characters d ON d.id=b.defender_id
    WHERE ${category==='battles'?'b.attacker_id=$1':'(b.attacker_id=$1 OR b.defender_id=$1)'}`);
  if(category==='all'||category==='comments'||category==='broadcasts')queries.push(`SELECT m.id,m.created_at,m.channel AS kind,
    jsonb_build_object('authorId',m.author_id,'authorName',a.name,'profileId',m.profile_id,'profileName',p.name,'body',m.body,
    'reported',EXISTS(SELECT 1 FROM social_reports r WHERE r.message_id=m.id AND r.reporter_id=$1)) AS data
    FROM realm_messages m JOIN characters a ON a.id=m.author_id LEFT JOIN characters p ON p.id=m.profile_id WHERE m.status='visible' AND
    ${profileId?"m.channel='comment' AND m.profile_id=$4::uuid":category==='comments'?"m.channel='comment' AND (m.profile_id=$1 OR m.author_id=$1)":category==='broadcasts'?"m.channel='broadcast'":"(m.channel='broadcast' OR m.profile_id=$1 OR m.author_id=$1)"}`);
  if(category==='all'){
    queries.push(`SELECT e.id,e.created_at,'bounty' AS kind,jsonb_build_object('event',e.kind,'amount',e.amount,'targetId',b.target_id,'targetName',t.name,
      'sponsorId',b.sponsor_id,'sponsorName',s.name,'claimantId',b.claimant_id,'battleId',CASE WHEN $1 IN (b.target_id,b.claimant_id) THEN b.battle_id ELSE NULL END) AS data
      FROM bounty_events e JOIN bounties b ON b.id=e.bounty_id JOIN characters t ON t.id=b.target_id JOIN characters s ON s.id=b.sponsor_id
      WHERE $1 IN (b.sponsor_id,b.target_id,b.claimant_id)`);
    queries.push(`SELECT e.id,e.created_at,'army' AS kind,jsonb_build_object('event',e.kind,'actorId',e.actor_id,'actorName',a.name,'targetId',e.target_id,'targetName',t.name) AS data
      FROM army_events e JOIN characters a ON a.id=e.actor_id JOIN characters t ON t.id=e.target_id WHERE $1 IN (e.actor_id,e.target_id)`);
  }
  const rows=(await sql.query(`SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM (${queries.join(' UNION ALL ')}) feed
    WHERE ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${community.social.pageSize+1}`,
    profileId?[viewerId,after,afterId,profileId]:[viewerId,after,afterId])).rows;
  const entries:FeedEntry[]=rows.slice(0,community.social.pageSize).map(row=>({id:row.id,kind:row.kind,createdAt:new Date(row.created_at).toISOString(),cursor:row.cursor_at+'~'+row.id,data:row.data}));
  return {entries,nextCursor:rows.length>community.social.pageSize?entries.at(-1)!.cursor:null};
}
export async function armyDashboard(sql:Sql,viewerId:string){
  return (await sql.query(`SELECT e.id,e.kind,e.created_at,e.actor_id,e.target_id,a.name AS actor_name,t.name AS target_name FROM army_events e
    JOIN characters a ON a.id=e.actor_id JOIN characters t ON t.id=e.target_id WHERE $1 IN (e.actor_id,e.target_id) ORDER BY e.created_at DESC,e.id DESC LIMIT 20`,[viewerId])).rows;
}
export function relativeTime(when:string|Date,serverTime:string){
  const seconds=Math.max(0,Math.floor((Date.parse(serverTime)-+new Date(when))/1000));
  if(seconds<60)return 'just now';const minutes=Math.floor(seconds/60);if(minutes<60)return minutes+' min ago';
  const hours=Math.floor(minutes/60);return hours<24?hours+' hr ago':Math.floor(hours/24)+' days ago';
}
