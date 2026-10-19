import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyQueuedDeployment} from '../deployment/release/deployment.mjs';

const ids=Array.from({length:6},(_,i)=>String(i+1).repeat(8)+'-'+String(i+1).repeat(4)+'-4'+String(i+1).repeat(3)+'-8'+String(i+1).repeat(3)+'-'+String(i+1).repeat(12));
const expected={projectId:ids[0],environmentId:ids[1],serviceId:ids[2]};
const token='synthetic-project-token-not-a-credential';
// Existing-project response in railwayapp/cli v5.70.0 src/commands/up.rs.
const queued=JSON.stringify({deploymentId:ids[3],logsUrl:'https://logs.invalid/do-not-follow?secret=synthetic'});
const identity=()=>({data:{deployment:{id:ids[3],...expected}}});
const failure='Railway deployment identity could not be verified. Production promotion stopped.';
const reject=error=>{assert.equal(error.message,failure);assert.equal(error.cause,undefined);return true;};
const response=(data=identity())=>({ok:true,json:async()=>data});

test('v5.70 detached response succeeds only after independent authenticated identity lookup',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});return response();};
 assert.equal(await verifyQueuedDeployment(queued,expected,{token,fetcher}),ids[3]);
 assert.equal(calls.length,1);
 const {url,options}=calls[0];
 assert.equal(url,'https://backboard.railway.com/graphql/v2');
 assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
 assert.deepEqual(options.headers,{'content-type':'application/json','project-access-token':token});
 assert.ok(options.signal instanceof AbortSignal);
 const body=JSON.parse(options.body);
 assert.deepEqual(body.variables,{id:ids[3]});
 assert.match(body.query,/^query /);assert.match(body.query,/deployment\(id: \$id\) \{ id projectId environmentId serviceId \}/);
 assert.doesNotMatch(body.query,/mutation|logs|variables|meta/);
});

test('the same verification supports the game service without substituting worker identity',async()=>{
 const game={...expected,serviceId:ids[4]};
 assert.equal(await verifyQueuedDeployment(queued,game,{token,fetcher:async()=>response({data:{deployment:{id:ids[3],...game}}})}),ids[3]);
 await assert.rejects(verifyQueuedDeployment(queued,game,{token,fetcher:async()=>response()}),reject);
});

test('missing, malformed, and non-string deployment IDs fail before any metadata request',async t=>{
 for(const value of [{logsUrl:'https://logs.invalid'},null,[],{deploymentId:null},{deploymentId:12},{deploymentId:''},{deploymentId:ids[3]+'\n'},{deploymentId:'not-a-uuid'}]){
  await t.test(JSON.stringify(value),async()=>{
   let called=false;
   await assert.rejects(verifyQueuedDeployment(JSON.stringify(value),expected,{token,fetcher:async()=>{called=true;return response();}}),reject);
   assert.equal(called,false);
  });
 }
 await assert.rejects(verifyQueuedDeployment('not JSON: synthetic-private-provider-output',expected,{token}),reject);
});

test('missing credentials or invalid configured identity fail before any metadata request',async()=>{
 let called=false;const fetcher=async()=>{called=true;return response();};
 for(const invalid of [undefined,'',' ','invalid\nheader'])await assert.rejects(verifyQueuedDeployment(queued,expected,{token:invalid,fetcher}),reject);
 for(const key of ['projectId','environmentId','serviceId'])await assert.rejects(verifyQueuedDeployment(queued,{...expected,[key]:undefined},{token,fetcher}),reject);
 assert.equal(called,false);
});

test('wrong or missing deployment, project, environment, or service metadata fails closed',async t=>{
 for(const key of ['id','projectId','environmentId','serviceId']){
  for(const value of [ids[5],undefined,null])await t.test(key+': '+String(value),async()=>{
   const data=identity();data.data.deployment[key]=value;
   // Echoed target fields from an upload response cannot replace API evidence.
   const echoed=JSON.stringify({...JSON.parse(queued),...expected});
   await assert.rejects(verifyQueuedDeployment(echoed,expected,{token,fetcher:async()=>response(data)}),reject);
  });
 }
});

test('unavailable or incomplete metadata never falls back to the upload response',async t=>{
 const cases=[
  ['network failure',async()=>{throw new Error('synthetic-secret-provider-output');}],
  ['timeout',async()=>{throw new DOMException('synthetic-secret-provider-output','TimeoutError');}],
  ['HTTP 401',async()=>({ok:false,json:async()=>{throw new Error('must not parse error body');}})],
  ['HTTP 500',async()=>({ok:false})],
  ['invalid JSON',async()=>({ok:true,json:async()=>{throw new SyntaxError('synthetic-secret-provider-output');}})],
  ['no response',async()=>null],
  ['no data',async()=>response({})],
  ['null data',async()=>response({data:null})],
  ['no deployment',async()=>response({data:{}})],
  ['null deployment',async()=>response({data:{deployment:null}})],
  ['GraphQL partial error',async()=>response({...identity(),errors:[{message:'synthetic-secret-provider-output'}]})],
  ['invalid errors field',async()=>response({...identity(),errors:{message:'synthetic-secret-provider-output'}})]
 ];
 for(const [name,fetcher]of cases)await t.test(name,async()=>{
  await assert.rejects(verifyQueuedDeployment(JSON.stringify({...JSON.parse(queued),...expected}),expected,{token,fetcher}),reject);
 });
});
