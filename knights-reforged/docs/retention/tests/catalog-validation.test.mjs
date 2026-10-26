// Local disposable PostgreSQL ONLY. Never run against Railway or a forwarded production port.
import pg from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
assert.equal(process.env.TEST_RETENTION_CATALOG_VALIDATION,'disposable');
const target=process.env.TEST_DATABASE_URL;const u=new URL(target);
assert.ok(['127.0.0.1','localhost'].includes(u.hostname));
assert.equal(decodeURIComponent(u.pathname),'/Railway');
const c=new pg.Client({connectionString:target});await c.connect();
const checks=[];const pass=n=>{checks.push(n);console.log('PASS '+n);};
try{
 const fresh=(await c.query("SELECT current_user='postgres' AND to_regnamespace('release_retention') IS NULL AND to_regnamespace('release_observations') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('kc_retention_owner','kc_release_copy_owner','kc_retention_runtime','kc_retention_authorizer','kc_copy_registrar')) AND NOT EXISTS(SELECT 1 FROM pg_stat_user_tables) AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datname NOT IN ('Railway','postgres','template0','template1')) AS ok")).rows[0].ok;
 assert.equal(fresh,true,'Use a fresh disposable cluster only; do not repair or reset an existing installation.');
 await c.query(await readFile(new URL('../../../deployment/release/retention/bootstrap.sql',import.meta.url),'utf8'));
 await c.query(await readFile(new URL('../../../deployment/release/retention/observations.sql',import.meta.url),'utf8'));
 const cluster=(await c.query("SELECT encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex') AS digest")).rows[0].digest;
 const sql=(await readFile(new URL('../VALIDATE_CATALOGS_READ_ONLY.sql',import.meta.url),'utf8')).replace(":'expected_cluster_digest'", "'"+cluster+"'");
 const read=async text=>{const results=await c.query(text);return (Array.isArray(results)?results:[results]).find(r=>r.rows[0]?.owner_summary)?.rows[0].owner_summary;};
 const fields=['catalog_definitions_match','role_definitions_match','explicit_grants_match','effective_permissions_match'];
 await c.query("CREATE TABLE IF NOT EXISTS public.validation_preserved_business(id int PRIMARY KEY,wallet bigint,history text); INSERT INTO public.validation_preserved_business VALUES(1,123456789,'unchanged-business-history') ON CONFLICT DO NOTHING;");
 const business=async()=>JSON.stringify((await c.query('SELECT * FROM public.validation_preserved_business ORDER BY id')).rows);
 const before=await business();const healthy=await read(sql);for(const f of fields)assert.equal(healthy[f],true,f);assert.equal(healthy.read_only,true);assert.equal(healthy.cluster_matches,true);assert.equal(healthy.all_five_tables_empty,true);assert.equal(healthy.no_managed_role_owns_database,true);assert.equal(healthy.retirement_authorized,false);pass('reviewed empty catalogs pass all four catalog/role/ACL/effective groups in READ ONLY');
 const select=sql.slice(sql.indexOf('WITH managed_roles')).replace(/ROLLBACK;\s*$/,'');
 const cases=[
 ['changed function body',"CREATE OR REPLACE FUNCTION release_retention.no_rewrite() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$ BEGIN RAISE EXCEPTION 'synthetic changed body'; END $$",'catalog_definitions_match'],
 ['unexpected catalog column','ALTER TABLE release_retention.copies ADD COLUMN unexpected_column int','catalog_definitions_match'],
 ['disabled immutable trigger','ALTER TABLE release_retention.audit DISABLE TRIGGER audit_immutable','catalog_definitions_match'],
 ['extra catalog object','CREATE TABLE release_observations.unexpected(id int)','catalog_definitions_match'],
 ['unlogged observation table','ALTER TABLE release_observations.verified_copies SET UNLOGGED','catalog_definitions_match'],
 ['direct registrar table write','GRANT INSERT ON release_observations.verified_copies TO kc_copy_registrar','effective_permissions_match'],
 ['single-column registrar write','GRANT INSERT(name) ON release_observations.verified_copies TO kc_copy_registrar','effective_permissions_match'],
 ['registrar cleanup function access','GRANT EXECUTE ON FUNCTION release_retention.record_event(text,text,text,oid,text) TO kc_copy_registrar','explicit_grants_match'],
 ['catalog-owner membership','GRANT kc_retention_owner TO kc_copy_registrar','role_definitions_match'],
 ['elevated role attributes','ALTER ROLE kc_retention_runtime CREATEDB','role_definitions_match'],
 ['PUBLIC schema access','GRANT USAGE ON SCHEMA release_retention TO PUBLIC','explicit_grants_match'],
 ['maintenance CREATE permission','GRANT CREATE ON DATABASE "Railway" TO kc_retention_runtime','effective_permissions_match'],
 ['PUBLIC CREATE permission','GRANT CREATE ON SCHEMA public TO PUBLIC','effective_permissions_match'],
 ['unexpected password assignment',"ALTER ROLE kc_copy_registrar PASSWORD 'disposable-synthetic-only'",'role_definitions_match'],
 ['role configuration drift',"ALTER ROLE kc_copy_registrar SET search_path='public'",'role_definitions_match']
 ];
 for(const [name,mutation,field] of cases){
  await c.query('BEGIN');
  try{await c.query("SET LOCAL search_path=pg_catalog,pg_temp");await c.query(mutation);const r=await read(select);assert.equal(r[field],false,name);assert.equal(r.retirement_authorized,false);}
  finally{await c.query('ROLLBACK');}
  pass('rejects '+name);
 }
 const wrong=await read(sql.replace("'"+cluster+"'","'"+'0'.repeat(64)+"'"));assert.equal(wrong.cluster_matches,false);assert.equal(wrong.retirement_authorized,false);pass('wrong private cluster digest is reported false without authority');
 for(let n=0;n<2;n++){const r=await read(sql);for(const f of fields)assert.equal(r[f],true);assert.equal(r.all_five_tables_empty,true);assert.equal(r.read_only,true);}
 assert.equal(await business(),before);pass('repeated read-only validations create no observations, permits or audit and preserve business rows');
 const result={kind:'synthetic-disposable-postgresql-only-not-production',serverVersion:(await c.query('SHOW server_version')).rows[0].server_version,passed:checks.length,checks};
 await writeFile(new URL('../CATALOG_VALIDATION_TEST_RESULTS.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log('All '+checks.length+' checks passed.');
}finally{await c.end();}
