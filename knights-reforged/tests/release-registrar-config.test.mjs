import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateRequest,targetConfig,checkWorker,checkPatch,runConfig,railwayClient,oldWorker,commitMutation,registrationKeys,failureCategory,approvalPolicy} from '../deployment/release/registrar-config.mjs';

const id=n=>String(n).repeat(8)+'-'+String(n).repeat(4)+'-4'+String(n).repeat(3)+'-8'+String(n).repeat(3)+'-'+String(n).repeat(12);
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'catillatio/test',GITHUB_JOB:'registrar-config',GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',
 KINGDOM_RELEASE_ENABLED:'true',KINGDOM_RAILWAY_AUTODEPLOY_DISABLED:'true',KINGDOM_RELEASE_TRANSPORT:'private-job-v2',RAILWAY_TOKEN:'fixture-project-token',RAILWAY_PROJECT_ID:id(1),RAILWAY_ENVIRONMENT_ID:id(2),RAILWAY_RELEASE_WORKER_SERVICE_ID:id(3),RAILWAY_GAME_SERVICE_ID:id(4),RAILWAY_VERIFY_PG_SERVICE_ID:id(5),
 REGISTRAR_CONFIG_OPERATION:'registrar-config-inspect',REGISTRAR_CONFIG_PROMOTE:'false',REGISTRAR_CONFIG_PATCH_ID:'',REGISTRAR_CONFIG_APPROVAL_TOKEN:'',REGISTRAR_CONFIG_EXCLUSIVE_WINDOW:'false'};
const target=targetConfig(env),stamp='2026-10-26T04:49:06.680Z';
function fixture(){
 const d={id:oldWorker,projectId:target.projectId,environmentId:target.environmentId,serviceId:target.workerId,status:'SUCCESS',createdAt:stamp,updatedAt:stamp,statusUpdatedAt:stamp,deploymentStopped:true,instances:[{id:'original-exited-instance',status:'EXITED'}]};
 const values={KINGDOM_COPY_REGISTRATION_DATABASE_URL:'postgres://kc_copy_registrar:fixture-private-password@copy.railway.internal:5432/Railway',KINGDOM_COPY_REGISTRATION_ENABLED:'0',KINGDOM_COPY_REGISTRATION_SCOPE:JSON.stringify({projectId:target.projectId,environmentId:target.environmentId,gameServiceId:target.gameId,workerServiceId:target.workerId,verificationDatabaseServiceId:target.copyId,maintenanceDatabase:'Railway',clusterDigest:'c'.repeat(64),sourceClusterDigest:'d'.repeat(64)})};
 // #57: authenticated values are plaintext; they must remain private.
 const patch={services:{[target.workerId]:{variables:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value}]))}}};
 return {project:{id:target.projectId,name:'merry-patience'},environment:{id:target.environmentId,name:'production',projectId:target.projectId,unmergedChangesCount:null},worker:{serviceId:target.workerId,environmentId:target.environmentId,serviceName:'KingdomReleaseCheck',latestDeployment:d,activeDeployments:[structuredClone(d)]},deployments:{edges:[{node:structuredClone(d)}]},
  staged:{id:id(6),environmentId:target.environmentId,status:'STAGED',createdAt:stamp,updatedAt:stamp,appliedAt:null,lastAppliedError:null,patch}};
}
const vars=d=>d.staged.patch.services[target.workerId].variables;
function review(data=fixture(),sourceCommit=env.GITHUB_SHA){return checkPatch(data,target,{sourceCommit,workerSnapshot:checkWorker(data,target)});}
function changePrivateValue(data){vars(data).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value=vars(data).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value.replace('fixture-private-password','changed-private-password');}
function commitEnv(data=fixture()){const plan=review(data);return {...env,REGISTRAR_CONFIG_OPERATION:'registrar-config-commit',REGISTRAR_CONFIG_PATCH_ID:plan.patchId,REGISTRAR_CONFIG_APPROVAL_TOKEN:plan.approvalToken,REGISTRAR_CONFIG_EXCLUSIVE_WINDOW:'true'};}
function provider({before=fixture(),changeSecond=()=>{},changeAfter=()=>{},mutationError=false,commitReply='config-workflow',status='Complete',statusError=null,readError=false}={}){
 const calls=[];let inspected=0;
 const api=async(query,variables)=>{
  calls.push({query,variables});
  if(query.includes('query RegistrarConfigInspect')){if(readError)throw new Error('provider-secret');const d=structuredClone(before);if(++inspected===2)changeSecond(d);return d;}
  if(query.includes('mutation RegistrarConfigCommit')){if(mutationError)throw new Error('provider-secret lost acknowledgement');return {environmentPatchCommitStaged:commitReply};}
  if(query.includes('query RegistrarConfigStatus'))return {workflowStatus:{status,error:statusError}};
  if(query.includes('query RegistrarConfigVerify')){
   assert.equal(variables.patchId,before.staged.id);
   const d=structuredClone(before);d.receipt={...structuredClone(before.staged),status:'COMMITTED',appliedAt:'2026-10-26T05:00:00.000Z',updatedAt:'2026-10-26T05:00:00.000Z'};
   d.pending=structuredClone(d.receipt);changeAfter(d);return d;
  }
  throw new Error('Unexpected provider operation');
 };
 return {api,calls,writes:()=>calls.filter(c=>c.query.includes('mutation '))};
}

test('inspection produces safe review pins without writing, exporting credentials or authorizing activation',async()=>{
 const p=provider(),result=await runConfig(env,{api:p.api});assert.equal(p.writes().length,0);assert.equal(p.calls.length,1);
 assert.deepEqual(Object.keys(result).sort(),['kind','patchId','approvalToken','workerDeploymentId'].sort());assert.equal(result.kind,'inspection');assert.equal(result.workerDeploymentId,oldWorker);
 assert.match(result.approvalToken,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(result),/fixture-private-password|copy\.railway|stored-ciphertext|DATABASE_URL|clusterDigest/);
});
test('exact reviewed commit calls only the official mutation once with literal skipDeploys true, then verifies completion and unchanged worker',async()=>{
 const p=provider(),result=await runConfig(commitEnv(),{api:p.api});assert.equal(result.kind,'committed');assert.equal(p.writes().length,1);
 assert.equal(p.writes()[0].query,commitMutation);assert.match(commitMutation,/skipDeploys:true/);
 assert.deepEqual(Object.keys(p.writes()[0].variables).sort(),['commitMessage','environmentId']);assert.doesNotMatch(JSON.stringify(p.writes()),/fixture-private-password|sourceClusterDigest/);
 assert.equal(p.calls.filter(c=>c.query.includes('query RegistrarConfigInspect')).length,2);
 assert.equal(p.calls.at(-1).query.includes('query RegistrarConfigVerify'),true);
});
test('#57 explicitly decrypted values validate privately; no false encryption view or storage-envelope assumption remains',async()=>{
 const p=provider();assert.equal((await runConfig(env,{api:p.api})).kind,'inspection');
 assert.equal((p.calls[0].query.match(/patch\(decryptVariables:true\)/g)||[]).length,1);
 assert.doesNotMatch(p.calls[0].query,/decryptVariables:false|clear:patch/);
 const c=provider();await runConfig(commitEnv(),{api:c.api});
 assert.equal((c.calls.at(-1).query.match(/patch\(decryptVariables:true\)/g)||[]).length,2);
 const before=fixture();vars(before).KINGDOM_COPY_REGISTRATION_DATABASE_URL={encryptedValue:'fake-ciphertext'};
 assert.throws(()=>review(before),e=>failureCategory(e)==='PATCH_VARIABLE_SCOPE');
 for(const value of ['*****','<redacted>','opaque-string',JSON.stringify({encryptedDek:'dek',cipherText:'cipher'})]){
  const invalid=fixture();vars(invalid).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value=value;
  assert.throws(()=>review(invalid),e=>failureCategory(e)==='REGISTRAR_URL');
 }
});
test('non-secret token excludes ALL sensitive values and unknown provider fields; it is explicitly not a value commitment',()=>{
 const before=fixture(),baseline=review(before);
 changePrivateValue(before);assert.deepEqual(review(before),baseline);
 const scope=JSON.parse(vars(before).KINGDOM_COPY_REGISTRATION_SCOPE.value);scope.clusterDigest='e'.repeat(64);scope.sourceClusterDigest='f'.repeat(64);
 vars(before).KINGDOM_COPY_REGISTRATION_SCOPE.value=JSON.stringify(scope);assert.deepEqual(review(before),baseline);
 before.staged.privateExtra='fixture-private-password';before.worker.privateExtra='fixture-private-password';before.privateExtra='fixture-private-password';
 assert.deepEqual(review(before),baseline);
 // Content changed under identical ID/timestamps is intentionally not bound
 // across runs. The owner-exclusive window is a hard external prerequisite.
 assert.equal(approvalPolicy,'registrar-server-revision-v1');
 for(const secret of Object.values(vars(before)).map(item=>item.value)){
  assert.notEqual(baseline.approvalToken,createHash('sha256').update(secret).digest('hex'));
  if(secret!=='0')assert.equal(JSON.stringify(baseline).includes(secret),false);
 }
});
test('token binds exact server identity/revision, variable metadata, source commit and stopped-worker snapshot',async t=>{
 const original=review();
 for(const [name,mutate] of Object.entries({
  patchId:d=>{d.staged.id=id(7);},created:d=>{d.staged.createdAt='2026-10-25T04:49:06.680Z';},
  updated:d=>{d.staged.updatedAt='2026-10-26T05:00:00.000Z';},
  flags:d=>{vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.isOptional=false;},
  worker:d=>{for(const row of [d.worker.latestDeployment,...d.worker.activeDeployments,...d.deployments.edges.map(x=>x.node)])row.updatedAt='2026-10-26T05:00:00.000Z';}
 }))await t.test(name,async()=>{
  const before=fixture();mutate(before);assert.notEqual(review(before).approvalToken,original.approvalToken);
  const p=provider({before});await assert.rejects(runConfig(commitEnv(),{api:p.api}),e=>failureCategory(e)==='PATCH_BINDING');assert.equal(p.writes().length,0);
 });
 assert.notEqual(review(fixture(),'b'.repeat(40)).approvalToken,original.approvalToken);
 const p=provider();await assert.rejects(runConfig({...commitEnv(),GITHUB_SHA:'b'.repeat(40)},{api:p.api}),e=>failureCategory(e)==='PATCH_BINDING');assert.equal(p.writes().length,0);
 for(const context of [{},{sourceCommit:'bad',workerSnapshot:'0'.repeat(64)},{sourceCommit:env.GITHUB_SHA,workerSnapshot:'bad'}])assert.throws(()=>checkPatch(fixture(),target,context),e=>failureCategory(e)==='APPROVAL_CONTEXT');
});
test('eight-field scope is exact and disabled registrar validation cannot be bypassed by a valid metadata token',async t=>{
 const scope=JSON.parse(vars(fixture()).KINGDOM_COPY_REGISTRATION_SCOPE.value);
 for(const field of Object.keys(scope))await t.test('missing '+field,async()=>{
  const before=fixture(),s={...scope};delete s[field];vars(before).KINGDOM_COPY_REGISTRATION_SCOPE.value=JSON.stringify(s);const p=provider({before});
  await assert.rejects(runConfig(commitEnv(),{api:p.api}),e=>failureCategory(e)==='REGISTRAR_SCOPE');assert.equal(p.writes().length,0);
 });
 const cases={
  extra:s=>{s.extra='provider-secret';},wrongMaintenance:s=>{s.maintenanceDatabase='railway';},
  wrongProject:s=>{s.projectId=id(7);},wrongEnvironment:s=>{s.environmentId=id(7);},wrongGame:s=>{s.gameServiceId=id(7);},wrongWorker:s=>{s.workerServiceId=id(7);},wrongCopy:s=>{s.verificationDatabaseServiceId=id(7);},
  invalidCluster:s=>{s.clusterDigest='bad';},invalidSourceCluster:s=>{s.sourceClusterDigest='bad';},sameCluster:s=>{s.sourceClusterDigest=s.clusterDigest;}
 };
 for(const [name,mutate] of Object.entries(cases))await t.test(name,async()=>{
  const before=fixture(),s={...scope};mutate(s);vars(before).KINGDOM_COPY_REGISTRATION_SCOPE.value=JSON.stringify(s);const p=provider({before});
  await assert.rejects(runConfig(commitEnv(),{api:p.api}),e=>failureCategory(e)==='REGISTRAR_SCOPE');assert.equal(p.writes().length,0);
 });
});
test('fresh read catches valid private URL/scope changes even when metadata revision does not advance',async()=>{
 for(const changeSecond of [changePrivateValue,d=>{const s=JSON.parse(vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.value);s.clusterDigest='e'.repeat(64);vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.value=JSON.stringify(s); }]){
  const p=provider({changeSecond});await assert.rejects(runConfig(commitEnv(),{api:p.api}),e=>failureCategory(e)==='PATCH_BINDING');assert.equal(p.writes().length,0);
 }
});
test('last-read/commit race can be detected only AFTER a write; never undo or retry it automatically',async()=>{
 const p=provider({changeAfter:d=>{changePrivateValue({staged:d.receipt});d.pending=structuredClone(d.receipt);}});
 await assert.rejects(runConfig(commitEnv(),{api:p.api}),e=>failureCategory(e)==='PATCH_NOT_CLEARED');assert.equal(p.writes().length,1);
});
test('old digest approvals and unacknowledged owner freeze are rejected before API access',async()=>{
 for(const patch of [{REGISTRAR_CONFIG_PATCH_DIGEST:'a'.repeat(64)},{REGISTRAR_CONFIG_APPROVAL_TOKEN:''},{REGISTRAR_CONFIG_EXCLUSIVE_WINDOW:'false'}]){
  const p=provider();await assert.rejects(runConfig({...commitEnv(),...patch},{api:p.api}),e=>failureCategory(e)==='WORKFLOW_REQUEST');assert.equal(p.calls.length,0);
 }
});
test('CLI exports only labeled metadata approval, or a fixed failure; no credential hash, values, bodies or diagnostic probes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'registrar-approval-'));
 try{
  for(const valid of [true,false]){
   const before=fixture();if(!valid)vars(before).KINGDOM_COPY_REGISTRATION_SCOPE.value='private-scope-<script>\n::error::credential';
   const summary=join(dir,valid?'success.md':'failure.md'),path=fileURLToPath(new URL('../deployment/release/registrar-config.mjs',import.meta.url));
   const preload='data:text/javascript,'+encodeURIComponent('globalThis.fetch=async(_url,options)=>{if(JSON.parse(options.body).query.includes("mutation "))throw Error("unexpected write");return {ok:true,text:async()=>JSON.stringify({data:'+JSON.stringify(before)+'})};};');
   const r=spawnSync(process.execPath,['--import',preload,path,'run'],{env:{PATH:process.env.PATH,...env,GITHUB_STEP_SUMMARY:summary},encoding:'utf8',timeout:5000});
   assert.equal(r.status,valid?0:1);assert.equal(r.stdout,valid?'REGISTRAR_CONFIG_INSPECTION: PASS\n':'');
   if(!valid){assert.equal(r.stderr,'REGISTRAR_CONFIG_FAILURE: REGISTRAR_SCOPE\nREGISTRAR_CONFIG: FAIL — no retry or recovery is authorized; inspect state read-only.\n');assert.equal(existsSync(summary),false);}
   const publicText=r.stdout+r.stderr+(valid?readFileSync(summary,'utf8'):'');
   if(valid){assert.match(publicText,/server metadata only; excludes secret values/);assert.match(publicText,/Not a secret-value commitment/);assert.ok(publicText.includes(review(before).approvalToken));}
   for(const secret of Object.values(vars(before)).map(item=>item.value)){
    if(secret!=='0')assert.equal(publicText.includes(secret),false);assert.equal(publicText.includes(createHash('sha256').update(secret).digest('hex')),false);
   }
   assert.doesNotMatch(publicText,/REGISTRAR_CONFIG_SHAPE|REGISTRAR_CONFIG_VALUE_CLASSES|private-scope|fixture-private-password|copy\.railway|cipherText|encryptedDek|stack|unexpected write/);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('only exact worker variable additions are accepted; unrelated or incomplete patch shapes fail before any write',async t=>{
 const cases={
  unrelatedService:d=>{d.staged.patch.services[target.gameId]={};},
  sharedVariables:d=>{d.staged.patch.sharedVariables={};},
  volume:d=>{d.staged.patch.volumes={};},
  startCommand:d=>{d.staged.patch.services[target.workerId].deploy={startCommand:'attacker'};},
  extraVariable:d=>{d.staged.patch.services[target.workerId].variables.UNRELATED={encryptedValue:'x'};},
  missingVariable:d=>{delete d.staged.patch.services[target.workerId].variables.KINGDOM_COPY_REGISTRATION_SCOPE;},
  deleteVariable:d=>{d.staged.patch.services[target.workerId].variables.KINGDOM_COPY_REGISTRATION_SCOPE=null;},
  unexpectedAttribute:d=>{d.staged.patch.services[target.workerId].variables.KINGDOM_COPY_REGISTRATION_SCOPE.isDeleted=true;},
  invalidScopeValue:d=>{d.staged.patch.services[target.workerId].variables.KINGDOM_COPY_REGISTRATION_SCOPE={value:'plaintext'};},
  enabled:d=>{vars(d).KINGDOM_COPY_REGISTRATION_ENABLED.value='1';},
  unrestrictedUser:d=>{vars(d).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value=vars(d).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value.replace('kc_copy_registrar','postgres');},
  wrongDatabase:d=>{vars(d).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value=vars(d).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value.replace('Railway','railway');},
  publicHost:d=>{vars(d).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value='postgres://kc_copy_registrar:fixture@public.example/Railway';},
  wrongScope:d=>{const s=JSON.parse(vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.value);s.workerServiceId=target.gameId;vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.value=JSON.stringify(s);},
  sameCluster:d=>{const s=JSON.parse(vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.value);s.sourceClusterDigest=s.clusterDigest;vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.value=JSON.stringify(s);},
  wrongPatchEnvironment:d=>{d.staged.environmentId=id(7);},
  applying:d=>{d.staged.status='APPLYING';},
  committed:d=>{d.staged.status='COMMITTED';}
 };
 for(const [name,mutate] of Object.entries(cases))await t.test(name,async()=>{const before=fixture();mutate(before);const p=provider({before});await assert.rejects(runConfig(commitEnv(),{api:p.api}));assert.equal(p.writes().length,0);});
});
test('replacement patches, changed private values/revisions and a worker change between reads are never committed',async t=>{
 const cases={replacement:d=>{d.staged.id=id(7);},revision:d=>{d.staged.updatedAt='2026-10-26T05:00:00.000Z';},privateValue:changePrivateValue,activation:d=>{vars(d).KINGDOM_COPY_REGISTRATION_ENABLED.value='1';},unrelated:d=>{d.staged.patch.services[target.gameId]={};},restart:d=>{d.worker.latestDeployment.updatedAt='2026-10-26T05:00:00.000Z';}};
 for(const [name,changeSecond] of Object.entries(cases))await t.test(name,async()=>{const p=provider({changeSecond});await assert.rejects(runConfig(commitEnv(),{api:p.api}));assert.equal(p.writes().length,0);});
 for(const patch of [{REGISTRAR_CONFIG_PATCH_ID:id(7)},{REGISTRAR_CONFIG_APPROVAL_TOKEN:'0'.repeat(64)}]){const p=provider();await assert.rejects(runConfig({...commitEnv(),...patch},{api:p.api}));assert.equal(p.writes().length,0);}
});
test('old worker must be the exact stopped deployment; target and queued/instance drift fail closed',async t=>{
 const cases={wrongProject:d=>{d.project.id=id(7);},wrongEnvironment:d=>{d.environment.name='staging';},wrongService:d=>{d.worker.serviceName='test';},newWorker:d=>{d.worker.latestDeployment.id=id(7);},running:d=>{d.worker.latestDeployment.deploymentStopped=false;},instance:d=>{d.worker.latestDeployment.instances[0].status='RUNNING';},additionalInstance:d=>{d.worker.latestDeployment.instances.push({id:'new-instance',status:'EXITED'});},queued:d=>{const row=structuredClone(d.deployments.edges[0]);row.node.id=id(7);row.node.status='QUEUED';d.deployments.edges.unshift(row);}};
 for(const [name,mutate] of Object.entries(cases))await t.test(name,async()=>{const before=fixture();mutate(before);const p=provider({before});await assert.rejects(runConfig(commitEnv(),{api:p.api}));assert.equal(p.writes().length,0);});
});
test('postchecks detect same-deployment restarts, new deployments, altered instances and an uncleared patch',async t=>{
 const cases={restart:d=>{d.worker.latestDeployment.updatedAt='2026-10-26T05:00:00.000Z';},newDeployment:d=>{d.worker.latestDeployment.id=id(7);},newInstance:d=>{d.worker.latestDeployment.instances[0].id='replacement-instance';},queued:d=>{d.deployments.edges.unshift({node:{...d.worker.latestDeployment,id:id(7),status:'QUEUED'}});},pending:d=>{d.pending=structuredClone(d.staged);}};
 for(const [name,changeAfter] of Object.entries(cases))await t.test(name,async()=>{const p=provider({changeAfter});await assert.rejects(runConfig(commitEnv(),{api:p.api}));assert.equal(p.writes().length,1);});
});
test('lost acknowledgements, failed workflows, read failures and timeouts never retry the mutation',async t=>{
 for(const [name,options] of Object.entries({lost:{mutationError:true},invalidAck:{commitReply:null},failed:{status:'Error',statusError:'provider-secret'},missing:{status:'NotFound'},timeout:{status:'Running'},readFailure:{readError:true}}))await t.test(name,async()=>{
  const p=provider(options);await assert.rejects(runConfig(commitEnv(),{api:p.api,wait:async()=>{},now:()=>0}));assert.ok(p.writes().length<=1);
 });
 const p=provider({status:'Running'});let state=0;const api=async(q,v)=>{if(q.includes('query RegistrarConfigStatus')&&++state===2)return {workflowStatus:{status:'Complete',error:null}};return p.api(q,v);};
 assert.equal((await runConfig(commitEnv(),{api,wait:async()=>{}})).kind,'committed');assert.equal(p.writes().length,1);
});
test('job reruns, absent exclusive-window acknowledgement, release promotion and untrusted execution contexts cannot write',async()=>{
 for(const patch of [{GITHUB_RUN_ATTEMPT:'2'},{REGISTRAR_CONFIG_EXCLUSIVE_WINDOW:'false'},{REGISTRAR_CONFIG_PROMOTE:'true'},{GITHUB_REF:'refs/heads/feature'},{GITHUB_EVENT_NAME:'push'},{GITHUB_ACTIONS:'false'},{GITHUB_REPOSITORY:'attacker/test'},{GITHUB_JOB:'release'},{RAILWAY_API_TOKEN:'unwanted-account-token'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'}]){const p=provider();await assert.rejects(runConfig({...commitEnv(),...patch},{api:p.api}));assert.equal(p.calls.length,0);}
 assert.equal(validateRequest({...env,REGISTRAR_CONFIG_OPERATION:'release'}),'release');assert.throws(()=>validateRequest({...commitEnv(),REGISTRAR_CONFIG_OPERATION:'release'}));
});
test('transport pins HTTPS endpoint/project authentication and rejects provider/HTTP/redirect failures without another call',async()=>{
 let seen;const client=railwayClient('fixture-private-token',async(url,options)=>{seen={url,options};return {ok:true,text:async()=>JSON.stringify({data:{ok:true}})};});
 assert.deepEqual(await client('query Test{}',{}),{ok:true});assert.equal(seen.url,'https://backboard.railway.com/graphql/v2');assert.equal(seen.options.redirect,'error');assert.equal(seen.options.cache,'no-store');assert.equal(seen.options.headers['project-access-token'],'fixture-private-token');
 for(const reply of [{ok:false,text:async()=>{throw Error('should not read body');}},{ok:true,text:async()=>JSON.stringify({errors:[{message:'provider-secret'}]})},{ok:true,text:async()=>'x'.repeat(2_000_001)}]){let n=0;await assert.rejects(railwayClient('fixture',async()=>{n++;return reply;})('query Test{}',{}));assert.equal(n,1);}
});
test('CLI prints only fixed failure diagnostics for credential-bearing provider failures',()=>{
 const path=fileURLToPath(new URL('../deployment/release/registrar-config.mjs',import.meta.url));
 const preload='data:text/javascript,'+encodeURIComponent('globalThis.fetch=async()=>({ok:true,text:async()=>JSON.stringify({errors:[{message:"fixture-private-password"}]})});');
 const r=spawnSync(process.execPath,['--import',preload,path,'run'],{env:{PATH:process.env.PATH,...env},encoding:'utf8',timeout:5000});
 assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'REGISTRAR_CONFIG_FAILURE: API_GRAPHQL_REJECTED\nREGISTRAR_CONFIG: FAIL — no retry or recovery is authorized; inspect state read-only.\n');assert.doesNotMatch(r.stderr,/fixture-private-password|assert|stack|copy\.railway/);
});
test('safe categories distinguish transport, authentication, permission and GraphQL rejection without messages or retries',async t=>{
 const cases={
  API_TRANSPORT:async()=>{throw new Error('fixture-private-password TLS/provider detail');},
  API_AUTHENTICATION:async()=>({ok:false,status:401,text:async()=>{throw new Error('body must not be read');}}),
  API_PERMISSION:async()=>({ok:false,status:403,text:async()=>{throw new Error('body must not be read');}}),
  API_HTTP:async()=>({ok:false,status:500,text:async()=>{throw new Error('body must not be read');}}),
  API_RESPONSE:async()=>({ok:true,status:200,text:async()=>'<html>fixture-private-password</html>'}),
  API_QUERY_REJECTED:async()=>({ok:false,status:400,text:async()=>JSON.stringify({errors:[{message:'fixture-private-password',extensions:{code:'GRAPHQL_VALIDATION_FAILED'}}]})}),
  API_GRAPHQL_REJECTED:async()=>({ok:true,status:200,text:async()=>JSON.stringify({errors:[{message:'Unauthorized fixture-private-password',extensions:{code:'UNRECOGNIZED_SECRET_CODE'}}]})})
 };
 for(const [category,response] of Object.entries(cases))await t.test(category,async()=>{let calls=0;await assert.rejects(railwayClient('fixture',async()=>{calls++;return response();})('query Test{}',{}),e=>failureCategory(e)===category&&!e.message.includes('fixture-private-password'));assert.equal(calls,1);});
 for(const [code,category] of [['UNAUTHENTICATED','API_AUTHENTICATION'],['FORBIDDEN','API_PERMISSION'],['GRAPHQL_PARSE_FAILED','API_QUERY_REJECTED']]){
  await assert.rejects(railwayClient('fixture',async()=>({ok:true,text:async()=>JSON.stringify({errors:[{message:'fixture-private-password',extensions:{code}}]})}))('query Test{}',{}),e=>failureCategory(e)===category);
 }
 // An attacker-controlled error message cannot impersonate a classified error.
 assert.equal(failureCategory(new Error('API_AUTHENTICATION fixture-private-password')),'UNCLASSIFIED');
});
test('inspection identifies the exact guard group while retaining rejection and zero mutation calls',async t=>{
 const cases={
  TARGET_IDENTITY:d=>{d.project.id=id(7);},
  WORKER_IDENTITY:d=>{d.worker.latestDeployment.id=id(7);},
  WORKER_STOPPED_STATE:d=>{d.worker.latestDeployment.deploymentStopped=false;},
  WORKER_HISTORY:d=>{d.worker.activeDeployments=[{...d.worker.latestDeployment,updatedAt:'2026-10-26T06:00:00.000Z'}];},
  PATCH_ID:d=>{d.staged.id='invalid';},
  PATCH_ENVIRONMENT:d=>{d.staged.environmentId=id(7);},
  PATCH_STATUS:d=>{d.staged.status='APPLYING';},
  PATCH_APPLIED_AT:d=>{d.staged.appliedAt=stamp;},
  PATCH_LAST_APPLIED_ERROR:d=>{d.staged.lastAppliedError='fixture-private-password';},
  PATCH_CREATED_AT:d=>{d.staged.createdAt='invalid';},
  PATCH_UPDATED_AT:d=>{d.staged.updatedAt='invalid';},
  PATCH_VARIABLE_SCOPE:d=>{d.staged.patch.sharedVariables={};},
  REGISTRATION_NOT_DISABLED:d=>{vars(d).KINGDOM_COPY_REGISTRATION_ENABLED.value='1';},
  REGISTRAR_URL:d=>{vars(d).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value='postgres://postgres:fixture-private-password@public.example/Railway';},
  REGISTRAR_SCOPE:d=>{vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.value='fixture-private-password';}
 };
 for(const [category,mutate] of Object.entries(cases))await t.test(category,async()=>{const before=fixture();mutate(before);const p=provider({before});await assert.rejects(runConfig(env,{api:p.api}),e=>failureCategory(e)===category&&!e.message.includes('fixture-private-password'));assert.equal(p.writes().length,0);assert.equal(p.calls.length,1);});
 const p=provider();await assert.rejects(runConfig({...env,GITHUB_JOB:'unexpected'},{api:p.api}),e=>failureCategory(e)==='WORKFLOW_REQUEST');assert.equal(p.calls.length,0);
});
test('forked-environment counters do not determine exact staged scope or successful clearance',async t=>{
 for(const count of [null,0,1,3,4,20])await t.test(String(count),async()=>{
  const before=fixture();before.environment.unmergedChangesCount=count;const p=provider({before});
  assert.equal((await runConfig(env,{api:p.api})).kind,'inspection');assert.equal(p.writes().length,0);
  assert.equal((await runConfig(commitEnv(before),{api:p.api})).kind,'committed');assert.equal(p.writes().length,1);
  assert.ok(p.calls.every(c=>!c.query.includes('unmergedChangesCount')));
 });
 // A zero fork counter cannot conceal unrelated staged changes.
 const before=fixture();before.environment.unmergedChangesCount=0;before.staged.patch.sharedVariables={UNRELATED:{value:'fixture-private-password'}};
 const p=provider({before});await assert.rejects(runConfig(commitEnv(),{api:p.api}));assert.equal(p.writes().length,0);
});
test('clearance binds the exact committed receipt and rejects pending, mismatched or unverifiable state',async t=>{
 for(const patch of [{},{services:{},volumes:{},buckets:{},sharedVariables:{}}]){
  const p=provider({changeAfter:d=>{d.pending={...structuredClone(d.staged),id:id(7),patch};}});
  assert.equal((await runConfig(commitEnv(),{api:p.api})).kind,'committed');assert.equal(p.writes().length,1);
 }
 const cases={
  wrongReceipt:d=>{d.receipt.id=id(7);},wrongEnvironment:d=>{d.receipt.environmentId=id(7);},
  unapplied:d=>{d.receipt.status='STAGED';d.receipt.appliedAt=null;},missingAppliedAt:d=>{d.receipt.appliedAt=null;},
  rewoundRevision:d=>{d.receipt.updatedAt='2026-10-25T00:00:00.000Z';},changedPayload:d=>{changePrivateValue({staged:d.receipt});},
  error:d=>{d.receipt.lastAppliedError='fixture-private-password';},missingPending:d=>{delete d.pending;},
  newNonempty:d=>{d.pending={...structuredClone(d.staged),id:id(7)};},differentCommitted:d=>{d.pending.id=id(7);},
  unknownEmptyRoot:d=>{d.pending={...structuredClone(d.staged),id:id(7),patch:{unrelated:{}}};},
  clearingNetwork:d=>{d.pending={...structuredClone(d.staged),id:id(7),patch:{privateNetworkDisabled:null}};}
 };
 for(const [name,changeAfter] of Object.entries(cases))await t.test(name,async()=>{const p=provider({changeAfter});await assert.rejects(runConfig(commitEnv(),{api:p.api}),e=>failureCategory(e)==='PATCH_NOT_CLEARED');assert.equal(p.writes().length,1);});
});
test('workflow keeps one production mutex/owner gate and makes config and recovery mutually exclusive',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/production-release.yml',import.meta.url),'utf8');
 assert.match(workflow,/group: kingdom-come-production\n  cancel-in-progress: false/);
 assert.match(workflow,/registrar_approval_token:/);assert.doesNotMatch(workflow,/registrar_patch_digest|REGISTRAR_CONFIG_PATCH_DIGEST/);
 assert.match(workflow,/REGISTRAR_CONFIG_APPROVAL_TOKEN: \$\{\{ inputs\.registrar_approval_token \}\}/);
 assert.match(workflow,/approve metadata-only binding; no other editors\/automation from inspection through completion/);
 const section=workflow.slice(workflow.indexOf('  registrar-config:'),workflow.indexOf('  release:'));
 assert.match(section,/needs: safety/);assert.match(section,/environment: production/);assert.match(section,/inputs\.operation == 'registrar-config-inspect' \|\| inputs\.operation == 'registrar-config-commit'/);
 assert.match(section,/secrets\.RAILWAY_TOKEN/);assert.doesNotMatch(section,/run\.mjs prepare|run\.mjs promote|railway up|BACKUP|SIGNING|DATABASE_URL|workflow_dispatch|workflow_run/);
 assert.match(workflow,/  release:\n    needs: safety\n    if: inputs\.operation == 'release' \|\| inputs\.operation == ''/);
 const source=readFileSync(new URL('../deployment/release/registrar-config.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/node:child_process|from 'pg'|registerVerifiedCopy|signProof|deploymentRestart|deploymentRedeploy|serviceInstanceDeploy|variableCollectionUpsert/);
 assert.equal((source.match(/environmentPatchCommitStaged\(/g)||[]).length,1);
});
