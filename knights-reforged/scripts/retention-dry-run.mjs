// Deterministic SYNTHETIC report. Never connects to Railway or PostgreSQL.
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fixture,scenario,scope as sampleScope,epoch} from '../tests/fixtures/release-retention.mjs';
import {makePlan} from '../deployment/release/retention/retention.mjs';
import {hash} from '../deployment/release/retention/protocol.mjs';
const scope={...sampleScope,approvalKeyDigest:'a'.repeat(64)};
let serial=1;for(const key of Object.keys(scope).filter(k=>k.endsWith('Id')))scope[key]='00000000-0000-4000-8000-'+String(serial++).padStart(12,'0');
scope.delivery={protocol:'kingdom-retention-delivery-v1',authorizerServiceId:'00000000-0000-4000-8000-000000000008',journalVolumeId:'00000000-0000-4000-8000-000000000009'};
const copies=Array.from({length:8},(_,i)=>fixture(i+1,{age:80-i}));
for(const [i,c] of copies.entries()){
 for(const object of [c.catalog.evidence.request,c.catalog.evidence.report])for(const key of ['projectId','environmentId','gameServiceId'])object[key]=scope[key];
 c.catalog.evidence.request.workerServiceId=scope.verificationWorkerServiceId;c.catalog.evidence.report.workerServiceId=scope.verificationWorkerServiceId;
 c.catalog.evidence.report.workerDeploymentId='00000000-0000-4000-8000-'+String(100+i).padStart(12,'0');c.catalog.evidence_sha256=hash(c.catalog.evidence);
}
copies[1].database.oid='106971';copies[1].catalog.oid='106971';copies[5].catalog.first_observed_at=new Date(epoch-3600000).toISOString();
copies[1].catalog.evidence.report.verifiedCopyIdentity.oid='106971';copies[1].catalog.evidence_sha256=hash(copies[1].catalog.evidence);
const {snapshot,state}=scenario(copies);state.scope=scope;state.pendingCopies=[copies[2].database.name];state.pinnedCopies=[copies[3].database.name];snapshot.catalog=snapshot.catalog.filter(c=>c.name!==copies[4].database.name);
const plan=makePlan(snapshot,state,scope);assert.equal(plan.rows.filter(r=>r.eligible).length,1);
const report={evidence:'SYNTHETIC; NOT PRODUCTION INVENTORY OR AUTHORIZATION',executionEnabled:false,plan,planSha256:hash(plan)};
await writeFile(process.argv[2]??'docs/retention/SYNTHETIC_DRY_RUN.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log('SYNTHETIC_RETENTION_REPORT: PASS');
