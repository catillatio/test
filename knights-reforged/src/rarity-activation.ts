import {randomUUID} from 'node:crypto';
import {transaction,type Database,type Sql} from './db.js';
import {expansionTarget} from './expansion-target.js';
import {definitionDigest,questRarities} from './expansion-content.js';
export interface RecoveryReference {artifactId:string;encryptedSha256:string;sha:string;candidateDigest:string;expiresAt:string;}
export function recoveryReference(proof:Record<string,any>):RecoveryReference {
 const result={artifactId:String(proof.artifactId),encryptedSha256:proof.encryptedSha256,sha:proof.sha,candidateDigest:proof.candidateDigest,expiresAt:proof.expiresAt};
 if(!/^\d+$/.test(result.artifactId)||!/^([a-f0-9]{64})$/.test(result.encryptedSha256)||!/^[a-f0-9]{40}$/.test(result.sha)||!/^[a-f0-9]{64}$/.test(result.candidateDigest)||!Number.isFinite(Date.parse(result.expiresAt)))throw new Error('Verified recovery reference required.');
 return result;
}
export interface RarityPlan {kind:'quest-rarity-authorization';id:string;target:Awaited<ReturnType<typeof expansionTarget>>;policyId:string;policyDigest:string;probabilityPpm:number;enabled:boolean;rateReviewed:boolean;equipmentReviewed:boolean;previousEventId:string|null;recovery:RecoveryReference;createdAt:string;expiresAt:string;}
export async function readRarityAuthorization(sql:Sql){
 if(!(await sql.query("SELECT to_regclass('rare_equipment_authorizations') AS installed")).rows[0]?.installed)return null;
 const row=(await sql.query('SELECT * FROM rare_equipment_authorizations ORDER BY sequence DESC LIMIT 1')).rows[0];if(!row)return null;
 const plan=row.plan as RarityPlan;
 if(row.policy_id!==questRarities.id||row.policy_digest!==definitionDigest(questRarities)||row.probability_ppm!==questRarities.proposedPpm||!plan||definitionDigest(plan)!==row.approval_digest||plan.kind!=='quest-rarity-authorization'||plan.policyId!==row.policy_id||plan.probabilityPpm!==row.probability_ppm||plan.policyDigest!==row.policy_digest||plan.enabled!==row.enabled||!plan.rateReviewed||!plan.equipmentReviewed)throw new Error('Invalid immutable rarity authorization.');
 return {id:String(row.id),enabled:row.enabled as boolean,effectiveAt:new Date(row.created_at).toISOString()};
}
export async function inspectRarity(db:Database,recovery:RecoveryReference):Promise<RarityPlan>{
 return transaction(db,async sql=>{
  if(!(await sql.query('SELECT 1 FROM realm_expansion_state')).rows.length)throw new Error('Expanded realm required.');
  const previous=(await sql.query('SELECT id FROM rare_equipment_authorizations ORDER BY sequence DESC LIMIT 1')).rows[0],now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
  return {kind:'quest-rarity-authorization',id:randomUUID(),target:await expansionTarget(sql),policyId:questRarities.id,policyDigest:definitionDigest(questRarities),probabilityPpm:questRarities.proposedPpm,enabled:false,rateReviewed:false,equipmentReviewed:false,previousEventId:previous?.id??null,recovery,createdAt:now.toISOString(),expiresAt:new Date(Math.min(+now+3600000,Date.parse(recovery.expiresAt))).toISOString()};
 },{mode:'repeatable-read-only'});
}
export async function setRarityAuthorization(db:Database,plan:RarityPlan,digest:string){
 if(digest!==definitionDigest(plan)||plan.kind!=='quest-rarity-authorization'||plan.policyId!==questRarities.id||plan.policyDigest!==definitionDigest(questRarities)||plan.probabilityPpm!==questRarities.proposedPpm||typeof plan.enabled!=='boolean'||plan.rateReviewed!==true||plan.equipmentReviewed!==true)throw new Error('Exact owner-reviewed rarity proposal required.');
 recoveryReference(plan.recovery);
 return transaction(db,async sql=>{
  if(definitionDigest(await expansionTarget(sql))!==definitionDigest(plan.target)||!(await sql.query('SELECT 1 FROM realm_expansion_state')).rows.length)throw new Error('Rarity database identity changed.');
  const replay=(await sql.query('SELECT approval_digest FROM rare_equipment_authorizations WHERE id=$1',[plan.id])).rows[0];
  if(replay){if(replay.approval_digest!==digest)throw new Error('Rarity approval conflict.');return {replayed:true,enabled:plan.enabled};}
  const previous=(await sql.query('SELECT id FROM rare_equipment_authorizations ORDER BY sequence DESC LIMIT 1')).rows[0],now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
  const created=Date.parse(plan.createdAt),expires=Date.parse(plan.expiresAt);
  if((previous?.id??null)!==plan.previousEventId||!Number.isFinite(created)||!Number.isFinite(expires)||created>+now||expires<=+now||expires-created>3600000||expires> Date.parse(plan.recovery.expiresAt))throw new Error('Rarity approval expired or state changed.');
  await sql.query(`INSERT INTO rare_equipment_authorizations(id,enabled,policy_id,policy_digest,probability_ppm,approval_digest,recovery,target,plan)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[plan.id,plan.enabled,plan.policyId,plan.policyDigest,plan.probabilityPpm,digest,plan.recovery,plan.target,plan]);
  return {replayed:false,enabled:plan.enabled};
 },{expansionLock:'exclusive'});
}
