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
// Only these fixed categories may leave the process. Never log exception
// messages/stacks, provider messages, response bodies or secret-bearing values.
const categories=new Set(['WORKFLOW_REQUEST','TARGET_CONFIG','API_TRANSPORT','API_AUTHENTICATION','API_PERMISSION','API_HTTP','API_RESPONSE','API_QUERY_REJECTED','API_GRAPHQL_REJECTED','API_READ',
 'TARGET_IDENTITY','WORKER_IDENTITY','WORKER_STOPPED_STATE','WORKER_HISTORY','PATCH_ID','PATCH_ENVIRONMENT','PATCH_STATUS','PATCH_APPLIED_AT','PATCH_LAST_APPLIED_ERROR','PATCH_CREATED_AT','PATCH_UPDATED_AT','PATCH_ENCRYPTED_SHAPE','PATCH_CLEAR_SHAPE','REGISTRATION_NOT_DISABLED','REGISTRAR_URL','REGISTRAR_SCOPE',
 'PATCH_BINDING','PRECOMMIT_WORKER_CHANGED','COMMIT_UNCONFIRMED','POST_COMMIT_WORKER_CHANGED','CONFIG_WORKFLOW_STATE','PATCH_NOT_CLEARED','POST_COMMIT_TIMEOUT','SUMMARY_WRITE','UNCLASSIFIED']);
const failures=new WeakMap();
const encryptedShapes=new WeakMap();
function fail(category){assert.ok(categories.has(category));const error=new Error('Registrar configuration check failed.');failures.set(error,category);throw error;}
export function failureCategory(error){return failures.get(error)??'UNCLASSIFIED';}
export function failureShape(error){return encryptedShapes.get(error);}
function checked(category,operation){try{return operation();}catch(error){if(failures.has(error))throw error;fail(category);}}
async function during(category,operation){try{return await operation();}catch(error){if(failures.has(error))throw error;fail(category);}}
const endpoint='https://backboard.railway.com/graphql/v2';
const identity=`id projectId environmentId serviceId status createdAt updatedAt statusUpdatedAt deploymentStopped instances { id status }`;
const context=`project(id:$projectId){id name}
 environment(id:$environmentId,projectId:$projectId){id name projectId}
 worker:serviceInstance(environmentId:$environmentId,serviceId:$workerId){serviceId environmentId serviceName latestDeployment{${identity}} activeDeployments{${identity}}}
 deployments(input:{projectId:$projectId,environmentId:$environmentId,serviceId:$workerId},first:3){edges{node{${identity}}}}`;
const variables=`$projectId:String!,$environmentId:String!,$workerId:String!`;
const patchFields=`id environmentId status createdAt updatedAt appliedAt lastAppliedError patch(decryptVariables:false)`;
const inspectQuery=`query RegistrarConfigInspect(${variables}){${context}
 staged:environmentStagedChanges(environmentId:$environmentId){${patchFields} clear:patch(decryptVariables:true)}}`;
const verifyQuery=`query RegistrarConfigVerify(${variables},$patchId:String!){${context}
 receipt:environmentPatch(id:$patchId){${patchFields}}
 pending:environmentStagedChanges(environmentId:$environmentId){${patchFields}}}`;
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
  const response=await during('API_TRANSPORT',()=>fetcher(endpoint,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
   headers:{'content-type':'application/json','project-access-token':token},body:JSON.stringify({query,variables})}));
  if(response.status===401)fail('API_AUTHENTICATION');if(response.status===403)fail('API_PERMISSION');
  if(response.ok!==true&&response.status!==400)fail('API_HTTP');
  const reply=await during('API_RESPONSE',async()=>{const bytes=await response.text();assert.ok(Buffer.byteLength(bytes)<=2_000_000);const parsed=JSON.parse(bytes);assert.ok(parsed&&typeof parsed==='object');return parsed;});
  if(reply.errors!==undefined){
   if(!Array.isArray(reply.errors))fail('API_RESPONSE');
   if(reply.errors.length){
    // Codes are allowlisted, never echoed. An unrecognized/absent code does not
    // establish authentication or permission failure and stays indeterminate.
    const codes=reply.errors.map(e=>e?.extensions?.code);
    if(codes.includes('UNAUTHENTICATED'))fail('API_AUTHENTICATION');
    if(codes.includes('FORBIDDEN'))fail('API_PERMISSION');
    if(codes.includes('GRAPHQL_VALIDATION_FAILED')||codes.includes('GRAPHQL_PARSE_FAILED'))fail('API_QUERY_REJECTED');
    fail('API_GRAPHQL_REJECTED');
   }
  }
  if(response.ok!==true)fail('API_HTTP');
  return checked('API_RESPONSE',()=>{assert.ok(reply.data&&typeof reply.data==='object');return reply.data;});
 };
}
export function checkWorker(data,target){
 checked('TARGET_IDENTITY',()=>{
 assert.equal(data.project?.id,target.projectId);assert.equal(data.project.name,'merry-patience');
 assert.equal(data.environment?.id,target.environmentId);assert.equal(data.environment.projectId,target.projectId);assert.equal(data.environment.name,'production');
 const worker=data.worker;assert.equal(worker?.serviceId,target.workerId);assert.equal(worker.environmentId,target.environmentId);assert.equal(worker.serviceName,'KingdomReleaseCheck');
 });
 const worker=data.worker,d=worker.latestDeployment;
 checked('WORKER_IDENTITY',()=>{assert.equal(d?.id,oldWorker);for(const key of ['projectId','environmentId','serviceId'])assert.equal(d[key],({projectId:target.projectId,environmentId:target.environmentId,serviceId:target.workerId})[key]);});
 checked('WORKER_STOPPED_STATE',()=>{
 assert.equal(d.status,'SUCCESS');assert.equal(d.deploymentStopped,true);
 assert.equal(d.instances?.length,1);assert.equal(d.instances[0].status,'EXITED');assert.ok(d.instances[0].id);
 });
 checked('WORKER_HISTORY',()=>{
 assert.ok(Array.isArray(worker.activeDeployments));assert.ok(worker.activeDeployments.length<=1);
 if(worker.activeDeployments.length)assert.deepEqual(worker.activeDeployments,[d]);
 const rows=data.deployments?.edges?.map(e=>e.node);assert.ok(Array.isArray(rows)&&rows.length>=1&&rows.length<=3);assert.deepEqual(rows[0],d);
 for(const row of rows){
  assert.equal(row.projectId,target.projectId);assert.equal(row.environmentId,target.environmentId);assert.equal(row.serviceId,target.workerId);
  for(const key of ['createdAt','updatedAt'])assert.ok(Number.isFinite(Date.parse(row[key])));
  assert.ok(!['QUEUED','WAITING','NEEDS_APPROVAL','INITIALIZING','BUILDING','DEPLOYING'].includes(row.status));
 }
 });
 return hash({worker,deployments:data.deployments.edges.map(e=>e.node)});
}
// Diagnostic metadata only. Do not recurse into encrypted/decrypted values or
// print arbitrary provider keys (which could themselves contain an ID/secret).
export function encryptedShape(patch,target){
 const kind=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const safeKeys=(v,allowed)=>object(v)?[...new Set(Object.keys(v).map(k=>allowed.includes(k)?k:'<REDACTED_KEY>'))].sort():['<NON_OBJECT>'];
 const rootKeys=['services','sharedVariables','volumes','buckets','privateNetworkDisabled'];
 const workerKeys=['variables','source','networking','configFile','deploy','build','volumeMounts','isDeleted','isCreated','parentServiceId','clusterRole','groupId','haTemplateCode','revertsToTemplateCode','haActiveVariable','clusterWiring'];
 const entryKeys=['encryptedValue','value','defaultValue','description','isOptional','isSealed','generator','createdAt','updatedAt','lastUpdatedAt'];
 const worker=object(patch)&&object(patch.services)?patch.services[target.workerId]:undefined;
 const variables=object(worker)&&object(worker.variables)?worker.variables:undefined;
 return {
  patchKeys:safeKeys(patch,rootKeys),workerKeys:safeKeys(worker,workerKeys),
  variables:Object.fromEntries(registrationKeys.map(name=>{
   const entry=variables?.[name];
   return [name,object(entry)?Object.fromEntries(safeKeys(entry,entryKeys).map(k=>[k,k==='<REDACTED_KEY>'?'<REDACTED>':kind(entry[k])])):{'<ENTRY_TYPE>':kind(entry)}];
  }))
 };
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
 const p=data.staged;
 checked('PATCH_ID',()=>assert.match(p?.id??'',uuid));
 checked('PATCH_ENVIRONMENT',()=>assert.equal(p.environmentId,target.environmentId));
 checked('PATCH_STATUS',()=>assert.equal(p.status,'STAGED'));
 checked('PATCH_APPLIED_AT',()=>assert.equal(p.appliedAt,null));
 checked('PATCH_LAST_APPLIED_ERROR',()=>assert.equal(p.lastAppliedError,null));
 checked('PATCH_CREATED_AT',()=>assert.ok(Number.isFinite(Date.parse(p.createdAt))));
 checked('PATCH_UPDATED_AT',()=>assert.ok(Number.isFinite(Date.parse(p.updatedAt))));
 // environment.unmergedChangesCount is nullable and counts forked-environment
 // differences, NOT staged variable edits. The exact patch itself is authoritative:
 // definitions requires one service, only variables, and precisely our three keys.
 try{checked('PATCH_ENCRYPTED_SHAPE',()=>definitions(p.patch,target,true));}
 catch(error){encryptedShapes.set(error,encryptedShape(p.patch,target));throw error;}
 const clear=checked('PATCH_CLEAR_SHAPE',()=>definitions(p.clear,target,false));
 // This action can install disabled configuration only. Activation is separate.
 checked('REGISTRATION_NOT_DISABLED',()=>assert.equal(clear.KINGDOM_COPY_REGISTRATION_ENABLED.value,'0'));
 checked('REGISTRAR_URL',()=>{
 const db=privateDatabase(clear.KINGDOM_COPY_REGISTRATION_DATABASE_URL.value);
 assert.equal(decodeURIComponent(db.url.username),'kc_copy_registrar');assert.ok(db.url.password);assert.equal(db.name,'Railway');
 });
 checked('REGISTRAR_SCOPE',()=>{
 const s=JSON.parse(clear.KINGDOM_COPY_REGISTRATION_SCOPE.value);
 keys(s,['projectId','environmentId','gameServiceId','workerServiceId','verificationDatabaseServiceId','maintenanceDatabase','clusterDigest','sourceClusterDigest']);
 for(const [k,v] of Object.entries({projectId:target.projectId,environmentId:target.environmentId,gameServiceId:target.gameId,workerServiceId:target.workerId,verificationDatabaseServiceId:target.copyId,maintenanceDatabase:'Railway'}))assert.equal(s[k],v);
 for(const k of ['clusterDigest','sourceClusterDigest'])assert.match(s[k]??'',digest);assert.notEqual(s.clusterDigest,s.sourceClusterDigest);
 });
 // Never publish clear values, encrypted values, or a plaintext credential hash.
 // The digest commits to the stored ciphertext and patch revision, not p.clear.
 return {patchId:p.id,patchDigest:hash({id:p.id,environmentId:p.environmentId,createdAt:p.createdAt,updatedAt:p.updatedAt,patch:p.patch})};
}
function checkClearedPatch(data,original,target){
 checked('PATCH_NOT_CLEARED',()=>{
  const receipt=data.receipt,pending=data.pending;
  assert.equal(receipt?.id,original.id);assert.equal(receipt.environmentId,target.environmentId);assert.equal(receipt.status,'COMMITTED');
  assert.equal(receipt.lastAppliedError,null);assert.equal(receipt.createdAt,original.createdAt);
  assert.ok(Number.isFinite(Date.parse(receipt.appliedAt))&&Date.parse(receipt.appliedAt)>=Date.parse(original.updatedAt));
  assert.ok(Number.isFinite(Date.parse(receipt.updatedAt))&&Date.parse(receipt.updatedAt)>=Date.parse(original.updatedAt));
  assert.equal(canonical(receipt.patch),canonical(original.patch));
  assert.match(pending?.id??'',uuid);assert.equal(pending.environmentId,target.environmentId);
  if(pending.id===receipt.id){
   // Railway may return the just-committed record when nothing is staged.
   for(const key of ['status','createdAt','updatedAt','appliedAt','lastAppliedError','patch'])assert.equal(canonical(pending[key]),canonical(receipt[key]));
  }else{
   // Or a fresh empty staged record. Never equate a missing/API-failed record,
   // a null fork counter, or a new non-empty patch with successful clearance.
   assert.equal(pending.status,'STAGED');assert.equal(pending.appliedAt,null);assert.equal(pending.lastAppliedError,null);
   for(const key of ['createdAt','updatedAt'])assert.ok(Number.isFinite(Date.parse(pending[key])));
   assert.ok(pending.patch&&typeof pending.patch==='object'&&!Array.isArray(pending.patch));
   for(const [key,value] of Object.entries(pending.patch)){
    assert.ok(['services','volumes','buckets','sharedVariables'].includes(key));
    assert.ok(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0);
   }
  }
 });
}
export async function runConfig(env,{api,wait=delay,now=Date.now}={}){
 const operation=checked('WORKFLOW_REQUEST',()=>{const op=validateRequest(env);assert.notEqual(op,'release');
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.GITHUB_JOB,'registrar-config');
 return op;});
 const target=checked('TARGET_CONFIG',()=>targetConfig(env));
 api??=railwayClient(env.RAILWAY_TOKEN);
 const vars={projectId:target.projectId,environmentId:target.environmentId,workerId:target.workerId};
 const first=await during('API_READ',()=>api(inspectQuery,vars)),workerDigest=checkWorker(first,target),plan=checkPatch(first,target);
 if(operation==='registrar-config-inspect')return {kind:'inspection',...plan,workerDeploymentId:oldWorker};
 checked('PATCH_BINDING',()=>{assert.equal(plan.patchId,env.REGISTRAR_CONFIG_PATCH_ID);assert.equal(plan.patchDigest,env.REGISTRAR_CONFIG_PATCH_DIGEST);});
 // Re-read immediately before the single write. Shared workflow concurrency
 // serializes releases; owner must freeze all other Railway editors separately.
 const second=await during('API_READ',()=>api(inspectQuery,vars));checked('PRECOMMIT_WORKER_CHANGED',()=>assert.equal(checkWorker(second,target),workerDigest));checked('PATCH_BINDING',()=>assert.deepEqual(checkPatch(second,target),plan));
 let workflowId;
 try{
  const result=await api(commitMutation,{environmentId:target.environmentId,commitMessage:'Registrar configuration only; run '+env.GITHUB_RUN_ID+'; patch '+plan.patchId});
  workflowId=result.environmentPatchCommitStaged;assert.ok(typeof workflowId==='string'&&workflowId.length>0&&workflowId.length<500);
 }catch{fail('COMMIT_UNCONFIRMED');}
 // Only reads are polled. A timeout or lost acknowledgement NEVER retries write.
 const deadline=now()+60000;
 for(let n=0;n<30;n++){
  const state=await during('API_READ',()=>api(statusQuery,{workflowId})),after=await during('API_READ',()=>api(verifyQuery,{...vars,patchId:plan.patchId}));
  checked('POST_COMMIT_WORKER_CHANGED',()=>assert.equal(checkWorker(after,target),workerDigest));
  const status=state.workflowStatus;checked('CONFIG_WORKFLOW_STATE',()=>{assert.equal(status?.error,null);assert.ok(['Running','Complete'].includes(status.status));});
  if(status.status==='Complete'){
   checkClearedPatch(after,first.staged,target);
   return {kind:'committed',...plan,workerDeploymentId:oldWorker};
  }
  checked('POST_COMMIT_TIMEOUT',()=>assert.ok(now()<deadline));await wait(2000);
 }
 fail('POST_COMMIT_TIMEOUT');
}
async function main(){
 try{
  process.umask(0o077);
  checked('WORKFLOW_REQUEST',()=>assert.ok(process.argv.length===3&&['validate-request','run'].includes(process.argv[2])));
  if(process.argv[2]==='validate-request'){checked('WORKFLOW_REQUEST',()=>validateRequest(process.env));console.log('REGISTRAR_CONFIG_REQUEST: PASS');return;}
  const result=await runConfig(process.env);
  console.log(result.kind==='inspection'?'REGISTRAR_CONFIG_INSPECTION: PASS':'REGISTRAR_CONFIG_COMMIT: PASS');
  if(process.env.GITHUB_STEP_SUMMARY)await during('SUMMARY_WRITE',()=>appendFile(process.env.GITHUB_STEP_SUMMARY,
   'Registrar configuration '+result.kind+' (registration remains OFF)\n\n'+
   'Patch ID: `'+result.patchId+'`\n\nPatch digest: `'+result.patchDigest+'`\n\n'+
   'Worker unchanged: `'+result.workerDeploymentId+'`\n\nNo recovery, deployment, activation or cleanup was requested.\n'));
 }catch(error){console.error('REGISTRAR_CONFIG_FAILURE: '+failureCategory(error));
  if(process.env.REGISTRAR_CONFIG_OPERATION==='registrar-config-inspect'&&failureShape(error))console.error('REGISTRAR_CONFIG_SHAPE: '+JSON.stringify(failureShape(error)));
  console.error('REGISTRAR_CONFIG: FAIL — no retry or recovery is authorized; inspect state read-only.');process.exitCode=1;}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await main();
