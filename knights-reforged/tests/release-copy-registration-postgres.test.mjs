import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fixture,scope as baseScope} from './fixtures/release-retention.mjs';
import {observationPayload,recordObservation,checkObservationCatalog} from '../deployment/release/retention/observation.mjs';
import {inspect,lockCluster} from '../deployment/release/retention/retention.mjs';
const target=process.env.TEST_DATABASE_URL;
test('append-only registration with real restricted PostgreSQL, concurrency, restart and preservation',{skip:!target,timeout:120000},async t=>{
 const rootUrl=new URL(target);assert.ok(['localhost','127.0.0.1'].includes(rootUrl.hostname));
 const root=new pg.Client({connectionString:target});await root.connect();const name='kingdom_registration_test',u=new URL(target);u.pathname='/'+name;
 const created=[];let admin,registrar,runtime,data;
 const connect=async role=>{const c=new pg.Client({connectionString:u.href});await c.connect();if(role)await c.query('SET SESSION AUTHORIZATION '+role);return c;};
 try{
  await root.query('CREATE DATABASE '+name);admin=await connect();
  await admin.query(await readFile(new URL('../deployment/release/retention/bootstrap.sql',import.meta.url),'utf8'));
  await admin.query(await readFile(new URL('../deployment/release/retention/observations.sql',import.meta.url),'utf8'));
  await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  const cluster=createHash('sha256').update((await admin.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id).digest('hex');
  const scope={...baseScope,clusterDigest:cluster,adminDatabase:name,workerAdminDatabase:name};
  const copy=fixture(91,{now:Date.now()}),m=copy.catalog.evidence;
  m.report.restoreClusterDigest=cluster;
  await root.query('CREATE DATABASE "'+copy.database.name+'"');created.push(copy.database.name);
  const oid=(await root.query('SELECT oid::text FROM pg_database WHERE datname=$1',[copy.database.name])).rows[0].oid;
  m.report.verifiedCopyIdentity={oid,owner:'postgres',maintenanceDatabase:name,clusterDigest:cluster};
  const payload=observationPayload(m);
  // Populated synthetic realm in the independent copy: no source URL is provided.
  const dataUrl=new URL(target);dataUrl.pathname='/'+copy.database.name;
  data=new pg.Client({connectionString:dataUrl.href});await data.connect();
  await data.query(`CREATE TABLE accounts(id int PRIMARY KEY,bot bool,wallet bigint,vault bigint,password text,session text);
   INSERT INTO accounts SELECT n,n<=450,n*100,n*200,'password-hash-'||n,'saved-session-'||n FROM generate_series(1,452)n;
   CREATE TABLE progress AS SELECT id,3 AS equipment,4 AS land,5 AS army,'saved-history' AS history FROM accounts;`);
  const snapshot=async()=>JSON.stringify((await data.query('SELECT (SELECT jsonb_agg(a ORDER BY id) FROM accounts a) AS accounts,(SELECT jsonb_agg(p ORDER BY id) FROM progress p) AS progress')).rows);
  const before=await snapshot();registrar=await connect('kc_copy_registrar');
  let receipt;
  await t.test('server identity and timestamps are recorded once; concurrent identical requests are idempotent',async()=>{
   const second=await connect('kc_copy_registrar');
   try{const results=await Promise.all([recordObservation(registrar,payload),recordObservation(second,payload)]);receipt=results[0];assert.deepEqual(results[0],results[1]);}finally{await second.end();}
   assert.ok(+new Date(receipt.first_observed_at)>=Date.now()-30000);
   const row=(await admin.query('SELECT * FROM release_observations.verified_copies')).rows[0];
   assert.equal(row.registered_by,'kc_copy_registrar');assert.equal(row.github_run_id,'91');assert.equal(row.github_run_attempt,1);assert.equal(row.observed_owner,'postgres');assert.equal(row.worker_deployment_id,m.report.workerDeploymentId);assert.deepEqual(row.details,payload);
   assert.equal((await root.query('SELECT r.rolname FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=$1',[copy.database.name])).rows[0].rolname,'postgres');
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_retention.copies')).rows[0].n,0);
  });
  await t.test('restart or retry after lost acknowledgement returns original server timestamps and no extra row',async()=>{
   await registrar.end();registrar=await connect('kc_copy_registrar');assert.deepEqual(await recordObservation(registrar,payload),receipt);
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_observations.verified_copies')).rows[0].n,1);
  });
  await t.test('mismatch, fake OID, wrong cluster, failed verification and secret-bearing extra fields fail closed',async()=>{
   for(const patch of [{oid:String(Number(oid)+1)},{clusterDigest:'f'.repeat(64)},{workerDeploymentId:randomUUID()},{passed:false},{evidenceSha256:'f'.repeat(64)},{maintenanceDatabase:'wrong'},{secret:'unretained-synthetic-secret'},{name:'postgres'},{bots:449}])await assert.rejects(recordObservation(registrar,{...payload,...patch}));
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_observations.verified_copies')).rows[0].n,1);
  });
  await t.test('runtime cannot bypass the function, rewrite history, replace guards, adopt ownership, issue permits or DROP',async()=>{
   for(const sql of ['UPDATE release_observations.verified_copies SET observed_owner=\'attacker\'','DELETE FROM release_observations.verified_copies','TRUNCATE release_observations.verified_copies','INSERT INTO release_observations.verified_copies SELECT * FROM release_observations.verified_copies','ALTER TABLE release_observations.verified_copies DISABLE TRIGGER ALL',
    'CREATE OR REPLACE FUNCTION release_observations.no_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$','SET ROLE kc_retention_owner','SET ROLE kc_release_copy_owner','SET ROLE kc_retention_authorizer','CREATE SCHEMA attacker','CREATE DATABASE attacker',
    'ALTER DATABASE "'+copy.database.name+'" OWNER TO kc_copy_registrar','DROP DATABASE "'+copy.database.name+'"','INSERT INTO release_retention.permits(approval_id) VALUES(\''+randomUUID()+'\')'])await assert.rejects(registrar.query(sql));
   await assert.rejects(registrar.query('SELECT release_retention.record_event($1,$2,$3,$4,$5)',[randomUUID(),'f'.repeat(64),copy.database.name,oid,'intent']));
  });
  await t.test('observed copies remain unknown and protected by the unchanged cleanup planner',async()=>{
   runtime=await connect('kc_retention_runtime');await lockCluster(runtime,scope);
   const state={protocol:scope.protocol,scope,observedAt:new Date().toISOString(),releaseQuiescent:true,activeSha:'f'.repeat(40),currentRecoveryCopy:copy.database.name,pinnedCopies:[],pendingCopies:[],closedJobIds:[m.request.jobId]};
   const plan=await inspect(runtime,state,scope),row=plan.rows.find(r=>r.name===copy.database.name);
   assert.equal(row.eligible,false);assert.ok(row.reasons.includes('unproven-provenance'));assert.ok(row.reasons.includes('ownership-or-identity-mismatch'));assert.equal(plan.reclaimableBytes,'0');
   await runtime.end();runtime=null;
  });
  await t.test('transaction interruption rolls back metadata; a retry does not touch any populated business row',async()=>{
   const other=fixture(92,{now:Date.now()}),meta=structuredClone(m);meta.request={...m.request,...other.catalog.evidence.request,restoreHost:m.request.restoreHost};
   meta.report={...m.report,...other.catalog.evidence.report,restoreClusterDigest:cluster};meta.backupKey=other.catalog.evidence.backupKey;
   await root.query('CREATE DATABASE "'+other.database.name+'"');created.push(other.database.name);
   const newOid=(await root.query('SELECT oid::text FROM pg_database WHERE datname=$1',[other.database.name])).rows[0].oid;
   meta.report.verifiedCopyIdentity={oid:newOid,owner:'postgres',maintenanceDatabase:name,clusterDigest:cluster};
   const another=observationPayload(meta);
   await registrar.query('BEGIN');await recordObservation(registrar,another);await registrar.query('ROLLBACK');
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM release_observations.verified_copies')).rows[0].n,1);
   await recordObservation(registrar,another);assert.equal(await snapshot(),before);
  });
  await t.test('name reuse or rename cannot attach an old report to a different database',async()=>{
   const another=fixture(93,{now:Date.now()}),old=structuredClone(m);old.request={...m.request,...another.catalog.evidence.request};old.report={...m.report,...another.catalog.evidence.report,restoreClusterDigest:cluster};old.backupKey=another.catalog.evidence.backupKey;
   await root.query('CREATE DATABASE "'+another.database.name+'"');created.push(another.database.name);
   const oldOid=(await root.query('SELECT oid::text FROM pg_database WHERE datname=$1',[another.database.name])).rows[0].oid;
   old.report.verifiedCopyIdentity={oid:oldOid,owner:'postgres',maintenanceDatabase:name,clusterDigest:cluster};
   const oldPayload=observationPayload(old);await recordObservation(registrar,oldPayload);
   const renamed='registration_renamed_test';await root.query('ALTER DATABASE "'+another.database.name+'" RENAME TO '+renamed);created.push(renamed);
   await root.query('CREATE DATABASE "'+another.database.name+'"');await assert.rejects(recordObservation(registrar,oldPayload));
  });
  await t.test('altered installed guard definitions and accidental elevated membership prevent registration',async()=>{
   await admin.query('GRANT INSERT(name) ON release_observations.verified_copies TO kc_copy_registrar');
   try{await assert.rejects(checkObservationCatalog(registrar));}finally{await admin.query('REVOKE INSERT(name) ON release_observations.verified_copies FROM kc_copy_registrar');}
   await admin.query('GRANT INSERT(approval_id) ON release_retention.permits TO kc_copy_registrar');
   try{await assert.rejects(checkObservationCatalog(registrar));}finally{await admin.query('REVOKE INSERT(approval_id) ON release_retention.permits FROM kc_copy_registrar');}
   await admin.query('GRANT kc_release_copy_owner TO kc_copy_registrar');
   try{await assert.rejects(checkObservationCatalog(registrar));}finally{await admin.query('REVOKE kc_release_copy_owner FROM kc_copy_registrar');}
   await admin.query("CREATE OR REPLACE FUNCTION release_observations.no_rewrite() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$ BEGIN RETURN NULL; END $$");await assert.rejects(checkObservationCatalog(registrar));
   assert.equal(await snapshot(),before);
  });
  await data.end();data=null;
 }finally{
  if(data)await data.end();
  if(runtime)await runtime.end();if(registrar)await registrar.end();if(admin)await admin.end();
  for(const db of created)await root.query('DROP DATABASE IF EXISTS "'+db+'"');
  const final=await connect();try{await final.query('DROP SCHEMA release_observations CASCADE; DROP SCHEMA release_retention CASCADE; REVOKE EXECUTE ON FUNCTION pg_control_system() FROM kc_retention_runtime,kc_retention_authorizer,kc_retention_owner; DROP OWNED BY kc_copy_registrar; DROP OWNED BY kc_retention_authorizer; DROP OWNED BY kc_retention_runtime; DROP OWNED BY kc_retention_owner; DROP OWNED BY kc_release_copy_owner;');}finally{await final.end();}
  await root.query('DROP DATABASE '+name);await root.query('DROP ROLE kc_copy_registrar; DROP ROLE kc_retention_authorizer; DROP ROLE kc_retention_runtime; DROP ROLE kc_release_copy_owner; DROP ROLE kc_retention_owner');await root.end();
 }
});
