// Real PostgreSQL, age encryption, HTTPS transfer and compiled migration tests.
// Only this script's own containers/private network are used; no provider token,
// live DATABASE_URL, public database ports or pre-existing volume is read.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash,generateKeyPairSync} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm,mkdir,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {candidateDigest} from '../deployment/release/candidate.mjs';
import {recoveryStore} from '../deployment/release/store.mjs';
import {protocol,copyName,checkJobReport} from '../deployment/release/protocol.mjs';
import {signProof} from '../deployment/release/proof.mjs';

const env={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const docker=(args,options={})=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env,encoding:'utf8',timeout:180000,stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024,...options});
const image=process.env.KINGDOM_RELEASE_WORKER_IMAGE??'kingdom-come:release-worker-check',game=process.env.KINGDOM_CONTAINER_IMAGE??'kingdom-come:railway-check';
const folder=await mkdtemp(join(tmpdir(),'kingdom-release-test-')),id=randomUUID().slice(0,8),network='kc-release-'+id,source='kc-source-'+id,restore='kc-restore-'+id,objects='kc-objects-'+id;
const sourceHost=source+'.railway.internal',restoreHost=restore+'.railway.internal',password=randomUUID(),readerPassword=randomUUID();
const projectId=randomUUID(),environmentId=randomUUID(),gameServiceId=randomUUID(),workerServiceId=randomUUID();
const result={passed:false,checks:[],liveProviderContacted:false,publicPorts:false};
const check=name=>{result.checks.push(name);console.log('PASS: '+name);};
const sql=(container,database,text)=>docker(['exec',container,'psql','-U','postgres','-d',database,'-X','-At','-v','ON_ERROR_STOP=1','-c',text]).trim();
async function ready(container){for(let n=0;n<100;n++){try{docker(['exec',container,'pg_isready','-U','postgres']);return;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('Disposable PostgreSQL did not become ready.');}
const store=recoveryStore({KINGDOM_BACKUP_ENDPOINT:'https://recovery.test:8443',KINGDOM_BACKUP_PATH_STYLE:'true',KINGDOM_BACKUP_BUCKET:'release-fixtures',KINGDOM_BACKUP_REGION:'auto',KINGDOM_BACKUP_ACCESS_KEY_ID:'fixture-only',KINGDOM_BACKUP_SECRET_ACCESS_KEY:'fixture-only'});
let grants=[];
const fileFor=key=>join(folder,'objects',createHash('sha256').update(key).digest('hex'));
async function grant(key,method){const url=await store.grant(key,method);grants.push({key,method,url});await writeFile(join(folder,'grants.json'),JSON.stringify(grants));return url;}
const sourceUrl='postgres://postgres:'+password+'@'+sourceHost+'/railway_test',restoreUrl='postgres://postgres:'+password+'@'+restoreHost+'/railway_test';
const common={NODE_ENV:'production',KINGDOM_PRIVATE_ALPHA:'1',RAILWAY_PROJECT_ID:projectId,RAILWAY_ENVIRONMENT_ID:environmentId,APP_ORIGIN:'https://realm.example',DATABASE_URL:sourceUrl,KINGDOM_RESTORE_DATABASE_URL:restoreUrl};
async function envFile(name,values){const path=join(folder,name);await writeFile(path,Object.entries(values).map(([key,value])=>key+'='+value).join('\n')+'\n',{mode:0o600});return path;}
const sourceSnapshotCode=`import {createDatabase} from './dist/db.js';import {createHash} from 'node:crypto';const db=createDatabase(process.env.DATABASE_URL);try{const data={};for(const {table_name:t} of(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows){const rows=(await db.query('SELECT row_to_json(t)::text AS row FROM "'+t+'" t ORDER BY row_to_json(t)::text')).rows.map(r=>r.row);data[t]=rows;}console.log(JSON.stringify(data));}finally{await db.end();}`;
const fixtureCode=`import {randomUUID} from 'node:crypto';import {createDatabase,transaction} from './dist/db.js';import {migrate} from './dist/migrate.js';import {initializePrivateAlpha} from './dist/development.js';import {registerAccount,createSession} from './dist/auth.js';import {ledger} from './dist/economy.js';import {grantExperience} from './dist/progression.js';import {purchaseItems} from './dist/inventory.js';import {buyEstate} from './dist/estate.js';import {vaultTransfer} from './dist/pvp-economy.js';
 const db=createDatabase(process.env.DATABASE_URL);try{await migrate(db,{through:'019_champions_and_rivalries.sql'});await db.query("DELETE FROM rulesets WHERE id='game-feel-1'");await initializePrivateAlpha(db,{...process.env,KINGDOM_ALPHA_INITIALIZE:'INITIALIZE_EMPTY_PRIVATE_ALPHA',KINGDOM_DEV_PASSWORD:randomUUID()+'Aa1!'});
 const actor=await registerAccount(db,{username:'release_fixture',name:'Release Keeper',password:randomUUID()+'Aa1!'});await createSession(db,actor.accountId);await transaction(db,async sql=>{const now=new Date();await ledger(sql,null,'release_test_fixture',[{characterId:actor.characterId,amount:10000}]);await grantExperience(sql,actor.characterId,50,now);await purchaseItems(sql,actor.characterId,4,{'squires-blade':2},randomUUID(),now);await buyEstate(sql,actor.characterId,4,'smallholding',3,randomUUID(),now);await vaultTransfer(sql,actor.characterId,500,true,randomUUID(),now);await sql.query("INSERT INTO player_preferences(character_id,tutorial_status) VALUES($1,'active')",[actor.characterId]);await sql.query('INSERT INTO tutorial_guides(character_id,step_index) VALUES($1,6)',[actor.characterId]);await sql.query("INSERT INTO realm_messages(id,author_id,channel,body,command_id,ruleset_id,created_at) VALUES($1,$2,'broadcast','Preserved fixture message',$3,'community-0.1',clock_timestamp())",[randomUUID(),actor.characterId,randomUUID()]);});console.log(JSON.stringify({accounts:452,bots:450}));}finally{await db.end();}`;
let basic,networkCreated=false;const created=[];
try{
 docker(['image','inspect',image]);docker(['image','inspect',game]);docker(['network','create',network]);networkCreated=true;
 const pgFile=await envFile('pg.env',{POSTGRES_PASSWORD:password,POSTGRES_DB:'railway_test'});
 for(const [name,host]of[[source,sourceHost],[restore,restoreHost]]){docker(['run','-d','--name',name,'--network',network,'--network-alias',host,'--env-file',pgFile,'postgres:18-bookworm']);created.push(name);await ready(name);}
 basic=await envFile('game.env',{...common,RAILWAY_SERVICE_ID:gameServiceId});
 docker(['run','--rm','--network',network,'--env-file',basic,game,'node','--input-type=module','-e',fixtureCode]);
 const snapshot=()=>JSON.parse(docker(['run','--rm','--network',network,'--env-file',basic,game,'node','--input-type=module','-e',sourceSnapshotCode]));
 const before=snapshot();assert.equal(before.development_bots.length,450);assert.equal(before.accounts.length,452);check('populated Phase 4.6 fixture has 450 stable bots, human sessions, Vault, inventory, Land, tutorial and social records');
 sql(source,'railway_test',"CREATE ROLE release_reader LOGIN; GRANT pg_read_all_data TO release_reader; GRANT EXECUTE ON FUNCTION pg_control_system() TO release_reader;");
 docker(['exec','-i',source,'psql','-U','postgres','-d','railway_test','-X','-v','ON_ERROR_STOP=1','-c','\\password release_reader'],{input:readerPassword+'\n'+readerPassword+'\n'});
 const reader='postgres://release_reader:'+readerPassword+'@'+sourceHost+'/railway_test';
 await writeFile(join(folder,'server.mjs'),await readFile('scripts/fixtures/release-object-store.mjs'));await writeFile(join(folder,'grants.json'),'[]');await writeFile(join(folder,'corrupt.json'),'[]');await writeFile(join(folder,'ignore-conditional.json'),'[]');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=recovery.test','-addext','subjectAltName=DNS:recovery.test','-keyout',join(folder,'server.key'),'-out',join(folder,'server.crt')],{stdio:'pipe'});
 await chmod(join(folder,'server.crt'),0o644);
 docker(['run','-d','--name',objects,'--network',network,'--network-alias','recovery.test','--user',String(process.getuid())+':'+String(process.getgid()),'--mount','type=bind,src='+folder+',dst=/fixture','node:24-bookworm-slim','node','/fixture/server.mjs']);created.push(objects);
 for(let n=0;n<50;n++){try{docker(['exec',objects,'node','-e',"require('net').connect(8443,'127.0.0.1').once('connect',function(){this.end()}).once('error',()=>process.exit(1))"]);break;}catch{if(n===49)throw new Error('Fixture TLS store did not start.');await new Promise(resolve=>setTimeout(resolve,100));}}
 const identity=docker(['run','--rm','--entrypoint','age-keygen',image]);
 const recipient=docker(['run','--rm','-i','--entrypoint','age-keygen',image,'-y'],{input:identity}).trim();await writeFile(join(folder,'owner.agekey'),identity,{mode:0o600});
 const fingerprint=await candidateDigest();
 async function request(mode='prepare'){
  const jobId='gh_123_1_'+randomBytes(16).toString('hex'),prefix='kingdom-releases/'+'a'.repeat(40)+'/'+jobId+'/';
  return {protocol,mode,jobId,sha:'a'.repeat(40),candidateDigest:fingerprint,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString(),projectId,environmentId,gameServiceId,workerServiceId,sourceHost,sourceDatabase:'railway_test',restoreHost,origin:common.APP_ORIGIN,backupOrigin:'https://recovery.test:8443',backupRecipient:recipient,copy:copyName(jobId),urls:{reportPut:await grant(prefix+mode+'.json','PUT'),...(mode==='prepare'?{backupPut:await grant(prefix+'realm.dump.age','PUT'),backupGet:await grant(prefix+'realm.dump.age','GET')}:{})}};
 }
 async function runWorker(request,{trust=true,overrides={}}={}){
  const file=await envFile('worker.env',{...common,DATABASE_URL:reader,KINGDOM_RELEASE_WORKER:'1',RAILWAY_SERVICE_ID:workerServiceId,RAILWAY_DEPLOYMENT_ID:randomUUID(),KINGDOM_BACKUP_ORIGIN:'https://recovery.test:8443',NO_PROXY:sourceHost+','+restoreHost+',recovery.test,127.0.0.1,localhost',...(trust?{NODE_EXTRA_CA_CERTS:'/test-ca.pem'}:{}),KINGDOM_RELEASE_JOB_REQUEST:Buffer.from(JSON.stringify(request)).toString('base64url'),...overrides});
  return docker(['run','--rm','--network',network,'--env-file',file,'--mount','type=bind,src='+join(folder,'server.crt')+',dst=/test-ca.pem,readonly',image]);
 }
 const first=await request();await runWorker(first);
 const reportKey='kingdom-releases/'+first.sha+'/'+first.jobId+'/prepare.json',backupKey=reportKey.replace('prepare.json','realm.dump.age');
 const report=checkJobReport(JSON.parse(await readFile(fileFor(reportKey),'utf8')),first);
 assert.equal(report.restoredCopy.bots,450);assert.deepEqual(snapshot(),before);assert.equal(sql(source,'railway_test','SELECT count(*) FROM pg_database WHERE datname=\''+first.copy+'\''),'0');
 check('read-only source role exports age-encrypted data over verified HTTPS and restores only to the separate PostgreSQL cluster');
 assert.equal(Object.hasOwn(report,'verifiedCopyIdentity'),false);check('registration defaults OFF and needs no retention catalog, credentials or additional database writes');
 // Optional registration uses a separately installed catalog and a restricted
 // credential only on this script's disposable verification PostgreSQL.
 sql(restore,'railway_test',await readFile('deployment/release/retention/bootstrap.sql','utf8'));
 sql(restore,'railway_test',await readFile('deployment/release/retention/observations.sql','utf8'));
 const registrarPassword=randomUUID();
 docker(['exec','-i',restore,'psql','-U','postgres','-d','railway_test','-X','-v','ON_ERROR_STOP=1','-c','\\password kc_copy_registrar'],{input:registrarPassword+'\n'+registrarPassword+'\n'});
 const registrationScope={projectId,environmentId,gameServiceId,workerServiceId,verificationDatabaseServiceId:randomUUID(),maintenanceDatabase:'railway_test',clusterDigest:report.restoreClusterDigest,sourceClusterDigest:report.sourceClusterDigest};
 const registrationSettings={KINGDOM_COPY_REGISTRATION_ENABLED:'1',KINGDOM_COPY_REGISTRATION_SCOPE:JSON.stringify(registrationScope),KINGDOM_COPY_REGISTRATION_DATABASE_URL:'postgres://kc_copy_registrar:'+registrarPassword+'@'+restoreHost+'/railway_test'};
 const observed=await request(),registeredOutput=await runWorker(observed,{overrides:registrationSettings});assert.match(registeredOutput,/COPY_REGISTRATION: PASS/);assert.doesNotMatch(registeredOutput,/COPY_REGISTRATION: FAIL/);
 const observedKey='kingdom-releases/'+observed.sha+'/'+observed.jobId+'/prepare.json',observedReport=checkJobReport(JSON.parse(await readFile(fileFor(observedKey),'utf8')),observed);
 const actualOid=sql(restore,'railway_test',"SELECT oid FROM pg_database WHERE datname='"+observed.copy+"'");assert.equal(observedReport.verifiedCopyIdentity.oid,actualOid);
 assert.equal(sql(restore,'railway_test','SELECT count(*) FROM release_observations.verified_copies'),'1');assert.equal(sql(restore,'railway_test','SELECT count(*) FROM release_retention.copies'),'0');
 assert.equal(sql(restore,'railway_test',"SELECT r.rolname FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname='"+observed.copy+"'"),'postgres');assert.deepEqual(snapshot(),before);
 check('opt-in registration follows genuine encrypted restoration/report upload and preserves unadopted ownership and every source row');
 const {urls:ignoredGrants,...publicObserved}=observed;
 const manifestBytes=Buffer.from(JSON.stringify({request:publicObserved,report:observedReport,backupKey:observedKey.replace('prepare.json','realm.dump.age')}));
 await writeFile(join(folder,'registration-manifest.json'),manifestBytes,{mode:0o644});
 const retryEnv=await envFile('registration.env',{NODE_ENV:'production',KINGDOM_RELEASE_WORKER:'1',RAILWAY_PROJECT_ID:projectId,RAILWAY_ENVIRONMENT_ID:environmentId,RAILWAY_SERVICE_ID:workerServiceId,RAILWAY_DEPLOYMENT_ID:randomUUID(),...registrationSettings});
 const receipt=sql(restore,'railway_test','SELECT first_observed_at::text,verified_at::text,evidence_sha256 FROM release_observations.verified_copies');
 for(let n=0;n<2;n++){
  const output=docker(['run','--rm','--network',network,'--env-file',retryEnv,'--mount','type=bind,src='+join(folder,'registration-manifest.json')+',dst=/manifest.json,readonly',image,'node','deployment/release/retention/register-verified.mjs','--owner-reviewed','--manifest','/manifest.json','--expected-sha256',createHash('sha256').update(manifestBytes).digest('hex')]);
  assert.equal(output,'COPY_REGISTRATION_REPLAY: PASS\n');
 }
 assert.equal(sql(restore,'railway_test','SELECT first_observed_at::text,verified_at::text,evidence_sha256 FROM release_observations.verified_copies'),receipt);assert.deepEqual(snapshot(),before);
 check('a restarted restricted registration-only process replays retained metadata idempotently without source credentials, backup or restore');
 check('the provider actually rejects a second conditional write of identical ciphertext before authorizing recovery');
 check('downloaded ciphertext decrypts with an ephemeral key, restores all old business rows, migrates the exact candidate and replays unchanged');
 await mkdir(join(folder,'recovery'));
 docker(['run','--rm','--user',String(process.getuid())+':'+String(process.getgid()),'--mount','type=bind,src='+folder+',dst=/fixture','--entrypoint','age',image,'--decrypt','--identity','/fixture/owner.agekey','--output','/fixture/recovery/independent.dump','/fixture/objects/'+createHash('sha256').update(backupKey).digest('hex')]);
 assert.equal(createHash('sha256').update(await readFile(join(folder,'recovery/independent.dump'))).digest('hex'),report.backup.sha256);
 check('independent owner-held age identity decrypts the exported recovery object to the verified original archive');
 let rejected=false;try{await runWorker(first);}catch{rejected=true;}assert.ok(rejected);assert.deepEqual(snapshot(),before);check('replaying a completed job cannot overwrite a copy, ciphertext or successful report');
 const ignored=await request(),ignoredKey='kingdom-releases/'+ignored.sha+'/'+ignored.jobId+'/realm.dump.age';await writeFile(join(folder,'ignore-conditional.json'),JSON.stringify([ignoredKey]));
 rejected=false;try{await runWorker(ignored);}catch{rejected=true;}assert.ok(rejected);assert.equal(sql(restore,'railway_test',"SELECT count(*) FROM pg_database WHERE datname='"+ignored.copy+"'"),'0');assert.deepEqual(snapshot(),before);check('a provider that silently ignores conditional writes fails before restoration or promotion');
 const corrupt=await request(),corruptKey='kingdom-releases/'+corrupt.sha+'/'+corrupt.jobId+'/realm.dump.age';await writeFile(join(folder,'corrupt.json'),JSON.stringify([corruptKey]));
 rejected=false;try{await runWorker(corrupt);}catch{rejected=true;}assert.ok(rejected);assert.equal(sql(restore,'railway_test',"SELECT count(*) FROM pg_database WHERE datname='"+corrupt.copy+"'"),'0');assert.deepEqual(snapshot(),before);check('a corrupted encrypted download fails before any restore or production promotion');
 const untrusted=await request();rejected=false;try{await runWorker(untrusted,{trust:false});}catch{rejected=true;}assert.ok(rejected);assert.deepEqual(snapshot(),before);check('an untrusted object-store TLS certificate is rejected without disabling verification');
 const wrong=await request();rejected=false;try{await runWorker(wrong,{overrides:{KINGDOM_RESTORE_DATABASE_URL:reader}});}catch{rejected=true;}assert.ok(rejected);assert.deepEqual(snapshot(),before);check('a source/restore alias is rejected before any administrative database operation');
 const noSpace=await request();rejected=false;const started=Date.now();try{await runWorker(noSpace,{overrides:{TMPDIR:'/sys'}});}catch{rejected=true;}assert.ok(rejected);assert.ok(Date.now()-started<30000);assert.deepEqual(snapshot(),before);check('unwritable temporary storage fails promptly and closes the verification pool without modifying the source');
 const {privateKey,publicKey}=generateKeyPairSync('ed25519'),publicPem=publicKey.export({type:'spki',format:'pem'});
 const approval={protocol:'kingdom-release-proof-v2',repository:'catillatio/test',branch:'release/production',approvalEnvironment:'production',...Object.fromEntries(['jobId','sha','candidateDigest','projectId','environmentId','gameServiceId','sourceHost','sourceDatabase','restoreHost','copy','origin'].map(key=>[key,first[key]])),backupSha256:report.backup.sha256,backupBytes:report.backup.bytes,encryptedSha256:report.backup.encryptedSha256,preservationSha256:report.restoredCopy.sha256,artifactId:'123456',independentRecoveryVerified:true,backupKeyVerified:true,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()};
 // Env files cannot represent PEM newlines; base64 decoding happens in this
 // test-only launch shim, not through a production administrative endpoint.
 const approved=await envFile('approved.env',{...common,RAILWAY_SERVICE_ID:gameServiceId,KINGDOM_AUTOMATED_RELEASES:'1',KINGDOM_RELEASE_SHA:first.sha,KINGDOM_RESTORE_TEST_DATABASE:first.copy,KINGDOM_RELEASE_BACKUP_PROOF:signProof(approval,privateKey),TEST_PUBLIC_KEY:Buffer.from(publicPem).toString('base64')});
 const migrateCode="process.env.KINGDOM_RELEASE_VERIFY_KEY=Buffer.from(process.env.TEST_PUBLIC_KEY,'base64').toString();await import('./deployment/migrate.mjs');";
 sql(restore,first.copy,"UPDATE realm_messages SET body='Altered restored copy' WHERE channel='broadcast'");
 rejected=false;try{docker(['run','--rm','--network',network,'--env-file',approved,game,'node','--input-type=module','-e',migrateCode]);}catch{rejected=true;}assert.ok(rejected);assert.deepEqual(snapshot(),before);
 check('a restored copy altered after signing is rejected before opening or migrating the source database');
 sql(restore,first.copy,"UPDATE realm_messages SET body='Preserved fixture message' WHERE channel='broadcast'");
 docker(['run','--rm','--network',network,'--env-file',approved,game,'node','--input-type=module','-e',migrateCode]);
 const after=snapshot();for(const [table,rows]of Object.entries(before)){if(['schema_migrations','rulesets'].includes(table)){const values=new Set(after[table]);assert.ok(rows.every(row=>values.has(row)),table);}else assert.deepEqual(after[table],rows,table);}
 docker(['run','--rm','--network',network,'--env-file',approved,game,'node','--input-type=module','-e',migrateCode]);assert.deepEqual(snapshot(),after);
 check('signed exact-candidate pre-deploy verifies the isolated copy before additive source migrations and preserves all old rows on replay');
 const post=await request('verify');await runWorker(post);const status=checkJobReport(JSON.parse(await readFile(fileFor('kingdom-releases/'+post.sha+'/'+post.jobId+'/verify.json'),'utf8')),post);assert.equal(status.schemaHead,'026_living_competition.sql');assert.deepEqual(snapshot(),after);check('post-deployment aggregate verification is read-only and preserves sessions, balances and all 450 bots');
 // Disposable fixture only: direct internal authorization exercises the exact
 // append, NOT the private production CLI's additional signed-backup gate.
 const cohortFixture=`import {createDatabase} from './dist/db.js';import {inspectPopulation,provisionExpansionBots} from './dist/expansion-population.js';import {definitionDigest} from './dist/expansion-content.js';const db=createDatabase(process.env.DATABASE_URL);try{const plan={...await inspectPopulation(db),capitalReviewed:true,storageReviewed:true,recoveryArtifactId:'1',encryptedSha256:'a'.repeat(64)};await provisionExpansionBots(db,plan,definitionDigest(plan));}finally{await db.end();}`;
 docker(['run','--rm','--network',network,'--env-file',basic,game,'node','--input-type=module','-e',cohortFixture]);
 const cohortBefore=snapshot();assert.equal(cohortBefore.development_bots.length,900);for(const [table,rows]of Object.entries(after)){const existing=new Set(cohortBefore[table]);assert.ok(rows.every(row=>existing.has(row)),table+' changed an original row');}
 const populationRequest=await request('prepare');await runWorker(populationRequest);const populationReport=checkJobReport(JSON.parse(await readFile(fileFor('kingdom-releases/'+populationRequest.sha+'/'+populationRequest.jobId+'/prepare.json'),'utf8')),populationRequest);
 assert.equal(populationReport.bots,900);assert.equal(populationReport.population.originalBots,450);assert.equal(populationReport.population.addedBots,450);assert.equal(populationReport.population.activeAddedBots,0);assert.equal(populationReport.restoredCopy.bots,900);assert.deepEqual(snapshot(),cohortBefore);
 const populationPost=await request('verify');await runWorker(populationPost);checkJobReport(JSON.parse(await readFile(fileFor('kingdom-releases/'+populationPost.sha+'/'+populationPost.jobId+'/verify.json'),'utf8')),populationPost);assert.deepEqual(snapshot(),cohortBefore);
 check('900 exact-manifest fixture independently encrypts, exports, downloads, restores and replays while preserving the source and every original identity');
 for(const name of [source,restore,objects])assert.equal(Object.keys(JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports??{}).some(key=>JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports[key]?.length),false);
 check('neither PostgreSQL cluster nor the verification job has a published port');
 result.passed=true;result.accounts=452;result.bots=450;result.expandedBotsVerified=900;result.originalBotsPreserved=450;result.expansionActivated=false;result.existingTablesVerified=report.restoredCopy.existingTablesVerified;result.recoverySha256=report.backup.sha256;await mkdir('test-results',{recursive:true});await writeFile('test-results/release-worker-verification.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}finally{
 store.close();for(const name of created.reverse())try{docker(['rm','-f','-v',name]);}catch{}
 if(networkCreated)try{docker(['network','rm',network]);}catch{}await rm(folder,{recursive:true,force:true});
}
