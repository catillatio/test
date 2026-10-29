import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {validateHandoff,expectedHandoffSettings} from '../deployment/release/retention/delivery/validate-handoff.mjs';
import {handoffStore} from '../deployment/release/retention/delivery/store.mjs';

const privateText='synthetic-private-credential-must-not-escape';
const env={...expectedHandoffSettings,GITHUB_REPOSITORY:'catillatio/test',GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_JOB:'validate-handoff',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',GITHUB_SHA:'a'.repeat(40),RETENTION_REQUEST_ID:randomUUID(),RETENTION_OPERATION:'validate-handoff',RETENTION_HANDOFF_ENVIRONMENT:'retention-execution',KINGDOM_RETENTION_EXECUTION_APPROVED:'0',KINGDOM_RETENTION_STORE_ACCESS_KEY_ID:'synthetic-key',KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY:privateText};
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
function fixture({responses,throwAt,fetcher}={}){
 const calls=[],logs=[];let body;
 const options={log:s=>logs.push(s),storeFactory:vars=>{
  assert.equal(vars.KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY,privateText);calls.push('store');
  return {grant:async(run,id,name,method)=>{calls.push({run,id,name,method});return 'https://synthetic.invalid/'+privateText;},close:()=>calls.push('close')};
 },fetcher:fetcher??(async(url,o)=>{
  calls.push({url,method:o.method??'GET',headers:o.headers,redirect:o.redirect,signal:o.signal});
  const n=calls.filter(c=>c.url).length;
  if(throwAt===n)throw Error(privateText);
  if(responses?.[n-1]!==undefined)return responses[n-1]();
  if(n===1){body=JSON.parse(o.body);return new Response('',{status:200});}
  if(n===2)return new Response(privateText,{status:412});
  return Response.json(body);
 })};return {calls,logs,options};
}

for(const environment of ['retention-execution','retention-signing'])test(environment+' checks create, conditional rejection and exact readback with execution OFF',async()=>{
 const h=fixture();assert.deepEqual(await validateHandoff({...env,RETENTION_HANDOFF_ENVIRONMENT:environment},h.options),{passed:true});
 assert.deepEqual(h.logs,['RETENTION_HANDOFF: PASS']);assert.equal(h.calls.at(-1),'close');
 const grants=h.calls.filter(c=>c.method&&!c.url),http=h.calls.filter(c=>c.url);
 assert.equal(grants.length,2);assert.deepEqual(grants.map(c=>c.method),['PUT','GET']);
 assert.equal(grants[0].id,grants[1].id);assert.notEqual(grants[0].id,env.RETENTION_REQUEST_ID);
 for(const grant of grants){assert.equal(grant.run,'123_1');assert.equal(grant.name,'probe.json');}
 assert.deepEqual(http.map(c=>c.method),['PUT','PUT','GET']);
 for(const call of http){assert.equal(call.redirect,'error');assert.ok(call.signal instanceof AbortSignal);}
 for(const call of http.slice(0,2))assert.equal(call.headers['if-none-match'],'*');
 assert.ok(!JSON.stringify(h.logs).includes(privateText));
});

for(const [name,patch,category] of [
 ['enabled execution',{KINGDOM_RETENTION_EXECUTION_APPROVED:'1'},'WORKFLOW_CONTEXT'],
 ['unknown execution flag',{KINGDOM_RETENTION_EXECUTION_APPROVED:undefined},'WORKFLOW_CONTEXT'],
 ['wrong branch',{GITHUB_REF:'refs/heads/unmerged'},'WORKFLOW_CONTEXT'],
 ['wrong repository',{GITHUB_REPOSITORY:'other/test'},'WORKFLOW_CONTEXT'],
 ['wrong event',{GITHUB_EVENT_NAME:'push'},'WORKFLOW_CONTEXT'],
 ['wrong job',{GITHUB_JOB:'retire'},'WORKFLOW_CONTEXT'],
 ['rerun',{GITHUB_RUN_ATTEMPT:'2'},'WORKFLOW_CONTEXT'],
 ['wrong operation',{RETENTION_OPERATION:'retire'},'WORKFLOW_CONTEXT'],
 ['wrong environment',{RETENTION_HANDOFF_ENVIRONMENT:'production'},'WORKFLOW_CONTEXT'],
 ['invalid head',{GITHUB_SHA:'not-a-commit'},'WORKFLOW_CONTEXT'],
 ['invalid run',{GITHUB_RUN_ID:'0'},'WORKFLOW_CONTEXT'],
 ['invalid request',{RETENTION_REQUEST_ID:'not-a-uuid'},'WORKFLOW_CONTEXT'],
 ['wrong bucket',{KINGDOM_RETENTION_STORE_BUCKET:'kingdom-recovery'},'STORE_CONFIGURATION'],
 ['wrong endpoint',{KINGDOM_RETENTION_STORE_ENDPOINT:'https://other.invalid'},'STORE_CONFIGURATION'],
 ['physical instead of signing region',{KINGDOM_RETENTION_STORE_REGION:'iad'},'STORE_CONFIGURATION'],
 ['wrong addressing',{KINGDOM_RETENTION_STORE_PATH_STYLE:'true'},'STORE_CONFIGURATION'],
 ['missing key',{KINGDOM_RETENTION_STORE_ACCESS_KEY_ID:''},'STORE_CONFIGURATION'],
 ['missing secret',{KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY:''},'STORE_CONFIGURATION'],
 ['disabled TLS verification',{NODE_TLS_REJECT_UNAUTHORIZED:'0'},'STORE_CONFIGURATION']
])test(name+' fails before creating a store or making any network request',async()=>{
 const h=fixture();assert.deepEqual(await validateHandoff({...env,...patch},h.options),{passed:false});
 assert.deepEqual(h.calls,[]);assert.deepEqual(h.logs,['RETENTION_HANDOFF_FAILURE: '+category,'RETENTION_HANDOFF: FAIL']);
});

for(const key of ['DATABASE_URL','KINGDOM_RETENTION_DATABASE_URL','KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL','PGPASSWORD','RAILWAY_TOKEN','RAILWAY_API_TOKEN','GH_TOKEN','KINGDOM_RETENTION_SIGNING_KEY','KINGDOM_RELEASE_SIGNING_KEY','KINGDOM_RETENTION_SCOPE','KINGDOM_RETENTION_INSTALL_TARGET','KINGDOM_RETENTION_ENABLED','KINGDOM_RETENTION_JOB','KINGDOM_BACKUP_ACCESS_KEY_ID','KINGDOM_BACKUP_SECRET_ACCESS_KEY'])test('rejects unrelated credential or execution setting '+key,async()=>{
 const h=fixture();assert.deepEqual(await validateHandoff({...env,[key]:privateText},h.options),{passed:false});
 assert.deepEqual(h.calls,[]);assert.deepEqual(h.logs,['RETENTION_HANDOFF_FAILURE: CREDENTIAL_ISOLATION','RETENTION_HANDOFF: FAIL']);
});

for(const [name,settings,category,count] of [
 ['create unauthorized',{responses:[()=>new Response(privateText,{status:403})]},'PROBE_CREATE',1],
 ['create acknowledgment lost',{throwAt:1},'PROBE_CREATE',1],
 ['overwrite incorrectly accepted',{responses:[undefined,()=>new Response(privateText,{status:200})]},'CONDITIONAL_WRITE',2],
 ['provider conflict not conditional rejection',{responses:[undefined,()=>new Response(privateText,{status:409})]},'CONDITIONAL_WRITE',2],
 ['conditional acknowledgment lost',{throwAt:2},'CONDITIONAL_WRITE',2],
 ['read unauthorized',{responses:[undefined,undefined,()=>new Response(privateText,{status:403})]},'PROBE_READ',3],
 ['read absent without waiting',{responses:[undefined,undefined,()=>new Response(privateText,{status:404})]},'PROBE_READ',3],
 ['read malformed',{responses:[undefined,undefined,()=>new Response(privateText)]},'PROBE_READ',3],
 ['read different object',{responses:[undefined,undefined,()=>Response.json({value:privateText})]},'PROBE_READ',3],
 ['read acknowledgment lost',{throwAt:3},'PROBE_READ',3]
])test(name+' fails closed without retry or sensitive output',async()=>{
 const h=fixture(settings);assert.deepEqual(await validateHandoff(env,h.options),{passed:false});
 assert.equal(h.calls.filter(c=>c.url).length,count);assert.equal(h.calls.at(-1),'close');
 assert.deepEqual(h.logs,['RETENTION_HANDOFF_FAILURE: '+category,'RETENTION_HANDOFF: FAIL']);
 const output=JSON.stringify(h.logs);assert.ok(!output.includes(privateText));assert.ok(!output.includes(createHash('sha256').update(privateText).digest('hex')));
});

test('cancelled check performs no store or network operation',async()=>{
 const c=new AbortController();c.abort();const h=fixture();
 assert.deepEqual(await validateHandoff(env,{...h.options,signal:c.signal}),{passed:false});assert.deepEqual(h.calls,[]);
});

test('actual SDK signs exactly the dedicated object with one-attempt client and no leaked grants',async()=>{
 const logs=[],calls=[];let value;
 const check=async()=>validateHandoff(env,{storeFactory:handoffStore,log:s=>logs.push(s),fetcher:async(url,o)=>{
  const u=new URL(url);assert.equal(u.origin,'https://kingdom-retention-handoff-g6-jcd.t3.storageapi.dev');
  assert.match(u.pathname,/^\/retention-delivery\/123_1\/[a-f0-9-]{36}\/probe.json$/);
  assert.equal(u.searchParams.get('X-Amz-Expires'),'900');assert.match(u.searchParams.get('X-Amz-Credential'),/\/auto\/s3\/aws4_request$/);
  calls.push({path:u.pathname,method:o.method??'GET'});
  if(o.method==='PUT'){
   assert.match(u.searchParams.get('X-Amz-SignedHeaders'),/if-none-match/);assert.equal(o.headers['if-none-match'],'*');
   if(!value){value=JSON.parse(o.body);return new Response('',{status:200});}
   return new Response('',{status:412});
  }
  return Response.json(value);
 }});
 assert.deepEqual(await check(),{passed:true});assert.deepEqual(calls.map(c=>c.method),['PUT','PUT','GET']);
 assert.equal(new Set(calls.map(c=>c.path)).size,1);assert.deepEqual(logs,['RETENTION_HANDOFF: PASS']);
});

test('protected workflow separates disabled handoff validation from every operational and signing path',async()=>{
 const w=await read('../.github/workflows/recovery-copy-retention.yml');
 const job=w.slice(w.indexOf('  validate-handoff:'),w.indexOf('  retire:'));
 const gate=w.slice(w.indexOf('  owner-approval:'),w.indexOf('  inspect-installation:'));
 assert.match(gate,/environment: production/);assert.match(gate,/inputs.operation == 'validate-handoff' && vars.KINGDOM_RETENTION_EXECUTION_APPROVED == '0'/);
 assert.match(job,/needs: owner-approval/);assert.match(job,/inputs.operation == 'validate-handoff' && vars.KINGDOM_RETENTION_EXECUTION_APPROVED == '0'/);
 assert.match(job,/environment: \$\{\{ matrix.environment \}\}/);assert.match(job,/environment: \[retention-execution, retention-signing\]/);
 assert.match(job,/max-parallel: 1/);assert.match(job,/fail-fast: true/);assert.match(job,/group: kingdom-come-production/);assert.match(job,/cancel-in-progress: false/);
 assert.match(job,/permissions: \{contents: read\}/);assert.match(job,/ref: '\$\{\{ github.sha \}\}', persist-credentials: false/);
 const injected=[...job.matchAll(/secrets\.([A-Z_]+)/g)].map(m=>m[1]);
 assert.deepEqual(injected,['KINGDOM_RETENTION_STORE_ACCESS_KEY_ID','KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY']);
 assert.doesNotMatch(job,/RAILWAY_TOKEN|DATABASE_URL|SIGNING_KEY|RETENTION_SCOPE|INSTALL_TARGET|coordinator\.mjs|worker\.mjs|signer\.mjs|upload-artifact|railway up/);
 assert.match(w.slice(w.indexOf('  retire:')),/inputs.operation != 'inspect-installation' && inputs.operation != 'validate-handoff'/);
 assert.match(w.slice(w.indexOf('  sign-retirement:')),/if: inputs.operation == 'retire'/);
 assert.equal(await read('deployment/release/retention/workflow.yml'),w);
});

test('CLI failure prints only fixed categories with no stack or inherited secret material',()=>{
 const result=spawnSync(process.execPath,['deployment/release/retention/delivery/validate-handoff.mjs'],{env:{PATH:process.env.PATH,...env,KINGDOM_RETENTION_STORE_BUCKET:privateText},encoding:'utf8'});
 assert.equal(result.status,1);assert.equal(result.stderr,'');
 assert.equal(result.stdout,'RETENTION_HANDOFF_FAILURE: STORE_CONFIGURATION\nRETENTION_HANDOFF: FAIL\n');
});
