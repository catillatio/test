import {assertAccountNotErased} from './privacy/gate.js';
import {randomUUID} from 'node:crypto';
import {type Database,transaction,type Sql} from './db.js';
import {GameError} from './errors.js';
import {community} from './community-rules.js';
import {lockCharacters} from './game.js';
export const communityPolicyVersion='community-2026-11-05-draft-1';
// A request is deliberately not represented as completed deletion or deactivation.
export async function requestAccountDeletion(db:Database,accountId:string){
 return transaction(db,async sql=>{
  await assertAccountNotErased(sql,accountId);
  if(!(await sql.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[accountId])).rowCount)
   throw new GameError('SIGN_IN_REQUIRED','Sign in to request deletion.',401);
  const existing=(await sql.query("SELECT id,requested_at,status FROM account_deletion_requests WHERE account_id=$1 AND status='pending'",[accountId])).rows[0];
  if(existing)return existing;
  return (await sql.query('INSERT INTO account_deletion_requests(id,account_id) VALUES($1,$2) RETURNING id,requested_at,status',[randomUUID(),accountId])).rows[0]!;
 });
}
export async function acceptCommunityPolicy(sql:Sql,characterId:string,version:unknown){
 if(version!==communityPolicyVersion)throw new GameError('COMMUNITY_TERMS_REQUIRED','Read and accept the current Terms and Community Guidelines before posting.',409);
 await sql.query('INSERT INTO community_policy_acceptances(character_id,policy_version) VALUES($1,$2) ON CONFLICT DO NOTHING',[characterId,communityPolicyVersion]);
}
export async function requireCommunityPolicy(sql:Sql,characterId:string){
 if(!(await sql.query('SELECT 1 FROM community_policy_acceptances WHERE character_id=$1 AND policy_version=$2',[characterId,communityPolicyVersion])).rowCount)
  throw new GameError('COMMUNITY_TERMS_REQUIRED','Read and accept the current Terms and Community Guidelines before posting.',409);
}
export async function socialSafety(db:Database,accountId:string,targetId:string,action:'block'|'unblock'|'report',reason:string){
 return transaction(db,async sql=>{
  await assertAccountNotErased(sql,accountId);
  const actor=(await sql.query('SELECT id FROM characters WHERE account_id=$1',[accountId])).rows[0]?.id;
  if(!actor)throw new GameError('SIGN_IN_REQUIRED','Sign in to manage social safety.',401);
  if(actor===targetId)throw new GameError('SELF_SOCIAL_ACTION','Choose another player.');
  const locked=await lockCharacters(sql,[actor,targetId]);
  if(!locked.some(row=>row.id===targetId&&row.account_id!==null)||(await sql.query('SELECT 1 FROM development_bots WHERE character_id=$1',[targetId])).rowCount)
   throw new GameError('PLAYER_UNAVAILABLE','Choose a human player.',404);
  if(action==='block')await sql.query('INSERT INTO social_blocks(character_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor,targetId]);
  else if(action==='unblock')await sql.query('DELETE FROM social_blocks WHERE character_id=$1 AND blocked_id=$2',[actor,targetId]);
  else {
   if(!['spam','abuse','other'].includes(reason))throw new GameError('INVALID_REPORT','Choose a report reason.');
   if((await sql.query('SELECT 1 FROM social_user_reports WHERE reporter_id=$1 AND target_id=$2',[actor,targetId])).rowCount)return;
   if(Number((await sql.query("SELECT count(*) AS n FROM social_user_reports WHERE reporter_id=$1 AND created_at>now()-interval '24 hours'",[actor])).rows[0]!.n)>=community.social.reportsPerDay)throw new GameError('REPORT_LIMIT','Your rolling 24-hour report limit has been reached.',429);
   await sql.query('INSERT INTO social_user_reports(id,reporter_id,target_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT(reporter_id,target_id) DO NOTHING',[randomUUID(),actor,targetId,reason]);
  }
 });
}
