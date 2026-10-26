import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {lockCluster,inspect,cleanup,checkCatalog} from '../deployment/release/retention/retention.mjs';
import {reconcileInterrupted} from '../deployment/release/retention/reconcile.mjs';
import {inventory} from '../deployment/release/retention/inventory.mjs';
import {installPermit} from '../deployment/release/retention/permit.mjs';
import {randomUUID} from 'node:crypto';
import {hash} from '../deployment/release/retention/protocol.mjs';
import {scope as fixtureScope,publicKey,fixture,approve,scenario} from './fixtures/release-retention.mjs';

const target=process.env.TEST_DATABASE_URL;
test('disposable PostgreSQL retention, append-only permissions, concurrency and populated preservation',{skip:!target,timeout:120000},async t=>{
 const url=new URL(target);assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Use only disposable local PostgreSQL.');
 const root=new pg.Client({connectionString:target});await root.connect();
 const adminUrl=new URL(target);adminUrl.pathname='/kingdom_release_retention';
 let admin,runtime,authorizer,other,sourceCreated=false,adminCreated=false;const created=[];
 const database=name=>'"'+name+'"'; // Names below are exclusively synthetic fixtures.
 try{
  if(!(await root.query("SELECT 1 FROM pg_database WHERE datname='kingdom_release_retention'")).rowCount){await root.query('CREATE DATABASE kingdom_release_retention');adminCreated=true;}
  admin=new pg.Client({connectionString:adminUrl.href});await admin.connect();
  await admin.query(await readFile(new URL('../deployment/release/retention/bootstrap.sql',import.meta.url),'utf8'));
  await admin.query("GRANT CONNECT ON DATABASE kingdom_release_retention TO kc_retention_runtime; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT EXECUTE ON FUNCTION pg_control_system() TO kc_retention_runtime;");
  const cluster=(await admin.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id;
  const scope={...fixtureScope,clusterDigest:createHash('sha256').update(cluster).digest('hex')};
  const now=Date.now(),copies=Array.from({length:8},(_,i)=>fixture(i+1,{now,age:80-i}));
  for(const copy of copies){
   copy.catalog.evidence.report.restoreClusterDigest=scope.clusterDigest;
   copy.catalog.evidence_sha256=hash(copy.catalog.evidence);
   await root.query('CREATE DATABASE '+database(copy.database.name)+' OWNER kc_release_copy_owner');created.push(copy.database.name);
   const oid=(await root.query('SELECT oid::text FROM pg_database WHERE datname=$1',[copy.database.name])).rows[0].oid;
   copy.database.oid=oid;copy.catalog.oid=oid;
   await admin.query('INSERT INTO release_retention.copies(name,database_oid,owner_name,verified_at,first_observed_at,evidence,evidence_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)',[copy.database.name,oid,copy.database.owner,copy.catalog.verified_at,copy.catalog.first_observed_at,copy.catalog.evidence,copy.catalog.evidence_sha256]);
  }
  const source='retention_preserved_source_test';await root.query('CREATE DATABASE '+source);sourceCreated=true;
  const sourceUrl=new URL(target);sourceUrl.pathname='/'+source;
  const preserved=new pg.Client({connectionString:sourceUrl.href});await preserved.connect();
  await preserved.query(`CREATE TABLE accounts(id int PRIMARY KEY,kind text,wallet bigint,vault bigint,session text);
   INSERT INTO accounts SELECT n,CASE WHEN n<=900 THEN 'bot' ELSE 'human' END,10000+n,25000+n,'saved-session-'||n FROM generate_series(1,902)n;
   CREATE TABLE holdings AS SELECT id,2 AS land,3 AS equipment,4 AS army FROM accounts;
   CREATE TABLE history AS SELECT id,'durable-history'::text AS event FROM accounts;`);
  const before=JSON.stringify((await preserved.query("SELECT (SELECT jsonb_agg(a ORDER BY id) FROM accounts a) AS accounts,(SELECT jsonb_agg(h ORDER BY id) FROM holdings h) AS holdings,(SELECT jsonb_agg(h ORDER BY id) FROM history h) AS history")).rows);
  await preserved.end();
  runtime=new pg.Client({connectionString:adminUrl.href});await runtime.connect();await runtime.query('SET SESSION AUTHORIZATION kc_retention_runtime');
  await lockCluster(runtime,scope);
  const state={...scenario(copies,now).state,scope};state.pinnedCopies=[copies[2].database.name];state.pendingCopies=[copies[3].database.name];state.closedJobIds=state.closedJobIds.filter(id=>id!==copies[4].jobId);
  authorizer=new pg.Client({connectionString:adminUrl.href});await authorizer.connect();await authorizer.query('SET SESSION AUTHORIZATION kc_retention_authorizer');
  const permit=async plan=>{const signed=approve(plan,state,{scope,now:Date.now()});await installPermit(authorizer,{scope,state,plan,approval:signed.encoded,verifyKey:publicKey});return signed;};
  let plan,interruptedApproval;
  await t.test('dry-run is read-only and explains sizes, pinned, pending, unresolved, newest and current copies',async()=>{
   plan=await inspect(runtime,state,scope);assert.deepEqual(plan.rows.filter(row=>row.eligible).map(row=>row.name).sort(),[copies[0],copies[1],copies[5]].map(c=>c.database.name).sort());
   assert.ok(BigInt(plan.reclaimableBytes)>0n);assert.equal((await runtime.query('SELECT count(*)::int AS n FROM release_retention.audit')).rows[0].n,0);
  });
  await t.test('read-only inventory reconciles real names/OIDs/owners/sizes without assigning cleanup eligibility',async()=>{
   const report=await inventory(admin);assert.equal(report.identity.cluster_digest,scope.clusterDigest);assert.equal(report.rows.filter(r=>r.classification==='adopted-requires-fresh-plan').length,8);
   assert.ok(report.rows.every(r=>r.eligible===false));assert.ok(BigInt(report.databaseBytes)>0n);assert.equal(report.reclaimableBytes,null);
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.audit')).rows[0].n,0);
   const ordinary=new pg.Client({connectionString:sourceUrl.href});await ordinary.connect();
   try{const noCatalog=await inventory(ordinary);assert.ok(noCatalog.rows.every(r=>r.eligible===false&&r.provenance===null));}finally{await ordinary.end();}
  });
  await t.test('SQL protects emergency OIDs even when called directly',async()=>{
   for(const oid of ['106971','129180'])await assert.rejects(runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5)',[randomUUID(),'f'.repeat(64),copies[0].database.name,oid,'intent']),/Emergency recovery OID is protected/);
  });
  await t.test('unregistered signatures and fabricated IDs, outcomes or bytes cannot enter the audit',async()=>{
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[0].database.name)};
   const raw=approve(single,state,{scope,now:Date.now()});
   await assert.rejects(cleanup(runtime,{scope,state,plan:single,approval:raw.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));
   const event=(id,p,n,o,e)=>runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5) AS bytes',[id,p,n,o,e]);
   for(const e of ['intent','deleted','absent','refused'])await assert.rejects(event(randomUUID(),hash(single),copies[0].database.name,copies[0].database.oid,e));
   const signed=await permit(single);
   for(const e of ['deleted','absent','refused'])await assert.rejects(event(signed.approval.id,hash(single),copies[0].database.name,copies[0].database.oid,e));
   await assert.rejects(event(signed.approval.id,hash(single),copies[0].database.name,String(Number(copies[0].database.oid)+1),'intent'));
   await assert.rejects(event(signed.approval.id,'f'.repeat(64),copies[0].database.name,copies[0].database.oid,'intent'));
   await assert.rejects(event(signed.approval.id,hash(single),copies[2].database.name,copies[2].database.oid,'intent'));
   await assert.rejects(runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5,$6)',[signed.approval.id,hash(single),copies[0].database.name,copies[0].database.oid,'deleted','999999999999999999']));
   assert.equal((await runtime.query('SELECT count(*)::int AS n FROM release_retention.audit')).rows[0].n,0);
  });
  await t.test('permit registration validates signatures, is concurrent-idempotent and separates authorizer privileges',async()=>{
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[1].database.name)},signed=approve(single,state,{scope,now:Date.now()});
   const args={scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey};
   const second=new pg.Client({connectionString:adminUrl.href});await second.connect();await second.query('SET SESSION AUTHORIZATION kc_retention_authorizer');
   try{await Promise.all([installPermit(authorizer,args),installPermit(second,args)]);}finally{await second.end();}
   await installPermit(authorizer,args);
   assert.equal((await runtime.query('SELECT count(*)::int AS n FROM release_retention.permits WHERE approval_id=$1',[signed.approval.id])).rows[0].n,1);
   for(const sql of ['UPDATE release_retention.audit SET measured_bytes=0','TRUNCATE release_retention.audit','ALTER TABLE release_retention.audit DISABLE TRIGGER ALL',
    'SET ROLE kc_retention_owner','SET ROLE kc_release_copy_owner','DROP DATABASE "'+copies[0].database.name+'"'])await assert.rejects(authorizer.query(sql));
   await assert.rejects(installPermit(authorizer,{...args,approval:signed.encoded.slice(1)}));
   const interrupted=approve(single,state,{scope,now:Date.now()}),query=authorizer.query.bind(authorizer);
   await assert.rejects(installPermit({query:(sql,...params)=>{if(sql==='COMMIT')throw new Error('Synthetic grant interruption');return query(sql,...params);}},
    {...args,approval:interrupted.encoded}));
   assert.equal((await runtime.query('SELECT count(*)::int AS n FROM release_retention.permits WHERE approval_id=$1',[interrupted.approval.id])).rows[0].n,0);
   await admin.query('GRANT kc_release_copy_owner TO kc_retention_authorizer');
   try{await assert.rejects(installPermit(authorizer,args));}finally{await admin.query('REVOKE kc_release_copy_owner FROM kc_retention_authorizer');}

   await assert.rejects(runtime.query('INSERT INTO release_retention.permits SELECT * FROM release_retention.permits LIMIT 1'));
   await assert.rejects(runtime.query("UPDATE release_retention.permits SET expires_at=clock_timestamp()+interval '1 hour'"));
  });
  await t.test('database expiry and cluster checks reject forged or expired historical permit contexts',async()=>{
   const selected=plan.rows.find(row=>row.name===copies[0].database.name);
   for(const [expired,grantCluster,databaseName] of [[true,cluster,scope.adminDatabase],[false,'wrong-cluster',scope.adminDatabase],[false,cluster,'wrong-maintenance-database']]){
    const past=Date.now()-600000,historicalState={...state,observedAt:new Date(past).toISOString()},historicalPlan={...plan,stateSha256:hash(historicalState)};
    const signed=approve(historicalPlan,historicalState,{scope,now:past});
    // Privileged synthetic historical records model a previously registered grant.
    // Production authorizer code rejects these invalid/expired contexts itself.
    await admin.query(`INSERT INTO release_retention.permits(approval_id,registered_at,expires_at,plan_sha256,state_sha256,encoded_approval,plan,state,cluster_identifier,maintenance_database)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[signed.approval.id,new Date(expired?past:Date.now()),new Date(expired?past+240000:Date.now()+240000),hash(historicalPlan),hash(historicalState),signed.encoded,historicalPlan,historicalState,grantCluster,databaseName]);
    await assert.rejects(runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5)',[signed.approval.id,hash(historicalPlan),selected.name,selected.oid,'intent']));
   }
   assert.equal((await runtime.query('SELECT count(*)::int AS n FROM release_retention.audit')).rows[0].n,0);
  });
  await t.test('SQL independently rejects a permit fabricated by a privileged installer for a newest retained copy',async()=>{
   const newest=plan.rows.find(r=>r.name===copies.at(-2).database.name);
   const forged={...plan,rows:[{...newest,eligible:true,reasons:['obsolete-verified-copy']}]},signed=approve(forged,state,{scope,now:Date.now()});
   await admin.query(`INSERT INTO release_retention.permits(approval_id,expires_at,plan_sha256,state_sha256,encoded_approval,plan,state,cluster_identifier,maintenance_database) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[signed.approval.id,signed.approval.expiresAt,hash(forged),hash(state),signed.encoded,forged,state,cluster,scope.adminDatabase]);
   await assert.rejects(runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5)',[signed.approval.id,hash(forged),newest.name,newest.oid,'intent']));
  });
  await t.test('runtime cannot modify provenance, rewrite audit, replace guards, disable triggers or own the catalog',async()=>{
   for(const sql of ["UPDATE release_retention.copies SET owner_name='postgres'","DELETE FROM release_retention.audit",'TRUNCATE release_retention.audit',
    'ALTER TABLE release_retention.audit DISABLE TRIGGER ALL','ALTER TABLE release_retention.copies ADD COLUMN bad text',
    "CREATE OR REPLACE FUNCTION release_retention.no_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$",
    'DROP FUNCTION release_retention.record_event(text,text,text,oid,text)','SET ROLE kc_retention_owner','CREATE SCHEMA attacker','CREATE ROLE attacker','DROP DATABASE kingdom_release_retention'])await assert.rejects(runtime.query(sql));
   await checkCatalog(runtime);
  });
  await t.test('effective column grants, sequence privileges and owner login changes fail closed',async()=>{
   for(const [grant,revoke] of [["GRANT INSERT(approval_id) ON release_retention.audit TO kc_retention_runtime","REVOKE INSERT(approval_id) ON release_retention.audit FROM kc_retention_runtime"],
    ['GRANT USAGE ON SEQUENCE release_retention.audit_sequence_seq TO kc_retention_runtime','REVOKE USAGE ON SEQUENCE release_retention.audit_sequence_seq FROM kc_retention_runtime'],
    ['ALTER ROLE kc_retention_owner LOGIN','ALTER ROLE kc_retention_owner NOLOGIN']]){
    await admin.query(grant);try{await assert.rejects(checkCatalog(runtime));}finally{await admin.query(revoke);}
   }
   await checkCatalog(runtime);
  });
  await t.test('concurrent verification or retention cannot acquire the same session advisory lock',async()=>{
   other=new pg.Client({connectionString:adminUrl.href});await other.connect();
   assert.equal((await other.query('SELECT pg_try_advisory_lock(61824087) AS acquired')).rows[0].acquired,false);
   await other.end();other=null;
  });
  await t.test('cleanup without the exclusive session lock or a successful live guard performs no deletion',async()=>{
   const signed=await permit(plan),unlocked=new pg.Client({connectionString:adminUrl.href});await unlocked.connect();
   try{await unlocked.query('SET SESSION AUTHORIZATION kc_retention_runtime');await assert.rejects(cleanup(unlocked,{scope,state,plan,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));}
   finally{await unlocked.end();}
   await runtime.query('SELECT pg_advisory_unlock(61824087),pg_advisory_lock_shared(61824087)');
   try{
    const target=plan.rows.find(row=>row.eligible);
    await assert.rejects(runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5)',[signed.approval.id,hash(plan),target.name,target.oid,'intent']));
    await assert.rejects(cleanup(runtime,{scope,state,plan,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));
   }finally{
    await runtime.query('SELECT pg_advisory_unlock_shared(61824087)');
    assert.equal((await runtime.query('SELECT pg_try_advisory_lock(61824087) AS acquired')).rows[0].acquired,true);
   }
   await assert.rejects(cleanup(runtime,{scope,state,plan,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{throw new Error('Synthetic live guard failure');}}));
   assert.equal((await runtime.query('SELECT count(*)::int AS n FROM release_retention.audit')).rows[0].n,0);
  });
  await t.test('wrong cluster fails before eligibility or deletion',async()=>{
   await assert.rejects(lockCluster(runtime,{...scope,clusterDigest:'f'.repeat(64)}));
  });
  await t.test('active connections protect an otherwise eligible copy',async()=>{
   const activeUrl=new URL(target);activeUrl.pathname='/'+copies[0].database.name;
   const active=new pg.Client({connectionString:activeUrl.href});await active.connect();
   try{const fresh=await inspect(runtime,state,scope);assert.ok(fresh.rows.find(r=>r.name===copies[0].database.name).reasons.includes('in-use-or-unknown'));}
   finally{await active.end();}
  });
  await t.test('audit measures server bytes, refuses existing-database outcomes, and seals a terminal refusal',async()=>{
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[0].database.name).map(row=>({...row,bytes:'999999999999999999'}))},signed=await permit(single);
   const event=e=>runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5) AS bytes',[signed.approval.id,hash(single),copies[0].database.name,copies[0].database.oid,e]);
   const measured=(await event('intent')).rows[0].bytes;
   assert.equal(measured,(await root.query('SELECT pg_database_size($1::oid)::text AS bytes',[copies[0].database.oid])).rows[0].bytes);
   assert.notEqual(measured,single.rows[0].bytes);assert.equal((await event('intent')).rows[0].bytes,measured);
   await assert.rejects(event('deleted'));await assert.rejects(event('absent'));
   assert.equal((await event('refused')).rows[0].bytes,'0');assert.equal((await event('refused')).rows[0].bytes,'0');
   await assert.rejects(event('deleted'));await assert.rejects(event('intent'));
   const rows=(await runtime.query('SELECT event,measured_bytes::text AS bytes FROM release_retention.audit WHERE approval_id=$1 ORDER BY sequence',[signed.approval.id])).rows;
   assert.deepEqual(rows,[{event:'intent',bytes:measured},{event:'refused',bytes:'0'}]);
  });
  await t.test('temporary catalog shadows cannot fake database absence or the session lock',async()=>{
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[0].database.name)},signed=await permit(single);
   const args=[signed.approval.id,hash(single),copies[0].database.name,copies[0].database.oid];
   await runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5)',[...args,'intent']);
   await runtime.query('CREATE TEMP TABLE pg_database(datname name,oid oid); SET search_path=pg_temp,pg_catalog');
   try{await assert.rejects(runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5)',[...args,'deleted']));}
   finally{await runtime.query('SET search_path=pg_catalog,pg_temp');}
   await runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5)',[...args,'refused']);
   const unlocked=new pg.Client({connectionString:adminUrl.href});await unlocked.connect();await unlocked.query('SET SESSION AUTHORIZATION kc_retention_runtime');
   try{
    await unlocked.query("CREATE TEMP TABLE pg_locks(locktype text,classid oid,objid oid,objsubid int,pid int,granted bool); INSERT INTO pg_temp.pg_locks VALUES('advisory',0,61824087,1,pg_backend_pid(),true); SET search_path=pg_temp,pg_catalog");
    await assert.rejects(unlocked.query('SELECT release_retention.record_event($1,$2,$3,$4,$5)',[...args,'intent']));
   }finally{await unlocked.end();}
   assert.equal((await root.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',[copies[0].database.name])).rows[0].n,1);
  });
  await t.test('a connection opened after revalidation makes non-FORCE DROP refuse, without terminating it',async()=>{
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[0].database.name)},signed=await permit(single);
   let active;const query=runtime.query.bind(runtime);
   const race={query:async(sql,...args)=>{
    if(sql.startsWith('DROP DATABASE ')){const u=new URL(target);u.pathname='/'+copies[0].database.name;active=new pg.Client({connectionString:u.href});await active.connect();}
    return query(sql,...args);
   }};
   try{await assert.rejects(cleanup(race,{scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));assert.equal((await active.query('SELECT 1 AS n')).rows[0].n,1);}
   finally{if(active)await active.end();}
   assert.equal((await root.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',[copies[0].database.name])).rows[0].n,1);
  });
  await t.test('lost DROP privilege refuses deletion and leaves a durable intent',async()=>{
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[1].database.name)},signed=await permit(single);
   const query=runtime.query.bind(runtime);
   const revoked={query:async(sql,...args)=>{if(sql.startsWith('DROP DATABASE '))await admin.query('REVOKE kc_release_copy_owner FROM kc_retention_runtime');return query(sql,...args);}};
   try{await assert.rejects(cleanup(revoked,{scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));}
   finally{await admin.query('GRANT kc_release_copy_owner TO kc_retention_runtime');}
   assert.ok((await runtime.query('SELECT event FROM release_retention.audit WHERE approval_id=$1',[signed.approval.id])).rows.some(row=>row.event==='refused'));
  });
  await t.test('cleanup journals before DROP; retry reconciles a crash after DROP with zero invented reclaimed bytes',async()=>{
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[0].database.name)},signed=await permit(single);
   interruptedApproval=signed;
   const otherGrants=[await permit(single),await permit(single)];
   for(const grant of otherGrants)await runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5)',[grant.approval.id,hash(single),copies[0].database.name,copies[0].database.oid,'intent']);
   const query=runtime.query.bind(runtime);let interrupted=false;
   const crash={query:(sql,args)=>{if(sql.includes('record_event')&&args?.[4]==='deleted'){interrupted=true;throw new Error('Synthetic interruption');}return query(sql,args);}};
   await assert.rejects(cleanup(crash,{scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));assert.equal(interrupted,true);
   const event=(grant,e)=>runtime.query('SELECT release_retention.record_event($1,$2,$3,$4,$5) AS bytes',[grant.approval.id,hash(single),copies[0].database.name,copies[0].database.oid,e]);
   assert.ok(BigInt((await event(otherGrants[0],'deleted')).rows[0].bytes)>0n);
   await assert.rejects(event(otherGrants[1],'deleted'));
   assert.equal((await event(otherGrants[1],'absent')).rows[0].bytes,'0');
   assert.equal((await runtime.query("SELECT count(*)::int AS n FROM release_retention.audit WHERE database_oid=$1 AND event='deleted'",[copies[0].database.oid])).rows[0].n,1);
   const reconciled=await reconcileInterrupted(runtime,{scope,approvalId:signed.approval.id,verifyKey:publicKey});
   assert.deepEqual(reconciled.reconciledAbsent,[copies[0].database.name]);assert.equal(reconciled.measuredDatabaseBytesRemoved,'0');
   assert.deepEqual((await reconcileInterrupted(runtime,{scope,approvalId:signed.approval.id,verifyKey:publicKey})).reconciledAbsent,[]);
   const result=await cleanup(runtime,{scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}});
   assert.deepEqual(result.alreadyAbsent,[copies[0].database.name]);assert.equal(result.measuredDatabaseBytesRemoved,'0');
   const repeated=await cleanup(runtime,{scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}});assert.deepEqual(repeated,result);
  });
  await t.test('expired historical intent can reconcile absence without renewing deletion authority',async()=>{
   const past=Date.now()-600000,oldState={...state,observedAt:new Date(past).toISOString()};
   const oldPlan={...plan,stateSha256:hash(oldState),rows:plan.rows.filter(r=>r.name===copies[0].database.name)},signed=approve(oldPlan,oldState,{scope,now:past});
   // Privileged fixture models an authorization/intent durably committed before
   // a crash, not permission for the runtime to forge historical timestamps.
   await admin.query(`INSERT INTO release_retention.permits(approval_id,registered_at,expires_at,plan_sha256,state_sha256,encoded_approval,plan,state,cluster_identifier,maintenance_database) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[signed.approval.id,new Date(past),signed.approval.expiresAt,hash(oldPlan),hash(oldState),signed.encoded,oldPlan,oldState,cluster,scope.adminDatabase]);
   await admin.query(`INSERT INTO release_retention.audit(at,approval_id,plan_sha256,name,database_oid,event,measured_bytes) VALUES($1,$2,$3,$4,$5,'intent',1000)`,[new Date(past+1),signed.approval.id,hash(oldPlan),copies[0].database.name,copies[0].database.oid]);
   await assert.rejects(cleanup(runtime,{scope,state:oldState,plan:oldPlan,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));
   const reconciled=await reconcileInterrupted(runtime,{scope,approvalId:signed.approval.id,verifyKey:publicKey});
   assert.deepEqual(reconciled.reconciledAbsent,[copies[0].database.name]);assert.equal(reconciled.measuredDatabaseBytesRemoved,'0');
   assert.equal((await runtime.query("SELECT measured_bytes::text AS bytes FROM release_retention.audit WHERE approval_id=$1 AND event='absent'",[signed.approval.id])).rows[0].bytes,'0');
  });
  await t.test('a reappeared name with a new OID cannot be deleted by an old approval',async()=>{
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[0].database.name)},signed=interruptedApproval;
   await root.query('CREATE DATABASE '+database(copies[0].database.name)+' OWNER kc_release_copy_owner');
   await assert.rejects(cleanup(runtime,{scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));
   assert.equal((await root.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',[copies[0].database.name])).rows[0].n,1);
   // Privileged TEST repair only: a reused/uncatalogued DB must never remain
   // owned by the restricted executor. Production would stop for owner review.
   await assert.rejects(checkCatalog(runtime));
   await root.query('ALTER DATABASE '+database(copies[0].database.name)+' OWNER TO CURRENT_USER');
  });
  await t.test('durable pin changes cannot race retirement; coordinated append-only unpin is explicit',async()=>{
   await assert.rejects(admin.query('INSERT INTO release_retention.pins(name,pinned,reason) VALUES($1,true,$2)',[copies[5].database.name,'Uncoordinated pin']),/session lock required/);
   assert.equal((await admin.query('SELECT pg_try_advisory_lock(61824087) AS acquired')).rows[0].acquired,false);
   const pin=async(pinned,reason)=>{
    await runtime.query('SELECT pg_advisory_unlock(61824087)');
    assert.equal((await admin.query('SELECT pg_try_advisory_lock(61824087) AS acquired')).rows[0].acquired,true);
    try{await admin.query('INSERT INTO release_retention.pins(name,pinned,reason) VALUES($1,$2,$3)',[copies[5].database.name,pinned,reason]);}
    finally{await admin.query('SELECT pg_advisory_unlock(61824087)');assert.equal((await runtime.query('SELECT pg_try_advisory_lock(61824087) AS acquired')).rows[0].acquired,true);}
   };
   await pin(true,'Synthetic recovery pin');
   assert.ok((await inspect(runtime,state,scope)).rows.find(row=>row.name===copies[5].database.name).reasons.includes('durably-pinned'));
   await assert.rejects(runtime.query('INSERT INTO release_retention.pins(name,pinned,reason) VALUES($1,false,$2)',[copies[5].database.name,'Unauthorized']));
   await assert.rejects(runtime.query('TRUNCATE release_retention.pins'));
   await pin(false,'Separately reviewed synthetic unpin');
   assert.equal((await inspect(runtime,state,scope)).rows.find(row=>row.name===copies[5].database.name).eligible,true);
  });
  await t.test('eligible copies are dropped once; current, pinned, pending and populated source survive',async()=>{
   const fresh=await inspect(runtime,state,scope),signed=await permit(fresh);
   const result=await cleanup(runtime,{scope,state,plan:fresh,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}});assert.equal(result.dropped.length,2);assert.ok(BigInt(result.measuredDatabaseBytesRemoved)>0n);
   const after=await inspect(runtime,state,scope);assert.equal(after.rows.filter(r=>r.eligible).length,0);
   const check=new pg.Client({connectionString:sourceUrl.href});await check.connect();
   try{assert.equal(JSON.stringify((await check.query("SELECT (SELECT jsonb_agg(a ORDER BY id) FROM accounts a) AS accounts,(SELECT jsonb_agg(h ORDER BY id) FROM holdings h) AS holdings,(SELECT jsonb_agg(h ORDER BY id) FROM history h) AS history")).rows),before);}
   finally{await check.end();}
   assert.ok((await runtime.query('SELECT count(*)::int AS n FROM release_retention.audit')).rows[0].n>=6);
  });
  await t.test('altered installed guard is detected even if name and owner look right',async()=>{
   await admin.query("CREATE OR REPLACE FUNCTION release_retention.no_rewrite() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RETURN NULL; END $$");
   await assert.rejects(checkCatalog(runtime));
  });
 }finally{
  if(other)await other.end();if(authorizer)await authorizer.end();if(runtime)await runtime.end();if(admin)await admin.end();
  for(const name of created)await root.query('DROP DATABASE IF EXISTS '+database(name));
  if(sourceCreated)await root.query('DROP DATABASE retention_preserved_source_test');
  // All objects/roles below belong only to this disposable test installation.
  const final=new pg.Client({connectionString:adminUrl.href});await final.connect();
  try{await final.query('DROP SCHEMA IF EXISTS release_retention CASCADE; REVOKE EXECUTE ON FUNCTION pg_control_system() FROM kc_retention_runtime,kc_retention_authorizer,kc_retention_owner; DROP OWNED BY kc_retention_authorizer; DROP OWNED BY kc_retention_runtime; DROP OWNED BY kc_retention_owner; DROP OWNED BY kc_release_copy_owner;');}finally{await final.end();}
  if(adminCreated)await root.query('DROP DATABASE kingdom_release_retention');
  await root.query('DROP ROLE kc_retention_authorizer; DROP ROLE kc_retention_runtime; DROP ROLE kc_release_copy_owner; DROP ROLE kc_retention_owner');await root.end();
 }
});
