// Compare only inventories from the SAME lock-held retirement operation.
// A new baseline cannot reconstruct the missing pre-registration legacy tuples.
import assert from 'node:assert/strict';
import {hash,emergencyOids,evidenceRecord} from './protocol.mjs';
import {observationPayload} from './observation.mjs';
const identity=r=>({name:r.name,oid:r.oid,owner:r.owner,template:r.template});
export function verifyRetirement(before,after,plan,result){
 for(const data of [before,after]){
  assert.ok(Array.isArray(data.databases)&&data.databases.length>0);
  assert.equal(new Set(data.databases.map(r=>r.name)).size,data.databases.length);assert.equal(new Set(data.databases.map(r=>r.oid)).size,data.databases.length);
  for(const r of data.databases){assert.equal(typeof r.name,'string');assert.ok(r.name);assert.match(r.oid??'',/^[1-9][0-9]*$/);assert.equal(typeof r.owner,'string');assert.equal(typeof r.template,'boolean');}
  assert.ok(Number.isFinite(Date.parse(data.now)));
 }
 assert.ok(Date.parse(after.now)>=Date.parse(before.now));
 const completed=[...result.dropped,...result.alreadyAbsent];
 assert.equal(new Set(completed).size,completed.length);
 const targets=new Map(plan.rows.filter(r=>r.eligible).map(r=>[r.name,r]));
 const remaining=new Map(after.databases.map(r=>[r.name,r]));
 for(const name of completed){
  const target=targets.get(name);assert.ok(target&&!emergencyOids.includes(target.oid));
  assert.ok(!after.databases.some(r=>r.name===name||r.oid===target.oid));
  if(result.dropped.includes(name))assert.equal(before.databases.find(r=>r.name===name)?.oid,target.oid);
 }
 const survivors=before.databases.filter(r=>!completed.includes(r.name));
 for(const row of survivors){assert.deepEqual(identity(remaining.get(row.name)??{}),identity(row));}
 // Creation, rename/reuse or ownership changes outside this batch are not
 // silently attributed to cleanup, even if every intended DROP succeeded.
 assert.equal(after.databases.length,survivors.length);
 const ordered=survivors.map(identity).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 return {kind:'retirement-postcheck',targetIdentitiesAbsent:true,allUntargetedIdentitiesPreserved:true,
  protectedEmergencyOidsObserved:before.databases.filter(r=>emergencyOids.includes(r.oid)).length,
  protectedEmergencyIdentitiesPreserved:true,retainedDatabaseCount:ordered.length,survivingIdentitySha256:hash(ordered),
  logicalDatabaseBytesRemoved:result.measuredDatabaseBytesRemoved,filesystemBytesReclaimed:null,
  physicalStorageMeasurement:'not-measured-on-database-volume'};
}
export async function verifyAdoption(client,manifest,scope){
 const record=evidenceRecord(manifest,scope),expected=observationPayload(manifest);
 await client.query('BEGIN READ ONLY');
 try{
  const row=(await client.query(`SELECT c.evidence,c.evidence_sha256,c.database_oid::text AS oid,c.owner_name,c.verified_at,c.first_observed_at,
   o.details,o.registered_by,o.first_observed_at AS observation_at,o.verified_at AS observation_verified_at,
   d.oid::text AS live_oid,r.rolname AS live_owner,d.datistemplate,clock_timestamp() AS now
   FROM release_retention.copies c JOIN release_observations.verified_copies o ON o.name=c.name
   JOIN pg_database d ON d.datname=c.name JOIN pg_roles r ON r.oid=d.datdba WHERE c.name=$1`,[record.name])).rows[0];
  assert.ok(row);assert.deepEqual(row.evidence,manifest);assert.equal(row.evidence_sha256,hash(manifest));
  assert.deepEqual(row.details,expected);assert.equal(row.registered_by,'kc_copy_registrar');
  assert.equal(row.oid,expected.oid);assert.equal(row.live_oid,expected.oid);assert.equal(row.datistemplate,false);
  assert.equal(row.owner_name,'kc_release_copy_owner');assert.equal(row.live_owner,row.owner_name);
  assert.equal(+new Date(row.verified_at),+new Date(row.observation_verified_at));
  assert.equal(+new Date(row.observation_at),+new Date(row.observation_verified_at));
  assert.ok(Number.isFinite(+new Date(row.first_observed_at))&&+new Date(row.first_observed_at)>=+new Date(row.observation_at)&&+new Date(row.first_observed_at)<=+new Date(row.now));
  return {kind:'read-only-adoption-postcheck',exactObservationAndManifest:true,exactLiveIdentity:true,serverDerivedHold:true,retirementAuthorized:false};
 }finally{await client.query('ROLLBACK');}
}
