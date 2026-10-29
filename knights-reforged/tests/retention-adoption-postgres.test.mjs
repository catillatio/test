import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {runAdopter} from '../deployment/release/retention/delivery/adopter.mjs';
import {signArm} from '../deployment/release/retention/delivery/protocol.mjs';
import {hash} from '../deployment/release/retention/protocol.mjs';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixtureUrl} from '../scripts/ci/isolation.mjs';
import {fixture,scope as originalScope,scenario} from './fixtures/release-retention.mjs';
import {recordObservation,observationPayload} from '../deployment/release/retention/observation.mjs';
import {performAdoption,rawDigest,verifyAdoptionPreservation} from '../deployment/release/retention/delivery/adoption-operation.mjs';
import {inventory} from '../deployment/release/retention/inventory.mjs';
import {snapshot,lockCluster,inspect} from '../deployment/release/retention/retention.mjs';
import {verifyAdoption} from '../deployment/release/retention/verification.mjs';
import {writeBaseline} from '../deployment/release/retention/journal.mjs';
import {liveGuards} from '../deployment/release/retention/guards.mjs';
const target=process.env.TEST_DATABASE_URL;
test('isolated future adoption: real ownership transaction, durable intent, interruptions, independent preservation and hold',{skip:!target,timeout:120000},async t=>{
 const url=fixtureUrl(target),root=new pg.Client({connectionString:url.href});await root.connect();
 const created=[],clients=[],maintenance='kc_future_adoption_test',dir=await mkdtemp(join(tmpdir(),'adoption-postgres-'));let installed=false;
 const connect=async(database,role)=>{const u=new URL(url);u.pathname='/'+database;const c=new pg.Client({connectionString:u.href});await c.connect();clients.push(c);if(role)await c.query('SET SESSION AUTHORIZATION '+role);return c;};
 try{
  await root.query('CREATE DATABASE '+maintenance);created.push(maintenance);const admin=await connect(maintenance);
  await admin.query(await readFile(new URL('../deployment/release/retention/bootstrap.sql',import.meta.url),'utf8'));
  await admin.query(await readFile(new URL('../deployment/release/retention/observations.sql',import.meta.url),'utf8'));installed=true;
  await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  const actor=(await admin.query('SELECT current_user AS actor')).rows[0].actor;
  const cluster=rawDigest(Buffer.from((await admin.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id));
  const scope={...originalScope,clusterDigest:cluster,adminDatabase:maintenance,workerAdminDatabase:maintenance};
  for(const oid of ['106971','129180'])if(!(await root.query('SELECT 1 FROM pg_database WHERE oid=$1',[oid])).rowCount){const n='kc_adopter_emergency_'+oid;await root.query('CREATE DATABASE '+n+' WITH OID = '+oid);created.push(n);}
  const copies=[fixture(1701,{now:Date.now(),age:0}),fixture(1702,{now:Date.now(),age:0}),fixture(1703,{now:Date.now(),age:0})];
  const registrar=await connect(maintenance,'kc_copy_registrar'),runtime=await connect(maintenance,'kc_retention_runtime'),authorizer=await connect(maintenance,'kc_retention_authorizer');
  for(const f of copies){
   await root.query('CREATE DATABASE '+f.database.name);created.push(f.database.name);
   f.database.oid=(await root.query('SELECT oid::text FROM pg_database WHERE datname=$1',[f.database.name])).rows[0].oid;f.database.owner=actor;
   Object.assign(f.catalog.evidence.report,{restoreClusterDigest:cluster,verifiedCopyIdentity:{oid:f.database.oid,owner:actor,maintenanceDatabase:maintenance,clusterDigest:cluster}});
   await recordObservation(registrar,observationPayload(f.catalog.evidence));
  }
  const realm=await connect(copies[2].database.name);await realm.query("CREATE TABLE untouched_realm(id integer PRIMARY KEY,bot boolean,gold bigint,equipment integer,land integer,history text); INSERT INTO untouched_realm SELECT n,n<=900,n*1000000::bigint,15,7,'saved-history-'||n FROM generate_series(1,902)n;");
  const business=async()=>JSON.stringify((await realm.query('SELECT jsonb_agg(r ORDER BY id) AS saved FROM untouched_realm r')).rows),saved=await business();
  const state={...scenario(copies,Date.now()).state,scope};
  const make=index=>{
   const manifest=copies[index].catalog.evidence,bytes=Buffer.from(JSON.stringify(manifest)),adoption={serviceId:'11111111-1111-4111-8111-111111111111',futureAfter:new Date(Date.now()-600000).toISOString()};
   return {f:{scope,adoption},data:{state:{...state,observedAt:new Date().toISOString()},data:{manifestBytes:bytes.toString('base64url'),manifestSha256:rawDigest(bytes),expectedOid:copies[index].database.oid,adoption}},manifest};
  };
  let current;
  const guards=liveGuards(scope,{githubToken:'synthetic-read-only',fetcher:async u=>{
   if(u.endsWith('/healthz'))return Response.json({status:'ready',release:'phase4.7',commit:state.activeSha});
   if(u.includes('/workflows/production-release.yml/runs?'))return Response.json({total_count:0,workflow_runs:[]});
   if(u.endsWith('/jobs?per_page=100'))return Response.json({total_count:2,jobs:[{name:'owner-approval',status:'completed',conclusion:'success',run_attempt:1},{name:'retire',status:'in_progress',run_attempt:1}]});
   const id=u.match(/\/runs\/(\d+)\/attempts\/1$/)?.[1];assert.ok(id);const coordinator=id==='999';
   return Response.json({id:Number(id),run_attempt:1,status:coordinator?'in_progress':'completed',event:'workflow_dispatch',head_branch:'release/production',path:coordinator?state.coordinator.workflow:'.github/workflows/production-release.yml',head_repository:{full_name:'catillatio/test'},head_sha:coordinator?state.coordinator.headSha:current.manifest.request.sha});
  }});
  const owner=async index=>(await root.query('SELECT r.rolname AS owner FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=$1',[copies[index].database.name])).rows[0].owner;
  let seq=0,lastBaseline;
  const run=async(index,{patch={},wrap=c=>c,durable,signal,role}={})=>{
   current=make(index);Object.assign(current,patch);const client=await connect(maintenance,role);
   try{return await performAdoption(wrap(client),{...current,guards,signal,ownerApproved:async()=>{},durableIntent:durable??(async before=>{
    assert.equal(await owner(index),actor);lastBaseline=before;
    const path=join(dir,'intent-'+seq+++'.json');await writeBaseline(path,before);assert.deepEqual(JSON.parse(await readFile(path,'utf8')),JSON.parse(JSON.stringify(before)));
   })});}finally{await client.end().catch(()=>{});}
  };
  await t.test('registration remains observed-only; both emergency tuples remain outside runtime ownership',async()=>{
   const before=await inventory(admin);for(const f of copies)assert.equal(before.rows.find(r=>r.name===f.database.name).classification,'observed-only-protected');
   for(const oid of ['106971','129180'])assert.equal(before.rows.find(r=>r.oid===oid).classification,'emergency-protected');
  });
  await t.test('current/pending/manual/unknown-as-pinned holds and stale state refuse adoption before durable intent',async()=>{
   for(const field of ['pinnedCopies','pendingCopies','currentRecoveryCopy','closedJobIds','observedAt']){
    const x=make(0);x.data.state[field]=field==='currentRecoveryCopy'?copies[0].database.name:field==='closedJobIds'?[]:field==='observedAt'?new Date(0).toISOString():[copies[0].database.name];
    await assert.rejects(run(0,{patch:x,durable:async()=>assert.fail('No intent allowed')}));
   }
   assert.equal(await owner(0),actor);
  });
  await t.test('restricted registrar, authorizer and executor cannot become the privileged adopter',async()=>{
   for(const role of ['kc_copy_registrar','kc_retention_authorizer','kc_retention_runtime'])await assert.rejects(run(0,{role}));
  });
  await t.test('concurrent release advisory lock prevents ownership or provenance changes',async()=>{
   await runtime.query('SELECT pg_advisory_lock(61824087)');try{await assert.rejects(run(0));}finally{await runtime.query('SELECT pg_advisory_unlock(61824087)');}
   assert.equal(await owner(0),actor);
  });
  await t.test('missing durable intent acknowledgment leaves original ownership and no adoption record',async()=>{
   await assert.rejects(run(0,{durable:async()=>{throw Error('Synthetic lost durable acknowledgment');}}));assert.equal(await owner(0),actor);
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.copies')).rows[0].n,0);
  });
  await t.test('failure after ALTER but before provenance INSERT rolls both changes back',async()=>{
   await assert.rejects(run(0,{wrap:c=>({query:async(sql,args)=>{if(sql.startsWith('INSERT INTO release_retention.copies'))throw Error('Synthetic transaction interruption');return c.query(sql,args);}})}));
   assert.equal(await owner(0),actor);assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.copies')).rows[0].n,0);
  });
  await t.test('cancellation during the durable-record handshake rolls back and never commits',async()=>{
   const signal=new AbortController();await assert.rejects(run(0,{signal:signal.signal,durable:async()=>{signal.abort();}}));
   assert.equal(await owner(0),actor);assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.copies')).rows[0].n,0);
  });
  await t.test('a new target connection during the handshake blocks mutation on the final fresh read',async()=>{
   let held;try{await assert.rejects(run(0,{durable:async()=>{held=await connect(copies[0].database.name);}}));assert.equal(await owner(0),actor);}finally{await held?.end();}
  });
  await t.test('role permission drift during the handshake fails closed without ownership change',async()=>{
   try{await assert.rejects(run(0,{durable:async()=>{await admin.query('ALTER ROLE kc_release_copy_owner LOGIN');}}));assert.equal(await owner(0),actor);}finally{await admin.query('ALTER ROLE kc_release_copy_owner NOLOGIN');}
  });
  await t.test('concurrent untargeted identity drift is detected before adoption',async()=>{
   try{await assert.rejects(run(0,{durable:async()=>{await admin.query('ALTER DATABASE '+copies[1].database.name+' OWNER TO kc_copy_registrar');}}));assert.equal(await owner(0),actor);}finally{await admin.query('ALTER DATABASE '+copies[1].database.name+' OWNER TO '+actor);}
  });
  await t.test('successful adoption uses existing atomic engine and restricted independent postcheck',async()=>{
   current=make(0);const requestId=randomUUID(),deploymentId=randomUUID(),keys=generateKeyPairSync('ed25519'),codeDigest=rawDigest(Buffer.from('synthetic-exact-image'));
   const data={protocol:'kingdom-retention-delivery-v1',scope,state:current.data.state,operation:'adopt',requestId,data:{...current.data.data,artifactId:'123'}};
   const names=['inputGet','readyPut','armGet','resultPut','baselinePut','baselineGet','proceedGet'];const urls=Object.fromEntries(names.map(k=>[k,'https://objects.fixture.invalid/'+k]));
   const f={protocol:data.protocol,role:'adopter',operation:'adopt',requestId,scope,coordinator:state.coordinator,adoption:current.f.adoption,codeDigest,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),githubToken:'synthetic-read-only',origin:'https://objects.fixture.invalid',urls,deliveryVerifyKey:keys.publicKey.export({type:'spki',format:'pem'})};
   const objects=new Map([[urls.inputGet,data],[urls.armGet,signArm(f,deploymentId,hash(data),keys.privateKey)]]);
   const fetcher=async(u,o={})=>{
    if(u.startsWith(f.origin)){
     if(o.method==='PUT'){
      assert.equal(o.headers['if-none-match'],'*');assert.ok(!objects.has(u));const value=JSON.parse(o.body);objects.set(u,value);
      if(u===urls.baselinePut){lastBaseline=value;assert.equal(await owner(0),actor);objects.set(urls.baselineGet,value);objects.set(urls.proceedGet,signArm(f,deploymentId,hash(data),keys.privateKey,hash(value)));}
      return new Response('',{status:200});
     }
     assert.ok(objects.has(u));return Response.json(objects.get(u));
    }
    if(u.endsWith('/approvals'))return Response.json([{state:'approved',user:{login:'catillatio'},environments:[{name:'retention-signing'}],comment:'adoption '+requestId+' '+hash(data)}]);
    if(u.endsWith('/healthz'))return Response.json({status:'ready',release:'phase4.7',commit:state.activeSha});
    if(u.includes('/workflows/production-release.yml/runs?'))return Response.json({total_count:0,workflow_runs:[]});
    if(u.endsWith('/jobs?per_page=100'))return Response.json({total_count:2,jobs:[{name:'owner-approval',status:'completed',conclusion:'success',run_attempt:1},{name:'retire',status:'in_progress',run_attempt:1}]});
    const id=u.match(/\/runs\/(\d+)\/attempts\/1$/)?.[1];assert.ok(id);const coordinator=id==='999';
    return Response.json({id:Number(id),run_attempt:1,status:coordinator?'in_progress':'completed',event:'workflow_dispatch',head_branch:'release/production',path:coordinator?state.coordinator.workflow:'.github/workflows/production-release.yml',head_repository:{full_name:'catillatio/test'},head_sha:coordinator?state.coordinator.headSha:current.manifest.request.sha});
   };
   const env={NODE_ENV:'production',KINGDOM_RETENTION_ADOPTER_ENABLED:'1',RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,RAILWAY_SERVICE_ID:f.adoption.serviceId,RAILWAY_DEPLOYMENT_ID:deploymentId,KINGDOM_RETENTION_JOB:Buffer.from(JSON.stringify(f)).toString('base64url'),KINGDOM_RETENTION_ADOPTER_DB_HOST:scope.host,KINGDOM_RETENTION_ADOPTER_DB_USER:decodeURIComponent(url.username),KINGDOM_RETENTION_ADOPTER_DB_PASSWORD:decodeURIComponent(url.password),KINGDOM_RETENTION_ADOPTER_DB_NAME:scope.adminDatabase};
   assert.deepEqual(await runAdopter({env,image:{role:'adopter',codeDigest},fetcher,clientFactory:actual=>{const u=new URL(actual);assert.equal(u.hostname,scope.host);u.hostname=url.hostname;u.port=url.port;return new pg.Client({connectionString:u.href});}}),{passed:true});
   const outcome=objects.get(urls.resultPut);assert.equal(outcome.result.alreadyAdopted,false);assert.equal(outcome.baselineDigest,hash(lastBaseline));assert.equal(await owner(0),'kc_release_copy_owner');
   assert.ok(!JSON.stringify([...objects.values()]).includes(decodeURIComponent(url.password)));

   const check=await verifyAdoption(runtime,copies[0].catalog.evidence,scope);assert.equal(check.serverDerivedHold,true);assert.equal(check.retirementAuthorized,false);
   const after=await snapshot(runtime);assert.equal(verifyAdoptionPreservation(lastBaseline,after,observationPayload(copies[0].catalog.evidence)).allUntargetedIdentitiesPreserved,true);
   assert.equal(await business(),saved);await assert.rejects(run(0));
  });
  await t.test('lost COMMIT acknowledgment is not a failed adoption nor permission to repeat it',async()=>{
   let committed=false;
   await assert.rejects(run(1,{wrap:c=>({query:async(sql,args)=>{const r=await c.query(sql,args);if(sql==='COMMIT'){committed=true;throw Error('Synthetic lost COMMIT acknowledgment');}return r;}})}),e=>{if(!committed)throw e;return true;});
   assert.equal(committed,true);assert.equal(await owner(1),'kc_release_copy_owner');const at=(await admin.query('SELECT first_observed_at FROM release_retention.copies WHERE name=$1',[copies[1].database.name])).rows[0].first_observed_at;
   await assert.rejects(run(1));assert.equal(+(await admin.query('SELECT first_observed_at FROM release_retention.copies WHERE name=$1',[copies[1].database.name])).rows[0].first_observed_at,+at);
  });
  await t.test('new 24-hour hold and both newest anchors remain protected; no permit/deletion was created',async()=>{
   await lockCluster(runtime,scope);try{const plan=await inspect(runtime,{...state,observedAt:new Date().toISOString()},scope);
    for(const copy of copies.slice(0,2)){const row=plan.rows.find(r=>r.name===copy.database.name);assert.equal(row.eligible,false);assert.ok(row.reasons.includes('within-age-window'));}
   }finally{await runtime.query('SELECT pg_advisory_unlock(61824087)');}
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.permits')).rows[0].n,0);
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.audit')).rows[0].n,0);assert.equal(await business(),saved);
  });
 }finally{
  for(const c of clients)await c.end().catch(()=>{});
  for(const name of created.filter(n=>n!==maintenance))await root.query('DROP DATABASE IF EXISTS "'+name+'"');
  if(installed){const c=await connect(maintenance);try{await c.query('DROP SCHEMA release_observations CASCADE; DROP SCHEMA release_retention CASCADE; DROP OWNED BY kc_copy_registrar; DROP OWNED BY kc_retention_authorizer; DROP OWNED BY kc_retention_runtime; DROP OWNED BY kc_retention_owner; DROP OWNED BY kc_release_copy_owner;');}finally{await c.end();}}
  if(created.includes(maintenance))await root.query('DROP DATABASE '+maintenance);
  if(installed)await root.query('DROP ROLE kc_copy_registrar; DROP ROLE kc_retention_authorizer; DROP ROLE kc_retention_runtime; DROP ROLE kc_release_copy_owner; DROP ROLE kc_retention_owner');
  await root.end();await rm(dir,{recursive:true,force:true});
 }
});
