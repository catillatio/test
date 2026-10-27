import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,stat,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeBaseline} from '../deployment/release/retention/journal.mjs';
import {adoptionEvidence,adoptionReasons} from '../deployment/release/retention/adoption.mjs';
import {verifyRetirement} from '../deployment/release/retention/verification.mjs';
import {hash,checkScope} from '../deployment/release/retention/protocol.mjs';
import {makePlan} from '../deployment/release/retention/retention.mjs';
import {scope,scenario,fixture} from './fixtures/release-retention.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('cleanup cannot reuse the release verification worker service',()=>{assert.throws(()=>checkScope({...scope,operatorServiceId:scope.verificationWorkerServiceId}));});
test('pre-operation journal is exclusive, private and refuses a substituted directory',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'retention-journal-'));
 try{
  const file=join(folder,'before.json'),value={kind:'synthetic-baseline',databases:[]};
  await writeBaseline(file,value);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),value);assert.equal((await stat(file)).mode&0o777,0o600);
  await assert.rejects(writeBaseline(file,value),{code:'EEXIST'});
  await symlink(folder,join(folder,'linked'));await assert.rejects(writeBaseline(join(folder,'linked','new.json'),value));
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('adoption binds the authenticated original file, recorded OID and independent verification; legacy names are insufficient',()=>{
 const f=fixture(81),bytes=Buffer.from(JSON.stringify(f.catalog.evidence));
 assert.equal(adoptionEvidence(bytes,sha(bytes),scope,f.database.oid).payload.oid,f.database.oid);
 assert.throws(()=>adoptionEvidence(bytes,'0'.repeat(64),scope,f.database.oid));
 assert.throws(()=>adoptionEvidence(bytes,sha(bytes),scope,'999'));
 for(const mutate of [m=>delete m.report.verifiedCopyIdentity,m=>m.report.verifiedCopyIdentity.oid='106971',m=>m.report.verifiedCopyIdentity.maintenanceDatabase='wrong',m=>m.report.passed=false]){
  const m=structuredClone(f.catalog.evidence);mutate(m);const raw=Buffer.from(JSON.stringify(m));
  assert.throws(()=>adoptionEvidence(raw,sha(raw),scope,f.database.oid));
 }
});
function candidate(){
 const data=scenario(),f=fixture(1);data.snapshot.databases[0].owner='postgres';data.snapshot.catalog=[];
 const observed={name:f.database.name,database_oid:f.database.oid,observed_owner:'postgres',cluster_digest:scope.clusterDigest,first_observed_at:f.catalog.first_observed_at,verified_at:f.catalog.verified_at};
 return {...data,manifest:f.catalog.evidence,observations:[observed]};
}
for(const [label,mutate,reason] of [
 ['current',x=>x.state.currentRecoveryCopy=x.manifest.request.copy,'current-recovery'],
 ['active',x=>x.state.activeSha=x.manifest.request.sha,'active-release-candidate'],
 ['pending',x=>x.state.pendingCopies.push(x.manifest.request.copy),'pending-release'],
 ['rollback or owner pin',x=>x.state.pinnedCopies.push(x.manifest.request.copy),'pinned-or-rollback-reference'],
 ['durable pin',x=>x.snapshot.pins.push({name:x.manifest.request.copy,pinned:true}),'durably-pinned'],
 ['unclosed',x=>x.state.closedJobIds=[],'release-not-confirmed-closed'],
 ['connected',x=>x.snapshot.databases[0].connections=1,'in-use-or-unknown']
])test('ownership handoff protects '+label,()=>{const x=candidate();mutate(x);assert.ok(adoptionReasons(x.snapshot,x.state,scope,x.manifest,x.observations).includes(reason));});
test('non-destructive anchor adoption is separate from age/newest retirement protection',()=>{
 const x=candidate();x.observations[0].first_observed_at=x.snapshot.now;
 assert.deepEqual(adoptionReasons(x.snapshot,x.state,scope,x.manifest,x.observations),[]);
 const f=fixture(1,{now:Date.parse(x.snapshot.now),age:0});const state={...x.state,currentRecoveryCopy:f.database.name};
 const plan=makePlan({now:x.snapshot.now,databases:[f.database],catalog:[f.catalog],pins:[]},state,scope);
 assert.equal(plan.rows[0].eligible,false);assert.ok(plan.rows[0].reasons.includes('newest-verified'));assert.ok(plan.rows[0].reasons.includes('within-age-window'));
});
test('planner protects an imported old name without original OID or with a fabricated original OID',()=>{
 for(const change of [m=>delete m.report.verifiedCopyIdentity,m=>m.report.verifiedCopyIdentity.oid='333333']){
  const x=scenario();change(x.snapshot.catalog[0].evidence);
  // Even a recomputed catalog digest is not a substitute for original identity.
  x.snapshot.catalog[0].evidence_sha256=hash(x.snapshot.catalog[0].evidence);
  assert.equal(makePlan(x.snapshot,x.state,scope).rows[0].eligible,false);
 }
});
function retired(){
 const x=scenario(),plan=makePlan(x.snapshot,x.state,scope),target=plan.rows[0];
 const before=structuredClone(x.snapshot),after=structuredClone(before);after.databases.shift();
 const result={dropped:[target.name],alreadyAbsent:[],measuredDatabaseBytesRemoved:target.bytes};return {before,after,plan,result};
}
test('postcheck proves exact absence and retained identities but never claims physical disk relief',()=>{
 const x=retired(),r=verifyRetirement(x.before,x.after,x.plan,x.result);
 assert.equal(r.targetIdentitiesAbsent,true);assert.equal(r.allUntargetedIdentitiesPreserved,true);
 assert.equal(r.logicalDatabaseBytesRemoved,'1048576');assert.equal(r.filesystemBytesReclaimed,null);
});
for(const [label,mutate] of [
 ['protected OID',x=>x.after.databases[0].oid='999'],['owner',x=>x.after.databases[0].owner='other'],
 ['protected database lost',x=>x.after.databases.pop()],['target still exists',x=>x.after.databases.push(x.before.databases[0])],
 ['target OID renamed',x=>x.after.databases.push({...x.before.databases[0],name:'renamed'})],
 ['unrelated creation',x=>x.after.databases.push({...x.before.databases[0],name:'unrelated',oid:'999'})],
 ['unsigned deletion',x=>x.result.dropped.push(x.plan.rows[3].name)],['duplicate result',x=>x.result.alreadyAbsent.push(x.result.dropped[0])],
 ['missing baseline',x=>x.before.databases=[]],['duplicate baseline identity',x=>x.before.databases.push(x.before.databases[0])],['backward observation time',x=>x.after.now='2020-01-01T00:00:00Z']
])test('postcheck refuses '+label,()=>{const x=retired();mutate(x);assert.throws(()=>verifyRetirement(x.before,x.after,x.plan,x.result));});
for(const oid of ['106971','129180'])test('postcheck preserves emergency tuple '+oid,()=>{
 const x=retired(),e={name:'emergency_'+oid,oid,owner:'postgres',template:false,bytes:'10',connections:0};x.before.databases.push(e);x.after.databases.push({...e});
 assert.equal(verifyRetirement(x.before,x.after,x.plan,x.result).protectedEmergencyOidsObserved,1);
 x.after.databases.at(-1).oid='999';assert.throws(()=>verifyRetirement(x.before,x.after,x.plan,x.result));
});
