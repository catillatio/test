// Configuration only: no database connection, backup, signing, upload or deploy.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {uuid,digest,privateDatabase} from './protocol.mjs';

export const registrationKeys=['KINGDOM_COPY_REGISTRATION_DATABASE_URL','KINGDOM_COPY_REGISTRATION_ENABLED','KINGDOM_COPY_REGISTRATION_SCOPE'];
export const oldWorker='ccd3f1b1-c1ba-4f47-9613-352c0b972304';
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const keys=(value,expected)=>assert.deepEqual(Object.keys(value??{}).sort(),expected.slice().sort());
const endpoint='https://backboard.railway.com/graphql/v2';
const identity=`id projectId environmentId serviceId status createdAt updatedAt statusUpdatedAt deploymentStopped instances { id status }`;
const context=`project(id:$projectId){id name}
 environment(id:$environmentId,projectId:$projectId){id name projectId unmergedChangesCount}
 worker:serviceInstance(environmentId:$environmentId,serviceId:$workerId){serviceId environmentId serviceName latestDeployment{${identity}} activeDeployments{${identity}}}
 deployments(input:{projectId:$projectId,environmentId:$environmentId,serviceId:$workerId},first:3){edges{node{${identity}}}}`;
const variables=`$projectId:String!,$environmentId:String!,$workerId:String!`;
const inspectQuery=`query RegistrarConfigInspect(${variables}){${context}
 staged:environmentStagedChanges(environmentId:$environmentId){id environmentId status createdAt updatedAt appliedAt lastAppliedError patch(decryptVariables:false) clear:patch(decryptVariables:true)}}`;
const verifyQuery=`query RegistrarConfigVerify(${variables}){${context}}`;
// Official pinned Railway CLI mutation. There is no expected-patch/CAS argument.
export const commitMutation=`mutation RegistrarConfigCommit($environmentId:String!,$commitMessage:String!){
 environmentPatchCommitStaged(environmentId:$environmentId,commitMessage:$commitMessage,skipDeploys:true)}`;
const statusQuery=`query RegistrarConfigStatus($workflowId:String!){workflowStatus(workflowId:$workflowId){status error}}`;

export function validateRequest(env){
 assert.equal(env.GITHUB_REF,'refs/heads/release/production');assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');
 const operation=env.REGISTRAR_CONFIG_OPERATION||'release';
 assert.ok(['release','registrar-config-inspect','registrar-config-commit'].includes(operation));
 if(operation==='release'){
  assert.ok(!env.REGISTRAR_CONFIG_PATCH_ID&&!env.REGISTRAR_CONFIG_PATCH_DIGEST);
  assert.ok(!env.REGISTRAR_CONFIG_EXCLUSIVE_WINDOW||env.REGISTRAR_CONFIG_EXCLUSIVE_WINDOW==='false');return operation;
 }
 assert.equal(env.REGISTRAR_CONFIG_PROMOTE,'false');
 assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.match(env.GITHUB_RUN_ID??'',/^[0-9]{1,20}$/);
 if(operation==='registrar-config-commit'){
  assert.equal(env.GITHUB_RUN_ATTEMPT,'1'); // Re-run jobs can inspect, never repeat a write.
  assert.match(env.REGISTRAR_CONFIG_PATCH_ID??'',uuid);assert.match(env.REGISTRAR_CONFIG_PATCH_DIGEST??'',digest);
  assert.equal(env.REGISTRAR_CONFIG_EXCLUSIVE_WINDOW,'true');
 }else assert.ok(!env.REGISTRAR_CONFIG_PATCH_ID&&!env.REGISTRAR_CONFIG_PATCH_DIGEST);
 return operation;
}
export function targetConfig(env){
 assert.equal(env.KINGDOM_RELEASE_ENABLED,'true');assert.equal(env.KINGDOM_RAILWAY_AUTODEPLOY_DISABLED,'true');
 assert.equal(env.KINGDOM_RELEASE_TRANSPORT,'private-job-v2');assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 assert.ok(env.RAILWAY_TOKEN&&!env.RAILWAY_API_TOKEN&&!/[\r\n]/.test(env.RAILWAY_TOKEN));
 const target={projectId:env.RAILWAY_PROJECT_ID,environmentId:env.RAILWAY_ENVIRONMENT_ID,workerId:env.RAILWAY_RELEASE_WORKER_SERVICE_ID,
  gameId:env.RAILWAY_GAME_SERVICE_ID,copyId:env.RAILWAY_VERIFY_PG_SERVICE_ID};
 for(const id of Object.values(target))assert.match(id??'',uuid);
 assert.equal(new Set([target.workerId,target.gameId,target.copyId]).size,3);return target;
}
export function railwayClient(token,fetcher=globalThis.fetch){
 return async(query,variables)=>{
  const response=await fetcher(endpoint,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
   headers:{'content-type':'application/json','project-access-token':token},body:JSON.stringify({query,variables})});
  assert.equal(response.ok,true);const bytes=await response.text();assert.ok(Buffer.byteLength(bytes)<=2_000_000);
  const reply=JSON.parse(bytes);assert.ok(reply.errors===undefined||(Array.isArray(reply.errors)&&reply.errors.length===0));
  assert.ok(reply.data&&typeof reply.data==='object');return reply.data;
 };
}
export function checkWorker(data,target){
 assert.equal(data.project?.id,target.projectId);assert.equal(data.project.name,'merry-patience');
 assert.equal(data.environment?.id,target.environmentId);assert.equal(data.environment.projectId,target.projectId);assert.equal(data.environment.name,'production');
 const worker=data.worker;assert.equal(worker?.serviceId,target.workerId);assert.equal(worker.environmentId,target.environmentId);assert.equal(worker.serviceName,'KingdomReleaseCheck');
 const d=worker.latestDeployment;assert.equal(d?.id,oldWorker);assert.equal(d.status,'SUCCESS');assert.equal(d.deploymentStopped,true);
 assert.equal(d.instances?.length,1);assert.equal(d.instances[0].status,'EXITED');assert.ok(d.instances[0].id);
 assert.ok(Array.isArray(worker.activeDeployments));assert.ok(worker.activeDeployments.length<=1);
 if(worker.activeDeployments.length)assert.deepEqual(worker.activeDeployments,[d]);
 const rows=data.deployments?.edges?.map(e=>e.node);assert.ok(Array.isArray(rows)&&rows.length>=1&&rows.length<=3);assert.deepEqual(rows[0],d);
 for(const row of rows){
  assert.equal(row.projectId,target.projectId);assert.equal(row.environmentId,target.environmentId);assert.equal(row.serviceId,target.workerId);
  for(const key of ['createdAt','updatedAt'])assert.ok(Number.isFinite(Date.parse(row[key])));
  assert.ok(!['QUEUED','WAITING','NEEDS_APPROVAL','INITIALIZING','BUILDING','DEPLOYING'].includes(row.status));
 }
 return hash({worker,deployments:rows});
}
function definitions(patch,target,encrypted){
 keys(patch,['services']);keys(patch.services,[target.workerId]);keys(patch.services[target.workerId],['variables']);
 const vars=patch.services[target.workerId].variables;keys(vars,registrationKeys);
 for(const item of Object.values(vars)){
  assert.ok(item&&typeof item==='object'&&!Array.isArray(item));
  const valueKey=encrypted?'encryptedValue':'value';
  assert.ok(Object.keys(item).every(k=>[valueKey,'isSealed','isOptional'].includes(k)));
  assert.ok(typeof item[valueKey]==='string'&&item[valueKey].length>0&&item[valueKey].length<=30000);
  if(item.isSealed!==undefined)assert.equal(typeof item.isSealed,'boolean');
  if(item.isOptional!==undefined)assert.equal(item.isOptional,false);
 }
 return vars;
}
export function checkPatch(data,target){
 const p=data.staged;assert.match(p?.id??'',uuid);assert.equal(p.environmentId,target.environmentId);assert.equal(p.status,'STAGED');
 assert.equal(p.appliedAt,null);assert.equal(p.lastAppliedError,null);assert.equal(data.environment.unmergedChangesCount,3);
 for(const k of ['createdAt','updatedAt'])assert.ok(Number.isFinite(Date.parse(p[k])));
 definitions(p.patch,target,true);const clear=definitions(p.clear,target,false);
 // This action can install disabled configuration only. Activation is separate.
 assert.equal(clear.KINGDOM_COPY_REGISTRATION_ENABLED.value,'0');
 const db=privateDatabase(clear.KINGDOM_COPY_REGISTRATION_DATABASE_URL.value);
 assert.equal(decodeURIComponent(db.url.username),'kc_copy_registrar');assert.ok(db.url.password);assert.equal(db.name,'Railway');
 const s=JSON.parse(clear.KINGDOM_COPY_REGISTRATION_SCOPE.value);
 keys(s,['projectId','environmentId','gameServiceId','workerServiceId','verificationDatabaseServiceId','maintenanceDatabase','clusterDigest','sourceClusterDigest']);
 for(const [k,v] of Object.entries({projectId:target.projectId,environmentId:target.environmentId,gameServiceId:target.gameId,workerServiceId:target.workerId,verificationDatabaseServiceId:target.copyId,maintenanceDatabase:'Railway'}))assert.equal(s[k],v);
 for(const k of ['clusterDigest','sourceClusterDigest'])assert.match(s[k]??'',digest);assert.notEqual(s.clusterDigest,s.sourceClusterDigest);
 // Never publish clear values, encrypted values, or a plaintext credential hash.
 // The digest commits to the stored ciphertext and patch revision, not p.clear.
 return {patchId:p.id,patchDigest:hash({id:p.id,environmentId:p.environmentId,createdAt:p.createdAt,updatedAt:p.updatedAt,patch:p.patch})};
}
export async function runConfig(env,{api,wait=delay,now=Date.now}={}){
 const operation=validateRequest(env);assert.notEqual(operation,'release');
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.GITHUB_JOB,'registrar-config');
 const target=targetConfig(env);
 api??=railwayClient(env.RAILWAY_TOKEN);
 const vars={projectId:target.projectId,environmentId:target.environmentId,workerId:target.workerId};
 const first=await api(inspectQuery,vars),workerDigest=checkWorker(first,target),plan=checkPatch(first,target);
 if(operation==='registrar-config-inspect')return {kind:'inspection',...plan,workerDeploymentId:oldWorker};
 assert.equal(plan.patchId,env.REGISTRAR_CONFIG_PATCH_ID);assert.equal(plan.patchDigest,env.REGISTRAR_CONFIG_PATCH_DIGEST);
 // Re-read immediately before the single write. Shared workflow concurrency
 // serializes releases; owner must freeze all other Railway editors separately.
 const second=await api(inspectQuery,vars);assert.equal(checkWorker(second,target),workerDigest);assert.deepEqual(checkPatch(second,target),plan);
 let workflowId;
 try{
  const result=await api(commitMutation,{environmentId:target.environmentId,commitMessage:'Registrar configuration only; run '+env.GITHUB_RUN_ID+'; patch '+plan.patchId});
  workflowId=result.environmentPatchCommitStaged;assert.ok(typeof workflowId==='string'&&workflowId.length>0&&workflowId.length<500);
 }catch{throw new Error('REGISTRAR_CONFIG_COMMIT_UNCONFIRMED');}
 // Only reads are polled. A timeout or lost acknowledgement NEVER retries write.
 const deadline=now()+60000;
 for(let n=0;n<30;n++){
  const state=await api(statusQuery,{workflowId}),after=await api(verifyQuery,vars);
  assert.equal(checkWorker(after,target),workerDigest);
  const status=state.workflowStatus;assert.equal(status?.error,null);assert.ok(['Running','Complete'].includes(status.status));
  if(status.status==='Complete'){
   assert.equal(after.environment.unmergedChangesCount,0);
   return {kind:'committed',...plan,workerDeploymentId:oldWorker};
  }
  assert.ok(now()<deadline);await wait(2000);
 }
 throw new Error('REGISTRAR_CONFIG_POSTCHECK_UNCONFIRMED');
}
async function main(){
 try{
  process.umask(0o077);
  if(process.argv.length!==3||!['validate-request','run'].includes(process.argv[2]))throw new Error('Invalid action');
  if(process.argv[2]==='validate-request'){validateRequest(process.env);console.log('REGISTRAR_CONFIG_REQUEST: PASS');return;}
  const result=await runConfig(process.env);
  console.log(result.kind==='inspection'?'REGISTRAR_CONFIG_INSPECTION: PASS':'REGISTRAR_CONFIG_COMMIT: PASS');
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,
   'Registrar configuration '+result.kind+' (registration remains OFF)\n\n'+
   'Patch ID: `'+result.patchId+'`\n\nPatch digest: `'+result.patchDigest+'`\n\n'+
   'Worker unchanged: `'+result.workerDeploymentId+'`\n\nNo recovery, deployment, activation or cleanup was requested.\n');
 }catch{console.error('REGISTRAR_CONFIG: FAIL — no retry or recovery is authorized; inspect state read-only.');process.exitCode=1;}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await main();
