import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {policy,hash,checkScope,checkEnvironment,checkApproval,evidenceRecord,retentionProtocol} from '../deployment/release/retention/protocol.mjs';
import {makePlan} from '../deployment/release/retention/retention.mjs';
import {copyName} from '../deployment/release/protocol.mjs';

import {keys,publicKey,scope,epoch,fixture,scenario,approve} from './fixtures/release-retention.mjs';
const approved=(plan,state,overrides={})=>approve(plan,state,{action:'drop-obsolete-verification-copies',...overrides});

test('provenance hashes are stable through PostgreSQL jsonb key reordering',()=>{assert.equal(hash({a:1,b:{c:2,d:3}}),hash({b:{d:3,c:2},a:1}));});

test('defaults keep two verified copies and at least 24h; unsafe limits rejected',()=>{
 assert.deepEqual(policy(),{keep:2,minAgeHours:24});assert.deepEqual(policy({keep:5,minAgeHours:72}),{keep:5,minAgeHours:72});
 for(const value of [{keep:1},{minAgeHours:23},{keep:2.1},{keep:101},{minAgeHours:8761},{extra:1}])assert.throws(()=>policy(value));
});
test('only older positively identified closed copies become candidates; dry-run measures each and total',()=>{
 const {snapshot,state}=scenario(),plan=makePlan(snapshot,state,scope);
 assert.equal(plan.reclaimableBytes,'2097152');assert.deepEqual(plan.rows.map(row=>row.eligible),[true,true,false,false]);
 assert.ok(plan.rows.at(-1).reasons.includes('current-recovery'));assert.ok(plan.rows.at(-1).reasons.includes('newest-verified'));
});
for(const [label,change,reason]of[
 ['active release SHA',x=>x.state.activeSha=x.snapshot.catalog[0].evidence.request.sha,'active-release-candidate'],
 ['unknown',x=>x.snapshot.catalog.shift(),'unproven-provenance'],
 ['changed evidence',x=>x.snapshot.catalog[0].evidence.report.bots=449,'unproven-provenance'],
 ['changed OID',x=>x.snapshot.databases[0].oid='999','ownership-or-identity-mismatch'],
 ['changed owner',x=>x.snapshot.databases[0].owner='postgres','ownership-or-identity-mismatch'],
 ['durable pin',x=>x.snapshot.pins.push({name:x.snapshot.databases[0].name,pinned:true}),'durably-pinned'],
 ['pinned',x=>x.state.pinnedCopies.push(x.snapshot.databases[0].name),'pinned'],
 ['pending',x=>x.state.pendingCopies.push(x.snapshot.databases[0].name),'pending-release'],
 ['unclosed or failed release',x=>x.state.closedJobIds.shift(),'release-not-confirmed-closed'],
 ['connections',x=>x.snapshot.databases[0].connections=1,'in-use-or-unknown'],
 ['unknown connections',x=>x.snapshot.databases[0].connections=null,'in-use-or-unknown'],
 ['recent',x=>{x.snapshot.catalog[0].first_observed_at=new Date(epoch-3600000).toISOString();},'within-age-window'],
 ['future timestamp',x=>x.snapshot.catalog[0].first_observed_at=new Date(epoch+1).toISOString(),'unproven-provenance']
])test('protect '+label,()=>{const data=scenario();change(data);const row=makePlan(data.snapshot,data.state,scope).rows[0];assert.equal(row.eligible,false);assert.ok(row.reasons.includes(reason));});
test('production/admin/template and lookalike names cannot be candidates',()=>{
 const data=scenario();for(const name of ['railway','postgres','template0','kingdom_release_retention','kc_bad_restore_test','kc_'+ 'a'.repeat(32)+'_restore_test;DROP DATABASE railway'])data.snapshot.databases.push({name,oid:'10',owner:'kc_release_copy_owner',template:false,bytes:'10',connections:0});
 const plan=makePlan(data.snapshot,data.state,scope);assert.ok(plan.rows.slice(4).every(row=>!row.eligible&&row.reasons.includes('outside-copy-scope')));
});
test('missing/stale/quiescence/current-reference evidence fails closed',()=>{
 for(const change of [x=>x.state.releaseQuiescent=false,x=>x.state.observedAt=new Date(epoch-300001).toISOString(),x=>x.state.currentRecoveryCopy=copyName('missing'),x=>delete x.state.currentRecoveryCopy,x=>x.state.closedJobIds=null]){
  const data=scenario();change(data);assert.throws(()=>makePlan(data.snapshot,data.state,scope));
 }
});
test('backdated artifact imports use first observation for age, successful verification time for ordering',()=>{
 const copies=[fixture(1,{age:0,verifiedAge:200}),fixture(2,{age:48}),fixture(3,{age:47}),fixture(4,{age:46})],data=scenario(copies);
 const plan=makePlan(data.snapshot,data.state,scope);assert.ok(plan.rows[0].reasons.includes('within-age-window'));assert.equal(plan.rows[1].eligible,true);
});
test('an ownership mismatch must not consume a retained verified slot',()=>{const data=scenario();data.snapshot.databases.at(-1).owner='postgres';const plan=makePlan(data.snapshot,data.state,scope);assert.equal(plan.rows[1].eligible,false);});

test('the two retained copies must still exist',()=>{
 const data=scenario();data.snapshot.databases.pop();data.state.currentRecoveryCopy=data.snapshot.databases.at(-1).name;
 const plan=makePlan(data.snapshot,data.state,scope);assert.equal(plan.rows[1].eligible,false);assert.ok(plan.rows[1].reasons.includes('newest-verified'));
});
test('authorization binds exact plan, live-state attestation, target and independent key',()=>{
 const data=scenario(),plan=makePlan(data.snapshot,data.state,scope),signed=approved(plan,data.state);
 assert.equal(checkApproval(signed.encoded,publicKey,plan,data.state,scope,{now:epoch}).id,signed.approval.id);
 for(const overrides of [{planSha256:'f'.repeat(64)},{stateSha256:'f'.repeat(64)},{releaseConcurrencyHeld:false},{expiresAt:new Date(epoch).toISOString()},{expiresAt:new Date(epoch+300001).toISOString()},{scope:{...scope,projectId:randomUUID()}}]){
  assert.throws(()=>checkApproval(approved(plan,data.state,overrides).encoded,publicKey,plan,data.state,scope,{now:epoch}));
 }
 assert.throws(()=>checkApproval(signed.encoded,keys.privateKey.export({type:'pkcs8',format:'pem'}),plan,data.state,scope,{now:epoch}));
 const other=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});assert.throws(()=>checkApproval(signed.encoded,other,plan,data.state,scope,{now:epoch}));
 assert.throws(()=>checkScope({...scope,releaseKeyDigest:scope.approvalKeyDigest}));
 assert.throws(()=>checkScope({...scope,workerAdminDatabase:'different_database'}));
});
test('environment accepts only the exact private administrative target and runtime role',()=>{
 const env={NODE_ENV:'production',KINGDOM_RETENTION_ENABLED:'1',RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,RAILWAY_SERVICE_ID:scope.operatorServiceId,KINGDOM_RETENTION_PG_SERVICE_ID:scope.verificationServiceId,KINGDOM_RETENTION_WORKER_ADMIN_DATABASE:scope.workerAdminDatabase,KINGDOM_RETENTION_DATABASE_URL:'postgres://kc_retention_runtime:fixture@copy.railway.internal/kingdom_release_retention'};
 assert.ok(checkEnvironment(env,scope));
 for(const overrides of [{DATABASE_URL:'anything'},{KINGDOM_RELEASE_SIGNING_KEY:'anything'},{KINGDOM_RETENTION_ENABLED:'0'},{RAILWAY_SERVICE_ID:scope.gameServiceId},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{KINGDOM_RETENTION_DATABASE_URL:'postgres://kc_retention_runtime:x@game.railway.internal/kingdom_release_retention'},{KINGDOM_RETENTION_DATABASE_URL:'postgres://postgres:x@copy.railway.internal/kingdom_release_retention'}])assert.throws(()=>checkEnvironment({...env,...overrides},scope));
});
test('manifest identity and independent recovery checks cannot be bypassed',()=>{
 const data=fixture(1);assert.equal(evidenceRecord(data.catalog.evidence,scope).name,data.database.name);
 for(const change of [x=>x.report.restoreClusterDigest=scope.sourceClusterDigest,x=>x.request.urls={},x=>x.request.gameServiceId=randomUUID(),x=>x.report.backup.exportRoundTripVerified=false,x=>x.backupKey+='other']){
  const evidence=structuredClone(data.catalog.evidence);change(evidence);assert.throws(()=>evidenceRecord(evidence,scope));
 }
});
