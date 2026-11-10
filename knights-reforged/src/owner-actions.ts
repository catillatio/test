// No HTTP route, startup hook, initialization, provisioning or release import.
import {createHash} from 'node:crypto';
import {registration} from './auth.js';
import {assertOperatorRuntime} from './owner-audit.js';
import {type Database,type Sql,transaction} from './db.js';
import {moderateMessageInTransaction} from './community.js';

export const nameTarget='af025047-1c77-437a-8d5a-dd51eba71840';
export const grayTarget='aff9d7b2-5044-4002-907a-60a9a273d375';
export const oldName='mosslikesbbc',newName='mosslikesbb';
export const grayBodySha256='c4cb23c808234a16c1c32862e0128b875635eeb3d704c764767d9fd1d2e6f5ba';
export type NameField='account_username'|'character_name';
export type OwnerOperation='name_correction'|'gray_broadcast_hide'|'gray_broadcast_restore';
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function requireThat(value:unknown):asserts value {if(!value)throw new Error('Operator target or state does not match the approved review.');}
export function canonical(value:unknown):string {
 const normalized=(v:any):any=>Array.isArray(v)?v.map(normalized):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,normalized(x)])):v;
 return JSON.stringify(normalized(value));
}
export const reviewDigest=(review:unknown)=>sha(canonical(review));
export interface TargetReview {
 operation:OwnerOperation;characterId:string;accountId:string;field:NameField|'message_status'|null;
 usernameHash:string;characterNameHash:string;
 reversesAuthorizationId?:string;messageId?:string;bodyHash?:string;createdAt?:string;status?:string;
}
interface Identity {account_id:string;character_id:string;username:string;name:string;login_disabled:boolean;bot:boolean;}
async function identity(sql:Sql,id:string,lock=false):Promise<Identity>{
 const rows=(await sql.query(`SELECT a.id AS account_id,c.id AS character_id,a.username,c.name,a.login_disabled,
 EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id=c.id) AS bot
 FROM characters c JOIN accounts a ON a.id=c.account_id WHERE c.id=$1${lock?' FOR UPDATE OF c,a':''}`,[id])).rows;
 requireThat(rows.length===1&&!rows[0]!.bot&&!rows[0]!.login_disabled);return rows[0] as Identity;
}
function base(i:Identity,operation:OwnerOperation,field:TargetReview['field']):TargetReview {
 return {operation,characterId:i.character_id,accountId:i.account_id,field,usernameHash:sha(i.username),characterNameHash:sha(i.name)};
}
async function available(sql:Sql,field:NameField,id:string){
 if(field==='account_username'){
  requireThat(registration.shape.username.parse(newName)===newName);
  return !(await sql.query('SELECT 1 FROM accounts WHERE username=$1 AND id<>$2 LIMIT 1',[newName,id])).rows.length;
 }
 requireThat(registration.shape.name.parse(newName)===newName);
 // Display names normally allow duplicates. This narrow correction is more
 // conservative: a conflicting public name requires a new owner review.
 return !(await sql.query('SELECT 1 FROM characters WHERE lower(name)=lower($1) AND id<>$2 LIMIT 1',[newName,id])).rows.length;
}
export async function inspectName(sql:Sql,selected?:NameField){
 const i=await identity(sql,nameTarget),matches:NameField[]=[];
 if(i.username===oldName)matches.push('account_username');if(i.name===oldName)matches.push('character_name');
 requireThat(matches.length>0&&(!selected||matches.includes(selected)));
 const field=selected??(matches.length===1?matches[0]!:null);
 const free=field?await available(sql,field,field==='account_username'?i.account_id:i.character_id):false;
 return {review:base(i,'name_correction',field),details:{playerId:i.character_id,accountId:i.account_id,username:i.username,characterName:i.name,
  matchingFields:matches,selectedField:field,replacement:newName,replacementAvailable:free,applyEligible:!!field&&free,
  note:field===null?'Both fields match. Review again with one explicit field; both will never change together.':field==='account_username'?'Only the login handle changes; the password and existing sessions remain.':'Only the public character name changes; the login handle remains.'}};
}
export async function inspectGray(sql:Sql,messageId?:string){
 if(messageId)requireThat(uuid.test(messageId));
 const i=await identity(sql,grayTarget);
 const rows=(await sql.query(`SELECT id,author_id,channel,body,status,
 to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
 FROM realm_messages WHERE author_id=$1 AND channel='broadcast'${messageId?' AND id=$2':''}
 ORDER BY created_at DESC,id DESC LIMIT 51`,messageId?[grayTarget,messageId]:[grayTarget])).rows;
 requireThat(rows.length<=50); // Never claim uniqueness from a truncated page.
 const matches=rows.filter(r=>sha(r.body)===grayBodySha256);requireThat(matches.length===1);
 const m=matches[0]!;
 const review={...base(i,'gray_broadcast_hide','message_status'),messageId:m.id,bodyHash:sha(m.body),createdAt:m.created_at,status:m.status};
 return {review,details:{playerId:i.character_id,accountId:i.account_id,authorName:i.name,messageId:m.id,body:m.body,
  createdAt:m.created_at,status:m.status,applyEligible:m.status==='visible',reversible:true}};
}
// Restore is a new reviewed authorization linked to this tool's immutable hide
// receipt. Author-deleted or subsequently re-moderated messages cannot restore.
async function assertGrayRestore(sql:Sql,review:TargetReview){
 requireThat(uuid.test(review.reversesAuthorizationId??''));
 const parent=(await sql.query("SELECT * FROM owner_operator_actions WHERE authorization_id=$1 AND operation='gray_broadcast_hide'",[review.reversesAuthorizationId])).rows[0];
 requireThat(parent&&parent.character_id===grayTarget&&parent.message_id===review.messageId&&parent.account_id===review.accountId&&parent.after_state.bodyHash===review.bodyHash&&parent.after_state.createdAt===review.createdAt);
 const last=(await sql.query('SELECT id,action FROM social_moderation WHERE message_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[review.messageId])).rows[0];
 requireThat(last&&last.id===parent.after_state.socialModerationId&&last.action==='operator_hide');
 return parent;
}
export async function inspectGrayRestore(sql:Sql,messageId:string,hideAuthorizationId:string){
 const r=await inspectGray(sql,messageId);
 requireThat(r.review.status==='hidden');
 const review={...r.review,operation:'gray_broadcast_restore' as const,reversesAuthorizationId:hideAuthorizationId};
 await assertGrayRestore(sql,review);
 return {review,details:{...r.details,applyEligible:true,reversesAuthorizationId:hideAuthorizationId,note:'This restores the exact offensive message to public visibility. Separate explicit owner approval is required.'}};
}
export async function readOnlyReview<T>(db:Database,work:(sql:Sql)=>Promise<T>){
 const sql=await db.connect();try{
  await sql.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await sql.query("SET LOCAL statement_timeout='10s'");const result=await work(sql);await sql.query('COMMIT');return result;
 }catch(error){await sql.query('ROLLBACK').catch(()=>{});throw error;}finally{sql.release();}
}
export interface ReviewAuthorization {id:string;sourceSha:string;projectId:string;environmentId:string;operatorServiceId:string;sourceHost:string;sourceDatabase:string;createdAt:string;expiresAt:string;operator:string;}
export type ApprovedTargetReview=TargetReview&{authorization:ReviewAuthorization};
export interface OwnerAuthorization {id:string;review:ApprovedTargetReview;digest:string;operator:string;sourceSha:string;runId:string;runAttempt:number;}
export async function applyOwnerAction(db:Database,approval:OwnerAuthorization){
 requireThat(uuid.test(approval.id)&&approval.digest===reviewDigest(approval.review)&&/^[a-f0-9]{40}$/.test(approval.sourceSha)&&/^[0-9]{1,20}$/.test(approval.runId)&&Number.isSafeInteger(approval.runAttempt)&&approval.runAttempt>0&&approval.operator==='catillatio');
 const review=approval.review;
 requireThat(review.authorization?.id===approval.id&&review.authorization.sourceSha===approval.sourceSha&&review.authorization.operator===approval.operator);
 requireThat(Date.parse(review.authorization.createdAt)<=Date.now()+60000&&Date.parse(review.authorization.expiresAt)>Date.now()&&Date.parse(review.authorization.expiresAt)>Date.parse(review.authorization.createdAt)&&Date.parse(review.authorization.expiresAt)-Date.parse(review.authorization.createdAt)<=86400000);
 requireThat((review.operation==='name_correction'&&review.characterId===nameTarget&&['account_username','character_name'].includes(review.field??''))||
  (['gray_broadcast_hide','gray_broadcast_restore'].includes(review.operation)&&review.characterId===grayTarget&&review.field==='message_status'&&uuid.test(review.messageId??'')&&review.bodyHash===grayBodySha256&&review.status===(review.operation==='gray_broadcast_restore'?'hidden':'visible')));
 return transaction(db,async sql=>{
  await sql.query("SET LOCAL statement_timeout='15s'");await sql.query("SET LOCAL lock_timeout='5s'");
  await assertOperatorRuntime(sql);
  await sql.query('SELECT pg_advisory_xact_lock(61824900,hashtext($1))',[approval.id]);
  const i=await identity(sql,review.characterId,true);requireThat(i.account_id===review.accountId);
  const existing=(await sql.query('SELECT * FROM owner_operator_actions WHERE authorization_id=$1',[approval.id])).rows[0];
  let message:Record<string,any>|undefined;
  if(review.operation.startsWith('gray_broadcast_')){
   message=(await sql.query(`SELECT id,author_id,channel,body,status,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
    FROM realm_messages WHERE id=$1 FOR UPDATE`,[review.messageId])).rows[0];
   requireThat(message&&message.author_id===grayTarget&&message.channel==='broadcast'&&sha(message.body)===review.bodyHash&&message.created_at===review.createdAt);
  }
  if(existing){
   requireThat(existing.review_sha256===approval.digest&&existing.operation===review.operation&&existing.character_id===review.characterId&&existing.account_id===review.accountId);
   if(review.operation==='name_correction')requireThat(i.username===existing.after_state.username&&i.name===existing.after_state.characterName);
   else requireThat(message?.status===(review.operation==='gray_broadcast_restore'?'visible':'hidden'));
   return {applied:false,alreadyApplied:true,authorizationId:approval.id,reviewSha256:approval.digest,verification:await verifyOwnerAction(sql,review)};
  }
  requireThat(sha(i.username)===review.usernameHash&&sha(i.name)===review.characterNameHash);
  let before:Record<string,unknown>,after:Record<string,unknown>;
  if(review.operation==='name_correction'){
   const field=review.field as NameField;
   requireThat((field==='account_username'?i.username:i.name)===oldName);
   requireThat(await available(sql,field,field==='account_username'?i.account_id:i.character_id));
   before={username:i.username,characterName:i.name};
   // Identifier selection is from this fixed branch, never a caller SQL name.
   const changed=field==='account_username'?await sql.query('UPDATE accounts SET username=$2 WHERE id=$1 AND username=$3 RETURNING id',[i.account_id,newName,oldName]):
    await sql.query('UPDATE characters SET name=$2 WHERE id=$1 AND name=$3 RETURNING id',[i.character_id,newName,oldName]);
   requireThat(changed.rows.length===1);
   after={username:field==='account_username'?newName:i.username,characterName:field==='character_name'?newName:i.name};
  }else{
   const restoring=review.operation==='gray_broadcast_restore';
   requireThat(message?.status===(restoring?'hidden':'visible'));
   if(restoring)await assertGrayRestore(sql,review);
   before={messageId:review.messageId,status:message.status,bodyHash:review.bodyHash,createdAt:review.createdAt};
   const reason='Owner-approved Gray '+(restoring?'restore ':'hide ')+approval.id;
   await moderateMessageInTransaction(sql,{messageId:review.messageId,action:restoring?'restore':'hide',operator:approval.operator,reason});
   const audit=(await sql.query("SELECT id FROM social_moderation WHERE message_id=$1 AND action=$3 AND reason=$2",[review.messageId,reason,restoring?'operator_restore':'operator_hide'])).rows;
   requireThat(audit.length===1);after={...before,status:restoring?'visible':'hidden',socialModerationId:audit[0]!.id};
  }
  await sql.query(`INSERT INTO owner_operator_actions(authorization_id,operation,review_sha256,character_id,account_id,message_id,field,before_state,after_state,operator_label,source_sha,github_run_id,github_run_attempt,reverses_authorization_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[approval.id,review.operation,approval.digest,i.character_id,i.account_id,review.messageId??null,review.field,before,after,approval.operator,approval.sourceSha,approval.runId,approval.runAttempt,review.reversesAuthorizationId??null]);
  const verification=await verifyOwnerAction(sql,review);
  return {applied:true,alreadyApplied:false,authorizationId:approval.id,reviewSha256:approval.digest,verification};
 });
}
// Read-only follow-up, including a lost-report/expired-approval investigation.
// It cannot reapply or reverse anything and does not call normal player reads.
export async function verifyOwnerAction(sql:Sql,review:ApprovedTargetReview){
 requireThat(uuid.test(review.authorization?.id??''));
 const audit=(await sql.query('SELECT * FROM owner_operator_actions WHERE authorization_id=$1',[review.authorization.id])).rows[0];
 requireThat(audit&&audit.review_sha256===reviewDigest(review)&&audit.operation===review.operation&&audit.character_id===review.characterId&&audit.account_id===review.accountId);
 const i=await identity(sql,review.characterId);requireThat(i.account_id===review.accountId);
 if(review.operation==='name_correction')requireThat(i.username===audit.after_state.username&&i.name===audit.after_state.characterName);
 else{
  requireThat(review.characterId===grayTarget&&review.bodyHash===grayBodySha256);
  const message=(await sql.query(`SELECT author_id,channel,body,status,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at FROM realm_messages WHERE id=$1`,[review.messageId])).rows[0];
  requireThat(message&&message.author_id===grayTarget&&message.channel==='broadcast'&&sha(message.body)===review.bodyHash&&message.created_at===review.createdAt&&message.status===(review.operation==='gray_broadcast_restore'?'visible':'hidden'));
  requireThat((await sql.query("SELECT 1 FROM social_moderation WHERE id=$1 AND message_id=$2 AND action=$3",[audit.after_state.socialModerationId,review.messageId,review.operation==='gray_broadcast_restore'?'operator_restore':'operator_hide'])).rows.length===1);
 }
 return {verified:true,authorizationId:review.authorization.id,reviewSha256:reviewDigest(review),operation:review.operation,field:review.field,characterId:i.character_id,accountId:i.account_id,messageId:review.messageId??null,before:audit.before_state,after:audit.after_state,currentUsername:i.username,currentCharacterName:i.name};
}
