// Synthetic fixture only; importing this module never invokes node:test or a realm.
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {realm} from './helpers.js';
import {sha256,type SignedRecord} from '../src/privacy/authorization.js';
import {constructGraveyard,graveyardCapacity} from '../src/privacy/graveyard.js';
import {graveyardWorld,graveyardDefinitionDigest,replenishmentSlots} from '../src/privacy/graveyard-roster.js';
const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({format:'pem',type:'spki'}).toString(),codeSha='a'.repeat(40),candidateDigest='b'.repeat(64);
const signed=(value:unknown):SignedRecord=>{const bytes=Buffer.from(JSON.stringify(value));return {payload:bytes.toString('base64url'),signature:sign(null,bytes,keys.privateKey).toString('base64url')};};
async function setup(){
 let now=new Date();const r=await realm({isolated:true,clock:()=>now}),actor=await r.player('Synthetic Hunter');
 const live=(await r.db.query(`SELECT current_database() AS database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex') AS cluster`)).rows[0]!;
 const scope={projectId:randomUUID(),environmentId:randomUUID(),gameServiceId:randomUUID(),database:live.database,clusterDigest:live.cluster};
 async function options(config:Partial<typeof graveyardWorld.recommended>={},operationId=randomUUID()){
  const state=await graveyardCapacity(r.db),p={protocol:'kingdom-graveyard-population-policy-v1',policyId:randomUUID(),repository:'catillatio/test',approved:true,approvedAt:new Date().toISOString(),scope,definitionDigest:graveyardDefinitionDigest(),...graveyardWorld.recommended,...config},policy=signed(p);
  return {enabled:true,publicKey,policy,codeSha,candidateDigest,permit:signed({protocol:'kingdom-graveyard-construction-v2',operationId,policyDigest:sha256(policy.payload),definitionDigest:graveyardDefinitionDigest(),catalogId:state.catalog_id,scope,codeSha,candidateDigest,targetDatabase:live.database,targetOid:live.oid,targetClusterDigest:live.cluster,expectedPopulation:state.world_count,expectedOperationCount:state.operation_count,slots:replenishmentSlots(state.occupied_slots,p.targetPopulation,p.maximumNewPerOperation),issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),externalHoldsCleared:true,restoreGuardInstalled:true,independentRecoveryVerified:true,encryptedBackupSha256:'e'.repeat(64),recoveryEvidenceSha256:'f'.repeat(64),recoveryVerifiedAt:new Date().toISOString()})};
 }
 async function populate(target=12){while((await graveyardCapacity(r.db)).world_count<target)await constructGraveyard(r.db,await options({targetPopulation:target,maximumPopulation:Math.max(12,target)}));}
 return {r,actor,scope,live,options,populate,advance:(at:Date)=>{now=at;},close:()=>r.close()};
}

export {setup,publicKey,codeSha,candidateDigest,signed};
