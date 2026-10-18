import {createHash} from 'node:crypto';
import {z} from 'zod';
import {type Database,type Sql,transaction} from './db.js';
import {moderateMessageInTransaction} from './community.js';
import {requireRailwayOperator} from './operator.js';

function exactIds(ids:string[]){
 if(ids.length!==2||new Set(ids.map(id=>id.toLowerCase())).size!==2||!ids.every(id=>z.string().uuid().safeParse(id).success))
  throw new Error('Review exactly two distinct immutable broadcast IDs. Nothing was changed.');
 return ids.map(id=>id.toLowerCase()).sort();
}
export async function listBroadcasts(sql:Sql){
 return (await sql.query(`SELECT m.id,m.author_id,c.name AS author_name,m.body,m.status,m.created_at
  FROM realm_messages m JOIN characters c ON c.id=m.author_id WHERE m.channel='broadcast' AND m.status='visible'
  ORDER BY m.created_at DESC,m.id DESC LIMIT 50`)).rows;
}
async function review(sql:Sql,ids:string[],lock=false){
 const rows=(await sql.query(`SELECT m.id,m.author_id,m.body,m.status,m.created_at FROM realm_messages m
  WHERE m.id=ANY($1::uuid[]) AND m.channel='broadcast' ORDER BY m.id${lock?' FOR UPDATE':''}`,[exactIds(ids)])).rows;
 if(rows.length!==2||rows.some(row=>row.status==='deleted'))throw new Error('Both exact records must be reviewable broadcasts. Nothing was changed.');
 const digest=createHash('sha256').update(JSON.stringify(rows.map(row=>({id:row.id,author:row.author_id,body:row.body,createdAt:new Date(row.created_at).toISOString()})))).digest('hex');
 return {records:rows,reviewSha256:digest};
}
export async function reviewBroadcasts(sql:Sql,ids:string[]){return review(sql,ids);}
export async function hideReviewedBroadcasts(db:Database,ids:string[],env:NodeJS.ProcessEnv){
 requireRailwayOperator(env);
 if(env.ALLOW_REALM_MODERATION!=='1'||env.KINGDOM_BROADCAST_CONFIRM!=='HIDE_REVIEWED_BROADCASTS'||!/^[a-f0-9]{64}$/.test(env.KINGDOM_BROADCAST_REVIEW??''))
  throw new Error('Explicit owner confirmation and the reviewed digest are required. Nothing was changed.');
 return transaction(db,async sql=>{
  const checked=await review(sql,ids,true);
  if(checked.reviewSha256!==env.KINGDOM_BROADCAST_REVIEW)throw new Error('The reviewed records changed. Review again; nothing was changed.');
  const reason='Phase 4.6 owner-reviewed broadcasts '+checked.reviewSha256;
  let hidden=0;
  for(const row of checked.records){
   if(row.status==='hidden'){
    if(!(await sql.query("SELECT 1 FROM social_moderation WHERE message_id=$1 AND action='operator_hide' AND reason=$2 LIMIT 1",[row.id,reason])).rows.length)
      throw new Error('A reviewed record was hidden by another procedure. Review moderation history first.');
    continue;
   }
   await moderateMessageInTransaction(sql,{messageId:row.id,action:'hide',operator:env.REALM_MODERATOR_LABEL??'',reason});hidden++;
  }
  return {hidden,alreadyHidden:2-hidden,ids:checked.records.map(row=>row.id),reviewSha256:checked.reviewSha256,reversible:true};
 });
}
