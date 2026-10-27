import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fixtureUrl} from '../scripts/ci/isolation.mjs';
import {fixture,scope as baseScope,scenario,approve,publicKey} from './fixtures/release-retention.mjs';
import {observationPayload,recordObservation} from '../deployment/release/retention/observation.mjs';
import {adoptObservedCopy} from '../deployment/release/retention/adoption.mjs';
import {inventory} from '../deployment/release/retention/inventory.mjs';
import {inspect,cleanup,lockCluster} from '../deployment/release/retention/retention.mjs';
import {installPermit} from '../deployment/release/retention/permit.mjs';
import {reconcileInterrupted} from '../deployment/release/retention/reconcile.mjs';
import {hash} from '../deployment/release/retention/protocol.mjs';
import {verifyAdoption} from '../deployment/release/retention/verification.mjs';
import {liveGuards} from '../deployment/release/retention/guards.mjs';
const target=process.env.TEST_DATABASE_URL;
const sha=b=>createHash('sha256').update(b).digest('hex');
test('disposable observed-copy lifecycle: registration, atomic adoption, age hold, signed retirement and preserved 900-bot realm',{skip:!target,timeout:120000},async t=>{
 const url=fixtureUrl(target),root=new pg.Client({connectionString:url.href});await root.connect();
 const maintenance='kc_lifecycle_catalog_test',created=[],clients=[];
 let installed=false;const connect=async(database,role)=>{
  const u=new URL(url);u.pathname='/'+database;const c=new pg.Client({connectionString:u.href});await c.connect();clients.push(c);
  if(role)await c.query('SET SESSION AUTHORIZATION '+role);return c;
 };
 try{
  await root.query('CREATE DATABASE '+maintenance);created.push(maintenance);
  const admin=await connect(maintenance);
  await admin.query(await readFile(new URL('../deployment/release/retention/bootstrap.sql',import.meta.url),'utf8'));
  await admin.query(await readFile(new URL('../deployment/release/retention/observations.sql',import.meta.url),'utf8'));installed=true;
  await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  const creator=(await admin.query('SELECT current_user AS actor')).rows[0].actor;
  const cluster=sha(Buffer.from((await admin.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id));
  const scope={...baseScope,clusterDigest:cluster,adminDatabase:maintenance,workerAdminDatabase:maintenance};
  const registrar=await connect(maintenance,'kc_copy_registrar'),runtime=await connect(maintenance,'kc_retention_runtime'),authorizer=await connect(maintenance,'kc_retention_authorizer');
  const copies=Array.from({length:6},(_,i)=>fixture(801+i,{now:Date.now(),age:100-i}));
  const rules=JSON.parse(await readFile(new URL('../rulesets/level100-rivals-1/rules.json',import.meta.url),'utf8'));
  const population={manifestId:'level100-rivals-1',manifestDigest:hash(rules),legacyDigest:'f'.repeat(64),originalBots:450,addedBots:450,totalBots:900,activeAddedBots:450,autonomyMode:'enabled'};
  const populate=`CREATE TABLE accounts(id int PRIMARY KEY,bot bool,wallet bigint,vault bigint,saved_session text);
   INSERT INTO accounts SELECT n,n<=900,n*100,n*200,'session-'||n FROM generate_series(1,902)n;
   CREATE TABLE business_history AS SELECT id,3 AS equipment,4 AS land,5 AS army,'saved-battle-history' AS history FROM accounts;`;
  for(const f of copies){
   await root.query('CREATE DATABASE "'+f.database.name+'"');created.push(f.database.name);
   f.database.oid=(await root.query('SELECT oid::text FROM pg_database WHERE datname=$1',[f.database.name])).rows[0].oid;f.database.owner=creator;
   f.catalog.evidence.report.restoreClusterDigest=cluster;
   f.catalog.evidence.report.verifiedCopyIdentity={oid:f.database.oid,owner:creator,maintenanceDatabase:maintenance,clusterDigest:cluster};
   Object.assign(f.catalog.evidence.report,{bots:900,accounts:902,population});Object.assign(f.catalog.evidence.report.restoredCopy,{bots:900,accounts:902,population});
   const data=await connect(f.database.name);await data.query(populate);await data.end();
  }
  const preserved=await connect(copies[5].database.name);
  const business=async()=>JSON.stringify((await preserved.query('SELECT (SELECT jsonb_agg(a ORDER BY id) FROM accounts a) AS accounts,(SELECT jsonb_agg(h ORDER BY id) FROM business_history h) AS history')).rows);
  const businessBefore=await business();
  let state={...scenario(copies).state,scope,currentRecoveryCopy:copies[5].database.name,observedAt:new Date().toISOString()};
  let liveReads=0;
  const guards=liveGuards(scope,{githubToken:'fixture-only',fetcher:async(url,options)=>{
   liveReads++;assert.equal(options.method,undefined);assert.equal(options.redirect,'error');
   if(url===scope.origin+'/healthz')return Response.json({status:'ready',release:'phase4.7',commit:state.activeSha});
   if(url.includes('/workflows/production-release.yml/runs?'))return Response.json({total_count:0,workflow_runs:[]});
   if(url.endsWith('/jobs?per_page=100'))return Response.json({total_count:2,jobs:[{name:'owner-approval',status:'completed',conclusion:'success',run_attempt:1},{name:'retire',status:'in_progress',run_attempt:1}]});
   const coordinator=url.endsWith('/actions/runs/999/attempts/1'),match=url.match(/\/actions\/runs\/([0-9]+)\/attempts\/1$/);assert.ok(match);
   return Response.json({id:Number(match[1]),run_attempt:1,status:coordinator?'in_progress':'completed',path:coordinator?state.coordinator.workflow:'.github/workflows/production-release.yml',event:'workflow_dispatch',head_branch:'release/production',head_repository:{full_name:'catillatio/test'},head_sha:coordinator?state.coordinator.headSha:copies[0].catalog.evidence.request.sha});
  }});
  const args=f=>{const bytes=Buffer.from(JSON.stringify(f.catalog.evidence));return {scope,state:{...state,observedAt:new Date().toISOString()},bytes,expectedSha256:sha(bytes),expectedOid:f.database.oid,beforeAdopt:guards.beforeDelete};};
  const owner=async f=>(await root.query('SELECT r.rolname AS owner FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=$1',[f.database.name])).rows[0]?.owner;
  await t.test('real restricted registration feeds accurate observed-only inventory, without adoption',async()=>{
   for(const f of copies.slice(0,5))await recordObservation(registrar,observationPayload(f.catalog.evidence));
   const report=await inventory(admin);
   for(const f of copies.slice(0,5)){
    const row=report.rows.find(r=>r.name===f.database.name);assert.equal(row.oid,f.database.oid);assert.equal(row.owner,creator);assert.equal(row.classification,'observed-only-protected');assert.equal(row.eligible,false);
   }
   assert.equal(report.rows.find(r=>r.name===copies[5].database.name).classification,'uncertain-protected');
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.copies')).rows[0].n,0);
  });
  await t.test('adoption refuses bad file hashes, unknown original identity, scope drift, active/pending/pinned/current and unfinished work',async()=>{
   const f=copies[0];
   for(const patch of [{expectedSha256:'0'.repeat(64)},{expectedOid:'106971'},{scope:{...scope,clusterDigest:'f'.repeat(64)}},
    {state:{...state,currentRecoveryCopy:f.database.name}},{state:{...state,activeSha:f.catalog.evidence.request.sha}},
    {state:{...state,pinnedCopies:[f.database.name]}},{state:{...state,pendingCopies:[f.database.name]}},{state:{...state,closedJobIds:[]}}])await assert.rejects(adoptObservedCopy(admin,{...args(f),...patch}));
   await assert.rejects(adoptObservedCopy(admin,args(copies[5]))); // No observation.
   const a=args(f),m=JSON.parse(a.bytes);delete m.report.verifiedCopyIdentity;a.bytes=Buffer.from(JSON.stringify(m));a.expectedSha256=sha(a.bytes);
   await assert.rejects(adoptObservedCopy(admin,a));assert.equal(await owner(f),creator);
  });
  await t.test('verification/release lock blocks adoption; credential roles cannot adopt',async()=>{
   assert.equal((await runtime.query('SELECT pg_try_advisory_lock(61824087) AS acquired')).rows[0].acquired,true);
   try{await assert.rejects(adoptObservedCopy(admin,args(copies[0])));}finally{await runtime.query('SELECT pg_advisory_unlock(61824087)');}
   await assert.rejects(adoptObservedCopy(registrar,args(copies[0])));await assert.rejects(adoptObservedCopy(authorizer,args(copies[0])));
  });
  await t.test('failure after ownership transfer rolls back ownership AND provenance',async()=>{
   // Disposable-only fault injection, no production hook or altered guard.
   const query=admin.query.bind(admin);let transferred=false;
   const interrupted={query:async(sql,values)=>{
    if(sql.startsWith('INSERT INTO release_retention.copies')){assert.equal(transferred,true);throw Error('Synthetic interruption before provenance');}
    const value=await query(sql,values);if(sql.startsWith('ALTER DATABASE'))transferred=true;return value;
   }};
   await assert.rejects(adoptObservedCopy(interrupted,args(copies[0])));
   assert.equal(transferred,true);assert.equal(await owner(copies[0]),creator);
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.copies')).rows[0].n,0);
   assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'")).rows[0].n,0);
  });
  await t.test('adoption is restart/concurrent-idempotent and never backdates the new 24-hour hold',async()=>{
   const f=copies[0],first=await adoptObservedCopy(admin,args(f));assert.equal(first.alreadyAdopted,false);assert.equal(await owner(f),'kc_release_copy_owner');
   assert.equal((await verifyAdoption(runtime,f.catalog.evidence,scope)).retirementAuthorized,false);
   const other=await connect(maintenance);const retried=await adoptObservedCopy(other,args(f));assert.equal(retried.alreadyAdopted,true);assert.equal(retried.firstObservedAt,first.firstObservedAt);
   const attempts=await Promise.allSettled([adoptObservedCopy(admin,args(f)),adoptObservedCopy(other,args(f))]);assert.ok(attempts.some(r=>r.status==='fulfilled'));
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.copies')).rows[0].n,1);
   assert.ok(Date.parse(first.firstObservedAt)>Date.now()-30000);
   for(const c of copies.slice(1,5))await adoptObservedCopy(admin,args(c));
   await lockCluster(runtime,scope);
   try{
    const plan=await inspect(runtime,{...state,observedAt:new Date().toISOString()},scope);
    assert.ok(plan.rows.filter(r=>copies.slice(0,5).some(c=>c.database.name===r.name)).every(r=>!r.eligible&&r.reasons.includes('within-age-window')));
   }finally{await runtime.query('SELECT pg_advisory_unlock(61824087)');}
  });
  // Simulate elapsed time ONLY in this disposable fixture. No production API
  // accepts timestamp overrides. Exact immutable triggers are restored before
  // runtime guard verification, planning, permit installation or any DROP.
  const aged=Date.now()-48*3600000;
  await admin.query('ALTER TABLE release_retention.copies DISABLE TRIGGER copies_immutable');
  try{for(let i=0;i<5;i++)await admin.query('UPDATE release_retention.copies SET verified_at=$1,first_observed_at=$1 WHERE name=$2',[new Date(aged+i*1000),copies[i].database.name]);}
  finally{await admin.query('ALTER TABLE release_retention.copies ENABLE TRIGGER copies_immutable');}
  state={...state,observedAt:new Date().toISOString()};
  await lockCluster(runtime,scope);
  await t.test('fresh dry-run retains newest anchors, unknown/current and pending/rollback pins',async()=>{
   const plan=await inspect(runtime,state,scope);assert.equal(plan.rows.filter(r=>r.eligible).length,3);
   for(const key of ['pinnedCopies','pendingCopies']){
    const protectedState={...state,[key]:[copies[0].database.name]};assert.equal((await inspect(runtime,protectedState,scope)).rows.find(r=>r.name===copies[0].database.name).eligible,false);
   }
   assert.equal(plan.rows.find(r=>r.name===copies[5].database.name).eligible,false);
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.audit')).rows[0].n,0);
  });
  let signedPlan,signed;
  await t.test('owner-signed one-copy permit cannot expand to another eligible copy',async()=>{
   await guards.coordinated(state);
   const plan=await inspect(runtime,state,scope);signedPlan={...plan,rows:plan.rows.filter(r=>r.name===copies[0].database.name)};
   signed=approve(signedPlan,state,{scope,now:Date.now()});
   await installPermit(authorizer,{scope,state,plan:signedPlan,approval:signed.encoded,verifyKey:publicKey});
   await assert.rejects(cleanup(runtime,{scope,state,plan:signedPlan,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{},recordBaseline:async()=>{throw Error('Synthetic private journal unavailable');}}));
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.audit')).rows[0].n,0);
   const expanded={...signedPlan,rows:plan.rows.filter(r=>r.eligible)};
   await assert.rejects(cleanup(runtime,{scope,state,plan:expanded,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));
   assert.equal(await owner(copies[0]),'kc_release_copy_owner');
  });
  await t.test('actual non-FORCE retirement proves absence, preserves every untargeted tuple and never invents physical relief',async()=>{
   let baseline;const result=await cleanup(runtime,{scope,state,plan:signedPlan,approval:signed.encoded,verifyKey:publicKey,beforeDelete:guards.beforeDelete,recordBaseline:async value=>{baseline=value;assert.equal(await owner(copies[0]),'kc_release_copy_owner');}});
   assert.deepEqual(result.dropped,[copies[0].database.name]);assert.ok(BigInt(result.measuredDatabaseBytesRemoved)>0n);
   assert.equal(result.verification.allUntargetedIdentitiesPreserved,true);assert.equal(result.verification.filesystemBytesReclaimed,null);
   assert.ok(liveReads>=11); // Exact protected job + owner gate + per-copy live guards.
   assert.equal(await owner(copies[0]),undefined);assert.equal(await business(),businessBefore);
   const retry=await cleanup(runtime,{scope,state,plan:signedPlan,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}});
   assert.deepEqual(retry.alreadyAbsent,[copies[0].database.name]);assert.equal(retry.measuredDatabaseBytesRemoved,'0');
   const reconciled=await reconcileInterrupted(runtime,{scope,approvalId:signed.approval.id,verifyKey:publicKey,before:baseline});
   assert.equal(reconciled.verification.allUntargetedIdentitiesPreserved,true);assert.equal(reconciled.verification.filesystemBytesReclaimed,null);
   assert.deepEqual(reconciled.reconciledAbsent,[]);assert.equal(await owner(copies[1]),'kc_release_copy_owner');
   assert.equal((await admin.query("SELECT count(*)::int AS n FROM release_retention.audit WHERE event='deleted'")).rows[0].n,1);
   assert.equal(await business(),businessBefore);
  });
  await runtime.query('SELECT pg_advisory_unlock(61824087)');
 }finally{
  for(const c of clients)await c.end().catch(()=>{});
  for(const name of created.filter(n=>n!==maintenance))await root.query('DROP DATABASE IF EXISTS "'+name+'"');
  if(installed){
   const u=new URL(url);u.pathname='/'+maintenance;const final=new pg.Client({connectionString:u.href});await final.connect();
   try{await final.query('DROP SCHEMA release_observations CASCADE; DROP SCHEMA release_retention CASCADE; DROP OWNED BY kc_copy_registrar; DROP OWNED BY kc_retention_authorizer; DROP OWNED BY kc_retention_runtime; DROP OWNED BY kc_retention_owner; DROP OWNED BY kc_release_copy_owner;');}finally{await final.end();}
  }
  if(created.includes(maintenance))await root.query('DROP DATABASE '+maintenance);
  if(installed)await root.query('DROP ROLE kc_copy_registrar; DROP ROLE kc_retention_authorizer; DROP ROLE kc_retention_runtime; DROP ROLE kc_release_copy_owner; DROP ROLE kc_retention_owner');
  await root.end();
 }
});
