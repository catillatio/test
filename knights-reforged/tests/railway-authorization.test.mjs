import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {railwayAuthorization,railwayDiagnosticLabels as labels,railwayAuthDetails as details} from '../deployment/release/diagnose-railway.mjs';

const ids=Array.from({length:6},(_,i)=>String(i+1).repeat(8)+'-'+String(i+1).repeat(4)+'-4'+String(i+1).repeat(3)+'-8'+String(i+1).repeat(3)+'-'+String(i+1).repeat(12));
const env={GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',
 RAILWAY_TOKEN:'synthetic-project-token-not-a-credential',RAILWAY_PROJECT_ID:ids[0],RAILWAY_ENVIRONMENT_ID:ids[1],
 RAILWAY_GAME_SERVICE_ID:ids[2],RAILWAY_RELEASE_WORKER_SERVICE_ID:ids[3]};
const expected=(states,authDetail=states[1]?'NONE':'UNVERIFIED')=>({...Object.fromEntries(labels.map((label,i)=>[label,states[i]])),authDetail});
const lines=(states,authDetail=expected(states).authDetail)=>labels.map((label,i)=>label+': '+(states[i]?'PASS':'FAIL')).join('\n')+'\nRAILWAY_AUTH_DETAIL: '+authDetail+'\n';
const allPass=Array(6).fill(true),allFail=Array(6).fill(false);
const folder=mkdtempSync(join(tmpdir(),'railway-authorization-'));
after(()=>rmSync(folder,{recursive:true,force:true}));
const wrapper=fileURLToPath(new URL('../deployment/release/diagnose-railway.sh',import.meta.url));

function dataFor(body){
 if(body.query.includes('KingdomRailwayToken'))return {projectToken:{projectId:ids[0],environmentId:ids[1]}};
 if(body.query.includes('KingdomRailwayProject'))return {project:{id:ids[0]}};
 if(body.query.includes('KingdomRailwayEnvironment'))return {environment:{id:ids[1],projectId:ids[0]}};
 if(body.query.includes('KingdomRailwayService'))return {service:{id:body.variables.serviceId,projectId:ids[0]},serviceInstance:{serviceId:body.variables.serviceId,environmentId:ids[1]}};
 throw new Error('Unexpected fixture query');
}
function fixture(change=()=>{}){
 const calls=[];
 const fetcher=async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,options,body});
  const result={ok:true,status:200,data:dataFor(body)};await change(result,body);
  return {ok:result.ok,status:result.status,json:async()=>{if(result.parseError)throw new Error('synthetic-private-provider-error');return Object.hasOwn(result,'raw')?result.raw:{data:result.data,...(result.errors===undefined?{}:{errors:result.errors})};}};
 };
 return {calls,fetcher};
}

test('exact project-token scope and both environment-specific services pass through five read-only requests',async()=>{
 const f=fixture();assert.deepEqual(await railwayAuthorization(env,f),expected(allPass));assert.equal(f.calls.length,5);
 for(const {url,options,body}of f.calls){
  assert.equal(url,'https://backboard.railway.com/graphql/v2');assert.equal(options.method,'POST');
  assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(options.headers,{'content-type':'application/json','project-access-token':env.RAILWAY_TOKEN});
  assert.match(body.query,/^query KingdomRailway/);assert.doesNotMatch(body.query,/mutation|deploy|variables\(|logs|database|secret|\btoken\s*\{/i);
 }
 const services=f.calls.filter(c=>c.body.query.includes('KingdomRailwayService'));
 assert.deepEqual(services.map(c=>c.body.variables),[{serviceId:ids[2],environmentId:ids[1]},{serviceId:ids[3],environmentId:ids[1]}]);
});

test('invalid target configuration, wrong trigger/ref, disabled TLS, and aliased services make no API requests',async()=>{
 for(const change of [{RAILWAY_PROJECT_ID:undefined},{RAILWAY_ENVIRONMENT_ID:ids[1]+'\n'},{RAILWAY_GAME_SERVICE_ID:'invalid'},
  {RAILWAY_RELEASE_WORKER_SERVICE_ID:ids[2]},{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'push'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'}]){
  const f=fixture();assert.deepEqual(await railwayAuthorization({...env,...change},f),expected(allFail));assert.equal(f.calls.length,0);
 }
});

test('credential categories reject missing, malformed or conflicting tokens before any request',async()=>{
 const cases=[['TOKEN_MISSING',{RAILWAY_TOKEN:undefined}],['TOKEN_MISSING',{RAILWAY_TOKEN:''}],
  ...['bad\nheader','bad\rheader','bad header','bad\theader','bad\x00header','bad\x7fheader','badéheader'].map(RAILWAY_TOKEN=>['TOKEN_FORMAT_INVALID',{RAILWAY_TOKEN}]),
  ['TOKEN_FORMAT_INVALID',{RAILWAY_TOKEN:123}],['CONFLICTING_API_TOKEN',{RAILWAY_API_TOKEN:'synthetic-alternative-token'}]];
 for(const [detail,change]of cases){
  const f=fixture();assert.deepEqual(await railwayAuthorization({...env,...change},f),expected([true,false,false,false,false,false],detail));assert.equal(f.calls.length,0);
 }
});

test('printable opaque project tokens are not trimmed, reformatted or restricted to guessed token identifiers',async()=>{
 const token='synthetic.opaque-token_123=not-a-credential';const f=fixture();
 assert.deepEqual(await railwayAuthorization({...env,RAILWAY_TOKEN:token},f),expected(allPass));
 assert.equal(f.calls[0].options.headers['project-access-token'],token);
});

test('HTTP success without valid authenticated project-token metadata never passes authentication',async()=>{
 for(const change of [r=>{r.data=null;},r=>{r.data={};},r=>{r.data.projectToken=null;},r=>{delete r.data.projectToken.projectId;},r=>{r.data.projectToken.environmentId='invalid';}]){
  const f=fixture(change);assert.deepEqual(await railwayAuthorization(env,f),expected([true,false,false,false,false,false],'TOKEN_METADATA_INVALID'));assert.equal(f.calls.length,1);
 }
});

test('a token for the wrong project authenticates but cannot pass configured-target access',async()=>{
 const f=fixture((r,b)=>{if(b.query.includes('KingdomRailwayToken'))r.data.projectToken.projectId=ids[4];});
 assert.deepEqual(await railwayAuthorization(env,f),expected([true,true,false,false,false,false],'TOKEN_SCOPE_MISMATCH'));assert.equal(f.calls.length,1);
});

test('a token for the wrong environment cannot inspect configured service instances',async()=>{
 const f=fixture((r,b)=>{if(b.query.includes('KingdomRailwayToken'))r.data.projectToken.environmentId=ids[4];});
 assert.deepEqual(await railwayAuthorization(env,f),expected([true,true,true,false,false,false],'TOKEN_SCOPE_MISMATCH'));assert.equal(f.calls.length,2);
});

test('project access requires returned project identity and gates all service requests',async()=>{
 for(const value of [null,{id:ids[4]},{}]){
  const f=fixture((r,b)=>{if(b.query.includes('KingdomRailwayProject'))r.data.project=value;});
  assert.deepEqual(await railwayAuthorization(env,f),expected([true,true,false,true,false,false]));assert.equal(f.calls.length,3);
 }
});

test('environment access requires returned environment and project identities',async()=>{
 for(const value of [null,{id:ids[4],projectId:ids[0]},{id:ids[1],projectId:ids[4]},{id:ids[1]}]){
  const f=fixture((r,b)=>{if(b.query.includes('KingdomRailwayEnvironment'))r.data.environment=value;});
  assert.deepEqual(await railwayAuthorization(env,f),expected([true,true,true,false,false,false]));assert.equal(f.calls.length,3);
 }
});

test('each service must belong to the exact project and have a matching instance in the exact environment',async t=>{
 const changes=[['missing service',r=>{r.data.service=null;}],['wrong service',r=>{r.data.service.id=ids[4];}],
  ['wrong project',r=>{r.data.service.projectId=ids[4];}],['missing instance',r=>{r.data.serviceInstance=null;}],
  ['wrong instance service',r=>{r.data.serviceInstance.serviceId=ids[4];}],['wrong instance environment',r=>{r.data.serviceInstance.environmentId=ids[4];}]];
 for(const [index,serviceId]of[ids[2],ids[3]].entries())for(const [name,change]of changes)await t.test((index===0?'game: ':'worker: ')+name,async()=>{
  const f=fixture((r,b)=>{if(b.query.includes('KingdomRailwayService')&&b.variables.serviceId===serviceId)change(r);});
  const states=[true,true,true,true,true,true];states[4+index]=false;
  assert.deepEqual(await railwayAuthorization(env,f),expected(states));assert.equal(f.calls.length,5);
 });
});

test('fixed HTTP categories stop authentication without reading the response body or retrying',async t=>{
 for(const [status,detail]of [[401,'HTTP_401'],[403,'HTTP_403'],[429,'HTTP_429'],[500,'HTTP_5XX'],[503,'HTTP_5XX'],[599,'HTTP_5XX'],[400,'HTTP_OTHER'],[404,'HTTP_OTHER'],[302,'HTTP_OTHER']])await t.test(String(status),async()=>{
  let calls=0;const fetcher=async()=>{calls++;return {ok:false,status,json:async()=>assert.fail('Error bodies must not be inspected')};};
  assert.deepEqual(await railwayAuthorization(env,{fetcher}),expected([true,false,false,false,false,false],detail));assert.equal(calls,1);
 });
});

test('GraphQL payload and HTTPS transport failures have separate fixed categories and gate later reads',async t=>{
 const cases=[['invalid JSON','GRAPHQL_RESPONSE_INVALID',r=>{r.parseError=true;}],
  ['null JSON','GRAPHQL_RESPONSE_INVALID',r=>{r.raw=null;}],['array JSON','GRAPHQL_RESPONSE_INVALID',r=>{r.raw=[];}],
  ['string JSON','GRAPHQL_RESPONSE_INVALID',r=>{r.raw='synthetic-private-provider-output';}],
  ['GraphQL partial error','GRAPHQL_REJECTED',r=>{r.errors=[{message:'synthetic-private-provider-error'}];}],
  ['malformed errors','GRAPHQL_RESPONSE_INVALID',r=>{r.errors={message:'synthetic-private-provider-error'};}],
  ['network error','HTTPS_TRANSPORT_FAILURE',()=>{throw new Error('synthetic-private-provider-error');}],
  ['TLS error','HTTPS_TRANSPORT_FAILURE',()=>{throw new Error('synthetic-private-certificate-details');}],
  ['timeout','HTTPS_TRANSPORT_FAILURE',()=>{throw new DOMException('synthetic-private-provider-error','TimeoutError');}]];
 for(const [name,detail,change]of cases)await t.test(name,async()=>{
  const f=fixture(change);assert.deepEqual(await railwayAuthorization(env,f),expected([true,false,false,false,false,false],detail));assert.equal(f.calls.length,1);
 });
});

const networkFlag=join(folder,'unapproved-network');
const preload=join(folder,'fake-provider.mjs');
writeFileSync(preload,`
import {appendFileSync} from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';
import dns from 'node:dns';import dgram from 'node:dgram';import child from 'node:child_process';import workers from 'node:worker_threads';
const block=()=>{appendFileSync(${JSON.stringify(networkFlag)},'blocked\\n');throw new Error('synthetic-private-network-error');};
for(const [module,names]of[[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],
 [tls,['connect']],[dns,['lookup','resolve']],[dns.promises,['lookup','resolve']],[dgram,['createSocket']],
 [child,['spawn','exec','execFile','fork','spawnSync','execSync','execFileSync']],[workers,['Worker']]])for(const name of names)module[name]=block;
syncBuiltinESMExports();
const ids=${JSON.stringify(ids)};
const dataFor=${dataFor.toString()};
globalThis.fetch=async(url,options)=>{
 if(url!=='https://backboard.railway.com/graphql/v2'||options.method!=='POST'||options.redirect!=='error')return block();
 const body=JSON.parse(options.body);if(!/^query KingdomRailway/.test(body.query)||/mutation/.test(body.query))return block();
 if(process.env.FIXTURE_PROVIDER_FAIL==='1')throw new Error('synthetic-private-provider-error');
 if(body.query.includes('KingdomRailwayToken')){
  const mode=process.env.FIXTURE_AUTH_CASE;
  if(mode?.startsWith('http_'))return {ok:false,status:Number(mode.slice(5)),json:async()=>block()};
  if(mode==='graphql')return {ok:true,status:200,json:async()=>({data:dataFor(body),errors:[{message:'synthetic-private-provider-response'}]})};
  if(mode==='json')return {ok:true,status:200,json:async()=>{throw new Error('synthetic-private-json-error');}};
  if(mode==='metadata')return {ok:true,status:200,json:async()=>({data:{projectToken:{projectId:'synthetic-private-scope',environmentId:ids[1]}}})};
 }
 return {ok:true,status:200,json:async()=>({data:dataFor(body)})};
};
`);
function runWrapper(overrides={},path=dirname(process.execPath)+':/usr/bin:/bin'){
 const result=spawnSync('/bin/bash',[wrapper],{env:{...env,PATH:path,NODE_OPTIONS:'--import='+preload,...overrides},encoding:'utf8',timeout:15000});
 assert.equal(existsSync(networkFlag),false);assert.equal(result.stderr,'');return result;
}
test('actual entry point and output wrapper emit only six PASS lines and the allowlisted auth detail using synthetic offline metadata',()=>{
 const result=runWrapper();assert.equal(result.status,0);assert.equal(result.stdout,lines(allPass));
});
test('provider exception details and synthetic credentials never escape the entry point or wrapper',()=>{
 const result=runWrapper({FIXTURE_PROVIDER_FAIL:'1'});assert.equal(result.status,1);assert.equal(result.stdout,lines([true,false,false,false,false,false],'HTTPS_TRANSPORT_FAILURE'));
});
test('entry point preserves only fixed credential, HTTP and GraphQL details through the output wrapper',()=>{
 const cases=[['TOKEN_MISSING',{RAILWAY_TOKEN:''}],['TOKEN_FORMAT_INVALID',{RAILWAY_TOKEN:'synthetic\nprivate-token'}],
  ['CONFLICTING_API_TOKEN',{RAILWAY_API_TOKEN:'synthetic-private-alternative'}],
  ...[[401,'HTTP_401'],[403,'HTTP_403'],[429,'HTTP_429'],[503,'HTTP_5XX'],[404,'HTTP_OTHER']].map(([code,detail])=>[detail,{FIXTURE_AUTH_CASE:'http_'+code}]),
  ['GRAPHQL_REJECTED',{FIXTURE_AUTH_CASE:'graphql'}],['GRAPHQL_RESPONSE_INVALID',{FIXTURE_AUTH_CASE:'json'}],
  ['TOKEN_METADATA_INVALID',{FIXTURE_AUTH_CASE:'metadata'}]];
 for(const [detail,changes]of cases){
  const result=runWrapper(changes);assert.equal(result.status,1);assert.equal(result.stdout,lines([true,false,false,false,false,false],detail));
  assert.doesNotMatch(result.stdout,/synthetic|https?:|credential|provider-response|private-scope/);
 }
});
test('disabled TLS and invalid triggers fail before a mocked provider request',()=>{
 for(const change of [{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{GITHUB_EVENT_NAME:'push'}]){
  const result=runWrapper(change);assert.equal(result.status,1);assert.equal(result.stdout,lines(allFail));
 }
});
let number=0;
function transport(body){
 const path=join(folder,'transport-'+number++);mkdirSync(path);
 writeFileSync(join(path,'node'),'#!/bin/bash\n'+body+'\n',{mode:0o700});return path+':/usr/bin:/bin';
}
test('unexpected stdout/stderr are discarded, even if the child reports all PASS',()=>{
 const result=runWrapper({},transport("printf '%s\\n' 'synthetic-private-output'; printf '%s\\n' 'synthetic-private-error' >&2; exit 1"));
 assert.equal(result.status,1);assert.equal(result.stdout,lines(allFail));
 const misleading=runWrapper({},transport("printf '%s\\n' "+labels.map(label=>"'"+label+": PASS'").join(' ')+'; exit 1'));
 assert.equal(misleading.status,1);assert.equal(misleading.stdout,lines(allFail));
});
test('only complete correctly ordered fixed results can pass through the wrapper',()=>{
 for(const text of [lines(allPass)+'synthetic-private-output\n',lines(allPass).split('\n').reverse().join('\n'),lines(allPass).split('\n').slice(1).join('\n')]){
  const path=join(folder,'stdout-'+number++);writeFileSync(path,text);
  const result=runWrapper({},transport('cat '+path));assert.equal(result.status,1);assert.equal(result.stdout,lines(allFail));
 }
});
test('unknown or secret-bearing auth details and contradictory all-PASS results fail closed',()=>{
 for(const text of [lines(allPass,'synthetic-private-output'),lines(allPass,'HTTP_401'),
  lines(allPass)+'synthetic-private-output\n',lines(allFail).replace('UNVERIFIED','TOKEN_FORMAT_INVALID synthetic-private-output')]){
  const path=join(folder,'detail-'+number++);writeFileSync(path,text);
  const result=runWrapper({},transport('cat '+path));assert.equal(result.status,1);assert.equal(result.stdout,lines(allFail));
 }
 const source=readFileSync(wrapper,'utf8');
 assert.deepEqual(source.match(/^details=\(([^)]+)\)$/m)[1].split(' '),details,'Shell and JavaScript share the exact fixed allowlist');
});
test('the new workflow is manual, production-approved, exact-commit, and wires only the required token and IDs directly',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/railway-authorization-diagnostic.yml',import.meta.url),'utf8');
 assert.match(workflow,/^  workflow_dispatch:/m);assert.match(workflow,/github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/release\/production'/);
 assert.match(workflow,/environment: production/);assert.match(workflow,/permissions:\n  contents: read\n/);
 assert.match(workflow,/ref: \$\{\{ github.sha \}\}/);assert.match(workflow,/persist-credentials: false/);
 assert.ok(workflow.includes('RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}'));
 for(const key of ['RAILWAY_PROJECT_ID','RAILWAY_ENVIRONMENT_ID','RAILWAY_GAME_SERVICE_ID','RAILWAY_RELEASE_WORKER_SERVICE_ID'])assert.ok(workflow.includes(key+': ${{ vars.'+key+' }}'));
 assert.doesNotMatch(workflow,/^  (push|pull_request|workflow_call|schedule|repository_dispatch):/m);
 assert.doesNotMatch(workflow,/secrets: inherit|DATABASE_URL|RAILWAY_API_TOKEN|KINGDOM_RELEASE_SIGNING_KEY|KINGDOM_BACKUP_|run\.mjs|worker\.mjs|migrate\.mjs|npm |railway up|upload-artifact|workflow_dispatch\(/);
});
