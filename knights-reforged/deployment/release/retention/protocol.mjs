import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {checkJobReport,copyName,uuid,digest,privateDatabase,httpsOrigin} from '../protocol.mjs';

export const retentionProtocol='kingdom-copy-retention-v1';
export const emergencyOids=Object.freeze(['106971','129180']);
export const retirementWorkflow='.github/workflows/recovery-copy-retention.yml';
export function checkCoordinator(value){
 assert.deepEqual(Object.keys(value??{}).sort(),['headSha','job','repository','runAttempt','runId','workflow']);
 assert.equal(value.repository,'catillatio/test');assert.equal(value.workflow,retirementWorkflow);assert.equal(value.job,'retire');
 assert.match(value.runId??'',/^[1-9][0-9]{0,19}$/);assert.ok(Number.isInteger(value.runAttempt)&&value.runAttempt>=1&&value.runAttempt<=99999);
 assert.match(value.headSha??'',/^[a-f0-9]{40}$/);return value;
}
export const copyPattern=/^kc_[a-f0-9]{32}_restore_test$/;
// PostgreSQL jsonb reorders object keys; evidence hashes must survive storage.
export const hash=value=>createHash('sha256').update(JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item)).digest('hex');
export function policy(value={}){
 const result={keep:2,minAgeHours:24,...value};
 assert.deepEqual(Object.keys(result).sort(),['keep','minAgeHours']);
 // Owner-configurable conservative limits: never less than two copies / 24h.
 assert.ok(Number.isInteger(result.keep)&&result.keep>=2&&result.keep<=100);
 assert.ok(Number.isInteger(result.minAgeHours)&&result.minAgeHours>=24&&result.minAgeHours<=8760);
 return result;
}
export function checkScope(scope){
 assert.deepEqual(Object.keys(scope).sort(),['protocol','projectId','environmentId','operatorServiceId','verificationServiceId','productionServiceId','gameServiceId','verificationWorkerServiceId','approvalKeyDigest','releaseKeyDigest','clusterDigest','sourceClusterDigest','host','sourceHost','adminDatabase','workerAdminDatabase','origin'].sort());
 assert.equal(scope.protocol,retentionProtocol);
 for(const key of ['projectId','environmentId','operatorServiceId','verificationServiceId','productionServiceId','gameServiceId','verificationWorkerServiceId'])assert.match(scope[key]??'',uuid);
 assert.equal(new Set([scope.verificationServiceId,scope.productionServiceId,scope.gameServiceId,scope.verificationWorkerServiceId]).size,4);
 assert.notEqual(scope.operatorServiceId,scope.gameServiceId);assert.notEqual(scope.operatorServiceId,scope.verificationServiceId);assert.notEqual(scope.operatorServiceId,scope.productionServiceId);
 assert.notEqual(scope.operatorServiceId,scope.verificationWorkerServiceId,'Never repurpose the verification worker as a retirement executor.');
 for(const key of ['approvalKeyDigest','releaseKeyDigest'])assert.match(scope[key]??'',digest);assert.notEqual(scope.approvalKeyDigest,scope.releaseKeyDigest);
 assert.match(scope.clusterDigest??'',digest);assert.match(scope.sourceClusterDigest??'',digest);assert.notEqual(scope.clusterDigest,scope.sourceClusterDigest);
 for(const key of ['host','sourceHost'])assert.match(scope[key]??'',/^[a-z0-9.-]+\.railway\.internal$/);
 assert.notEqual(scope.host,scope.sourceHost);
 assert.match(scope.adminDatabase??'',/^[a-zA-Z0-9_-]{1,63}$/);assert.ok(!copyPattern.test(scope.adminDatabase)&&!['template0','template1'].includes(scope.adminDatabase));
 assert.equal(scope.adminDatabase,scope.workerAdminDatabase,'Retention must use the SAME maintenance database as the release worker advisory lock.');httpsOrigin(scope.origin);
 return scope;
}
function connection(env,scope,variable,role){
 checkScope(scope);
 assert.equal(env.KINGDOM_RETENTION_ENABLED,'1');assert.equal(env.NODE_ENV,'production');
 assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 for(const key of ['DATABASE_URL','KINGDOM_RESTORE_DATABASE_URL','KINGDOM_RELEASE_SIGNING_KEY','KINGDOM_RELEASE_JOB_REQUEST','KINGDOM_ALPHA_INITIALIZE','RUN_MIGRATIONS','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGSSLMODE'])assert.ok(!env[key]);
 for(const [key,variable] of [['projectId','RAILWAY_PROJECT_ID'],['environmentId','RAILWAY_ENVIRONMENT_ID'],['operatorServiceId','RAILWAY_SERVICE_ID'],['verificationServiceId','KINGDOM_RETENTION_PG_SERVICE_ID'],['workerAdminDatabase','KINGDOM_RETENTION_WORKER_ADMIN_DATABASE']])assert.equal(env[variable],scope[key]);
 const target=privateDatabase(env[variable]);
 assert.equal(target.host,scope.host);assert.equal(target.name,scope.adminDatabase);
 assert.equal(decodeURIComponent(target.url.username),role);
 return target.url.href;
}
export function checkEnvironment(env,scope){
 assert.ok(!env.KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL&&!env.KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL);
 return connection(env,scope,'KINGDOM_RETENTION_DATABASE_URL','kc_retention_runtime');
}
export function checkAuthorizerEnvironment(env,scope){
 assert.ok(!env.KINGDOM_RETENTION_DATABASE_URL&&!env.KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL);
 return connection(env,scope,'KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL','kc_retention_authorizer');
}
export function evidenceRecord(evidence,scope){
 checkScope(scope);
 const {request,report,backupKey}=evidence;
 assert.match(request.sourceDatabase??'',/^[a-zA-Z0-9_-]{1,63}$/);assert.ok(!request.sourceDatabase.endsWith('_restore_test'));
 assert.equal(request.mode,'prepare');assert.match(request.jobId??'',/^gh_[0-9]{1,20}_[0-9]{1,5}_[a-f0-9]{32}$/);
 assert.match(request.sha??'',/^[a-f0-9]{40}$/);assert.match(request.candidateDigest??'',digest);
 assert.ok(Number.isFinite(Date.parse(request.createdAt))&&Date.parse(request.expiresAt)>Date.parse(request.createdAt));assert.equal(request.copy,copyName(request.jobId));assert.match(request.copy,copyPattern);
 for(const key of ['projectId','environmentId'])assert.equal(request[key],scope[key]);
 assert.equal(request.origin,scope.origin);assert.equal(request.gameServiceId,scope.gameServiceId);assert.equal(request.workerServiceId,scope.verificationWorkerServiceId);
 assert.equal(request.restoreHost,scope.host);assert.equal(request.sourceHost,scope.sourceHost);
 assert.equal(report.restoreClusterDigest,scope.clusterDigest);assert.equal(report.sourceClusterDigest,scope.sourceClusterDigest);
 assert.equal(backupKey,'kingdom-releases/'+request.sha+'/'+request.jobId+'/realm.dump.age');
 assert.equal(Object.hasOwn(request,'urls'),false,'Import only the independently retained public backup manifest.');
 checkJobReport(report,request);
 // A name or an operator's current OID is never original verification identity.
 // Old reports without this capture remain protected, even after manual import.
 const identity=report.verifiedCopyIdentity;
 assert.match(identity?.oid??'',/^[1-9][0-9]{0,9}$/);assert.ok(BigInt(identity.oid)<=4294967295n);
 assert.match(identity.owner??'',/^[a-zA-Z_][a-zA-Z0-9_$-]{0,62}$/);
 assert.equal(identity.maintenanceDatabase,scope.adminDatabase);assert.equal(identity.clusterDigest,scope.clusterDigest);
 return {name:request.copy,jobId:request.jobId,evidenceSha256:hash(evidence)};
}
export function checkState(state,scope,{now=Date.now()}={}){
 for(const key of Object.keys(state))assert.ok(['protocol','scope','releaseQuiescent','observedAt','currentRecoveryCopy','activeSha','pinnedCopies','pendingCopies','closedJobIds','coordinator'].includes(key));
 assert.equal(state.protocol,retentionProtocol);assert.deepEqual(state.scope,checkScope(scope));
 // This is an explicit owner attestation from current protected-release and
 // live deployment evidence, never an inference from an expired release proof.
 assert.equal(state.releaseQuiescent,true);
 assert.ok(Number.isFinite(Date.parse(state.observedAt))&&Date.parse(state.observedAt)<=now&&now-Date.parse(state.observedAt)<=300000);
 assert.match(state.currentRecoveryCopy??'',copyPattern);assert.match(state.activeSha??'',/^[a-f0-9]{40}$/);
 for(const key of ['pinnedCopies','pendingCopies','closedJobIds']){
  assert.ok(Array.isArray(state[key])&&state[key].length<=10000&&new Set(state[key]).size===state[key].length);
  for(const value of state[key])assert.match(value,key==='closedJobIds'?/^gh_[0-9]{1,20}_[0-9]{1,5}_[a-f0-9]{32}$/:copyPattern);
 }
 return state;
}
export function checkApproval(encoded,pem,plan,state,scope,{now=Date.now()}={}){
 checkState(state,scope,{now});
 assert.ok(typeof pem==='string'&&pem.trim().startsWith('-----BEGIN PUBLIC KEY-----')&&!pem.includes('PRIVATE KEY'));
 const key=createPublicKey(pem);assert.equal(key.asymmetricKeyType,'ed25519');
 assert.equal(createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex'),scope.approvalKeyDigest);
 assert.match(encoded??'',/^[A-Za-z0-9_-]{1,16000}$/);
 const envelope=JSON.parse(Buffer.from(encoded,'base64url'));
 assert.match(envelope.payload??'',/^[A-Za-z0-9_-]{1,12000}$/);assert.match(envelope.signature??'',/^[A-Za-z0-9_-]{86}$/);
 const bytes=Buffer.from(envelope.payload,'base64url');assert.ok(verify(null,bytes,key,Buffer.from(envelope.signature,'base64url')));
 const approval=JSON.parse(bytes);
 assert.equal(approval.protocol,retentionProtocol);assert.equal(approval.action,'drop-obsolete-verification-copies');
 assert.match(approval.id??'',uuid);assert.deepEqual(approval.scope,scope);
 assert.equal(approval.planSha256,hash(plan));assert.equal(approval.stateSha256,hash(state));
 assert.ok(Number.isFinite(Date.parse(approval.issuedAt))&&Date.parse(approval.issuedAt)<=now&&Date.parse(approval.expiresAt)>now);
 assert.ok(Date.parse(approval.expiresAt)-Date.parse(approval.issuedAt)<=300000&&Date.parse(approval.expiresAt)>Date.parse(approval.issuedAt));
 assert.equal(approval.releaseConcurrencyHeld,true);
 // Signed exact job binding; a boolean is never sufficient for execution.
 checkCoordinator(state.coordinator);
 return approval;
}
