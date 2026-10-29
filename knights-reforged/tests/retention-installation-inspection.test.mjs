import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import http from 'node:http';
import {inspectInstallation,expectedInstallationIdentity as expected} from '../deployment/release/retention/delivery/inspect-installation.mjs';
import {verifyInstallationToken,installationIdentityQuery} from '../deployment/release/retention/delivery/installation-identity.mjs';
import {installDisabled} from '../deployment/release/retention/delivery/install.mjs';
import {platform} from '../deployment/release/retention/delivery/platform.mjs';

const token='synthetic-private-token-do-not-print';
const target={...expected,...Object.fromEntries(['operatorServiceId','authorizerServiceId','journalVolumeId','gameServiceId','productionServiceId','verificationServiceId','verificationWorkerServiceId'].map(k=>[k,randomUUID()]))};
const env={GITHUB_REPOSITORY:'catillatio/test',GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_JOB:'inspect-installation',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),RETENTION_OPERATION:'inspect-installation',RETENTION_REQUEST_ID:randomUUID(),KINGDOM_RETENTION_EXECUTION_APPROVED:'0',RAILWAY_PROJECT_ID:expected.projectId,RAILWAY_ENVIRONMENT_ID:expected.environmentId,RAILWAY_TOKEN:token,KINGDOM_RETENTION_INSTALL_TARGET:JSON.stringify(target)};
const identity=value=>Response.json({data:{projectToken:value}});
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('exact protected environment secret is sent once through the fixed read-only project-token query',async()=>{
 const calls=[],logs=[];
 const result=await inspectInstallation(env,{log:s=>logs.push(s),fetcher:async(url,o)=>{
  calls.push({url,o});assert.equal(url,'https://backboard.railway.com/graphql/v2');
  assert.equal(o.headers['project-access-token'],token);assert.equal(o.headers.authorization,undefined);
  assert.equal(o.method,'POST');assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');assert.ok(o.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(o.body),{query:installationIdentityQuery});assert.doesNotMatch(o.body,/mutation|variables\s*\(/i);
  return identity(expected);
 }});
 assert.deepEqual(result,{passed:true});assert.equal(calls.length,1);
 assert.deepEqual(logs,['RETENTION_TOKEN_PROJECT: MATCH','RETENTION_TOKEN_ENVIRONMENT: MATCH','RETENTION_INSTALLATION_METADATA: MATCH','RETENTION_INSTALLATION_INSPECTION: PASS']);
 assert.ok(!JSON.stringify(logs).includes(token));assert.ok(!JSON.stringify(logs).includes(expected.projectId));
});

for(const [name,value,code] of [
 ['wrong project',{...expected,projectId:randomUUID()},'TOKEN_PROJECT_MISMATCH'],
 ['wrong environment',{...expected,environmentId:randomUUID()},'TOKEN_ENVIRONMENT_MISMATCH'],
 ['unscoped project token',{...expected,environmentId:null},'TOKEN_ENVIRONMENT_MISMATCH'],
 ['both wrong',{projectId:randomUUID(),environmentId:randomUUID()},'TOKEN_PROJECT_AND_ENVIRONMENT_MISMATCH']
])test(name+' fails closed without disclosure or retry',async()=>{
 let calls=0;const logs=[];
 assert.deepEqual(await inspectInstallation(env,{log:s=>logs.push(s),fetcher:async()=>{calls++;return identity(value);}}),{passed:false});
 assert.equal(calls,1);assert.deepEqual(logs,['RETENTION_INSTALLATION_FAILURE: '+code,'RETENTION_INSTALLATION_INSPECTION: FAIL']);
});

for(const [name,patch,category] of [
 ['missing token',{RAILWAY_TOKEN:undefined},'TOKEN_MISSING_OR_INVALID'],
 ['empty token',{RAILWAY_TOKEN:''},'TOKEN_MISSING_OR_INVALID'],
 ['header injection',{RAILWAY_TOKEN:token+'\nprivate'},'TOKEN_MISSING_OR_INVALID'],
 ['wrong project variable',{RAILWAY_PROJECT_ID:randomUUID()},'CONFIGURED_PROJECT_MISMATCH'],
 ['wrong environment variable',{RAILWAY_ENVIRONMENT_ID:randomUUID()},'CONFIGURED_ENVIRONMENT_MISMATCH'],
 ['unmerged branch',{GITHUB_REF:'refs/heads/unreviewed'},'WORKFLOW_CONTEXT'],
 ['wrong job',{GITHUB_JOB:'retire'},'WORKFLOW_CONTEXT'],
 ['retry',{GITHUB_RUN_ATTEMPT:'2'},'WORKFLOW_CONTEXT'],
 ['wrong repository',{GITHUB_REPOSITORY:'other/test'},'WORKFLOW_CONTEXT'],
 ['push event',{GITHUB_EVENT_NAME:'push'},'WORKFLOW_CONTEXT'],
 ['invalid head',{GITHUB_SHA:'wrong'},'WORKFLOW_CONTEXT'],
 ['missing request',{RETENTION_REQUEST_ID:undefined},'WORKFLOW_CONTEXT'],
 ['retirement operation',{RETENTION_OPERATION:'retire'},'WORKFLOW_CONTEXT'],
 ['execution enabled',{KINGDOM_RETENTION_EXECUTION_APPROVED:'1'},'WORKFLOW_CONTEXT'],
 ['execution unknown',{KINGDOM_RETENTION_EXECUTION_APPROVED:undefined},'WORKFLOW_CONTEXT'],
 ['invalid metadata',{KINGDOM_RETENTION_INSTALL_TARGET:token},'INSTALLATION_METADATA'],
 ['extra metadata',{KINGDOM_RETENTION_INSTALL_TARGET:JSON.stringify({...target,command:token})},'INSTALLATION_METADATA'],
 ['cross-environment target',{KINGDOM_RETENTION_INSTALL_TARGET:JSON.stringify({...target,environmentId:randomUUID()})},'INSTALLATION_METADATA'],
 ['reused game service',{KINGDOM_RETENTION_INSTALL_TARGET:JSON.stringify({...target,operatorServiceId:target.gameServiceId})},'INSTALLATION_METADATA']
])test(name+' rejected before any API request',async()=>{
 let calls=0;const logs=[];
 assert.deepEqual(await inspectInstallation({...env,...patch},{log:s=>logs.push(s),fetcher:async()=>{calls++;throw Error(token);}}),{passed:false});
 assert.equal(calls,0);assert.deepEqual(logs,['RETENTION_INSTALLATION_FAILURE: '+category,'RETENTION_INSTALLATION_INSPECTION: FAIL']);
});

for(const [name,response,code] of [
 ['HTTP authentication',()=>new Response(token,{status:401}),'TOKEN_AUTHENTICATION'],
 ['HTTP forbidden',()=>new Response(token,{status:403}),'TOKEN_AUTHENTICATION'],
 ['HTTP provider failure',()=>new Response(token,{status:500}),'TOKEN_HTTP'],
 ['redirect',()=>new Response(token,{status:302}),'TOKEN_HTTP'],
 ['GraphQL authorization',()=>Response.json({errors:[{message:token}]}),'TOKEN_AUTHORIZATION_OR_QUERY'],
 ['null identity',()=>identity(null),'TOKEN_RESPONSE_SHAPE'],
 ['malformed identity',()=>identity({projectId:7,environmentId:expected.environmentId}),'TOKEN_RESPONSE_SHAPE'],
 ['null body',()=>new Response(null),'TOKEN_RESPONSE_SHAPE'],
 ['malformed JSON',()=>new Response(token),'TOKEN_RESPONSE_SHAPE'],
 ['oversized body',()=>new Response(token.repeat(1000)),'TOKEN_RESPONSE_SHAPE'],
 ['transport error',()=>{throw Error(token);},'TOKEN_TRANSPORT']
])test(name+' is secret-safe and never retried',async()=>{
 let calls=0;const logs=[];
 const result=await inspectInstallation(env,{log:s=>logs.push(s),fetcher:async()=>{calls++;return response();}});
 assert.deepEqual(result,{passed:false});assert.equal(calls,1);
 assert.deepEqual(logs,['RETENTION_INSTALLATION_FAILURE: '+code,'RETENTION_INSTALLATION_INSPECTION: FAIL']);
 const output=JSON.stringify(logs);assert.ok(!output.includes(token));assert.ok(!output.includes(createHash('sha256').update(token).digest('hex')));
});

test('a cancelled identity check makes no request',async()=>{
 const c=new AbortController();c.abort();let calls=0;
 await assert.rejects(verifyInstallationToken(token,expected,{signal:c.signal,fetcher:async()=>{calls++;}}),{code:'TOKEN_TRANSPORT'});
 assert.equal(calls,0);
});

test('oversized streaming identity response is cancelled before reading the whole body',async()=>{
 let cancelled=false,reads=0;
 const body=new ReadableStream({pull(c){reads++;c.enqueue(new Uint8Array(9000));},cancel(){cancelled=true;}});
 await assert.rejects(verifyInstallationToken(token,expected,{fetcher:async()=>new Response(body)}),{code:'TOKEN_RESPONSE_SHAPE'});
 assert.equal(cancelled,true);assert.ok(reads<=3);
});

test('HTTP fixture authenticates the actual provider identity adapter without any mutation',async()=>{
 let requests=0;
 const server=http.createServer(async(req,res)=>{
  requests++;assert.equal(req.method,'POST');assert.equal(req.headers['project-access-token'],token);
  let body='';for await(const chunk of req)body+=chunk;
  assert.deepEqual(JSON.parse(body),{query:installationIdentityQuery});
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:{projectToken:expected}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const provider=platform(token,{fetcher:async(url,o)=>{
   assert.equal(url,'https://backboard.railway.com/graphql/v2');
   return fetch('http://127.0.0.1:'+server.address().port,o);
  },command:async()=>assert.fail('No command may run')});
  assert.deepEqual(await provider.tokenIdentity(target),{project:'MATCH',environment:'MATCH'});assert.equal(requests,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

for(const operation of ['initialize-journal','install-disabled'])test(operation+' revalidates the injected token before preflight, bundling, writes or uploads',async()=>{
 const vars={...env,GITHUB_JOB:'retire',GITHUB_RUN_ID:'999',GH_TOKEN:'synthetic-github-read',RETENTION_OPERATION:operation,KINGDOM_RETENTION_INSTALLATION_APPROVED:'1'};
 const github=async url=>url.endsWith('/jobs?per_page=100')?Response.json({total_count:2,jobs:[{name:'owner-approval',status:'completed',conclusion:'success'},{name:'retire',status:'in_progress',run_attempt:1}]}):Response.json({id:999,run_attempt:1,head_sha:env.GITHUB_SHA,head_branch:'release/production',event:'workflow_dispatch',status:'in_progress',path:'.github/workflows/recovery-copy-retention.yml',head_repository:{full_name:'catillatio/test'}});
 for(const result of ['match','mismatch','authentication','lost']){
  const calls=[];
  const api=platform(token,{fetcher:async()=>{
   calls.push('identity');
   if(result==='lost')throw Error(token);
   if(result==='authentication')return new Response('',{status:403});
   return identity(result==='mismatch'?{...expected,environmentId:randomUUID()}:expected);
  }});
  const provider={tokenIdentity:api.tokenIdentity,preflight:async()=>calls.push('preflight'),install:async()=>{calls.push('install');return randomUUID();},completion:async()=>calls.push('complete'),running:async()=>calls.push('running'),resetInstallation:async()=>calls.push('reset')};
  const options={env:vars,provider,fetcher:github,bundle:async()=>{calls.push('bundle');return {directory:'/synthetic/exact-bundle'};}};
  if(result==='match'){
   await installDisabled(options);assert.deepEqual(calls,operation==='initialize-journal'?['identity','preflight','bundle','install','complete','reset']:['identity','preflight','bundle','install','running','bundle','install','running']);
  }else{
   await assert.rejects(installDisabled(options));assert.deepEqual(calls,['identity']);
  }
 }
});

test('workflow isolates inspection from all installation, signing, SQL and handoff actions',async()=>{
 const w=await read('../.github/workflows/recovery-copy-retention.yml');
 const inspection=w.slice(w.indexOf('  inspect-installation:'),w.indexOf('  retire:'));
 const execution=w.slice(w.indexOf('  retire:'),w.indexOf('  sign-retirement:'));
 const gate=w.slice(w.indexOf('  owner-approval:'),w.indexOf('  inspect-installation:'));
 assert.match(gate,/environment: production/);assert.match(gate,/inputs.operation == 'inspect-installation'/);
 assert.match(inspection,/needs: owner-approval/);assert.match(inspection,/if: inputs.operation == 'inspect-installation'/);
 assert.match(inspection,/environment: retention-execution/);assert.match(inspection,/group: kingdom-come-production/);
 assert.match(inspection,/cancel-in-progress: false/);assert.match(inspection,/permissions: \{contents: read\}/);
 assert.match(inspection,/RAILWAY_TOKEN: \$\{\{ secrets.RAILWAY_TOKEN \}\}/);
 assert.match(inspection,/ref: '\$\{\{ github.sha \}\}', persist-credentials: false/);
 assert.match(inspection,/run: node deployment\/release\/retention\/delivery\/inspect-installation.mjs/);
 assert.doesNotMatch(inspection,/npm |railway up|coordinator.mjs|signer.mjs|DATABASE_URL|STORE_|SIGNING_KEY|INSTALLATION_APPROVED|upload-artifact|GH_TOKEN/);
 assert.match(execution,/if: inputs.operation != 'inspect-installation'/);
 assert.match(w.slice(w.indexOf('  sign-retirement:')),/if: inputs.operation == 'retire'/);
 assert.equal(await read('deployment/release/retention/workflow.yml'),w);
});

test('real inspection CLI fails without dynamic stack traces or secret fragments',()=>{
 const run=spawnSync(process.execPath,['deployment/release/retention/delivery/inspect-installation.mjs'],{encoding:'utf8',env:{PATH:process.env.PATH,...env,KINGDOM_RETENTION_INSTALL_TARGET:token}});
 assert.equal(run.status,1);assert.equal(run.stderr,'');
 assert.equal(run.stdout,'RETENTION_INSTALLATION_FAILURE: INSTALLATION_METADATA\nRETENTION_INSTALLATION_INSPECTION: FAIL\n');
});
