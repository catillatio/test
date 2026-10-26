import assert from 'node:assert/strict';
import {emergencyOids,hash} from './protocol.mjs';
// Non-destructive, including before any retention catalog is installed. The
// caller supplies an existing authenticated private connection; no credentials,
// public proxy, role grants, owner adoption or infrastructure are created here.
export async function inventory(client){
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  await client.query("SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='2s'; SET LOCAL search_path=pg_catalog,pg_temp");
  const identity=(await client.query(`SELECT current_database() AS database,current_user AS observer,clock_timestamp() AS at,
   encode(sha256(convert_to(system_identifier::text,'UTF8')),'hex') AS cluster_digest FROM pg_control_system()`)).rows[0];
  const databases=(await client.query(`SELECT d.datname AS name,d.oid::text AS oid,r.rolname AS owner,d.datistemplate AS template,
   pg_database_size(d.oid)::text AS bytes,(SELECT count(*)::int FROM pg_stat_activity a WHERE a.datid=d.oid) AS connections
   FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba ORDER BY d.datname`)).rows;
  const installed=(await client.query("SELECT to_regclass('release_retention.copies') IS NOT NULL AS catalog,to_regclass('release_observations.verified_copies') IS NOT NULL AS observations")).rows[0];
  // Missing/inaccessible provenance never makes a copy eligible. Permission
  // failures abort the whole inventory rather than silently omitting evidence.
  const catalog=installed.catalog?(await client.query('SELECT name,database_oid::text AS oid,owner_name AS owner,evidence_sha256,verified_at,first_observed_at FROM release_retention.copies ORDER BY name')).rows:[];
  const observations=installed.observations?(await client.query('SELECT name,database_oid::text AS oid,observed_owner AS owner,cluster_digest,job_id,worker_deployment_id,evidence_sha256,first_observed_at FROM release_observations.verified_copies ORDER BY name')).rows:[];
  let walBytes=null;await client.query('SAVEPOINT optional_wal');
  try{walBytes=(await client.query('SELECT coalesce(sum(size),0)::text AS bytes FROM pg_ls_waldir()')).rows[0].bytes;}
  catch{await client.query('ROLLBACK TO SAVEPOINT optional_wal');}
  const rows=databases.map(d=>{
   assert.match(d.bytes,/^(0|[1-9][0-9]*)$/);
   const adopted=catalog.find(c=>c.name===d.name&&c.oid===d.oid&&c.owner===d.owner);
   const observed=observations.find(c=>c.name===d.name&&c.oid===d.oid&&c.cluster_digest===identity.cluster_digest);
   return {...d,classification:emergencyOids.includes(d.oid)?'emergency-protected':d.template||d.name===identity.database?'system-protected':adopted?'adopted-requires-fresh-plan':observed?'observed-only-protected':'uncertain-protected',
    provenance:adopted??observed??null,eligible:false};
  });
  await client.query('COMMIT');
  const report={kind:'read-only-inventory',identity,rows,databaseBytes:rows.reduce((n,r)=>n+BigInt(r.bytes),0n).toString(),walBytes,
   volumeFreeBytes:null,reclaimableBytes:null,note:'Inventory does not authorize retirement. Filesystem/free-space and current release references require separate evidence.'};
  return {...report,sha256:hash(report)};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
