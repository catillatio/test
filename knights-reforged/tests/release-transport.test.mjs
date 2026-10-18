import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {candidateDigest} from '../deployment/release/candidate.mjs';
import {releaseInputs,checkEnvironmentProtection} from '../deployment/release/guard.mjs';
import {checkRequest,checkWorkerEnvironment,checkJobReport,privateDatabase,copyName,protocol} from '../deployment/release/protocol.mjs';
import {signProof,verifyProof,requireReleaseProof} from '../deployment/release/proof.mjs';
import {recoveryStore} from '../deployment/release/store.mjs';
import {putFile,putReport,getFile,getReport} from '../deployment/release/transfer.mjs';

const ids=Array.from({length:6},(_,i)=>String(i+1).repeat(8)+'-'+String(i+1).repeat(4)+'-4'+String(i+1).repeat(3)+'-8'+String(i+1).repeat(3)+'-'+String(i+1).repeat(12));
const valid={GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',KINGDOM_RELEASE_ENABLED:'true',KINGDOM_RELEASE_TRANSPORT:'private-job-v2',KINGDOM_RAILWAY_AUTODEPLOY_DISABLED:'true',
 GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',RAILWAY_PROJECT_ID:ids[0],RAILWAY_ENVIRONMENT_ID:ids[1],RAILWAY_GAME_SERVICE_ID:ids[2],RAILWAY_PG_SERVICE_ID:ids[3],RAILWAY_RELEASE_WORKER_SERVICE_ID:ids[4],RAILWAY_VERIFY_PG_SERVICE_ID:ids[5],
 KINGDOM_PRODUCTION_ORIGIN:'https://realm.example',KINGDOM_DATABASE_HOST:'game-db.railway.internal',KINGDOM_DATABASE_NAME:'railway',KINGDOM_RESTORE_DATABASE_HOST:'verify-db.railway.internal'};
const grant=(method='GET')=>{const url=new URL('https://recovery.storage.example/object');for(const [key,value]of Object.entries({'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Expires':'3600','X-Amz-Signature':'b'.repeat(64),'X-Amz-SignedHeaders':method==='PUT'?'host;if-none-match':'host'}))url.searchParams.set(key,value);return url.href;};
const jobId='gh_123_1_'+'c'.repeat(32);
function request(){return {protocol,mode:'prepare',jobId,sha:valid.GITHUB_SHA,candidateDigest:'d'.repeat(64),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString(),
 projectId:ids[0],environmentId:ids[1],gameServiceId:ids[2],workerServiceId:ids[4],sourceHost:valid.KINGDOM_DATABASE_HOST,sourceDatabase:'railway',restoreHost:valid.KINGDOM_RESTORE_DATABASE_HOST,
 origin:valid.KINGDOM_PRODUCTION_ORIGIN,backupOrigin:'https://recovery.storage.example',backupRecipient:'age1'+'a'.repeat(58),copy:copyName(jobId),urls:{backupPut:grant('PUT'),backupGet:grant(),reportPut:grant('PUT')}};}
const env={NODE_ENV:'production',KINGDOM_PRIVATE_ALPHA:'1',KINGDOM_RELEASE_WORKER:'1',RAILWAY_PROJECT_ID:ids[0],RAILWAY_ENVIRONMENT_ID:ids[1],RAILWAY_SERVICE_ID:ids[4],RAILWAY_DEPLOYMENT_ID:ids[5],APP_ORIGIN:'https://realm.example',KINGDOM_BACKUP_ORIGIN:'https://recovery.storage.example',DATABASE_URL:'postgres://fixture:fixture@game-db.railway.internal/railway',KINGDOM_RESTORE_DATABASE_URL:'postgres://fixture:fixture@verify-db.railway.internal/railway'};
function report(){const r=request();return {...r,passed:true,workerDeploymentId:ids[5],sourceClusterDigest:'1'.repeat(64),restoreClusterDigest:'2'.repeat(64),accounts:452,bots:450,
 backup:{sha256:'3'.repeat(64),bytes:200000,encryptedSha256:'4'.repeat(64),encryptedBytes:200500,recipient:r.backupRecipient,conditionalWriteVerified:true,exportRoundTripVerified:true},
 restoredCopy:{passed:true,accounts:452,bots:450,existingTablesVerified:64,migrationReplay:'unchanged',liveDatabaseConnected:false,restoredDatabase:r.copy,restoredHost:r.restoreHost,sha256:'5'.repeat(64)}};}
const keys=generateKeyPairSync('ed25519'),privatePem=keys.privateKey.export({type:'pkcs8',format:'pem'}),publicPem=keys.publicKey.export({type:'spki',format:'pem'});
const gameEnv={...env,RAILWAY_SERVICE_ID:ids[2],KINGDOM_RELEASE_SHA:valid.GITHUB_SHA,KINGDOM_RESTORE_TEST_DATABASE:copyName(jobId)};delete gameEnv.KINGDOM_RELEASE_WORKER;
function proof(){return {protocol:'kingdom-release-proof-v2',repository:'catillatio/test',branch:'release/production',approvalEnvironment:'production',jobId,sha:valid.GITHUB_SHA,candidateDigest:'d'.repeat(64),projectId:ids[0],environmentId:ids[1],gameServiceId:ids[2],sourceHost:valid.KINGDOM_DATABASE_HOST,sourceDatabase:'railway',restoreHost:valid.KINGDOM_RESTORE_DATABASE_HOST,origin:'https://realm.example',copy:copyName(jobId),backupSha256:'3'.repeat(64),backupBytes:200000,encryptedSha256:'4'.repeat(64),preservationSha256:'5'.repeat(64),artifactId:'123456',independentRecoveryVerified:true,backupKeyVerified:true,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()};}

test('release setup fails closed for old transport, wrong branch, unapproved triggers, disabled setup and conflicting service/database identities',()=>{
 assert.equal(releaseInputs(valid).sha,valid.GITHUB_SHA);
 for(const changed of [{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'push'},{KINGDOM_RELEASE_ENABLED:'false'},{KINGDOM_RELEASE_TRANSPORT:undefined},{RAILWAY_RELEASE_WORKER_SERVICE_ID:ids[2]},{RAILWAY_VERIFY_PG_SERVICE_ID:ids[3]},{KINGDOM_RESTORE_DATABASE_HOST:valid.KINGDOM_DATABASE_HOST},{KINGDOM_PRODUCTION_ORIGIN:'http://realm.example'},{GITHUB_SHA:'latest'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'}])assert.throws(()=>releaseInputs({...valid,...changed}));
});
test('the single exact owner approval and production-only environment restriction remain required',()=>{
 const e={can_admins_bypass:false,deployment_branch_policy:{custom_branch_policies:true},protection_rules:[{type:'required_reviewers',reviewers:[{type:'User',reviewer:{login:'catillatio'}}]}]};
 checkEnvironmentProtection(e,'catillatio');for(const changed of [{can_admins_bypass:true},{protection_rules:[]},{deployment_branch_policy:{custom_branch_policies:false}}])assert.throws(()=>checkEnvironmentProtection({...e,...changed},'catillatio'));
 assert.throws(()=>checkEnvironmentProtection(e,'stranger'));
});
test('private database selection rejects public targets, source copies, connection overrides and aliasing the source',()=>{
 assert.equal(privateDatabase(env.DATABASE_URL).name,'railway');
 for(const url of ['postgres://fixture@localhost/railway','postgres://fixture@tcp.proxy.example/railway',env.DATABASE_URL+'?host=evil.example',env.DATABASE_URL+'_restore_test',env.DATABASE_URL.replace('/railway',':6543/railway')])assert.throws(()=>privateDatabase(url));
 assert.throws(()=>privateDatabase('credential-fixture-not-a-url'),error=>{assert.doesNotMatch(error.message,/credential-fixture/);return true;});
 assert.throws(()=>checkWorkerEnvironment({...env,KINGDOM_RESTORE_DATABASE_URL:env.DATABASE_URL},request()));
});
test('worker request requires current nonce, scoped conditional HTTPS grants and an independent restore service',()=>{
 checkRequest(request());checkWorkerEnvironment(env,request());
 for(const changed of [{mode:'initialize'},{copy:'railway'},{sha:'latest'},{expiresAt:new Date(Date.now()-1).toISOString()},{createdAt:new Date(Date.now()+120000).toISOString()},{restoreHost:valid.KINGDOM_DATABASE_HOST},{urls:{...request().urls,backupPut:grant('GET')}},{urls:{...request().urls,backupGet:grant().replace('https:','http:')}}])assert.throws(()=>checkRequest({...request(),...changed}));
 for(const changed of [{RAILWAY_SERVICE_ID:ids[2]},{KINGDOM_RELEASE_WORKER:undefined},{KINGDOM_DEV_PASSWORD:'fixture'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{KINGDOM_BACKUP_ORIGIN:'https://other.example'}])assert.throws(()=>checkWorkerEnvironment({...env,...changed},request()));
});
test('official S3 signing binds conditional uploads, exact object keys and one-hour grants without network access',async()=>{
 const store=recoveryStore({KINGDOM_BACKUP_ENDPOINT:'https://storage.example',KINGDOM_BACKUP_BUCKET:'realm-backups',KINGDOM_BACKUP_REGION:'auto',KINGDOM_BACKUP_ACCESS_KEY_ID:'fixture-only',KINGDOM_BACKUP_SECRET_ACCESS_KEY:'fixture-only'});
 try{
  const key='kingdom-releases/'+valid.GITHUB_SHA+'/'+jobId+'/realm.dump.age';
  const put=new URL(await store.grant(key,'PUT'));assert.equal(put.protocol,'https:');assert.equal(put.hostname,'realm-backups.storage.example');assert.equal(put.searchParams.get('X-Amz-SignedHeaders'),'host;if-none-match');assert.equal(put.searchParams.get('X-Amz-Expires'),'3600');
  assert.equal(new URL(await store.grant(key,'GET')).pathname,put.pathname);
  await assert.rejects(store.grant('../other.dump','PUT'));
 }finally{store.close();}
});
test('all transfer helpers reject plaintext transport before opening any file or network request',async()=>{
 await assert.rejects(putFile('http://example.invalid','missing'));await assert.rejects(putReport('http://example.invalid',{}));await assert.rejects(getFile('http://example.invalid','missing',{}));await assert.rejects(getReport('http://example.invalid'));
});
test('a successful job report requires the real exported-object round trip, exact deployment and full data preservation',async()=>{
 checkJobReport(report(),request());
 for(const changed of [{passed:false},{sha:'f'.repeat(40)},{bots:449},{accounts:0},{workerDeploymentId:'fake'},{restoreClusterDigest:'1'.repeat(64)},
  {backup:{...report().backup,conditionalWriteVerified:false}},{backup:{...report().backup,exportRoundTripVerified:false}},{backup:{...report().backup,encryptedBytes:888}},
  {restoredCopy:{...report().restoredCopy,migrationReplay:'changed'}},{restoredCopy:{...report().restoredCopy,liveDatabaseConnected:true}},
  {restoredCopy:{...report().restoredCopy,restoredHost:valid.KINGDOM_DATABASE_HOST}},{restoredCopy:{...report().restoredCopy,existingTablesVerified:2}}])assert.throws(()=>checkJobReport({...report(),...changed},request()));
 const folder=await mkdtemp(join(tmpdir(),'retained-recovery-'));
 try{
  const root=join(folder,'verified-backup');await mkdir(root);
  const bytes=Buffer.alloc(200500,47),r=request(),saved=report();r.candidateDigest=await candidateDigest();saved.candidateDigest=r.candidateDigest;
  saved.backup.encryptedSha256=createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(root,'backup-manifest.json'),JSON.stringify({request:r,report:saved}));await writeFile(join(root,'realm.dump.age'),bytes);
  const options={env:{PATH:process.env.PATH,RUNNER_TEMP:folder,GITHUB_SHA:valid.GITHUB_SHA},stdio:'pipe'};
  assert.match(String(execFileSync(process.execPath,['deployment/release/check-recovery.mjs'],options)),/matches the checked candidate/);
  bytes[0]^=255;await writeFile(join(root,'realm.dump.age'),bytes);
  assert.throws(()=>execFileSync(process.execPath,['deployment/release/check-recovery.mjs'],options));
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('post-deployment verification is aggregate read-only status, not a provisioning operation',()=>{
 const expected={...request(),mode:'verify'},r={...report(),mode:'verify',schemaHead:'020_game_feel.sql',active_bots:450,initialized:true};checkJobReport(r,expected);
 for(const changed of [{schemaHead:'019_champions_and_rivalries.sql'},{active_bots:0},{initialized:false}])assert.throws(()=>checkJobReport({...r,...changed},expected));
});
test('signed migration approval binds exact code, source, separate restored copy, recovery artifact and target service',()=>{
 const p=proof();assert.equal(verifyProof(signProof(p,privatePem),publicPem,gameEnv,p.candidateDigest).sha,p.sha);
 for(const changed of [{sha:'e'.repeat(40)},{candidateDigest:'e'.repeat(64)},{branch:'main'},{repository:'other/repo'},{gameServiceId:ids[4]},{projectId:ids[5]},{origin:'https://other.example'},{sourceHost:valid.KINGDOM_RESTORE_DATABASE_HOST},{sourceDatabase:'other'},{restoreHost:valid.KINGDOM_DATABASE_HOST},{copy:'railway'},{artifactId:''},{independentRecoveryVerified:false},{backupKeyVerified:false},{backupBytes:888},{backupSha256:'invalid'},{expiresAt:new Date(Date.now()-1).toISOString()}])assert.throws(()=>verifyProof(signProof({...p,...changed},privatePem),publicPem,gameEnv,p.candidateDigest));
 assert.throws(()=>verifyProof(signProof(p,privatePem),publicPem,{...gameEnv,KINGDOM_RELEASE_SHA:'f'.repeat(40)},p.candidateDigest));
});
test('tampering, wrong signing keys and placing the private key in Railway are rejected',()=>{
 const encoded=signProof(proof(),privatePem),envelope=JSON.parse(Buffer.from(encoded,'base64url'));
 envelope.payload=Buffer.from(JSON.stringify({...proof(),backupBytes:999999})).toString('base64url');
 assert.throws(()=>verifyProof(Buffer.from(JSON.stringify(envelope)).toString('base64url'),publicPem,gameEnv,'d'.repeat(64)));
 const wrong=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
 assert.throws(()=>verifyProof(encoded,wrong,gameEnv,'d'.repeat(64)));assert.throws(()=>verifyProof(encoded,privatePem,gameEnv,'d'.repeat(64)));
});
test('legacy manual mode is compatible, but invalid automated mode and worker role cannot bypass the signed gate',async()=>{
 assert.equal(await requireReleaseProof({}),null);await assert.rejects(requireReleaseProof({KINGDOM_AUTOMATED_RELEASES:'2'}));
 for(const file of ['deployment/start.mjs','deployment/migrate.mjs']){
  let message='';try{execFileSync(process.execPath,[file],{env:{PATH:process.env.PATH,KINGDOM_RELEASE_WORKER:'1'},stdio:'pipe'});}catch(error){message=String(error.stderr);}
  assert.match(message,/private verification job cannot/);
 }
});
test('production migration refuses absent approval before attempting a source connection',()=>{
 let message='';try{execFileSync(process.execPath,['deployment/migrate.mjs'],{env:{PATH:process.env.PATH,...gameEnv,KINGDOM_AUTOMATED_RELEASES:'1'},stdio:'pipe'});}catch(error){message=String(error.stderr);}
 assert.match(message,/No production migration was authorized/);assert.doesNotMatch(message,/getaddrinfo|ENOTFOUND|password authentication/);
});
test('workflow remains manual, serialized, environment-approved and independently retains recovery before signing promotion',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/production-release.yml',import.meta.url),'utf8');
 assert.match(workflow,/workflow_dispatch/);assert.doesNotMatch(workflow,/pull_request_target:|^  push:/m);assert.match(workflow,/environment: production/);assert.match(workflow,/cancel-in-progress: false/);assert.match(workflow,/if: inputs.promote/);assert.match(workflow,/f518230646acc7a6a7a67365e7642618f659d5d8cdd7cf8c180336140d0504eb/);
 const prepare=workflow.indexOf('run.mjs prepare'),upload=workflow.indexOf('actions/upload-artifact',prepare),download=workflow.indexOf('actions/download-artifact',upload),verify=workflow.indexOf('check-recovery.mjs',download),promote=workflow.indexOf('run.mjs promote');assert.ok(prepare<upload&&upload<download&&download<verify&&verify<promote);
 const runner=readFileSync(new URL('../deployment/release/run.mjs',import.meta.url),'utf8');
 assert.match(runner,/--skip-deploys/);assert.match(runner,/signProof/);assert.match(runner,/verified-backup/);assert.match(runner,/workerDeploymentId/);assert.doesNotMatch(workflow+runner,/RAILWAY_SSH_|StrictHostKeyChecking|ssh-keyscan|trust.on.first.use|['"]ssh['"]|db:seed|db:reset|dev:bots|grant-gray|initializePrivateAlpha/);
 const worker=readFileSync(new URL('../deployment/release/worker.mjs',import.meta.url),'utf8');assert.match(worker,/READ ONLY/);assert.match(worker,/default_transaction_read_only=on/);assert.doesNotMatch(worker,/dropdb|--clean|TRUNCATE|initializePrivateAlpha/);
 const image=readFileSync(new URL('../deployment/release/Dockerfile',import.meta.url),'utf8');assert.match(image,/ENTRYPOINT \[\]/);assert.match(image,/USER postgres/);
});
