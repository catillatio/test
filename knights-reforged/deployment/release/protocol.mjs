import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const digest=/^[a-f0-9]{64}$/;
export const sha=/^[a-f0-9]{40}$/;
export const protocol='kingdom-release-job-v2';
export function copyName(jobId){return 'kc_'+createHash('sha256').update(jobId).digest('hex').slice(0,32)+'_restore_test';}
export function httpsOrigin(value){
 const url=new URL(value);assert.equal(url.protocol,'https:');
 assert.ok(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','Use an exact HTTPS origin.');
 return url.origin;
}
export function privateDatabase(value){
 let url;try{url=new URL(value);}catch{throw new Error('A valid Railway private database target is required.');}
 assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname.endsWith('.railway.internal')&&/^[a-z0-9.-]+$/.test(url.hostname),'Only Railway private PostgreSQL is allowed.');
 assert.ok(!url.port||url.port==='5432','Use private PostgreSQL port 5432.');
 assert.equal([...url.searchParams].length,0,'Connection overrides are not permitted for release jobs.');
 const name=decodeURIComponent(url.pathname.slice(1));assert.match(name,/^[a-zA-Z0-9_-]{1,63}$/);
 assert.ok(!name.endsWith('_restore_test'),'A restored copy cannot be the source database.');
 return {url,host:url.hostname,name};
}
export function checkRequest(request,{now=Date.now()}={}){
 assert.equal(request.protocol,protocol);assert.ok(['prepare','verify'].includes(request.mode));
 assert.match(request.jobId,/^gh_[0-9]{1,20}_[0-9]{1,5}_[a-f0-9]{32}$/);
 assert.match(request.sha,sha);assert.match(request.candidateDigest,digest);
 for(const key of ['projectId','environmentId','gameServiceId','workerServiceId'])assert.match(request[key],uuid);
 assert.notEqual(request.gameServiceId,request.workerServiceId);
 assert.equal(request.copy,copyName(request.jobId));
 assert.ok(Number.isFinite(Date.parse(request.createdAt))&&Number.isFinite(Date.parse(request.expiresAt)));
 assert.ok(Date.parse(request.createdAt)<=now+60000&&Date.parse(request.expiresAt)>now&&Date.parse(request.expiresAt)-Date.parse(request.createdAt)<=3600000,'Release job request is stale or invalid.');
 for(const key of ['sourceHost','restoreHost'])assert.match(request[key],/^[a-z0-9.-]+\.railway\.internal$/);
 assert.notEqual(request.sourceHost,request.restoreHost,'Restore testing must use a separate PostgreSQL service.');
 assert.match(request.sourceDatabase,/^[a-zA-Z0-9_-]{1,63}$/);assert.ok(!request.sourceDatabase.endsWith('_restore_test'));
 httpsOrigin(request.origin);httpsOrigin(request.backupOrigin);
 assert.match(request.backupRecipient,/^age1[a-z0-9]{58}$/);
 const keys=request.mode==='prepare'?['backupPut','backupGet','reportPut']:['reportPut'];
 for(const key of keys){
  const url=new URL(request.urls[key]);assert.equal(url.origin,request.backupOrigin);
  assert.equal(url.protocol,'https:');assert.ok(!url.username&&!url.password&&!url.hash);
  assert.equal(url.searchParams.get('X-Amz-Algorithm'),'AWS4-HMAC-SHA256');
  assert.ok(Number(url.searchParams.get('X-Amz-Expires'))>0&&Number(url.searchParams.get('X-Amz-Expires'))<=3600);
  assert.match(url.searchParams.get('X-Amz-Signature')??'',digest);
  if(key.endsWith('Put'))assert.ok((url.searchParams.get('X-Amz-SignedHeaders')??'').split(';').includes('if-none-match'),'Uploads must be conditional, never overwrite recovery data.');
 }
 return request;
}
export function checkWorkerEnvironment(env,request){
 checkRequest(request);
 assert.equal(env.NODE_ENV,'production');assert.equal(env.KINGDOM_PRIVATE_ALPHA,'1');
 assert.equal(env.KINGDOM_RELEASE_WORKER,'1','This command belongs only to the private verification service.');
 assert.equal(env.RAILWAY_PROJECT_ID,request.projectId);assert.equal(env.RAILWAY_ENVIRONMENT_ID,request.environmentId);
 assert.equal(env.RAILWAY_SERVICE_ID,request.workerServiceId);assert.match(env.RAILWAY_DEPLOYMENT_ID??'',uuid);
 assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0','TLS verification cannot be disabled.');
 for(const key of ['KINGDOM_DEV_PASSWORD','KINGDOM_ALPHA_INITIALIZE','ALLOW_DEV_PROVISIONING','RUN_MIGRATIONS'])assert.ok(!env[key],'Remove initialization and provisioning settings.');
 assert.equal(httpsOrigin(env.APP_ORIGIN),request.origin);assert.equal(httpsOrigin(env.KINGDOM_BACKUP_ORIGIN),request.backupOrigin);
 const source=privateDatabase(env.DATABASE_URL),restore=privateDatabase(env.KINGDOM_RESTORE_DATABASE_URL);
 assert.equal(source.host,request.sourceHost);assert.equal(source.name,request.sourceDatabase);assert.equal(restore.host,request.restoreHost);
 assert.notEqual(source.host,restore.host);
 return {source,restore};
}
// Exact installed append manifest only; never an arbitrary count/range.
export function checkPopulationEvidence(evidence){
 if(evidence==null)return 450;
 const manifest=JSON.parse(readFileSync(new URL('../../rulesets/level100-rivals-1/rules.json',import.meta.url),'utf8'));
 const normalized=v=>Array.isArray(v)?v.map(normalized):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort().map(([k,x])=>[k,normalized(x)])):v;
 const expected=createHash('sha256').update(JSON.stringify(normalized(manifest))).digest('hex');
 assert.equal(evidence.manifestId,'level100-rivals-1');assert.equal(evidence.manifestDigest,expected);assert.match(evidence.legacyDigest,digest);
 assert.equal(evidence.originalBots,450);assert.equal(evidence.addedBots,450);assert.equal(evidence.totalBots,900);assert.ok([0,450].includes(evidence.activeAddedBots));assert.ok(['paused','purchases-only','enabled'].includes(evidence.autonomyMode));if(evidence.activeAddedBots===0)assert.equal(evidence.autonomyMode,'paused');
 return 900;
}
export function checkJobReport(report,expected){
 assert.equal(report.protocol,protocol);assert.equal(report.passed,true);
 for(const key of ['jobId','mode','sha','candidateDigest','projectId','environmentId','gameServiceId','workerServiceId','sourceHost','sourceDatabase','restoreHost','copy'])assert.equal(report[key],expected[key],'Private job evidence does not match this release.');
 assert.match(report.workerDeploymentId??'',uuid);assert.match(report.sourceClusterDigest??'',digest);
 const expectedBots=checkPopulationEvidence(report.population);
 assert.ok(report.accounts>=expectedBots+1&&report.bots===expectedBots,'The exact populated realm was not preserved.');
 if(expected.mode==='prepare'){
  const backup=report.backup;
  assert.match(backup.sha256,digest);assert.match(backup.encryptedSha256,digest);
  assert.ok(Number.isSafeInteger(backup.bytes)&&backup.bytes>100000&&Number.isSafeInteger(backup.encryptedBytes)&&backup.encryptedBytes>100000);
  assert.equal(backup.recipient,expected.backupRecipient);assert.equal(backup.conditionalWriteVerified,true);assert.equal(backup.exportRoundTripVerified,true);
  assert.equal(report.restoredCopy.passed,true);assert.equal(report.restoredCopy.bots,expectedBots);assert.deepEqual(report.restoredCopy.population??null,report.population??null);assert.ok(report.restoredCopy.accounts>=report.accounts);
  assert.ok(report.restoredCopy.existingTablesVerified>=60);assert.equal(report.restoredCopy.migrationReplay,'unchanged');assert.equal(report.restoredCopy.liveDatabaseConnected,false);
  assert.equal(report.restoredCopy.restoredDatabase,expected.copy);assert.equal(report.restoredCopy.restoredHost,expected.restoreHost);
  assert.match(report.restoredCopy.sha256??'',digest);assert.match(report.restoreClusterDigest??'',digest);
  assert.notEqual(report.sourceClusterDigest,report.restoreClusterDigest,'Restore target must be a different PostgreSQL cluster.');
 }else{
  assert.equal(report.schemaHead,'026_living_competition.sql');assert.equal(report.active_bots,450+(report.population?.activeAddedBots??0));assert.equal(report.initialized,true);
 }
 return report;
}
