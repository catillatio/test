// The game-only image switch. Uses the existing authenticated client and exact
// committed-patch receipt verifier. No source upload, retry, latest fallback or DB.
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {railwayClient,checkClearedPatch} from './registrar-config.mjs';
import {uuid} from './protocol.mjs';
import {canonical,checkImageCandidate,imageRepository,imageRegistrySetup,imageRegistryCredentials} from './image-policy.mjs';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {releaseInputs} from './guard.mjs';

const identity='id projectId environmentId serviceId status createdAt updatedAt deploymentStopped instances{id status}';
const patch='id environmentId status createdAt updatedAt appliedAt lastAppliedError patch(decryptVariables:true)';
const scope=`project(id:$projectId){id name}
 environment(id:$environmentId,projectId:$projectId){id projectId name config}
 game:serviceInstance(environmentId:$environmentId,serviceId:$serviceId){serviceId environmentId startCommand preDeployCommand healthcheckPath healthcheckTimeout numReplicas restartPolicyType rootDirectory source{image repo} latestDeployment{${identity}} activeDeployments{${identity}}}
 inFlight:deployments(input:{projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId,status:{in:[WAITING,NEEDS_APPROVAL,QUEUED,INITIALIZING,BUILDING,DEPLOYING,REMOVING]}},first:1){edges{node{id}}}`;
const variables='$projectId:String!,$environmentId:String!,$serviceId:String!';
export const imageInspectQuery=`query KingdomImageInspect(${variables}){${scope} pending:environmentStagedChanges(environmentId:$environmentId){${patch}}}`;
export const imageStageMutation=`mutation KingdomImageStage($environmentId:String!,$input:EnvironmentConfig!,$merge:Boolean!){environmentStageChanges(environmentId:$environmentId,input:$input,merge:$merge){${patch}}}`;
export const imageCommitMutation=`mutation KingdomImageCommit($environmentId:String!,$commitMessage:String!){environmentPatchCommitStaged(environmentId:$environmentId,commitMessage:$commitMessage,skipDeploys:true)}`;
export const imageDeployMutation=`mutation KingdomImageDeploy($environmentId:String!,$serviceId:String!){serviceInstanceDeployV2(environmentId:$environmentId,serviceId:$serviceId)}`;
const verifyQuery=`query KingdomImageReceipt(${variables},$patchId:String!){${scope} receipt:environmentPatch(id:$patchId){${patch}} pending:environmentStagedChanges(environmentId:$environmentId){${patch}}}`;
export {verifyQuery as imageReceiptQuery};
const statusQuery='query KingdomImageWorkflow($workflowId:String!){workflowStatus(workflowId:$workflowId){status error}}';
const imageIdentityQuery=`query KingdomImageDeployment($id:String!){deployment(id:$id){${identity} meta}}`;
export const imageReleaseKeys=['KINGDOM_AUTOMATED_RELEASES','KINGDOM_RELEASE_SHA','KINGDOM_RESTORE_TEST_DATABASE','KINGDOM_RELEASE_BACKUP_PROOF','KINGDOM_RELEASE_ARTIFACT_KIND','KINGDOM_RELEASE_IMAGE_REFERENCE','KINGDOM_RELEASE_IMAGE_DIGEST'];
const keys=(value,wanted)=>assert.deepEqual(Object.keys(value??{}).sort(),wanted.slice().sort());

// Optional observation runs before each existing assertion. It cannot approve or
// suppress a check; operational callers do not supply it. Values stay private.
const observed=(observe,field,expected,value,check)=>{if(observe)observe(field,expected,structuredClone(value));check();};
export function emptyImagePatch(pending,environmentId,observe){
 const check=(field,expected,value,fn)=>observed(observe,field,expected,value,fn);
 if(pending===null)return;
 check('pending','OBJECT',pending,()=>assert.ok(pending&&typeof pending==='object'));
 check('pending.environmentId','TARGET_MATCH',pending.environmentId===environmentId,()=>assert.equal(pending.environmentId,environmentId));
 check('pending.status','STAGED',pending.status,()=>assert.equal(pending.status,'STAGED'));
 check('pending.lastAppliedError','NULL',pending.lastAppliedError,()=>assert.equal(pending.lastAppliedError,null));
 check('pending.id','STRING',pending.id,()=>assert.equal(typeof pending.id,'string'));
 check('pending.appliedAt','NULL',pending.appliedAt,()=>assert.equal(pending.appliedAt,null));
 for(const key of ['createdAt','updatedAt'])check('pending.'+key,'VALID_TIMESTAMP',Number.isFinite(Date.parse(pending[key])),()=>assert.ok(Number.isFinite(Date.parse(pending[key]))));
 const value=pending.patch;check('pending.patch','OBJECT',value,()=>assert.ok(value&&typeof value==='object'&&!Array.isArray(value)));
 for(const [key,item]of Object.entries(value)){
  check('pending.patch.keys','ALLOWED_EMPTY_CONTAINERS',['services','volumes','buckets','sharedVariables'].includes(key),()=>assert.ok(['services','volumes','buckets','sharedVariables'].includes(key)));
  check('pending.patch.container','EMPTY_OBJECT',item,()=>assert.ok(item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).length===0));
 }
}
async function noPending(data,target,api,observe){
 const check=(field,expected,value,fn)=>observed(observe,field,expected,value,fn);
 check('pending.present','TRUE',Object.hasOwn(data,'pending'),()=>assert.ok(Object.hasOwn(data,'pending')));
 if(data.pending?.status!=='COMMITTED'){emptyImagePatch(data.pending,target.environmentId,observe);return;}
 // Railway can return its just-committed record as the cleared placeholder.
 // Authenticate that receipt separately; never equate missing data with empty.
 const p=data.pending;
 check('pending.id','UUID',typeof p.id==='string'&&uuid.test(p.id),()=>assert.match(p.id,uuid));
 check('pending.environmentId','TARGET_MATCH',p.environmentId===target.environmentId,()=>assert.equal(p.environmentId,target.environmentId));
 check('pending.lastAppliedError','NULL',p.lastAppliedError,()=>assert.equal(p.lastAppliedError,null));
 check('pending.receipt.timestamps','VALID_TIMESTAMPS',Number.isFinite(Date.parse(p.appliedAt))&&Number.isFinite(Date.parse(p.updatedAt)),()=>assert.ok(Number.isFinite(Date.parse(p.appliedAt))&&Number.isFinite(Date.parse(p.updatedAt))));
 const checked=await api(verifyQuery,{...target,patchId:p.id});
 const after=gameSnapshot(checked,target,observe),before=gameSnapshot(data,target,observe);
 check('pending.receipt.target','UNCHANGED',after===before,()=>assert.equal(after,before));
 check('pending.receipt.binding','EXACT_MATCH',canonical(checked.receipt)===canonical(p),()=>assert.equal(canonical(checked.receipt),canonical(p)));
 check('pending.receipt.pendingPresent','TRUE',Object.hasOwn(checked,'pending'),()=>assert.ok(Object.hasOwn(checked,'pending')));
 if(checked.pending?.id===p.id)check('pending.receipt.pendingBinding','EXACT_MATCH',canonical(checked.pending)===canonical(p),()=>assert.equal(canonical(checked.pending),canonical(p)));
 else emptyImagePatch(checked.pending,target.environmentId,observe);
}
function gameSnapshot(data,target,observe){
 const check=(field,expected,value,fn)=>observed(observe,field,expected,value,fn);
 check('project.id','TARGET_MATCH',data.project?.id===target.projectId,()=>assert.equal(data.project?.id,target.projectId));
 check('project.name','EXPECTED_NAME',data.project.name==='merry-patience',()=>assert.equal(data.project.name,'merry-patience'));
 check('environment.id','TARGET_MATCH',data.environment?.id===target.environmentId,()=>assert.equal(data.environment?.id,target.environmentId));
 check('environment.projectId','TARGET_MATCH',data.environment.projectId===target.projectId,()=>assert.equal(data.environment.projectId,target.projectId));
 check('environment.name','PRODUCTION',data.environment.name==='production',()=>assert.equal(data.environment.name,'production'));
 const game=data.game;
 check('game.serviceId','TARGET_MATCH',game?.serviceId===target.serviceId,()=>assert.equal(game?.serviceId,target.serviceId));
 check('game.environmentId','TARGET_MATCH',game.environmentId===target.environmentId,()=>assert.equal(game.environmentId,target.environmentId));
 check('game.startCommand','EXPECTED_START',game.startCommand==='node deployment/start.mjs',()=>assert.equal(game.startCommand,'node deployment/start.mjs'));
 check('game.preDeployCommand','EXPECTED_MIGRATION',canonical(game.preDeployCommand)===canonical(['node deployment/migrate.mjs']),()=>assert.deepEqual(game.preDeployCommand,['node deployment/migrate.mjs']));
 check('game.healthcheckPath','EXPECTED_HEALTH_PATH',game.healthcheckPath==='/healthz',()=>assert.equal(game.healthcheckPath,'/healthz'));
 check('game.healthcheckTimeout','120',game.healthcheckTimeout,()=>assert.equal(game.healthcheckTimeout,120));
 check('game.restartPolicyType','ON_FAILURE',game.restartPolicyType,()=>assert.equal(game.restartPolicyType,'ON_FAILURE'));
 check('game.rootDirectory','EXPECTED_ROOT',game.rootDirectory==='/knights-reforged',()=>assert.equal(game.rootDirectory,'/knights-reforged'));
 // Railway's legacy replica field can be null when regional counts are used.
 // Require explicit one-replica configuration, never interpret null as one.
 const regions=data.environment.config?.services?.[target.serviceId]?.deploy?.multiRegionConfig;
 let regionalReplicas=null;
 if(regions!==undefined){
  check('game.regionalReplicas','NONEMPTY_OBJECT',regions,()=>assert.ok(regions&&typeof regions==='object'&&!Array.isArray(regions)&&Object.keys(regions).length>0));
  regionalReplicas=Object.fromEntries(Object.entries(regions).map(([region,value])=>{
   check('game.regionalReplicas.region','VALID_REGION',/^[a-z0-9-]+$/.test(region),()=>assert.match(region,/^[a-z0-9-]+$/));
   check('game.regionalReplicas.count','NONNEGATIVE_INTEGER',value?.numReplicas,()=>assert.ok(Number.isInteger(value?.numReplicas)&&value.numReplicas>=0));return [region,value.numReplicas];
  }));
  check('game.regionalReplicas.total','1',Object.values(regionalReplicas).reduce((sum,n)=>sum+n,0),()=>assert.equal(Object.values(regionalReplicas).reduce((sum,n)=>sum+n,0),1));
 }
 if(game.numReplicas===null)check('game.numReplicas','EXPLICIT_REGIONAL_EVIDENCE',regionalReplicas!==null,()=>assert.notEqual(regionalReplicas,null));
 else check('game.numReplicas','1',game.numReplicas,()=>assert.equal(game.numReplicas,1));
 check('inFlight.edges','ARRAY',data.inFlight?.edges,()=>assert.ok(Array.isArray(data.inFlight?.edges)));
 check('inFlight.count','0',data.inFlight.edges.length,()=>assert.equal(data.inFlight.edges.length,0));
 check('game.activeDeployments','ARRAY',game.activeDeployments,()=>assert.ok(Array.isArray(game.activeDeployments)));
 check('game.activeDeployments.count','1',game.activeDeployments.length,()=>assert.equal(game.activeDeployments.length,1));
 const active=game.activeDeployments[0],latest=game.latestDeployment;
 for(const [name,d] of [['latest',latest],['active',active]]){
  check(name+'.id','UUID',typeof d?.id==='string'&&uuid.test(d.id),()=>assert.match(d?.id??'',uuid));
  for(const key of ['projectId','environmentId','serviceId'])check(name+'.'+key,'TARGET_MATCH',d[key]===target[key],()=>assert.equal(d[key],target[key]));
  for(const key of ['createdAt','updatedAt'])check(name+'.'+key,'VALID_TIMESTAMP',Number.isFinite(Date.parse(d[key])),()=>assert.ok(Number.isFinite(Date.parse(d[key]))));
  check(name+'.timestampOrder','VALID_ORDER',Date.parse(d.updatedAt)>=Date.parse(d.createdAt),()=>assert.ok(Date.parse(d.updatedAt)>=Date.parse(d.createdAt)));
  check(name+'.deploymentStopped','BOOLEAN',d.deploymentStopped,()=>assert.equal(typeof d.deploymentStopped,'boolean'));
  check(name+'.instances','ARRAY',d.instances,()=>assert.ok(Array.isArray(d.instances)));
  for(const instance of d.instances)check(name+'.instance.id','NONEMPTY_STRING',typeof instance.id==='string'&&instance.id.length>0,()=>assert.ok(typeof instance.id==='string'&&instance.id.length>0));
 }
 check('active.status','SUCCESS',active.status,()=>assert.equal(active.status,'SUCCESS'));
 check('active.deploymentStopped','FALSE',active.deploymentStopped,()=>assert.equal(active.deploymentStopped,false));
 check('active.instances.count','1',active.instances.length,()=>assert.equal(active.instances.length,1));
 check('active.instance.status','RUNNING',active.instances[0].status,()=>assert.equal(active.instances[0].status,'RUNNING'));
 if(latest.id===active.id)check('latest.activeBinding','EXACT_MATCH',canonical(latest)===canonical(active),()=>assert.deepEqual(latest,active));
 else{
  // A failed/removed/skipped attempt is not the running deployment. Neither
  // history scanning nor arbitrary selection of an older success is allowed.
  check('latest.status','TERMINAL_ATTEMPT',latest.status,()=>assert.ok(['FAILED','REMOVED','SKIPPED'].includes(latest.status)));
  check('latest.instances.status','ALL_EXITED',latest.instances.map(i=>i.status),()=>assert.ok(latest.instances.every(i=>i.status==='EXITED')));
  check('latest.activeCreatedOrder','VALID_ORDER',Date.parse(latest.createdAt)>=Date.parse(active.createdAt),()=>assert.ok(Date.parse(latest.createdAt)>=Date.parse(active.createdAt)));
 }
 // Source changes are intentional; running deployment/config identity is not.
 const deployment=d=>({...Object.fromEntries(['id','projectId','environmentId','serviceId','status','createdAt','updatedAt','deploymentStopped'].map(k=>[k,d[k]])),instances:d.instances.map(({id,status})=>({id,status}))});
 const snapshot=Object.fromEntries(['serviceId','environmentId','startCommand','preDeployCommand','healthcheckPath','healthcheckTimeout','numReplicas','restartPolicyType','rootDirectory'].map(k=>[k,game[k]]));
 // Only non-secret, selected config enters the digest, never environment vars.
 return canonical({...snapshot,regionalReplicas,latestDeployment:deployment(latest),activeDeployments:[deployment(active)]});
}
export async function preflightImageTarget(settings,approval,{token,api=railwayClient(token)}={}){
 const definition=checkImageCandidate(approval.candidate,{sourceSha:settings.sha});
 return {...await inspectImageTargetState(settings,{api}),definition};
}
// Shared READ ONLY provider validation. No image publication or mutation path.
export async function inspectImageTargetState(settings,{token,api=railwayClient(token),observe}={}){
 const check=(field,expected,value,fn)=>observed(observe,field,expected,value,fn);
 const target={projectId:settings.projectId,environmentId:settings.environmentId,serviceId:settings.gameServiceId};
 const before=await api(imageInspectQuery,target);await noPending(before,target,api,observe);const baseline=gameSnapshot(before,target,observe);
 const setup=settings.registrySetup??'preconfigured';check('registrySetup','KNOWN_MODE',['preconfigured','install-read-only'].includes(setup),()=>assert.ok(['preconfigured','install-read-only'].includes(setup)));
 const source=before.game.source;check('game.source','OBJECT',source,()=>assert.ok(source&&typeof source==='object'));
 if(setup==='install-read-only'||source.image===null){
  check('game.source.image','NULL',source.image,()=>assert.equal(source.image,null));
  check('game.source.repo','EXPECTED_REPOSITORY',source.repo==='catillatio/test',()=>assert.equal(source.repo,'catillatio/test'));
 }else{
  check('game.source.repo','NULL',source.repo,()=>assert.equal(source.repo,null));
  const pinned=typeof source.image==='string'&&source.image.startsWith(imageRepository+'@sha256:')&&/^sha256:[a-f0-9]{64}$/.test(source.image.split('@')[1]);
  check('game.source.image','PINNED_PRIVATE_IMAGE',pinned,()=>assert.ok(pinned));
 }
 return {target,baseline,source:{image:source.image,repo:source.repo}};
}
function checkCredentials(credentials){
 keys(credentials,['username','password']);assert.equal(credentials.username,'catillatio');
 assert.ok(typeof credentials.password==='string'&&credentials.password.trim()&&credentials.password===credentials.password.trim()&&credentials.password.length<=8192&&!/[\r\n]/.test(credentials.password));
}
export function checkImagePatch(p,target,reference,values,credentials){
 assert.match(p?.id??'',uuid);assert.equal(p.environmentId,target.environmentId);assert.equal(p.status,'STAGED');assert.equal(p.appliedAt,null);assert.equal(p.lastAppliedError,null);
 assert.ok(Number.isFinite(Date.parse(p.createdAt))&&Date.parse(p.updatedAt)>=Date.parse(p.createdAt));
 keys(p.patch,['services']);keys(p.patch.services,[target.serviceId]);const service=p.patch.services[target.serviceId];keys(service,credentials?['source','variables','deploy']:['source','variables']);
 if(credentials){
  checkCredentials(credentials);
  keys(service.deploy,['registryCredentials']);keys(service.deploy.registryCredentials,['username','password']);
  assert.equal(service.deploy.registryCredentials.username,credentials.username);assert.equal(service.deploy.registryCredentials.password,credentials.password);
 }
 keys(service.source,['image','repo']);assert.equal(service.source.image,reference);assert.equal(service.source.repo,null);
 keys(values,imageReleaseKeys);keys(service.variables,imageReleaseKeys);
 for(const name of imageReleaseKeys){
  const value=service.variables[name];assert.ok(value&&typeof value==='object'&&!Array.isArray(value));
  assert.ok(Object.keys(value).every(k=>['value','isSealed','isOptional'].includes(k)));assert.equal(value.value,values[name]);
  if(value.isOptional!==undefined)assert.equal(value.isOptional,false);if(value.isSealed!==undefined)assert.equal(typeof value.isSealed,'boolean');
 }
 return p;
}
export async function verifyImageDeployment(deploymentId,target,reference,{api}={}){
 assert.match(deploymentId,uuid);const data=await api(imageIdentityQuery,{id:deploymentId}),d=data.deployment;
 assert.equal(d?.id,deploymentId);for(const key of ['projectId','environmentId','serviceId'])assert.equal(d[key],target[key]);
 assert.ok(d.meta&&typeof d.meta==='object'&&!Array.isArray(d.meta));assert.equal(d.meta.image,reference);
 assert.ok(['WAITING','QUEUED','INITIALIZING','BUILDING','DEPLOYING','SUCCESS'].includes(d.status));return d;
}
export async function deployImage(settings,approval,values,{token,api=railwayClient(token),wait=delay,log=()=>{},now=Date.now,credentials}={}){
 const definition=checkImageCandidate(approval.candidate,{sourceSha:settings.sha});
 assert.equal(credentials!==undefined,(settings.registrySetup??'preconfigured')==='install-read-only');if(credentials)checkCredentials(credentials);
 const target={projectId:settings.projectId,environmentId:settings.environmentId,serviceId:settings.gameServiceId};for(const id of Object.values(target))assert.match(id,uuid);
 keys(values,imageReleaseKeys);assert.equal(values.KINGDOM_AUTOMATED_RELEASES,'1');assert.equal(values.KINGDOM_RELEASE_SHA,settings.sha);assert.equal(values.KINGDOM_RELEASE_ARTIFACT_KIND,'oci-image-v1');
 assert.equal(values.KINGDOM_RELEASE_IMAGE_REFERENCE,definition.reference);assert.equal(values.KINGDOM_RELEASE_IMAGE_DIGEST,definition.manifestDigest);assert.ok(values.KINGDOM_RELEASE_BACKUP_PROOF);
 const {baseline,source}=await preflightImageTarget(settings,approval,{api});
 assert.match(settings.imageTargetDigest??'',/^[a-f0-9]{64}$/);assert.equal(createHash('sha256').update(baseline).digest('hex'),settings.imageTargetDigest);
 const patchValue={services:{[target.serviceId]:{...(credentials?{deploy:{registryCredentials:credentials}}:{}),source:{image:definition.reference,repo:null},variables:Object.fromEntries(imageReleaseKeys.map(k=>[k,{value:values[k]}]))}}};
 // Merge preserves any competing edit; the strict post-stage scope check then
 // rejects it instead of silently discarding another editor's pending work.
 const staged=checkImagePatch((await api(imageStageMutation,{environmentId:target.environmentId,input:patchValue,merge:true})).environmentStageChanges,target,definition.reference,values,credentials);log('PATCH_STAGED');
 const fresh=await api(imageInspectQuery,target);assert.equal(gameSnapshot(fresh,target),baseline);assert.deepEqual(fresh.game.source,source);
 checkImagePatch(fresh.pending,target,definition.reference,values,credentials);assert.equal(fresh.pending.id,staged.id);assert.equal(fresh.pending.updatedAt,staged.updatedAt);assert.equal(canonical(fresh.pending.patch),canonical(staged.patch));
 let workflowId;
 // Exactly one mutation; a lost reply is uncertain and never retried.
 workflowId=(await api(imageCommitMutation,{environmentId:target.environmentId,commitMessage:'Protected exact-image release '+settings.sha})).environmentPatchCommitStaged;
 assert.ok(typeof workflowId==='string'&&workflowId.length>0&&workflowId.length<=500);
 const deadline=now()+60000;let committed=false;
 for(let n=0;n<30;n++){
  const state=(await api(statusQuery,{workflowId})).workflowStatus;assert.equal(state?.error,null);assert.ok(['Running','Complete'].includes(state.status));
  const after=await api(verifyQuery,{...target,patchId:staged.id});assert.equal(gameSnapshot(after,target),baseline);
  if(state.status==='Complete'){
   checkClearedPatch(after,staged,target);assert.equal(after.game.source?.image,definition.reference);assert.equal(after.game.source.repo,null);committed=true;break;
  }
  assert.ok(now()<deadline);await wait(2000);
 }
 assert.ok(committed);log('CONFIG_COMMITTED_NO_DEPLOY');
 const predeploy=await api(verifyQuery,{...target,patchId:staged.id});assert.equal(gameSnapshot(predeploy,target),baseline);checkClearedPatch(predeploy,staged,target);
 assert.equal(predeploy.game.source?.image,definition.reference);assert.equal(predeploy.game.source.repo,null);
 const deploymentId=(await api(imageDeployMutation,{environmentId:target.environmentId,serviceId:target.serviceId})).serviceInstanceDeployV2;assert.match(deploymentId??'',uuid);
 await verifyImageDeployment(deploymentId,target,definition.reference,{api});log('DEPLOYMENT_QUEUED');return deploymentId;
}
async function main(){
 try{
  assert.equal(process.argv[2],'preflight');const env=process.env,settings=releaseInputs(env);assert.equal(settings.gameTransport,'oci-image-v1');
  const registrySetup=imageRegistrySetup(env);settings.registrySetup=registrySetup;
  if(registrySetup==='preconfigured')assert.equal(env.KINGDOM_GAME_IMAGE_REGISTRY_READY,'true');
  else imageRegistryCredentials(env); // scope was authenticated by image.mjs verify before this read-only step
  const approval=JSON.parse(await readFile(join(env.RUNNER_TEMP,'verified-image-candidate.json'),'utf8'));
  const {baseline}=await preflightImageTarget(settings,approval,{token:env.RAILWAY_TOKEN});
  const now=Date.now(),record={sha:settings.sha,jobId:settings.id,registrySetup,definitionDigest:approval.definitionDigest,checkedAt:now,expiresAt:now+2700000,
   runningTargetDigest:createHash('sha256').update(baseline).digest('hex')};
  await writeFile(join(env.RUNNER_TEMP,'verified-image-target.json'),JSON.stringify(record),{mode:0o600});console.log('IMAGE_TARGET_PREFLIGHT: PASS');
 }catch{console.error('IMAGE_TARGET_PREFLIGHT: FAIL — no recovery or mutation was authorized.');process.exitCode=1;}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await main();
