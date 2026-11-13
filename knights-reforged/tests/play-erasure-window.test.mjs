import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {verifyErasureWindow} from '../deployment/privacy/release-window.mjs';
const operationId='11111111-1111-4111-8111-111111111111',codeSha='a'.repeat(40),now=Date.parse('2026-11-13T01:00:00Z');
const permit={operationId,codeSha,coordinator:{protocol:'kingdom-production-mutex-v1',runId:'123',runAttempt:1,jobId:'456'}};
function fixture(change=()=>{}){
 const run={id:123,run_attempt:1,event:'workflow_dispatch',path:'.github/workflows/account-erasure-window.yml',head_repository:{full_name:'catillatio/test'},head_branch:'release/production',head_sha:codeSha,status:'in_progress',conclusion:null,display_title:'Account erasure window '+createHash('sha256').update(operationId).digest('hex')};
 const job={id:456,name:'window',status:'in_progress',conclusion:null,started_at:new Date(now-1000).toISOString(),steps:[{name:'Hold the production release mutex',status:'in_progress'}]};
 const approvals=[{state:'approved',user:{login:'catillatio'},environments:[{name:'account-erasure'}]}];change({run,job,approvals});let reads=0;
 return {get reads(){return reads;},options:{token:'synthetic-actions-read-only-token',now:()=>now,fetcher:async(url,options)=>{
  reads++;assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer synthetic-actions-read-only-token');
  assert.ok(url.startsWith('https://api.github.com/repos/catillatio/test/actions/runs/123'));
  return Response.json(url.endsWith('/approvals')?approvals:url.includes('/jobs?')?{jobs:[job]}:run);
 }}};
}
test('private erasure verifies a fresh owner-approved operation-bound job in the real production mutex',async()=>{
 const f=fixture();assert.deepEqual(await verifyErasureWindow(permit,f.options),{runId:'123',jobId:'456',runAttempt:1});assert.equal(f.reads,3);
});
const changes={cancelled:({run})=>{run.status='completed';run.conclusion='cancelled';},queued:({run})=>{run.status='queued';},source:({run})=>{run.head_sha='b'.repeat(40);},repository:({run})=>{run.head_repository.full_name='other/test';},workflow:({run})=>{run.path='.github/workflows/other.yml';},operation:({run})=>{run.display_title='Account erasure window '+'c'.repeat(64);},attempt:({run})=>{run.run_attempt=2;},job:({job})=>{job.id=457;},finished:({job})=>{job.status='completed';},step:({job})=>{job.steps[0].status='completed';},stale:({job})=>{job.started_at=new Date(now-1200001).toISOString();},approval:({approvals})=>{approvals.length=0;},owner:({approvals})=>{approvals[0].user.login='someone-else';},environment:({approvals})=>{approvals[0].environments[0].name='unprotected';}};
for(const [name,change] of Object.entries(changes))test('erasure rejects '+name+' coordinator evidence',async()=>{const f=fixture(change);await assert.rejects(verifyErasureWindow(permit,f.options));});
test('missing coordinator credential cannot become an owner-window attestation fallback',async()=>{
 const f=fixture();await assert.rejects(verifyErasureWindow(permit,{...f.options,token:''}));assert.equal(f.reads,0);
});
test('coordinator access errors never include provider bodies or credentials',async()=>{
 await assert.rejects(verifyErasureWindow(permit,{token:'synthetic',fetcher:async()=>new Response('SENSITIVE_PROVIDER_RESPONSE',{status:403})}),error=>!String(error).includes('SENSITIVE_PROVIDER_RESPONSE')&&!String(error).includes('synthetic'));
});
test('erasure window is manual, owner-gated and serialized with existing protected releases; no privileged operation runs in it',()=>{
 const root=new URL('../../',import.meta.url),window=readFileSync(new URL('.github/workflows/account-erasure-window.yml',root),'utf8'),release=readFileSync(new URL('.github/workflows/production-release.yml',root),'utf8');
 for(const workflow of [window,release]){assert.match(workflow,/group: kingdom-come-production/);assert.match(workflow,/cancel-in-progress: false/);}
 assert.match(window,/environment: account-erasure/);assert.match(window,/workflow_dispatch:/);assert.match(window,/timeout-minutes: 20/);
 assert.doesNotMatch(window,/secrets\.|RAILWAY_TOKEN|DATABASE_URL|SIGNING_KEY|run\.mjs promote/);
 const entry=readFileSync(new URL('knights-reforged/deployment/privacy/fulfill.mjs',root),'utf8');assert.match(entry,/verifyErasureWindow\(authorization.permit/);assert.doesNotMatch(entry,/KINGDOM_ERASURE_OWNER_WINDOW/);
});
