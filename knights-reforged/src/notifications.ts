import {z} from 'zod';
import {type Database,type Sql,transaction} from './db.js';
import {GameError} from './errors.js';
import type {FeedEntry} from './feeds.js';
export type AttentionEvent={kind:'attack'|'comment'|'army_accepted';id:string};
const eventSchema=z.array(z.object({kind:z.enum(['attack','comment','army_accepted']),id:z.uuid()})).max(40);
// Every event is unique and read independently. No time watermark can swallow
// a late commit or another event with the same timestamp during acknowledgement.
const eventsSql=`SELECT b.id,'attack'::text AS kind FROM battles b
 JOIN notification_state s ON s.character_id=b.defender_id
 WHERE b.defender_id=$1 AND b.attacker_id<>$1 AND b.created_at>=s.started_at
 UNION ALL SELECT m.id,'comment'::text AS kind FROM realm_messages m
 JOIN notification_state s ON s.character_id=m.profile_id
 WHERE m.profile_id=$1 AND m.author_id<>$1 AND m.channel='comment'
 AND m.status='visible' AND m.created_at>=s.started_at
 UNION ALL SELECT e.id,'army_accepted'::text AS kind FROM army_events e
 JOIN army_attention_starts s ON s.character_id=e.target_id
 WHERE e.target_id=$1 AND e.actor_id<>$1 AND e.kind='accepted' AND e.created_at>=s.started_at
 AND NOT EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id IN(e.actor_id,e.target_id))`;
export async function notificationSummary(sql:Sql,id:string,feed:Pick<FeedEntry,'id'|'kind'|'data'>[]=[]){
 const counts=(await sql.query(`SELECT
 (SELECT count(*)::int FROM (${eventsSql}) e WHERE NOT EXISTS
 (SELECT 1 FROM notification_reads r WHERE r.character_id=$1 AND r.kind=e.kind AND r.event_id=e.id)) AS home,
 (SELECT count(*)::int FROM army_links WHERE (low_id=$1 OR high_id=$1) AND status='pending' AND inviter_id<>$1) AS army`,[id])).rows[0]!;
 const candidates=feed.filter(e=>e.kind==='battle'&&e.data.defenderId===id||e.kind==='comment'&&e.data.profileId===id&&e.data.authorId!==id||e.kind==='army'&&e.data.event==='accepted'&&e.data.targetId===id&&e.data.actorId!==id).map(e=>({id:e.id,kind:e.kind==='battle'?'attack':e.kind==='army'?'army_accepted':'comment'}));
 const events:AttentionEvent[]=candidates.length?(await sql.query(`SELECT e.kind,e.id FROM (${eventsSql}) e
 WHERE e.id=ANY($2::uuid[]) AND NOT EXISTS(SELECT 1 FROM notification_reads r WHERE r.character_id=$1 AND r.kind=e.kind AND r.event_id=e.id)`,[id,candidates.map(e=>e.id)])).rows.filter(r=>candidates.some(e=>e.id===r.id&&e.kind===r.kind)).map(r=>({kind:r.kind,id:r.id})):[];
 return {home:counts.home as number,army:counts.army as number,events};
}
export async function acknowledgeNotifications(db:Database,id:string,input:unknown){
 let value=input;if(typeof input==='string'){try{value=JSON.parse(input);}catch{throw new GameError('INVALID_ACKNOWLEDGEMENT','Choose displayed notifications to mark as read.');}}
 const parsed=eventSchema.safeParse(value);if(!parsed.success)throw new GameError('INVALID_ACKNOWLEDGEMENT','Choose displayed notifications to mark as read.');
 await transaction(db,async sql=>{
  await sql.query('SELECT character_id FROM notification_state WHERE character_id=$1 FOR UPDATE',[id]);
  for(const kind of ['attack','comment','army_accepted'] as const){const ids=parsed.data.filter(e=>e.kind===kind).map(e=>e.id);if(!ids.length)continue;
   await sql.query(`INSERT INTO notification_reads(character_id,kind,event_id)
    SELECT $1,e.kind,e.id FROM (${eventsSql}) e WHERE e.kind=$2 AND e.id=ANY($3::uuid[]) ON CONFLICT DO NOTHING`,[id,kind,ids]);
  }
 });
 return notificationSummary(db,id);
}
