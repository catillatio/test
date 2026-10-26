import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hash} from '../deployment/release/retention/protocol.mjs';
import {randomUUID} from 'node:crypto';
import {fixture,scope} from './fixtures/release-retention.mjs';
import {observationPayload,registrationConfig,captureCopyIdentity,registrationFields} from '../deployment/release/retention/observation.mjs';
const copy=fixture(70,{now:Date.now()}),manifest=copy.catalog.evidence;
manifest.report.verifiedCopyIdentity={oid:copy.database.oid,owner:'postgres',maintenanceDatabase:scope.adminDatabase,clusterDigest:scope.clusterDigest};
const config={projectId:scope.projectId,environmentId:scope.environmentId,gameServiceId:scope.gameServiceId,workerServiceId:scope.verificationWorkerServiceId,verificationDatabaseServiceId:scope.verificationServiceId,maintenanceDatabase:scope.adminDatabase,clusterDigest:scope.clusterDigest,sourceClusterDigest:scope.sourceClusterDigest};
const env={NODE_ENV:'production',KINGDOM_RELEASE_WORKER:'1',KINGDOM_COPY_REGISTRATION_ENABLED:'1',KINGDOM_COPY_REGISTRATION_SCOPE:JSON.stringify(config),KINGDOM_COPY_REGISTRATION_DATABASE_URL:'postgres://kc_copy_registrar:fixture-only@'+scope.host+'/'+scope.adminDatabase,KINGDOM_RESTORE_DATABASE_URL:'postgres://worker:fixture-only@'+scope.host+'/'+scope.adminDatabase,
 RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,RAILWAY_SERVICE_ID:scope.verificationWorkerServiceId,RAILWAY_DEPLOYMENT_ID:manifest.report.workerDeploymentId};
test('observation payload keeps exact public verification identity and excludes all unknown/nested secret fields',()=>{
 const extra=structuredClone(manifest);extra.request.urls={reportPut:'synthetic-private-signed-url'};extra.request.secret='synthetic-secret';extra.report.secret='synthetic-secret';extra.report.backup.secret='synthetic-secret';extra.report.restoredCopy.secret='synthetic-secret';extra.report.verifiedCopyIdentity.secret='synthetic-secret';
 const payload=observationPayload(extra);assert.deepEqual(payload,observationPayload(manifest));assert.deepEqual(Object.keys(payload).sort(),registrationFields.slice().sort());
 const text=JSON.stringify(payload);assert.doesNotMatch(text,/synthetic-secret|signed-url|password|urls|recipient/);
 assert.equal(payload.oid,copy.database.oid);assert.equal(payload.workerDeploymentId,manifest.report.workerDeploymentId);assert.equal(payload.passed,true);
});
test('registration refuses missing or mismatched identity and failed/incomplete verification',()=>{
 for(const mutate of [m=>{delete m.report.verifiedCopyIdentity;},m=>m.report.verifiedCopyIdentity.oid='0',m=>m.report.verifiedCopyIdentity.clusterDigest='f'.repeat(64),m=>m.report.passed=false,m=>m.report.backup.exportRoundTripVerified=false,m=>m.report.restoredCopy.migrationReplay='changed',m=>m.report.restoredCopy.bots=449,m=>m.request.copy='kc_'+'0'.repeat(32)+'_restore_test',m=>m.backupKey+='?secret',m=>m.request.origin+='?secret',m=>m.report.verifiedCopyIdentity.owner='user:password',m=>m.request.createdAt='invalid']){
  const changed=structuredClone(manifest);mutate(changed);assert.throws(()=>observationPayload(changed));
 }
});
test('registration is opt-in, private, exact-scope and cannot inherit cleanup, signing or bootstrap credentials',()=>{
 assert.equal(registrationConfig(env,manifest.request,manifest.report).scope.maintenanceDatabase,scope.adminDatabase);
 for(const overrides of [{KINGDOM_COPY_REGISTRATION_ENABLED:undefined},{KINGDOM_COPY_REGISTRATION_ENABLED:'0'},{KINGDOM_COPY_REGISTRATION_ENABLED:'true'},{RAILWAY_SERVICE_ID:scope.gameServiceId},{RAILWAY_DEPLOYMENT_ID:randomUUID()},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{PGOPTIONS:'-c role=postgres'},
  {KINGDOM_COPY_REGISTRATION_DATABASE_URL:env.KINGDOM_COPY_REGISTRATION_DATABASE_URL.replace('kc_copy_registrar','postgres')},{KINGDOM_COPY_REGISTRATION_DATABASE_URL:'postgres://kc_copy_registrar:fixture@public.example/test'},...['KINGDOM_RETENTION_DATABASE_URL','KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL','KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL','KINGDOM_RELEASE_SIGNING_KEY'].map(key=>({[key]:'synthetic-secret'}))])assert.throws(()=>registrationConfig({...env,...overrides},manifest.request,manifest.report));
 for(const patch of [{clusterDigest:'f'.repeat(64)},{sourceClusterDigest:scope.clusterDigest},{maintenanceDatabase:'wrong'},{projectId:randomUUID()},{verificationDatabaseServiceId:scope.gameServiceId},{extra:'unknown'}])assert.throws(()=>registrationConfig({...env,KINGDOM_COPY_REGISTRATION_SCOPE:JSON.stringify({...config,...patch})},manifest.request,manifest.report));
 assert.doesNotThrow(()=>registrationConfig({...env,RAILWAY_DEPLOYMENT_ID:randomUUID()},manifest.request,manifest.report,{replay:true}));
});
test('OID capture uses the existing locked verification connection without requiring registration credentials',async()=>{
 let calls=0;const client={query:async(sql,args)=>{calls++;if(['BEGIN READ ONLY',"SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='2s'",'ROLLBACK'].includes(sql))return {rows:[]};assert.match(sql,/pg_catalog\.pg_database/);assert.deepEqual(args,[copy.database.name]);return {rows:[{oid:copy.database.oid,owner:'postgres',maintenanceDatabase:scope.adminDatabase,locked:true}]};}};
 const withoutCredentials={...env};delete withoutCredentials.KINGDOM_COPY_REGISTRATION_DATABASE_URL;delete withoutCredentials.KINGDOM_COPY_REGISTRATION_SCOPE;
 assert.deepEqual(await captureCopyIdentity(client,manifest.request,manifest.report,withoutCredentials),manifest.report.verifiedCopyIdentity);assert.equal(calls,4);
 await assert.rejects(captureCopyIdentity({query:async()=>({rows:[{locked:false}]})},manifest.request,manifest.report,env));
});
test('historical metadata replay requires exact independently reviewed file hash and prints fixed failure only',()=>{
 const run=spawnSync(process.execPath,[fileURLToPath(new URL('../deployment/release/retention/register-verified.mjs',import.meta.url))],{env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.equal(run.status,1);assert.equal(run.stdout,'');assert.equal(run.stderr,'COPY_REGISTRATION_REPLAY: FAIL\n');
});
test('worker bundles explicitly include metadata helpers without including destructive retention tools',()=>{
 const run=readFileSync(new URL('../deployment/release/run.mjs',import.meta.url),'utf8'),docker=readFileSync(new URL('../deployment/release/Dockerfile',import.meta.url),'utf8');
 for(const text of [run,docker]){
  for(const file of ['observation.mjs','observations.sql','register-verified.mjs'])assert.ok(text.includes(file));
  assert.doesNotMatch(text,/retention\/(?:cli|permit|register)\.mjs|retention\/bootstrap\.sql/);
 }
});

test('900-bot observations require the exact installed population manifest and restored population evidence',()=>{
 const rules=JSON.parse(readFileSync(new URL('../rulesets/level100-rivals-1/rules.json',import.meta.url),'utf8'));
 const m=structuredClone(manifest),population={manifestId:'level100-rivals-1',manifestDigest:hash(rules),legacyDigest:'f'.repeat(64),originalBots:450,addedBots:450,totalBots:900,activeAddedBots:450,autonomyMode:'enabled'};
 Object.assign(m.report,{accounts:902,bots:900,population});Object.assign(m.report.restoredCopy,{accounts:902,bots:900,population});
 const payload=observationPayload(m);assert.equal(payload.bots,900);assert.equal(payload.populationSha256,hash(population));
 m.report.population={...population,secret:'must-not-be-retained'};m.report.restoredCopy.population=m.report.population;
 assert.deepEqual(observationPayload(m),payload);
 for(const change of [x=>x.report.population.manifestDigest='0'.repeat(64),x=>x.report.restoredCopy.population=null,x=>x.report.bots=901]){const bad=structuredClone(m);change(bad);assert.throws(()=>observationPayload(bad));}
});
