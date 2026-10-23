import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForWorkerCompletion} from '../deployment/release/deployment.mjs';

const ids=Array.from({length:5},(_,i)=>String(i+1).repeat(8)+'-'+String(i+1).repeat(4)+'-4'+String(i+1).repeat(3)+'-8'+String(i+1).repeat(3)+'-'+String(i+1).repeat(12));
const expected={projectId:ids[0],environmentId:ids[1],serviceId:ids[2]},deploymentId=ids[3];
const token='synthetic-project-token-not-a-credential',secret='synthetic-private-provider-url-and-credential';
const epoch=Date.parse('2050-01-01T00:00:00Z');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const capture=operation=>operation.then(value=>({value}),error=>({error}));
const instance=(status='EXITED',id='synthetic-worker-instance')=>({id,status});
const deployment=(overrides={})=>({id:deploymentId,...expected,status:'SUCCESS',deploymentStopped:true,instances:[instance()],...overrides});
const response=value=>({ok:true,json:async()=>({data:{deployment:value}})});
const failure='Exact private worker completion could not be verified. Production promotion stopped.';
function harness(t,handler){
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const calls=[],statuses=[];
 const fetcher=async(url,options)=>{
  assert.equal(url,'https://backboard.railway.com/graphql/v2');assert.equal(options.method,'POST');
  assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(options.headers,{'content-type':'application/json','project-access-token':token});
  const body=JSON.parse(options.body);assert.deepEqual(body.variables,{id:deploymentId});
  assert.match(body.query,/^query KingdomReleaseWorkerCompletion/);assert.match(body.query,/deploymentStopped instances \{ id status \}/);
  assert.doesNotMatch(body.query,/mutation|logs|meta|variables\s*\{|exitCode/);
  calls.push({url,options});return handler(calls.length,options);
 };
 return {calls,statuses,wait:(options={})=>waitForWorkerCompletion(deploymentId,expected,{token,fetcher,onStatus:code=>statuses.push(code),...options})};
}
function rejected(result){assert.ok(result.error);assert.equal(result.error.message,failure);assert.equal(result.error.cause,undefined);}

test('the exact queued worker must progress through build/running to stopped SUCCESS with its sole instance EXITED',async t=>{
 const states=[deployment({status:'QUEUED',instances:[]}),deployment({status:'BUILDING',instances:[]}),deployment({status:'DEPLOYING',deploymentStopped:false,instances:[instance('CREATED')]}),deployment({deploymentStopped:false,instances:[instance('RUNNING')]}),deployment()];
 const h=harness(t,n=>response(states[n-1]));const result=capture(h.wait());await flush();
 assert.equal(h.calls.length,1);assert.deepEqual(h.statuses,['WAITING']);
 for(let i=0;i<4;i++){t.mock.timers.tick(5000);await flush();assert.equal(h.calls.length,i+2);}
 assert.deepEqual(await result,{value:deploymentId});assert.deepEqual(h.statuses,['WAITING','COMPLETED']);
});

test('SUCCESS while running is not completion, even when one completion field updates early',async t=>{
 const states=[deployment({deploymentStopped:false,instances:[instance('RUNNING')]}),deployment({deploymentStopped:true,instances:[instance('RUNNING')]}),deployment({deploymentStopped:false}),deployment()];
 const h=harness(t,n=>response(states[n-1]));const result=capture(h.wait());await flush();
 for(let i=0;i<2;i++){t.mock.timers.tick(5000);await flush();assert.deepEqual(h.statuses,['WAITING']);}
 t.mock.timers.tick(5000);await flush();assert.deepEqual(await result,{value:deploymentId});
 assert.deepEqual(h.statuses,['WAITING','COMPLETED']);
});

test('an already completed, identity-matched worker requires one authenticated read',async t=>{
 const h=harness(t,()=>response(deployment()));assert.deepEqual(await capture(h.wait()),{value:deploymentId});
 assert.equal(h.calls.length,1);assert.deepEqual(h.statuses,['COMPLETED']);
});

for(const state of ['FAILED','CRASHED','REMOVED','REMOVING','SKIPPED'])test('terminal deployment '+state+' fails immediately without retry or success',async t=>{
 const h=harness(t,()=>response(deployment({status:state})));rejected(await capture(h.wait()));
 assert.equal(h.calls.length,1);assert.deepEqual(h.statuses,['TERMINATED']);
 t.mock.timers.tick(30000);await flush();assert.equal(h.calls.length,1);
});
for(const state of ['CRASHED','STOPPED','REMOVED','REMOVING','SKIPPED','RESTARTING',secret])test('a stopped/crashed/restarted or unknown instance is not a clean completion: '+(state===secret?'unknown':state),async t=>{
 const h=harness(t,()=>response(deployment({instances:[instance(state)]})));rejected(await capture(h.wait()));
 assert.equal(h.calls.length,1);assert.deepEqual(h.statuses,['STATE_REJECTED']);
});
for(const key of ['id','projectId','environmentId','serviceId'])test('completion evidence for the wrong '+key+' cannot substitute for the exact queued worker',async t=>{
 const h=harness(t,()=>response(deployment({[key]:ids[4]})));rejected(await capture(h.wait()));
 assert.equal(h.calls.length,1);assert.deepEqual(h.statuses,['IDENTITY_REJECTED']);
});

test('a different instance under the same deployment cannot replace the one already observed',async t=>{
 const h=harness(t,n=>response(n===1?deployment({deploymentStopped:false,instances:[instance('RUNNING')]}):deployment({instances:[instance('EXITED','replacement-instance')]})));
 const result=capture(h.wait());await flush();t.mock.timers.tick(5000);await flush();rejected(await result);
 assert.equal(h.calls.length,2);assert.deepEqual(h.statuses,['WAITING','IDENTITY_REJECTED']);
});

for(const [name,overrides]of[
 ['missing stopped flag',{deploymentStopped:undefined}],['truthy stopped flag',{deploymentStopped:'true'}],
 ['missing instances',{instances:undefined}],['non-array instances',{instances:{}}],['null instance',{instances:[null]}],
 ['no successful instance',{instances:[]}],['multiple instances',{instances:[instance(),instance('EXITED','second')]}],
 ['missing instance ID',{instances:[{status:'EXITED'}]}],['missing instance state',{instances:[{id:'instance'}]}],
 ['sleeping worker',{status:'SLEEPING'}],['Railway approval pending',{status:'NEEDS_APPROVAL'}],['unknown status',{status:secret}]
])test('incomplete or unsupported completion metadata fails closed: '+name,async t=>{
 const h=harness(t,()=>response(deployment(overrides)));rejected(await capture(h.wait()));assert.equal(h.calls.length,1);
 assert.deepEqual(h.statuses,['STATE_REJECTED']);
});

for(const [name,provider]of[
 ['network',()=>{throw new Error(secret);}],['malformed JSON',()=>({ok:true,json:async()=>{throw new Error(secret);}})],
 ['null JSON',()=>({ok:true,json:async()=>null})],['GraphQL error',()=>({ok:true,json:async()=>({data:{deployment:deployment()},errors:[{message:secret}]})})],
 ['invalid GraphQL errors field',()=>({ok:true,json:async()=>({data:{deployment:deployment()},errors:secret})})],
 ...[400,401,403,408,429,500,503].map(code=>['HTTP '+code,()=>({ok:false,body:{cancel:async()=>{}},get json(){throw new Error(secret);}})])
])test('metadata API error is sanitized and never retried: '+name,async t=>{
 const h=harness(t,provider);rejected(await capture(h.wait()));assert.equal(h.calls.length,1);
 assert.deepEqual(h.statuses,['API_REJECTED']);assert.doesNotMatch(h.statuses.join(' '),/synthetic-private/);
});

test('missing deployment evidence fails closed without consulting another deployment',async t=>{
 const h=harness(t,()=>response(null));rejected(await capture(h.wait()));
 assert.equal(h.calls.length,1);assert.deepEqual(h.statuses,['IDENTITY_REJECTED']);
});

test('pending worker stops at the original 20-minute maximum, even if a later deadline is requested',async t=>{
 const h=harness(t,()=>response(deployment({status:'QUEUED',instances:[]})));const result=capture(h.wait({deadline:epoch+3600000}));await flush();
 for(let i=0;i<240;i++){t.mock.timers.tick(5000);await flush();}
 rejected(await result);assert.equal(h.calls.length,240);assert.deepEqual(h.statuses,['WAITING','DEADLINE']);
});

test('a shorter deadline stops before another status read',async t=>{
 const h=harness(t,()=>response(deployment({status:'BUILDING',instances:[]})));const result=capture(h.wait({deadline:epoch+2500}));await flush();
 t.mock.timers.tick(2500);await flush();rejected(await result);assert.equal(h.calls.length,1);assert.deepEqual(h.statuses,['WAITING','DEADLINE']);
});

test('an expired deadline does not perform any metadata request',async t=>{
 const h=harness(t,()=>assert.fail('Unexpected request'));rejected(await capture(h.wait({deadline:epoch})));
 assert.equal(h.calls.length,0);assert.deepEqual(h.statuses,['DEADLINE']);
});

test('a late successful response cannot extend the deadline',async t=>{
 const h=harness(t,()=>{t.mock.timers.tick(1000);return response(deployment());});rejected(await capture(h.wait({deadline:epoch+1000})));
 assert.equal(h.calls.length,1);assert.deepEqual(h.statuses,['DEADLINE']);
});

test('each authenticated request uses the shorter of 15 seconds and the remaining budget',async t=>{
 const timeouts=[];t.mock.method(AbortSignal,'timeout',ms=>{timeouts.push(ms);return new AbortController().signal;});
 const h=harness(t,()=>response(deployment({status:'BUILDING',instances:[]})));const result=capture(h.wait({deadline:epoch+18000}));await flush();
 t.mock.timers.tick(5000);await flush();assert.deepEqual(timeouts,[15000,13000]);
 t.mock.timers.tick(13000);await flush();rejected(await result);assert.equal(h.calls.length,2);
});

for(const phase of ['before','request','wait'])test('abort during '+phase+' cannot complete a worker or leak its reason',async t=>{
 const controller=new AbortController();
 const h=harness(t,(_,options)=>phase==='request'?new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error(secret)),{once:true})):response(deployment({status:'QUEUED',instances:[]})));
 if(phase==='before')controller.abort(new Error(secret));
 const result=capture(h.wait({signal:controller.signal}));await flush();controller.abort(new Error(secret));await flush();
 rejected(await result);assert.equal(h.calls.length,phase==='before'?0:1);assert.equal(h.statuses.at(-1),'ABORTED');
});

test('invalid exact-target configuration fails before a request',async t=>{
 const h=harness(t,()=>assert.fail('Unexpected request'));
 for(const changed of [{token:''},{token:'invalid\nheader'},{deadline:NaN}]){
  rejected(await capture(h.wait(changed)));
 }
 for(const target of ['invalid-id',deploymentId+'\n']){
  rejected(await capture(waitForWorkerCompletion(target,expected,{token,fetcher:()=>assert.fail('Unexpected request')})));
 }
 assert.equal(h.calls.length,0);assert.deepEqual(h.statuses,Array(3).fill('CONFIGURATION_REJECTED'));
});

test('target identity is rechecked on later status reads, not just when the worker was queued',async t=>{
 const h=harness(t,n=>response(n===1?deployment({deploymentStopped:false,instances:[instance('RUNNING')]}):deployment({serviceId:ids[4]})));
 const result=capture(h.wait());await flush();t.mock.timers.tick(5000);await flush();rejected(await result);
 assert.equal(h.calls.length,2);assert.deepEqual(h.statuses,['WAITING','IDENTITY_REJECTED']);
});

test('metadata error bodies and headers are canceled, never inspected for output',async t=>{
 let canceled=0,inspected=0;
 const h=harness(t,()=>({ok:false,body:{cancel:async()=>{canceled++;}},get json(){inspected++;throw new Error(secret);},get headers(){inspected++;throw new Error(secret);}}));
 rejected(await capture(h.wait()));assert.equal(canceled,1);assert.equal(inspected,0);
 assert.deepEqual(h.statuses,['API_REJECTED']);
});
