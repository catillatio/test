import test from 'node:test';
import assert from 'node:assert/strict';
import {liveGuards} from '../deployment/release/retention/guards.mjs';
import {scope,fixture,scenario} from './fixtures/release-retention.mjs';
const unsafe='SYNTHETIC_PROVIDER_DETAILS_NOT_FOR_LOGS';
const entry=fixture(1),state=scenario().state,record={jobId:entry.jobId,evidence:entry.catalog.evidence};
const run={id:1,run_attempt:1,status:'completed',path:'.github/workflows/production-release.yml',event:'workflow_dispatch',head_branch:'release/production',head_repository:{full_name:'catillatio/test'},head_sha:'a'.repeat(40)};
function mock(mode){
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(options.signal);
  if(mode==='transport')throw new Error(unsafe);
  if(mode==='http')return new Response(unsafe,{status:403});
  if(url===scope.origin+'/healthz'){
   assert.equal(options.headers.authorization,undefined);
   return Response.json({status:mode==='unhealthy'?'down':'ready',release:'phase4.7',commit:mode==='changed-commit'?'e'.repeat(40):state.activeSha});
  }
  assert.ok(url.startsWith('https://api.github.com/repos/catillatio/test/'));assert.equal(options.headers.authorization,'Bearer fixture-only');
  if(url.includes('/workflows/production-release.yml/runs?')){
   const status=new URL(url).searchParams.get('status');return Response.json({total_count:mode===status?1:0,workflow_runs:mode===status?[{id:1}]:[]});
  }
  assert.equal(url,'https://api.github.com/repos/catillatio/test/actions/runs/1/attempts/1');
  if(mode==='malformed')return new Response('{');
  const data=structuredClone(run);
  if(mode==='wrong-attempt')data.run_attempt=2;if(mode==='wrong-run')data.id=2;if(mode==='wrong-sha')data.head_sha='e'.repeat(40);if(mode==='not-completed')data.status='in_progress';
  if(mode==='wrong-repository')data.head_repository.full_name='other/repository';if(mode==='wrong-workflow')data.path='.github/workflows/checks.yml';if(mode==='wrong-branch')data.head_branch='feature/test';
  return Response.json(data);
 };
 return {calls,guards:liveGuards(scope,{githubToken:'fixture-only',fetcher})};
}
test('live coordination uses only fixed read endpoints, exact completed run/attempt/SHA and current health',async()=>{
 const {calls,guards}=mock('success');await guards.beforeDelete(record,state);assert.equal(calls.length,7);
 assert.equal(calls.filter(call=>new URL(call.url).origin===scope.origin).length,1);
 assert.ok(calls.every(call=>call.options.method===undefined));
});
for(const mode of ['queued','in_progress','waiting','pending','requested','unhealthy','changed-commit','wrong-attempt','wrong-run','wrong-sha','not-completed','wrong-repository','wrong-workflow','wrong-branch','malformed','http','transport'])test('coordination fails closed: '+mode,async()=>{
 const {guards}=mock(mode);await assert.rejects(guards.beforeDelete(record,state));
});
test('no credential fallback or arbitrary endpoint; invalid input prevents reads',async()=>{
 assert.throws(()=>liveGuards({...scope,origin:'http://unsafe.test'}));
 let read=false;const guards=liveGuards(scope,{fetcher:async()=>{read=true;return Response.json({status:'ready',release:'phase4.7',commit:state.activeSha});}});
 await assert.rejects(guards.beforeDelete(record,state));assert.equal(read,true); // Public health may be read; no authenticated request is made without a token.
});
