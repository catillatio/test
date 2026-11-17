import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {postgresClient} from './postgres-client.js';
import {realm,testDatabaseUrl} from './helpers.js';
import {migrate,assertInstalledRulesets} from '../src/migrate.js';
import {assertApplicationPrivileges,prepareRecoveryFunctionPrivileges} from '../src/application-privileges.js';
import {createDatabase} from '../src/db.js';

// Real custom-format dump/restore with the release's no-owner/no-ACL flags.
function tool(command:'pg_dump'|'pg_restore',schema:string,input?:Buffer,databaseUrl=testDatabaseUrl!){
 return postgresClient(command,databaseUrl,command==='pg_dump'?['--format=custom','--no-owner','--no-acl','--schema='+schema]:['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname='+decodeURIComponent(new URL(databaseUrl).pathname.slice(1))],input);
}
const functionsSql=`SELECT p.oid::text,p.proname,coalesce(bool_or(a.grantee=0 AND a.privilege_type='EXECUTE'),false) AS public_execute
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
 WHERE n.nspname=current_schema() AND p.prosecdef GROUP BY p.oid,p.proname ORDER BY p.proname`;

test('same-head migration repairs no-ACL restore privileges without changing rows or named capability grants',async()=>{
 const r=await realm({isolated:true});const schema=(await r.db.query('SELECT current_schema() AS name')).rows[0]!.name;
 const role='acl_'+randomUUID().replaceAll('-','');let created=false;
 try{
  await r.db.query('CREATE ROLE '+role+' NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');created=true;
  const before=(await r.db.query(functionsSql)).rows;assert.equal(before.length,6);assert.ok(before.every(f=>!f.public_execute));
  const rows=JSON.stringify((await r.db.query('SELECT name,applied_at FROM schema_migrations ORDER BY name')).rows);
  const dump=tool('pg_dump',schema);await r.db.query('DROP SCHEMA '+schema+' CASCADE');tool('pg_restore',schema,dump);
  const exposed=(await r.db.query(functionsSql)).rows;assert.equal(exposed.length,6);assert.ok(exposed.every(f=>f.public_execute),'Real no-ACL restore reproduces the historical default-EXECUTE exposure');
  await assert.rejects(assertInstalledRulesets(r.db),/must not be executable by PUBLIC/);
  await r.db.query('GRANT USAGE ON SCHEMA '+schema+' TO '+role);
  await r.db.query('GRANT EXECUTE ON FUNCTION account_erasure_credentials_witness(uuid) TO '+role);
  await migrate(r.db);const after=(await r.db.query(functionsSql)).rows;
  assert.ok(after.every(f=>!f.public_execute),'Migration replay must repair default PUBLIC execution even when 054 is already recorded');
  assert.equal(JSON.stringify((await r.db.query('SELECT name,applied_at FROM schema_migrations ORDER BY name')).rows),rows,'No migration history is rewritten');
  assert.equal((await r.db.query("SELECT has_function_privilege($1,'account_erasure_credentials_witness(uuid)','EXECUTE') AS allowed",[role])).rows[0]!.allowed,true,'Named capability grants survive reconciliation');
  const client=await r.db.connect();try{
   await client.query('SET ROLE '+role);
   for(const query of ["SELECT account_erasure_credentials_removed($1)","SELECT detach_erased_identity($1,$2)","SELECT construct_public_graveyard($1,'{}','{}',ARRAY[0],0::bigint,0::bigint,repeat('a',64),'{}','{}')"])
    await assert.rejects(client.query(query,[randomUUID(),...(query.includes('detach_')?[randomUUID()]:[])]),(error:any)=>error.code==='42501');
  }finally{await client.query('RESET ROLE');client.release();}
 }finally{if(created){await r.db.query('DROP OWNED BY '+role);await r.db.query('DROP ROLE '+role)}await r.close();}
});


test('fresh protected restore has safe EXECUTE defaults before the restored transaction commits',async()=>{
 const r=await realm({isolated:true}),admin=createDatabase(testDatabaseUrl!);
 const schema=(await r.db.query('SELECT current_schema() AS name')).rows[0]!.name;
 const name='acl_restore_'+randomUUID().replaceAll('-','')+'_test';let copy:ReturnType<typeof createDatabase>|undefined,created=false;
 try{
  const dump=tool('pg_dump',schema);await admin.query('CREATE DATABASE "'+name+'" TEMPLATE template0');created=true;
  const target=new URL(testDatabaseUrl!);target.pathname='/'+name;copy=createDatabase(target.href);
  // Model a template1-inherited, additive schema ACL. Global default REVOKE
  // alone cannot cancel this grant, so preparation must stop before restore.
  await copy.query('CREATE SCHEMA default_acl_probe');
  await copy.query('ALTER DEFAULT PRIVILEGES IN SCHEMA default_acl_probe GRANT EXECUTE ON FUNCTIONS TO PUBLIC');
  await assert.rejects(prepareRecoveryFunctionPrivileges(copy),/defaults still grant PUBLIC/);
  await copy.query('ALTER DEFAULT PRIVILEGES IN SCHEMA default_acl_probe REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
  await copy.query('DROP SCHEMA default_acl_probe');
  await prepareRecoveryFunctionPrivileges(copy);
  tool('pg_restore',schema,dump,target.href);
  const scoped=new URL(target);scoped.searchParams.set('options','-c search_path='+schema);await copy.end();copy=createDatabase(scoped.href);
  const restored=(await copy.query(functionsSql)).rows;assert.equal(restored.length,6);assert.ok(restored.every(f=>!f.public_execute),'No PUBLIC exposure between restore commit and migration');
  await assertApplicationPrivileges(copy);await migrate(copy);await assertInstalledRulesets(copy);
  await assert.rejects(prepareRecoveryFunctionPrivileges(copy),/empty target/);
 }finally{await copy?.end();if(created)await admin.query('DROP DATABASE "'+name+'"');await admin.end();await r.close();}
});

test('missing or unreviewed SQL capabilities fail closed; pre-054 upgrades stay supported',async()=>{
 const old=await realm({isolated:true,migrationThrough:'052_npc_sponsorship.sql'});
 try{await assertApplicationPrivileges(old.db);await migrate(old.db);await assertApplicationPrivileges(old.db);}finally{await old.close();}
 const r=await realm({isolated:true});try{
  await r.db.query('ALTER FUNCTION account_erasure_credentials_witness(uuid) RENAME TO unexpected_witness');
  await assert.rejects(assertApplicationPrivileges(r.db),/policy does not match/);
  await assert.rejects(migrate(r.db),/policy does not match/);
 }finally{await r.close();}
});
