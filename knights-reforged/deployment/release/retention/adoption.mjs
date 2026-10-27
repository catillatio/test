// Explicit privileged handoff, never called by observation/registration.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkScope,checkState,evidenceRecord,hash,emergencyOids} from './protocol.mjs';
import {observationPayload} from './observation.mjs';
import {snapshot,checkGuardDefinitions} from './retention.mjs';

export function adoptionEvidence(bytes,expectedSha256,scope,expectedOid){
 assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=2000000);
 assert.match(expectedSha256??'',/^[a-f0-9]{64}$/);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),expectedSha256);
 const manifest=JSON.parse(bytes),record=evidenceRecord(manifest,scope),payload=observationPayload(manifest);
 assert.equal(payload.oid,expectedOid);assert.ok(!emergencyOids.includes(payload.oid));
 return {manifest,record,payload};
}
export function adoptionReasons(before,state,scope,manifest,observations){
 checkState(state,scope,{now:Date.parse(before.now)});
 const payload=observationPayload(manifest),row=before.databases.find(r=>r.name===payload.name),reasons=[];
 assert.ok(before.databases.some(r=>r.name===state.currentRecoveryCopy));
 assert.ok(row&&!row.template&&row.oid===payload.oid&&row.owner===payload.owner);
 if(emergencyOids.includes(row.oid))reasons.push('emergency-recovery-oid');
 if(row.name===state.currentRecoveryCopy)reasons.push('current-recovery');
 if(manifest.request.sha===state.activeSha)reasons.push('active-release-candidate');
 if(state.pendingCopies.includes(row.name))reasons.push('pending-release');
 if(state.pinnedCopies.includes(row.name))reasons.push('pinned-or-rollback-reference');
 if(before.pins.some(p=>p.name===row.name&&p.pinned))reasons.push('durably-pinned');
 if(!state.closedJobIds.includes(payload.jobId))reasons.push('release-not-confirmed-closed');
 if(row.connections!==0)reasons.push('in-use-or-unknown');
 const observation=observations.find(o=>o.name===row.name&&o.database_oid===row.oid);
 assert.ok(observation);assert.equal(observation.cluster_digest,scope.clusterDigest);
 const at=Date.parse(observation.first_observed_at);
 assert.ok(Number.isFinite(at)&&at<=Date.parse(before.now));
 // Adoption is not retirement: recent/newest anchors can be explicitly adopted
 // while remaining protected by the NEW server-derived 24h hold and two-newest
 // rules in both planner and installed SQL. Never import a caller's backdate.
 return reasons;
}
export async function adoptObservedCopy(client,{scope,state,bytes,expectedSha256,expectedOid,beforeAdopt}){
 checkScope(scope);checkState(state,scope);
 const {manifest,record,payload}=adoptionEvidence(bytes,expectedSha256,scope,expectedOid);
 const identity=(await client.query(`SELECT current_database() AS database,current_user AS actor,session_user AS session_actor,
  (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS privileged,
  encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex') AS cluster`)).rows[0];
 assert.equal(identity.database,scope.adminDatabase);assert.equal(identity.cluster,scope.clusterDigest);
 assert.equal(identity.actor,identity.session_actor);assert.equal(identity.privileged,true);
 assert.ok(!['kc_retention_owner','kc_release_copy_owner','kc_retention_runtime','kc_retention_authorizer','kc_copy_registrar'].includes(identity.actor));
 const roles=(await client.query(`SELECT count(*)=2 AND NOT bool_or(rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AS safe
  FROM pg_roles WHERE rolname IN ('kc_retention_owner','kc_release_copy_owner')`)).rows[0];assert.equal(roles.safe,true);
 assert.equal((await client.query('SELECT pg_try_advisory_lock(61824087) AS acquired')).rows[0].acquired,true);
 try{
  await client.query('BEGIN');
  try{
   await client.query("SET LOCAL search_path=pg_catalog,pg_temp; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s'");
   await checkGuardDefinitions(client);
   const o=(await client.query('SELECT *,database_oid::text AS database_oid FROM release_observations.verified_copies WHERE name=$1',[record.name])).rows[0];
   assert.ok(o);assert.deepEqual(o.details,payload);assert.equal(o.database_oid,payload.oid);
   assert.equal(o.observed_owner,payload.owner);assert.equal(o.cluster_digest,payload.clusterDigest);
   assert.equal(o.job_id,payload.jobId);assert.equal(o.worker_deployment_id,payload.workerDeploymentId);
   assert.equal(o.evidence_sha256,payload.evidenceSha256);assert.equal(o.registered_by,'kc_copy_registrar');
   assert.equal(String(o.github_run_id),payload.jobId.split('_')[1]);assert.equal(o.github_run_attempt,Number(payload.jobId.split('_')[2]));
   assert.ok(Number.isFinite(+new Date(o.first_observed_at))&&+new Date(o.first_observed_at)<=Date.now());
   assert.equal(+new Date(o.first_observed_at),+new Date(o.verified_at));
   const before=await snapshot(client),database=before.databases.find(d=>d.name===record.name);
   assert.ok(database&&!database.template);assert.equal(database.oid,payload.oid);
   const existing=before.catalog.find(c=>c.name===record.name||c.oid===payload.oid);
   if(existing){
    assert.equal(existing.name,record.name);assert.equal(existing.oid,payload.oid);assert.equal(database.owner,'kc_release_copy_owner');
    assert.equal(existing.owner,database.owner);assert.deepEqual(existing.evidence,manifest);assert.equal(existing.evidence_sha256,hash(manifest));
    assert.equal(+new Date(existing.verified_at),+new Date(o.verified_at));
    await client.query('COMMIT');return {name:record.name,oid:payload.oid,firstObservedAt:new Date(existing.first_observed_at).toISOString(),alreadyAdopted:true};
   }
   assert.deepEqual(adoptionReasons(before,state,scope,manifest,[o]),[]);
   assert.equal(typeof beforeAdopt,'function','Live protected-release coordination is required for ownership adoption.');
   await beforeAdopt({jobId:record.jobId,evidence:manifest},state);
   checkState(state,scope);
   // Owner transfer and append-only provenance COMMIT together; an interruption
   // cannot leave an unmanaged-owned copy. Adoption starts a new server hold.
   await client.query('ALTER DATABASE "'+record.name+'" OWNER TO kc_release_copy_owner');
   await client.query('SET LOCAL ROLE kc_retention_owner');
   const receipt=(await client.query(`INSERT INTO release_retention.copies(name,database_oid,owner_name,verified_at,evidence,evidence_sha256)
    VALUES($1,$2,'kc_release_copy_owner',$3,$4,$5) RETURNING first_observed_at`,[record.name,payload.oid,o.verified_at,manifest,hash(manifest)])).rows[0];
   await client.query('COMMIT');
   return {name:record.name,oid:payload.oid,firstObservedAt:new Date(receipt.first_observed_at).toISOString(),alreadyAdopted:false};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
 }finally{await client.query('SELECT pg_advisory_unlock(61824087)').catch(()=>{});}
}
