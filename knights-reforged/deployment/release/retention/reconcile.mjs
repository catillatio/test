import assert from 'node:assert/strict';
import {checkApproval,hash,emergencyOids} from './protocol.mjs';
import {checkCatalog,snapshot} from './retention.mjs';
import {verifyRetirement} from './verification.mjs';
// Recovery writes observations ONLY. Never DROP, rename, alter ownership, renew
// approvals or retry an interrupted deletion. Original authorization is verified
// at its original issuance time; expired grants can ONLY reconcile actual absence.
export async function reconcileInterrupted(client,{scope,approvalId,verifyKey,before}){
 await checkCatalog(client);
 const permit=(await client.query('SELECT * FROM release_retention.permits WHERE approval_id=$1',[approvalId])).rows[0];assert.ok(permit);
 const envelope=JSON.parse(Buffer.from(permit.encoded_approval,'base64url'));
 const issued=Date.parse(JSON.parse(Buffer.from(envelope.payload,'base64url')).issuedAt);assert.ok(Number.isFinite(issued)&&issued<=Date.now());
 const approved=checkApproval(permit.encoded_approval,verifyKey,permit.plan,permit.state,scope,{now:issued});
 assert.equal(approved.id,approvalId);assert.equal(permit.plan_sha256,hash(permit.plan));assert.equal(permit.state_sha256,hash(permit.state));
 const intents=(await client.query(`SELECT a.name,a.database_oid::text AS oid,a.plan_sha256 FROM release_retention.audit a
  WHERE a.approval_id=$1 AND a.event='intent' AND NOT EXISTS(SELECT 1 FROM release_retention.audit o WHERE o.approval_id=a.approval_id AND o.name=a.name AND o.event<>'intent') ORDER BY a.name`,[approvalId])).rows;
 const result={approvalId,reconciledAbsent:[],requiresFreshApproval:[],measuredDatabaseBytesRemoved:'0'};
 for(const intent of intents){
  assert.equal(intent.plan_sha256,permit.plan_sha256);assert.ok(!emergencyOids.includes(intent.oid));
  const present=(await client.query('SELECT datname AS name,oid::text AS oid FROM pg_database WHERE datname=$1 OR oid=$2',[intent.name,intent.oid])).rows;
  if(present.length){
   assert.equal(present.length,1);assert.deepEqual(present[0],{name:intent.name,oid:intent.oid});
   result.requiresFreshApproval.push(intent.name);continue;
  }
  const recorded=(await client.query('SELECT release_retention.record_event($1,$2,$3,$4,$5) AS bytes',[approvalId,permit.plan_sha256,intent.name,intent.oid,'absent'])).rows[0].bytes;
  assert.equal(recorded,'0');result.reconciledAbsent.push(intent.name);
 }
 if(before){
  const outcomes=(await client.query("SELECT name,event,measured_bytes::text AS bytes FROM release_retention.audit WHERE approval_id=$1 AND event IN ('deleted','absent')",[approvalId])).rows;
  result.verification=verifyRetirement(before,await snapshot(client),permit.plan,{dropped:outcomes.filter(r=>r.event==='deleted').map(r=>r.name),alreadyAbsent:outcomes.filter(r=>r.event==='absent').map(r=>r.name),
   measuredDatabaseBytesRemoved:outcomes.filter(r=>r.event==='deleted').reduce((n,r)=>n+BigInt(r.bytes),0n).toString()});
  result.verification.basis='original-operation-baseline-and-durable-outcomes';
 }else result.verification={kind:'not-run',reason:'original-operation-baseline-not-supplied'};
 return result;
}
