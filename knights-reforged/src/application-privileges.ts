import {type Sql} from './db.js';

// Migration 054's SQL capabilities are deliberately separate from the public
// application API. --no-acl archives lose REVOKEs even on migration replay.
const capabilities=[
 'account_erasure_credentials_witness(uuid)',
 'account_erasure_credentials_removed(uuid)',
 'detach_erased_identity(uuid, uuid)',
 'graveyard_snapshot(jsonb)',
 'construct_public_graveyard(uuid, jsonb, jsonb, integer[], bigint, bigint, text, jsonb, jsonb)',
 'read_graveyard_operation(uuid)',
];
interface Capability {identity:string;qualified:string;prosecdef:boolean;public_execute:boolean}
async function installedCapabilities(sql:Sql){
 const installed=(await sql.query("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name='054_account_erasure.sql') AS installed")).rows[0]!.installed;
 const rows=(await sql.query<Capability>(`SELECT p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')' AS identity,
 pg_catalog.format('%I.%I(%s)',n.nspname,p.proname,pg_catalog.oidvectortypes(p.proargtypes)) AS qualified,p.prosecdef,
 EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.oid=(SELECT relnamespace FROM pg_catalog.pg_class WHERE oid='schema_migrations'::regclass)
 AND (p.prosecdef OR p.proname=ANY($1::text[]))`,[capabilities.map(value=>value.split('(')[0])])).rows;
 if(rows.some(row=>!row.prosecdef||!capabilities.includes(row.identity))||
   (installed&&(rows.length!==capabilities.length||capabilities.some(identity=>!rows.some(row=>row.identity===identity)))))
  throw new Error('Application SQL capability policy does not match the installed functions.');
 return rows;
}
export async function assertApplicationPrivileges(sql:Sql){
 if((await installedCapabilities(sql)).some(row=>row.public_execute))
  throw new Error('Application SQL capabilities must not be executable by PUBLIC. Run the protected migration procedure.');
}
export async function reconcileApplicationPrivileges(sql:Sql){
 for(const row of await installedCapabilities(sql)){
  // Server-formatted schema/function/types, never caller-supplied SQL. Only
  // PUBLIC is revoked; explicit operator grants and ownership stay intact.
  await sql.query('REVOKE ALL ON FUNCTION '+row.qualified+' FROM PUBLIC');
 }
 await assertApplicationPrivileges(sql);
}
export async function prepareRecoveryFunctionPrivileges(sql:Sql){
 // Called only on the new independent restore target, as its restoring role.
 // Establish safe creation defaults before pg_restore commits any functions.
 if((await sql.query("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND p.prosecdef) AS present")).rows[0]!.present)
  throw new Error('Recovery SQL privilege preparation requires an empty target.');
 await sql.query('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
 // createdb may inherit schema-specific defaults from template1. PostgreSQL
 // adds these to global defaults; a global REVOKE cannot cancel them.
 if((await sql.query(`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl d
 CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
 WHERE d.defaclrole=current_user::regrole AND d.defaclobjtype='f'
 AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute`)).rows[0]!.public_execute)
  throw new Error('Recovery function defaults still grant PUBLIC execution.');
}
