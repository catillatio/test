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
const statusQuery='query KingdomImageWorkflow($workflowId:String!){workflowStatus(workflowId:$workflowId){status error}}';
const imageIdentityQuery=`query KingdomImageDeployment($id:String!){deployment(id:$id){${identity} meta}}`;
export const imageReleaseKeys=['KINGDOM_AUTOMATED_RELEASES','KINGDOM_RELEASE_SHA','KINGDOM_RESTORE_TEST_DATABASE','KINGDOM_RELEASE_BACKUP_PROOF','KINGDOM_RELEASE_ARTIFACT_KIND','KINGDOM_RELEASE_IMAGE_REFERENCE','KINGDOM_RELEASE_IMAGE_DIGEST'];
const keys=(value,wanted)=>assert.deepEqual(Object.keys(value??{}).sort(),wanted.slice().sort());

export function emptyImagePatch(pending,environmentId){
 if(pending===null)return;
 assert.ok(pending&&typeof pending==='object');assert.equal(pending.environmentId,environmentId);assert.equal(pending.status,'STAGED');assert.equal(pending.lastAppliedError,null);
 assert.equal(typeof pending.id,'string');assert.equal(pending.appliedAt,null);
 for(const key of ['createdAt','updatedAt'])assert.ok(Number.isFinite(Date.parse(pending[key])));
 const value=pending.patch;assert.ok(value&&typeof value==='object'&&!Array.isArray(value));
 for(const [key,item]of Object.entries(value)){assert.ok(['services','volumes','buckets','sharedVariables'].includes(key));assert.ok(item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).length===0);}
}
async function noPending(data,target,api){
 assert.ok(Object.hasOwn(data,'pending'));
 if(data.pending?.status!=='COMMITTED'){emptyImagePatch(data.pending,target.environmentId);return;}
 // Railway can return its just-committed record as the cleared placeholder.
 // Authenticate that receipt separately; never equate missing data with empty.
 const p=data.pending;assert.match(p.id,uuid);assert.equal(p.environmentId,target.environmentId);assert.equal(p.lastAppliedError,null);
 assert.ok(Number.isFinite(Date.parse(p.appliedAt))&&Number.isFinite(Date.parse(p.updatedAt)));
 const checked=await api(verifyQuery,{...target,patchId:p.id});assert.equal(gameSnapshot(checked,target),gameSnapshot(data,target));
 assert.equal(canonical(checked.receipt),canonical(p));assert.ok(Object.hasOwn(checked,'pending'));
 if(checked.pending?.id===p.id)assert.equal(canonical(checked.pending),canonical(p));
 else emptyImagePatch(checked.pending,target.environmentId);
}
function gameSnapshot(data,target){
 assert.equal(data.project?.id,target.projectId);assert.equal(data.project.name,'merry-patience');
 assert.equal(data.environment?.id,target.environmentId);assert.equal(data.environment.projectId,target.projectId);assert.equal(data.environment.name,'production');
 const game=data.game;assert.equal(game?.serviceId,target.serviceId);assert.equal(game.environmentId,target.environmentId);
 assert.equal(game.startCommand,'node deployment/start.mjs');assert.deepEqual(game.preDeployCommand,['node deployment/migrate.mjs']);
 assert.equal(game.healthcheckPath,'/healthz');assert.equal(game.healthcheckTimeout,120);assert.equal(game.restartPolicyType,'ON_FAILURE');assert.equal(game.rootDirectory,'/knights-reforged');
 // Railway's legacy replica field can be null when regional counts are used.
 // Require explicit one-replica configuration, never interpret null as one.
 const regions=data.environment.config?.services?.[target.serviceId]?.deploy?.multiRegionConfig;
 let regionalReplicas=null;
 if(regions!==undefined){
  assert.ok(regions&&typeof regions==='object'&&!Array.isArray(regions)&&Object.keys(regions).length>0);
  regionalReplicas=Object.fromEntries(Object.entries(regions).map(([region,value])=>{assert.match(region,/^[a-z0-9-]+$/);assert.ok(Number.isInteger(value?.numReplicas)&&value.numReplicas>=0);return [region,value.numReplicas];}));
  assert.equal(Object.values(regionalReplicas).reduce((sum,n)=>sum+n,0),1);
 }
 if(game.numReplicas===null)assert.notEqual(regionalReplicas,null);else assert.equal(game.numReplicas,1);
 assert.ok(Array.isArray(data.inFlight?.edges));assert.equal(data.inFlight.edges.length,0);
 assert.ok(Array.isArray(game.activeDeployments));assert.equal(game.activeDeployments.length,1);
 const active=game.activeDeployments[0],latest=game.latestDeployment;
 for(const d of [latest,active]){
  assert.match(d?.id??'',uuid);for(const key of ['projectId','environmentId','serviceId'])assert.equal(d[key],target[key]);
  for(const key of ['createdAt','updatedAt'])assert.ok(Number.isFinite(Date.parse(d[key])));
  assert.ok(Date.parse(d.updatedAt)>=Date.parse(d.createdAt));assert.equal(typeof d.deploymentStopped,'boolean');assert.ok(Array.isArray(d.instances));
  for(const instance of d.instances)assert.ok(typeof instance.id==='string'&&instance.id.length>0);
 }
 assert.equal(active.status,'SUCCESS');assert.equal(active.deploymentStopped,false);assert.equal(active.instances.length,1);assert.equal(active.instances[0].status,'RUNNING');
 if(latest.id===active.id)assert.deepEqual(latest,active);
 else{
  // A failed/removed/skipped attempt is not the running deployment. Neither
  // history scanning nor arbitrary selection of an older success is allowed.
  assert.ok(['FAILED','REMOVED','SKIPPED'].includes(latest.status));assert.ok(latest.instances.every(i=>i.status==='EXITED'));
  assert.ok(Date.parse(latest.createdAt)>=Date.parse(active.createdAt));
 }
 // Source changes are intentional; running deployment/config identity is not.
 const deployment=d=>({...Object.fromEntries(['id','projectId','environmentId','serviceId','status','createdAt','updatedAt','deploymentStopped'].map(k=>[k,d[k]])),instances:d.instances.map(({id,status})=>({id,status}))});
 const snapshot=Object.fromEntries(['serviceId','environmentId','startCommand','preDeployCommand','healthcheckPath','healthcheckTimeout','numReplicas','restartPolicyType','rootDirectory'].map(k=>[k,game[k]]));
 // Only non-secret, selected config enters the digest, never environment vars.
 return canonical({...snapshot,regionalReplicas,latestDeployment:deployment(latest),activeDeployments:[deployment(active)]});
}
export async function preflightImageTarget(settings,approval,{token,api=railwayClient(token)}={}){
 const definition=checkImageCandidate(approval.candidate,{sourceSha:settings.sha});
 const target={projectId:settings.projectId,environmentId:settings.environmentId,serviceId:settings.gameServiceId};
 const before=await api(imageInspectQuery,target);await noPending(before,target,api);const baseline=gameSnapshot(before,target);
 const setup=settings.registrySetup??'preconfigured';assert.ok(['preconfigured','install-read-only'].includes(setup));
 const source=before.game.source;assert.ok(source&&typeof source==='object');
 if(setup==='install-read-only'||source.image===null){assert.equal(source.image,null);assert.equal(source.repo,'catillatio/test');}
 else{assert.equal(source.repo,null);assert.ok(typeof source.image==='string'&&source.image.startsWith(imageRepository+'@sha256:')&&/^sha256:[a-f0-9]{64}$/.test(source.image.split('@')[1]));}
 return {target,definition,baseline,source:{image:source.image,repo:source.repo}};
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
