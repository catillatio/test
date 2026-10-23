import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {lockCluster,inspect,cleanup,checkCatalog} from '../deployment/release/retention/retention.mjs';
import {hash} from '../deployment/release/retention/protocol.mjs';
import {scope as fixtureScope,publicKey,fixture,approve,scenario} from './fixtures/release-retention.mjs';

const target=process.env.TEST_DATABASE_URL;
test('disposable PostgreSQL retention, append-only permissions, concurrency and populated preservation',{skip:!target,timeout:120000},async t=>{
 const url=new URL(target);assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Use only disposable local PostgreSQL.');
 const root=new pg.Client({connectionString:target});await root.connect();
 const adminUrl=new URL(target);adminUrl.pathname='/kingdom_release_retention';
 let admin,runtime,other,sourceCreated=false,adminCreated=false;const created=[];
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
   INSERT INTO accounts SELECT n,CASE WHEN n<=450 THEN 'bot' ELSE 'human' END,10000+n,25000+n,'saved-session-'||n FROM generate_series(1,452)n;
   CREATE TABLE holdings AS SELECT id,2 AS land,3 AS equipment,4 AS army FROM accounts;
   CREATE TABLE history AS SELECT id,'durable-history'::text AS event FROM accounts;`);
  const before=JSON.stringify((await preserved.query("SELECT (SELECT jsonb_agg(a ORDER BY id) FROM accounts a) AS accounts,(SELECT jsonb_agg(h ORDER BY id) FROM holdings h) AS holdings,(SELECT jsonb_agg(h ORDER BY id) FROM history h) AS history")).rows);
  await preserved.end();
  runtime=new pg.Client({connectionString:adminUrl.href});await runtime.connect();await runtime.query('SET SESSION AUTHORIZATION kc_retention_runtime');
  await lockCluster(runtime,scope);
  const state={...scenario(copies,now).state,scope};state.pinnedCopies=[copies[2].database.name];state.pendingCopies=[copies[3].database.name];state.closedJobIds=state.closedJobIds.filter(id=>id!==copies[4].jobId);
  let plan;
  await t.test('dry-run is read-only and explains sizes, pinned, pending, unresolved, newest and current copies',async()=>{
   plan=await inspect(runtime,state,scope);assert.deepEqual(plan.rows.filter(row=>row.eligible).map(row=>row.name).sort(),[copies[0],copies[1],copies[5]].map(c=>c.database.name).sort());
   assert.ok(BigInt(plan.reclaimableBytes)>0n);assert.equal((await runtime.query('SELECT count(*)::int AS n FROM release_retention.audit')).rows[0].n,0);
  });
  await t.test('runtime cannot modify provenance, rewrite audit, replace guards, disable triggers or own the catalog',async()=>{
   for(const sql of ["UPDATE release_retention.copies SET owner_name='postgres'","DELETE FROM release_retention.audit",'TRUNCATE release_retention.audit',
    'ALTER TABLE release_retention.audit DISABLE TRIGGER ALL','ALTER TABLE release_retention.copies ADD COLUMN bad text',
    "CREATE OR REPLACE FUNCTION release_retention.no_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$",
    'DROP FUNCTION release_retention.record_event(text,text,text,oid,text,bigint)','SET ROLE kc_retention_owner','CREATE SCHEMA attacker','CREATE ROLE attacker','DROP DATABASE kingdom_release_retention'])await assert.rejects(runtime.query(sql));
   await checkCatalog(runtime);
  });
  await t.test('concurrent verification or retention cannot acquire the same session advisory lock',async()=>{
   other=new pg.Client({connectionString:adminUrl.href});await other.connect();
   assert.equal((await other.query('SELECT pg_try_advisory_lock(61824087) AS acquired')).rows[0].acquired,false);
   await other.end();other=null;
  });
  await t.test('cleanup without the verified session lock or a successful live guard performs no deletion',async()=>{
   const signed=approve(plan,state,{scope,now:Date.now()}),unlocked=new pg.Client({connectionString:adminUrl.href});await unlocked.connect();
   try{await unlocked.query('SET SESSION AUTHORIZATION kc_retention_runtime');await assert.rejects(cleanup(unlocked,{scope,state,plan,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));}
   finally{await unlocked.end();}
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
  await t.test('a connection opened after revalidation makes non-FORCE DROP refuse, without terminating it',async()=>{
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[0].database.name)},signed=approve(single,state,{scope,now:Date.now()});
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
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[1].database.name)},signed=approve(single,state,{scope,now:Date.now()});
   const query=runtime.query.bind(runtime);
   const revoked={query:async(sql,...args)=>{if(sql.startsWith('DROP DATABASE '))await admin.query('REVOKE kc_release_copy_owner FROM kc_retention_runtime');return query(sql,...args);}};
   try{await assert.rejects(cleanup(revoked,{scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));}
   finally{await admin.query('GRANT kc_release_copy_owner TO kc_retention_runtime');}
   assert.ok((await runtime.query('SELECT event FROM release_retention.audit WHERE approval_id=$1',[signed.approval.id])).rows.some(row=>row.event==='refused'));
  });
  await t.test('cleanup journals before DROP; retry reconciles a crash after DROP with zero invented reclaimed bytes',async()=>{
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[0].database.name)},signed=approve(single,state,{scope,now:Date.now()});
   const query=runtime.query.bind(runtime);let interrupted=false;
   const crash={query:(sql,args)=>{if(sql.includes('record_event')&&args?.[4]==='deleted'){interrupted=true;throw new Error('Synthetic interruption');}return query(sql,args);}};
   await assert.rejects(cleanup(crash,{scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));assert.equal(interrupted,true);
   const result=await cleanup(runtime,{scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}});
   assert.deepEqual(result.alreadyAbsent,[copies[0].database.name]);assert.equal(result.measuredDatabaseBytesRemoved,'0');
   const repeated=await cleanup(runtime,{scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}});assert.deepEqual(repeated,result);
  });
  await t.test('a reappeared name with a new OID cannot be deleted by an old approval',async()=>{
   const single={...plan,rows:plan.rows.filter(row=>row.name===copies[0].database.name)},signed=approve(single,state,{scope,now:Date.now()});
   await root.query('CREATE DATABASE '+database(copies[0].database.name)+' OWNER kc_release_copy_owner');
   await assert.rejects(cleanup(runtime,{scope,state,plan:single,approval:signed.encoded,verifyKey:publicKey,beforeDelete:async()=>{}}));
   assert.equal((await root.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',[copies[0].database.name])).rows[0].n,1);
  });
  await t.test('durable pins survive omission from the owner state; only privileged append-only unpin releases them',async()=>{
   await admin.query('INSERT INTO release_retention.pins(name,pinned,reason) VALUES($1,true,$2)',[copies[5].database.name,'Synthetic recovery pin']);
   assert.ok((await inspect(runtime,state,scope)).rows.find(row=>row.name===copies[5].database.name).reasons.includes('durably-pinned'));
   await assert.rejects(runtime.query('INSERT INTO release_retention.pins(name,pinned,reason) VALUES($1,false,$2)',[copies[5].database.name,'Unauthorized']));
   await assert.rejects(runtime.query('TRUNCATE release_retention.pins'));
   await admin.query('INSERT INTO release_retention.pins(name,pinned,reason) VALUES($1,false,$2)',[copies[5].database.name,'Separately reviewed synthetic unpin']);
   assert.equal((await inspect(runtime,state,scope)).rows.find(row=>row.name===copies[5].database.name).eligible,true);
  });
  await t.test('eligible copies are dropped once; current, pinned, pending and populated source survive',async()=>{
   const fresh=await inspect(runtime,state,scope),signed=approve(fresh,state,{scope,now:Date.now()});
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
  if(other)await other.end();if(runtime)await runtime.end();if(admin)await admin.end();
  for(const name of created)await root.query('DROP DATABASE IF EXISTS '+database(name));
  if(sourceCreated)await root.query('DROP DATABASE retention_preserved_source_test');
  // All objects/roles below belong only to this disposable test installation.
  const final=new pg.Client({connectionString:adminUrl.href});await final.connect();
  try{await final.query('DROP SCHEMA IF EXISTS release_retention CASCADE; REVOKE EXECUTE ON FUNCTION pg_control_system() FROM kc_retention_runtime; DROP OWNED BY kc_retention_runtime; DROP OWNED BY kc_retention_owner; DROP OWNED BY kc_release_copy_owner;');}finally{await final.end();}
  if(adminCreated)await root.query('DROP DATABASE kingdom_release_retention');
  await root.query('DROP ROLE kc_retention_runtime; DROP ROLE kc_release_copy_owner; DROP ROLE kc_retention_owner');await root.end();
 }
});
