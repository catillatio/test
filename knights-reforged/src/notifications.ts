import {accountSafetySchema} from './account-safety-schema.js';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {type Database,type Sql,transaction} from './db.js';
import {competitionSchema} from './competitive-records.js';
import {GameError} from './errors.js';
import type {FeedEntry} from './feeds.js';
export type AttentionEvent={kind:'attack'|'comment'|'army_accepted'|'bounty_placed'|'bounty_claimed';id:string};
const eventKinds=['attack','comment','army_accepted','bounty_placed','bounty_claimed'] as const;
const eventSchema=z.array(z.object({kind:z.enum(eventKinds),id:z.uuid()})).max(40);
// Every event is unique and read independently. No time watermark can swallow
// a late commit or another event with the same timestamp during acknowledgement.
function eventQuery(competition:boolean,safety:boolean){return `SELECT b.id,'attack'::text AS kind,b.created_at FROM battles b
 JOIN notification_state s ON s.character_id=b.defender_id
 WHERE b.defender_id=$1 AND b.attacker_id<>$1 AND b.created_at>=s.started_at
 ${competition?`AND NOT EXISTS(SELECT 1 FROM competitive_deaths d JOIN competitive_attention_starts n ON n.character_id=$1
  WHERE d.battle_id=b.id AND d.created_at>=n.started_at)`:''}
 UNION ALL SELECT m.id,'comment'::text AS kind,m.created_at FROM realm_messages m
 JOIN notification_state s ON s.character_id=m.profile_id
 WHERE m.profile_id=$1 AND m.author_id<>$1 AND m.channel='comment'
 AND m.status='visible' AND m.created_at>=s.started_at
 ${safety?`AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.character_id=$1 AND b.blocked_id=m.author_id) OR (b.character_id=m.author_id AND b.blocked_id=$1))`:""}
 UNION ALL SELECT e.id,'army_accepted'::text AS kind,e.created_at FROM army_events e
 JOIN army_attention_starts s ON s.character_id=e.target_id
 WHERE e.target_id=$1 AND e.actor_id<>$1 AND e.kind='accepted' AND e.created_at>=s.started_at
 AND NOT EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id IN(e.actor_id,e.target_id))
 ${competition?`UNION ALL SELECT e.id,'bounty_placed'::text AS kind,e.created_at FROM bounty_events e
 JOIN bounties b ON b.id=e.bounty_id JOIN competitive_attention_starts n ON n.character_id=b.target_id
 WHERE b.target_id=$1 AND b.sponsor_id<>$1 AND e.kind='placed' AND e.created_at>=n.started_at
 UNION ALL SELECT e.id,'bounty_claimed'::text AS kind,e.created_at FROM bounty_events e
 JOIN bounties b ON b.id=e.bounty_id JOIN competitive_attention_starts n ON n.character_id=$1
 WHERE (b.target_id=$1 OR b.sponsor_id=$1) AND b.claimant_id<>$1 AND e.kind='claimed' AND e.created_at>=n.started_at`:''}`;}
export async function notificationSummary(sql:Sql,id:string,feed:Pick<FeedEntry,'id'|'kind'|'data'>[]=[]){
 const eventsSql=eventQuery(await competitionSchema(sql),await accountSafetySchema(sql));
 const counts=(await sql.query(`SELECT
 (SELECT count(*)::int FROM (${eventsSql}) e WHERE NOT EXISTS
 (SELECT 1 FROM notification_reads r WHERE r.character_id=$1 AND r.kind=e.kind AND r.event_id=e.id)) AS home,
 (SELECT count(*)::int FROM army_links WHERE (low_id=$1 OR high_id=$1) AND status='pending' AND inviter_id<>$1) AS army`,[id])).rows[0]!;
 const candidates=feed.filter(e=>e.kind==='battle'&&e.data.defenderId===id||e.kind==='comment'&&e.data.profileId===id&&e.data.authorId!==id||e.kind==='army'&&e.data.event==='accepted'&&e.data.targetId===id&&e.data.actorId!==id||e.kind==='bounty'&&(e.data.event==='placed'&&e.data.targetId===id||e.data.event==='claimed'&&[e.data.targetId,e.data.sponsorId].includes(id)&&e.data.claimantId!==id)).map(e=>({id:e.id,kind:e.kind==='battle'?'attack':e.kind==='army'?'army_accepted':e.kind==='bounty'?'bounty_'+e.data.event:'comment'}));
 const events:AttentionEvent[]=candidates.length?(await sql.query(`SELECT e.kind,e.id FROM (${eventsSql}) e
 WHERE e.id=ANY($2::uuid[]) AND NOT EXISTS(SELECT 1 FROM notification_reads r WHERE r.character_id=$1 AND r.kind=e.kind AND r.event_id=e.id)`,[id,candidates.map(e=>e.id)])).rows.filter(r=>candidates.some(e=>e.id===r.id&&e.kind===r.kind)).map(r=>({kind:r.kind,id:r.id})):[];
 return {home:counts.home as number,army:counts.army as number,events};
}
export async function acknowledgeNotifications(db:Database,id:string,input:unknown){
 let value=input;if(typeof input==='string'){try{value=JSON.parse(input);}catch{throw new GameError('INVALID_ACKNOWLEDGEMENT','Choose displayed notifications to mark as read.');}}
 const parsed=eventSchema.safeParse(value);if(!parsed.success)throw new GameError('INVALID_ACKNOWLEDGEMENT','Choose displayed notifications to mark as read.');
 await transaction(db,async sql=>{
  const eventsSql=eventQuery(await competitionSchema(sql),await accountSafetySchema(sql));
  await sql.query('SELECT character_id FROM notification_state WHERE character_id=$1 FOR UPDATE',[id]);
  for(const kind of eventKinds){const ids=parsed.data.filter(e=>e.kind===kind).map(e=>e.id);if(!ids.length)continue;
   await sql.query(`INSERT INTO notification_reads(character_id,kind,event_id)
    SELECT $1,e.kind,e.id FROM (${eventsSql}) e WHERE e.kind=$2 AND e.id=ANY($3::uuid[]) ON CONFLICT DO NOTHING`,[id,kind,ids]);
  }
 });
 return notificationSummary(db,id);
}

// A fixed ID snapshot, never a watermark: a retry cannot swallow later commits.
export async function prepareReadBatch(db:Database,id:string){return transaction(db,async sql=>{
 const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now),batch=randomUUID();
 await sql.query('SELECT character_id FROM notification_state WHERE character_id=$1 FOR UPDATE',[id]);
 await sql.query('DELETE FROM notification_read_batches WHERE character_id=$1 AND (expires_at<=$2 OR id IN(SELECT id FROM notification_read_batches WHERE character_id=$1 ORDER BY sequence DESC OFFSET 2))',[id,now]);
 await sql.query(`INSERT INTO notification_read_batches(id,character_id,events,created_at,expires_at) SELECT $2,$1,coalesce(jsonb_agg(jsonb_build_object('kind',e.kind,'id',e.id)),'[]'::jsonb),$3,$4 FROM (${eventQuery(await competitionSchema(sql),await accountSafetySchema(sql))}) e WHERE NOT EXISTS(SELECT 1 FROM notification_reads r WHERE r.character_id=$1 AND r.kind=e.kind AND r.event_id=e.id)`,[id,batch,now,new Date(+now+600000)]);
 return batch;
});}
export async function applyReadBatch(db:Database,id:string,batch:unknown){
 if(!z.uuid().safeParse(batch).success)throw new GameError('INVALID_ACKNOWLEDGEMENT','Refresh the current events before marking them read.');
 await transaction(db,async sql=>{
  await sql.query('SELECT character_id FROM notification_state WHERE character_id=$1 FOR UPDATE',[id]);
  const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
  const saved=(await sql.query('SELECT * FROM notification_read_batches WHERE id=$1 AND character_id=$2 FOR UPDATE',[batch,id])).rows[0];
  if(!saved||(!saved.applied_at&&+new Date(saved.expires_at)<=+now))throw new GameError('INVALID_ACKNOWLEDGEMENT','This event snapshot expired. Refresh to review current events.',409);
  if(saved.applied_at)return;
  await sql.query(`INSERT INTO notification_reads(character_id,kind,event_id) SELECT $1,e.kind,e.id FROM (${eventQuery(await competitionSchema(sql),await accountSafetySchema(sql))}) e JOIN jsonb_to_recordset($2::jsonb) s(kind text,id uuid) ON s.kind=e.kind AND s.id=e.id ON CONFLICT DO NOTHING`,[id,JSON.stringify(saved.events)]);
  await sql.query('UPDATE notification_read_batches SET applied_at=$2 WHERE id=$1',[batch,now]);
 });return notificationSummary(db,id);
}
export async function unreadNotificationPage(db:Database,id:string,cursor?:string){
 let at:string|null=null,last:string|null=null,kind:string|null=null;
 if(cursor!==undefined){const p=cursor.split('~');if(p.length!==3||!z.iso.datetime().safeParse(p[0]).success||!z.uuid().safeParse(p[1]).success||!eventKinds.includes(p[2] as AttentionEvent['kind']))throw new GameError('INVALID_CURSOR','Refresh your unread events.');at=p[0]!;last=p[1]!;kind=p[2]!;}
 const rows=(await db.query(`SELECT e.*,to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,CASE WHEN e.kind='comment' THEN(SELECT body FROM realm_messages WHERE id=e.id) END AS message_body,CASE WHEN e.kind='attack' THEN(SELECT result FROM battles WHERE id=e.id) END AS battle_result,CASE WHEN e.kind='army_accepted' THEN(SELECT jsonb_build_object('actorName',c.name) FROM army_events a JOIN characters c ON c.id=a.actor_id WHERE a.id=e.id) WHEN e.kind IN('bounty_placed','bounty_claimed') THEN(SELECT jsonb_build_object('amount',v.amount,'targetName',c.name) FROM bounty_events v JOIN bounties b ON b.id=v.bounty_id JOIN characters c ON c.id=b.target_id WHERE v.id=e.id) END AS event_detail FROM (${eventQuery(await competitionSchema(db),await accountSafetySchema(db))}) e WHERE NOT EXISTS(SELECT 1 FROM notification_reads r WHERE r.character_id=$1 AND r.kind=e.kind AND r.event_id=e.id) AND ($2::timestamptz IS NULL OR (e.created_at,e.id,e.kind)<($2::timestamptz,$3::uuid,$4::text)) ORDER BY e.created_at DESC,e.id DESC,e.kind DESC LIMIT 21`,[id,at,last,kind])).rows;
 const entries=rows.slice(0,20).map(r=>({...r,id:r.id as string,kind:r.kind as AttentionEvent['kind'],cursor_at:r.cursor_at as string,created_at:new Date(r.created_at).toISOString()}));const end=entries.at(-1);
 return {entries,nextCursor:rows.length>20&&end?[end.cursor_at,end.id,end.kind].join('~'):null};
}
