import {generateKeyPairSync,sign,createHash,randomUUID} from 'node:crypto';
import {hash,retentionProtocol} from '../../deployment/release/retention/protocol.mjs';
import {copyName,protocol} from '../../deployment/release/protocol.mjs';
export const keys=generateKeyPairSync('ed25519');
export const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
export const scope={protocol:retentionProtocol,delivery:{protocol:'kingdom-retention-delivery-v1',authorizerServiceId:randomUUID(),journalVolumeId:randomUUID()},projectId:randomUUID(),environmentId:randomUUID(),operatorServiceId:randomUUID(),verificationServiceId:randomUUID(),productionServiceId:randomUUID(),gameServiceId:randomUUID(),verificationWorkerServiceId:randomUUID(),
 origin:'https://realm.fixture.invalid',clusterDigest:'1'.repeat(64),sourceClusterDigest:'2'.repeat(64),host:'copy.railway.internal',sourceHost:'game.railway.internal',adminDatabase:'kingdom_release_retention',workerAdminDatabase:'kingdom_release_retention',
 approvalKeyDigest:createHash('sha256').update(keys.publicKey.export({type:'spki',format:'der'})).digest('hex'),releaseKeyDigest:'0'.repeat(64)};
export const epoch=Date.parse('2026-10-23T12:00:00Z');
export function fixture(number,{now=epoch,age=48,verifiedAge=age,connections=0,owner='kc_release_copy_owner',closed=true}={}){
 const jobId='gh_'+number+'_1_'+String(number).padStart(32,'0'),name=copyName(jobId),oid=String(20000+number);
 const request={protocol,mode:'prepare',jobId,copy:name,sha:'a'.repeat(40),candidateDigest:'b'.repeat(64),projectId:scope.projectId,environmentId:scope.environmentId,gameServiceId:scope.gameServiceId,workerServiceId:scope.verificationWorkerServiceId,sourceHost:scope.sourceHost,sourceDatabase:'railway',restoreHost:scope.host,
  origin:scope.origin,backupRecipient:'age1'+'a'.repeat(58),createdAt:new Date(now-verifiedAge*3600000-60000).toISOString(),expiresAt:new Date(now-verifiedAge*3600000+1800000).toISOString()};
 const report={...request,passed:true,workerDeploymentId:randomUUID(),sourceClusterDigest:scope.sourceClusterDigest,restoreClusterDigest:scope.clusterDigest,accounts:452,bots:450,
  backup:{sha256:'c'.repeat(64),encryptedSha256:'d'.repeat(64),bytes:100001,encryptedBytes:100002,recipient:request.backupRecipient,conditionalWriteVerified:true,exportRoundTripVerified:true},
  restoredCopy:{passed:true,bots:450,accounts:452,existingTablesVerified:64,migrationReplay:'unchanged',liveDatabaseConnected:false,restoredDatabase:name,restoredHost:scope.host,sha256:'e'.repeat(64)}};
 report.verifiedCopyIdentity={oid,owner:'postgres',maintenanceDatabase:scope.adminDatabase,clusterDigest:scope.clusterDigest};
 const evidence={request,report,backupKey:'kingdom-releases/'+request.sha+'/'+jobId+'/realm.dump.age'};
 return {database:{name,oid,owner,template:false,bytes:'1048576',connections},catalog:{name,oid,owner,first_observed_at:new Date(now-age*3600000).toISOString(),verified_at:new Date(now-verifiedAge*3600000).toISOString(),evidence,evidence_sha256:hash(evidence)},jobId,closed};
}
export function scenario(copies,now=epoch){
 copies??=[fixture(1,{now}),fixture(2,{now,age:47}),fixture(3,{now,age:46}),fixture(4,{now,age:45})];
 const state={protocol:retentionProtocol,scope,observedAt:new Date(now).toISOString(),releaseQuiescent:true,coordinator:{repository:'catillatio/test',workflow:'.github/workflows/recovery-copy-retention.yml',job:'retire',runId:'999',runAttempt:1,headSha:'f'.repeat(40)},activeSha:'f'.repeat(40),currentRecoveryCopy:copies.at(-1).database.name,pinnedCopies:[],pendingCopies:[],closedJobIds:copies.filter(c=>c.closed).map(c=>c.jobId)};
 return {snapshot:{now:new Date(now).toISOString(),databases:copies.map(c=>c.database),catalog:copies.map(c=>c.catalog),pins:[]},state};
}
export function approve(plan,state,{now=epoch,...overrides}={}){
 const approval={protocol:retentionProtocol,action:'drop-obsolete-verification-copies',id:randomUUID(),scope,planSha256:hash(plan),stateSha256:hash(state),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+240000).toISOString(),releaseConcurrencyHeld:true,...overrides};
 const payload=Buffer.from(JSON.stringify(approval));return {approval,encoded:Buffer.from(JSON.stringify({payload:payload.toString('base64url'),signature:sign(null,payload,keys.privateKey).toString('base64url')})).toString('base64url')};
}
