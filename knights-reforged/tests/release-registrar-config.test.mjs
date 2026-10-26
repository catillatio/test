import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateRequest,targetConfig,checkWorker,checkPatch,runConfig,railwayClient,oldWorker,commitMutation,registrationKeys} from '../deployment/release/registrar-config.mjs';

const id=n=>String(n).repeat(8)+'-'+String(n).repeat(4)+'-4'+String(n).repeat(3)+'-8'+String(n).repeat(3)+'-'+String(n).repeat(12);
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'catillatio/test',GITHUB_JOB:'registrar-config',GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',
 KINGDOM_RELEASE_ENABLED:'true',KINGDOM_RAILWAY_AUTODEPLOY_DISABLED:'true',KINGDOM_RELEASE_TRANSPORT:'private-job-v2',RAILWAY_TOKEN:'fixture-project-token',RAILWAY_PROJECT_ID:id(1),RAILWAY_ENVIRONMENT_ID:id(2),RAILWAY_RELEASE_WORKER_SERVICE_ID:id(3),RAILWAY_GAME_SERVICE_ID:id(4),RAILWAY_VERIFY_PG_SERVICE_ID:id(5),
 REGISTRAR_CONFIG_OPERATION:'registrar-config-inspect',REGISTRAR_CONFIG_PROMOTE:'false',REGISTRAR_CONFIG_PATCH_ID:'',REGISTRAR_CONFIG_PATCH_DIGEST:'',REGISTRAR_CONFIG_EXCLUSIVE_WINDOW:'false'};
const target=targetConfig(env),stamp='2026-10-26T04:49:06.680Z';
function fixture(){
 const d={id:oldWorker,projectId:target.projectId,environmentId:target.environmentId,serviceId:target.workerId,status:'SUCCESS',createdAt:stamp,updatedAt:stamp,statusUpdatedAt:stamp,deploymentStopped:true,instances:[{id:'original-exited-instance',status:'EXITED'}]};
 const values={KINGDOM_COPY_REGISTRATION_DATABASE_URL:'postgres://kc_copy_registrar:fixture-private-password@copy.railway.internal:5432/Railway',KINGDOM_COPY_REGISTRATION_ENABLED:'0',KINGDOM_COPY_REGISTRATION_SCOPE:JSON.stringify({projectId:target.projectId,environmentId:target.environmentId,gameServiceId:target.gameId,workerServiceId:target.workerId,verificationDatabaseServiceId:target.copyId,maintenanceDatabase:'Railway',clusterDigest:'c'.repeat(64),sourceClusterDigest:'d'.repeat(64)})};
 const patch={services:{[target.workerId]:{variables:Object.fromEntries(registrationKeys.map(k=>[k,{encryptedValue:'stored-ciphertext-'+k}]))}}};
 const clear={services:{[target.workerId]:{variables:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value}]))}}};
 return {project:{id:target.projectId,name:'merry-patience'},environment:{id:target.environmentId,name:'production',projectId:target.projectId,unmergedChangesCount:3},worker:{serviceId:target.workerId,environmentId:target.environmentId,serviceName:'KingdomReleaseCheck',latestDeployment:d,activeDeployments:[structuredClone(d)]},deployments:{edges:[{node:structuredClone(d)}]},
  staged:{id:id(6),environmentId:target.environmentId,status:'STAGED',createdAt:stamp,updatedAt:stamp,appliedAt:null,lastAppliedError:null,patch,clear}};
}
const vars=d=>d.staged.clear.services[target.workerId].variables;
function commitEnv(data=fixture()){const plan=checkPatch(data,target);return {...env,REGISTRAR_CONFIG_OPERATION:'registrar-config-commit',REGISTRAR_CONFIG_PATCH_ID:plan.patchId,REGISTRAR_CONFIG_PATCH_DIGEST:plan.patchDigest,REGISTRAR_CONFIG_EXCLUSIVE_WINDOW:'true'};}
function provider({before=fixture(),changeSecond=()=>{},changeAfter=()=>{},mutationError=false,commitReply='config-workflow',status='Complete',statusError=null,readError=false}={}){
 const calls=[];let inspected=0;
 const api=async(query,variables)=>{
  calls.push({query,variables});
  if(query.includes('query RegistrarConfigInspect')){if(readError)throw new Error('provider-secret');const d=structuredClone(before);if(++inspected===2)changeSecond(d);return d;}
  if(query.includes('mutation RegistrarConfigCommit')){if(mutationError)throw new Error('provider-secret lost acknowledgement');return {environmentPatchCommitStaged:commitReply};}
  if(query.includes('query RegistrarConfigStatus'))return {workflowStatus:{status,error:statusError}};
  if(query.includes('query RegistrarConfigVerify')){const d=structuredClone(before);d.environment.unmergedChangesCount=0;changeAfter(d);return d;}
  throw new Error('Unexpected provider operation');
 };
 return {api,calls,writes:()=>calls.filter(c=>c.query.includes('mutation '))};
}

test('inspection produces safe review pins without writing, exporting credentials or authorizing activation',async()=>{
 const p=provider(),result=await runConfig(env,{api:p.api});assert.equal(p.writes().length,0);assert.equal(p.calls.length,1);
 assert.deepEqual(Object.keys(result).sort(),['kind','patchId','patchDigest','workerDeploymentId'].sort());assert.equal(result.kind,'inspection');assert.equal(result.workerDeploymentId,oldWorker);
 assert.match(result.patchDigest,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(result),/fixture-private-password|copy\.railway|stored-ciphertext|DATABASE_URL|clusterDigest/);
});
test('exact reviewed commit calls only the official mutation once with literal skipDeploys true, then verifies completion and unchanged worker',async()=>{
 const p=provider(),result=await runConfig(commitEnv(),{api:p.api});assert.equal(result.kind,'committed');assert.equal(p.writes().length,1);
 assert.equal(p.writes()[0].query,commitMutation);assert.match(commitMutation,/skipDeploys:true/);
 assert.deepEqual(Object.keys(p.writes()[0].variables).sort(),['commitMessage','environmentId']);assert.doesNotMatch(JSON.stringify(p.writes()),/fixture-private-password|sourceClusterDigest/);
 assert.equal(p.calls.filter(c=>c.query.includes('query RegistrarConfigInspect')).length,2);
 assert.equal(p.calls.at(-1).query.includes('query RegistrarConfigVerify'),true);
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
  plaintextFingerprint:d=>{d.staged.patch.services[target.workerId].variables.KINGDOM_COPY_REGISTRATION_SCOPE={value:'plaintext'};},
  enabled:d=>{vars(d).KINGDOM_COPY_REGISTRATION_ENABLED.value='1';},
  unrestrictedUser:d=>{vars(d).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value=vars(d).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value.replace('kc_copy_registrar','postgres');},
  wrongDatabase:d=>{vars(d).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value=vars(d).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value.replace('Railway','railway');},
  publicHost:d=>{vars(d).KINGDOM_COPY_REGISTRATION_DATABASE_URL.value='postgres://kc_copy_registrar:fixture@public.example/Railway';},
  wrongScope:d=>{const s=JSON.parse(vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.value);s.workerServiceId=target.gameId;vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.value=JSON.stringify(s);},
  sameCluster:d=>{const s=JSON.parse(vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.value);s.sourceClusterDigest=s.clusterDigest;vars(d).KINGDOM_COPY_REGISTRATION_SCOPE.value=JSON.stringify(s);},
  wrongPatchEnvironment:d=>{d.staged.environmentId=id(7);},
  applying:d=>{d.staged.status='APPLYING';},
  committed:d=>{d.staged.status='COMMITTED';d.environment.unmergedChangesCount=0;},
  otherChangeCount:d=>{d.environment.unmergedChangesCount=4;}
 };
 for(const [name,mutate] of Object.entries(cases))await t.test(name,async()=>{const before=fixture();mutate(before);const p=provider({before});await assert.rejects(runConfig(commitEnv(),{api:p.api}));assert.equal(p.writes().length,0);});
});
test('replacement patches, changed ciphertext/revisions and a worker change between reads are never committed',async t=>{
 const cases={replacement:d=>{d.staged.id=id(7);},revision:d=>{d.staged.updatedAt='2026-10-26T05:00:00.000Z';},ciphertext:d=>{d.staged.patch.services[target.workerId].variables.KINGDOM_COPY_REGISTRATION_SCOPE.encryptedValue+='changed';},activation:d=>{vars(d).KINGDOM_COPY_REGISTRATION_ENABLED.value='1';},unrelated:d=>{d.staged.patch.services[target.gameId]={};},restart:d=>{d.worker.latestDeployment.updatedAt='2026-10-26T05:00:00.000Z';}};
 for(const [name,changeSecond] of Object.entries(cases))await t.test(name,async()=>{const p=provider({changeSecond});await assert.rejects(runConfig(commitEnv(),{api:p.api}));assert.equal(p.writes().length,0);});
 for(const patch of [{REGISTRAR_CONFIG_PATCH_ID:id(7)},{REGISTRAR_CONFIG_PATCH_DIGEST:'0'.repeat(64)}]){const p=provider();await assert.rejects(runConfig({...commitEnv(),...patch},{api:p.api}));assert.equal(p.writes().length,0);}
});
test('old worker must be the exact stopped deployment; target and queued/instance drift fail closed',async t=>{
 const cases={wrongProject:d=>{d.project.id=id(7);},wrongEnvironment:d=>{d.environment.name='staging';},wrongService:d=>{d.worker.serviceName='test';},newWorker:d=>{d.worker.latestDeployment.id=id(7);},running:d=>{d.worker.latestDeployment.deploymentStopped=false;},instance:d=>{d.worker.latestDeployment.instances[0].status='RUNNING';},additionalInstance:d=>{d.worker.latestDeployment.instances.push({id:'new-instance',status:'EXITED'});},queued:d=>{const row=structuredClone(d.deployments.edges[0]);row.node.id=id(7);row.node.status='QUEUED';d.deployments.edges.unshift(row);}};
 for(const [name,mutate] of Object.entries(cases))await t.test(name,async()=>{const before=fixture();mutate(before);const p=provider({before});await assert.rejects(runConfig(commitEnv(),{api:p.api}));assert.equal(p.writes().length,0);});
});
test('postchecks detect same-deployment restarts, new deployments, altered instances and an uncleared patch',async t=>{
 const cases={restart:d=>{d.worker.latestDeployment.updatedAt='2026-10-26T05:00:00.000Z';},newDeployment:d=>{d.worker.latestDeployment.id=id(7);},newInstance:d=>{d.worker.latestDeployment.instances[0].id='replacement-instance';},queued:d=>{d.deployments.edges.unshift({node:{...d.worker.latestDeployment,id:id(7),status:'QUEUED'}});},pending:d=>{d.environment.unmergedChangesCount=3;}};
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
 assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'REGISTRAR_CONFIG: FAIL — no retry or recovery is authorized; inspect state read-only.\n');assert.doesNotMatch(r.stderr,/fixture-private-password|assert|stack|copy\.railway/);
});
test('workflow keeps one production mutex/owner gate and makes config and recovery mutually exclusive',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/production-release.yml',import.meta.url),'utf8');
 assert.match(workflow,/group: kingdom-come-production\n  cancel-in-progress: false/);
 const section=workflow.slice(workflow.indexOf('  registrar-config:'),workflow.indexOf('  release:'));
 assert.match(section,/needs: safety/);assert.match(section,/environment: production/);assert.match(section,/inputs\.operation == 'registrar-config-inspect' \|\| inputs\.operation == 'registrar-config-commit'/);
 assert.match(section,/secrets\.RAILWAY_TOKEN/);assert.doesNotMatch(section,/run\.mjs prepare|run\.mjs promote|railway up|BACKUP|SIGNING|DATABASE_URL|workflow_dispatch|workflow_run/);
 assert.match(workflow,/  release:\n    needs: safety\n    if: inputs\.operation == 'release' \|\| inputs\.operation == ''/);
 const source=readFileSync(new URL('../deployment/release/registrar-config.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/node:child_process|from 'pg'|registerVerifiedCopy|signProof|deploymentRestart|deploymentRedeploy|serviceInstanceDeploy|variableCollectionUpsert/);
 assert.equal((source.match(/environmentPatchCommitStaged\(/g)||[]).length,1);
});
