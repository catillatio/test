// Fixed-purpose private delivery. None of these objects is a public output.
import assert from 'node:assert/strict';
import {createPublicKey,sign,verify} from 'node:crypto';
import {checkScope,checkState,checkCoordinator,hash} from '../protocol.mjs';
import {uuid,httpsOrigin} from '../../protocol.mjs';
export const deliveryProtocol='kingdom-retention-delivery-v1';
export const operations=Object.freeze(['retire','adoption-review','reconcile']);
export const roles=Object.freeze(['executor','authorizer']);
export const root='/run/kingdom-retention';
const keys=(v,k)=>assert.deepEqual(Object.keys(v??{}).sort(),k.slice().sort());
export function deliveryScope(value){checkScope(value);assert.equal(value.delivery?.protocol,deliveryProtocol);return value;}
export function coordinator(env){
 assert.equal(env.KINGDOM_RETENTION_EXECUTION_APPROVED,'1');
 assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.GITHUB_REF,'refs/heads/release/production');
 assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_JOB,'retire');
 assert.equal(env.GITHUB_RUN_ATTEMPT,'1','Delivery writes cannot be rerun; use a fresh request.');
 return checkCoordinator({repository:env.GITHUB_REPOSITORY,workflow:'.github/workflows/recovery-copy-retention.yml',job:env.GITHUB_JOB,runId:env.GITHUB_RUN_ID,runAttempt:1,headSha:env.GITHUB_SHA});
}
export function frame(value,env,role){
 keys(value,['protocol','role','operation','requestId','scope','coordinator','codeDigest','createdAt','expiresAt','githubToken','origin','urls','deliveryVerifyKey']);
 assert.equal(value.protocol,deliveryProtocol);assert.equal(value.role,role);assert.ok(roles.includes(role));
 assert.ok(operations.includes(value.operation));assert.match(value.requestId??'',uuid);deliveryScope(value.scope);checkCoordinator(value.coordinator);
 assert.equal(createPublicKey(value.deliveryVerifyKey).asymmetricKeyType,'ed25519');assert.ok(!value.deliveryVerifyKey.includes('PRIVATE KEY'));
 assert.match(value.codeDigest??'',/^[a-f0-9]{64}$/);assert.ok(value.githubToken&&!/[\r\n]/.test(value.githubToken));
 const now=Date.now(),from=Date.parse(value.createdAt),to=Date.parse(value.expiresAt);
 assert.ok(Number.isFinite(from)&&from<=now&&to>now&&to-from<=900000);
 assert.equal(env.RAILWAY_PROJECT_ID,value.scope.projectId);assert.equal(env.RAILWAY_ENVIRONMENT_ID,value.scope.environmentId);
 assert.equal(env.RAILWAY_SERVICE_ID,role==='executor'?value.scope.operatorServiceId:value.scope.delivery.authorizerServiceId);
 assert.match(env.RAILWAY_DEPLOYMENT_ID??'',uuid);
 const names=role==='executor'?['inputGet','readyPut','armGet','resultPut','signatureGet','permitGet']:['inputGet','inputPut','readyPut','armGet','resultPut','signatureGet','permitPut'];
 keys(value.urls,names);httpsOrigin(value.origin);
 for(const url of Object.values(value.urls)){const u=new URL(url);assert.equal(u.protocol,'https:');assert.ok(!u.username&&!u.password&&!u.hash);assert.equal(u.origin,value.origin);}
 return value;
}
export function githubEnvironment(c,token){return {GH_TOKEN:token,GITHUB_REPOSITORY:c.repository,GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_JOB:c.job,GITHUB_RUN_ID:c.runId,GITHUB_RUN_ATTEMPT:String(c.runAttempt),GITHUB_SHA:c.headSha};}
export function input(value,f){
 keys(value,['protocol','operation','requestId','scope','state','data']);
 assert.equal(value.protocol,deliveryProtocol);assert.equal(value.operation,f.operation);assert.equal(value.requestId,f.requestId);
 assert.deepEqual(value.scope,deliveryScope(f.scope));checkState(value.state,f.scope);assert.deepEqual(value.state.coordinator,f.coordinator);
 if(value.operation==='retire'){
  keys(value.data,['plan']);const p=value.data.plan;assert.deepEqual(p.scope,f.scope);assert.equal(p.stateSha256,hash(value.state));
  keys(p,['protocol','scope','policy','observedAt','stateSha256','rows','reclaimableBytes']);assert.equal(p.protocol,'kingdom-copy-retention-v1');
  assert.equal(p.rows.length,1,'Initial delivery is one exact owner-reviewed target, never a broad batch.');
  const r=p.rows[0];keys(r,['name','oid','bytes','eligible','reasons','evidenceSha256']);assert.equal(r.eligible,true);assert.match(r.name,/^kc_[a-f0-9]{32}_restore_test$/);assert.match(r.oid,/^[1-9][0-9]{0,9}$/);assert.match(r.bytes,/^[0-9]+$/);assert.match(r.evidenceSha256,/^[a-f0-9]{64}$/);assert.deepEqual(r.reasons,['obsolete-verified-copy']);assert.equal(p.reclaimableBytes,r.bytes);
  assert.ok(Number.isFinite(Date.parse(p.observedAt)));keys(p.policy,['keep','minAgeHours']);assert.ok(Number.isInteger(p.policy.keep)&&p.policy.keep>=2);assert.ok(Number.isInteger(p.policy.minAgeHours)&&p.policy.minAgeHours>=24);
 }else if(value.operation==='adoption-review')keys(value.data,['manifest']);
 else{keys(value.data,['before','priorApproval']);assert.match(value.data.priorApproval??'',uuid);}
 return value;
}
export function receipt(value,f,deploymentId,kind){
 keys(value,['protocol','kind','role','requestId','coordinator','deploymentId','codeDigest','inputDigest','passed']);
 assert.equal(value.protocol,deliveryProtocol);assert.equal(value.kind,kind);assert.equal(value.role,f.role);assert.equal(value.requestId,f.requestId);
 assert.deepEqual(value.coordinator,f.coordinator);assert.equal(value.deploymentId,deploymentId);assert.equal(value.codeDigest,f.codeDigest);assert.equal(value.passed,true);
 if(kind==='ready')assert.equal(value.inputDigest,null);else assert.match(value.inputDigest??'',/^[a-f0-9]{64}$/);
 return value;
}
export function makeReceipt(f,deploymentId,kind,inputDigest=null){return {protocol:deliveryProtocol,kind,role:f.role,requestId:f.requestId,coordinator:f.coordinator,deploymentId,codeDigest:f.codeDigest,inputDigest,passed:true};}

// A separate EPHEMERAL delivery key prevents a signer/handoff writer from changing
// the coordinator-frozen input or arming a different deployment. It is not a
// retirement authorization and never reaches either Railway component.
export function signArm(f,deploymentId,inputDigest,key){
 const value={protocol:f.protocol,requestId:f.requestId,role:f.role,deploymentId,codeDigest:f.codeDigest,coordinator:f.coordinator,inputDigest};
 const payload=Buffer.from(JSON.stringify(value));return {payload:payload.toString('base64url'),signature:sign(null,payload,key).toString('base64url')};
}
export function verifyArm(arm,f,deploymentId){
 keys(arm,['payload','signature']);assert.match(arm.payload??'',/^[A-Za-z0-9_-]{1,10000}$/);assert.match(arm.signature??'',/^[A-Za-z0-9_-]{86}$/);
 const b=Buffer.from(arm.payload,'base64url');assert.equal(verify(null,b,createPublicKey(f.deliveryVerifyKey),Buffer.from(arm.signature,'base64url')),true);
 const v=JSON.parse(b);assert.match(v.inputDigest??'',/^[a-f0-9]{64}$/);
 assert.deepEqual(v,{protocol:f.protocol,requestId:f.requestId,role:f.role,deploymentId,codeDigest:f.codeDigest,coordinator:f.coordinator,inputDigest:v.inputDigest});return v.inputDigest;
}
