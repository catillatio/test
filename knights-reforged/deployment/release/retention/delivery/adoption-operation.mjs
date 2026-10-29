import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {adoptionEvidence,adoptObservedCopy,adoptionReasons} from '../adoption.mjs';
import {checkState,emergencyOids,hash} from '../protocol.mjs';
import {snapshot,checkGuardDefinitions} from '../retention.mjs';
import {verifyAdoption,verifyAdoptionPreservation} from '../verification.mjs';
export {verifyAdoptionPreservation} from '../verification.mjs';

export function adoptionInput(data,f){
 const bytes=Buffer.from(data.data.manifestBytes,'base64url');
 assert.equal(bytes.toString('base64url'),data.data.manifestBytes);
 const checked=adoptionEvidence(bytes,data.data.manifestSha256,f.scope,data.data.expectedOid);
 const run=checked.manifest.request.jobId.split('_')[1];assert.notEqual(run,'40758163475');
 assert.ok(Date.parse(checked.manifest.request.createdAt)>=Date.parse(f.adoption.futureAfter));
 assert.deepEqual(data.data.adoption,f.adoption);checkState(data.state,f.scope);
 const name=checked.payload.name;
 assert.notEqual(name,data.state.currentRecoveryCopy);assert.notEqual(checked.manifest.request.sha,data.state.activeSha);
 assert.ok(!data.state.pinnedCopies.includes(name)&&!data.state.pendingCopies.includes(name));
 assert.ok(data.state.closedJobIds.includes(checked.payload.jobId));
 return {...checked,bytes,run};
}
// The privileged client exists ONLY inside the adopter. Evidence/journals contain no URL.
export async function performAdoption(client,{f,data,guards,ownerApproved,durableIntent,signal}){
 const selected=adoptionInput(data,f);assert.equal(typeof durableIntent,'function');
 let baseline;
 const abort=()=>{client.end().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  signal?.throwIfAborted();await ownerApproved();
  const result=await adoptObservedCopy(client,{scope:f.scope,state:data.state,bytes:selected.bytes,
   expectedSha256:data.data.manifestSha256,expectedOid:data.data.expectedOid,
   beforeAdopt:async(record,state,context)=>{
    signal?.throwIfAborted();assert.ok(Date.parse(context.observation.first_observed_at)>=Date.parse(f.adoption.futureAfter));
    await guards.beforeDelete(record,state);signal?.throwIfAborted();
    baseline=context.before;await durableIntent(baseline); // signed coordinator acknowledgment before ALTER
    await ownerApproved();await guards.beforeDelete(record,state);signal?.throwIfAborted();
    await checkGuardDefinitions(client);
    const roles=(await client.query("SELECT count(*)=2 AND NOT bool_or(rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AS safe FROM pg_roles WHERE rolname IN ('kc_retention_owner','kc_release_copy_owner')")).rows[0];assert.equal(roles.safe,true);
    await client.query('SELECT pg_stat_clear_snapshot()'); // pg_stat_activity caches within a transaction
    const latest=await snapshot(client);assert.deepEqual(adoptionReasons(latest,state,f.scope,selected.manifest,[context.observation]),[]);
    const identities=s=>s.databases.map(d=>({name:d.name,oid:d.oid,owner:d.owner,template:d.template})).sort((a,b)=>a.name.localeCompare(b.name));
    assert.deepEqual(identities(latest),identities(baseline));signal?.throwIfAborted();
   }});
  assert.equal(result.alreadyAdopted,false,'A new delivery cannot replay a previous adoption.');
  signal?.throwIfAborted();const after=await snapshot(client);
  const verification=verifyAdoptionPreservation(baseline,after,selected.payload);
  await verifyAdoption(client,selected.manifest,f.scope);signal?.throwIfAborted();
  return {baselineDigest:hash(baseline),result,verification};
 }finally{signal?.removeEventListener('abort',abort);}
}
export const rawDigest=b=>createHash('sha256').update(b).digest('hex');
