import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deployImage,preflightImageTarget,emptyImagePatch,imageReleaseKeys,imageInspectQuery} from '../deployment/release/image-deploy.mjs';
import {canonical} from '../deployment/release/image-policy.mjs';
import {candidate,approval,ids} from './fixtures/release-image.mjs';
const secret='synthetic-private-proof provider-token https://private.invalid/?credential=fixture';
const oldId='77777777-7777-4777-8777-777777777777',newId='88888888-8888-4888-8888-888888888888',patchId='99999999-9999-4999-8999-999999999999';
const failedId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(mode='success',{install=false,failedLatest=false,regional=false,edit}={}){
 const target={projectId:ids[0],environmentId:ids[1],serviceId:ids[2]},trace=[],logs=[];let staged,receipt,clock=0,inspectCount=0;
 const identity={id:oldId,...target,status:'SUCCESS',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:01:00Z',deploymentStopped:false,instances:[{id:'running-game-instance',status:'RUNNING'}]};
 let game={serviceId:target.serviceId,environmentId:target.environmentId,startCommand:'node deployment/start.mjs',preDeployCommand:['node deployment/migrate.mjs'],healthcheckPath:'/healthz',healthcheckTimeout:120,numReplicas:1,restartPolicyType:'ON_FAILURE',rootDirectory:'/knights-reforged',source:{image:null,repo:'catillatio/test'},latestDeployment:identity,activeDeployments:[structuredClone(identity)]};
 if(failedLatest)game.latestDeployment={...structuredClone(identity),id:failedId,status:'FAILED',createdAt:'2026-10-01T01:00:00Z',updatedAt:'2026-10-01T01:01:00Z',deploymentStopped:true,instances:[]};
 if(regional)game.numReplicas=null;
 const {source,...snapshot}=game;
 const settings={registrySetup:install?'install-read-only':'preconfigured',sha:candidate().sha,projectId:target.projectId,environmentId:target.environmentId,gameServiceId:target.serviceId,imageTargetDigest:createHash('sha256').update(canonical({...snapshot,regionalReplicas:regional?{iad:1}:null})).digest('hex')};
 const values={KINGDOM_AUTOMATED_RELEASES:'1',KINGDOM_RELEASE_SHA:candidate().sha,KINGDOM_RESTORE_TEST_DATABASE:'kc_fixture_restore_test',KINGDOM_RELEASE_BACKUP_PROOF:secret,KINGDOM_RELEASE_ARTIFACT_KIND:'oci-image-v1',KINGDOM_RELEASE_IMAGE_REFERENCE:candidate().reference,KINGDOM_RELEASE_IMAGE_DIGEST:candidate().manifestDigest};
 const cleared=()=>mode==='same_committed_placeholder'?structuredClone(receipt):mode==='empty_placeholder'?{id:'opaque-empty-id',environmentId:target.environmentId,status:'STAGED',appliedAt:null,lastAppliedError:null,createdAt:'2026-10-02T00:00:01Z',updatedAt:'2026-10-02T00:00:01Z',patch:{}}:null;
 const base=pending=>{
  const b={project:{id:target.projectId,name:'merry-patience'},environment:{id:target.environmentId,projectId:target.projectId,name:'production',config:{services:{[target.serviceId]:{deploy:regional?{multiRegionConfig:{iad:{numReplicas:1}}}:{},variables:{PRIVATE:{value:secret}}}}}},game:structuredClone(game),inFlight:{edges:[]},pending};
  edit?.(b,{staged:!!staged,committed:!!receipt});return b;
 };
 const api=async(query,v)=>{
  if(query.startsWith('query KingdomImageInspect')){
   trace.push('inspect');inspectCount++;
   let pending=receipt?cleared():staged?structuredClone(staged):null;
   if(mode==='unrelated_pending'&&!staged)pending={environmentId:target.environmentId,status:'STAGED',lastAppliedError:null,patch:{services:{[ids[4]]:{variables:{PRIVATE:{value:secret}}}}}};
   if(staged&&!receipt&&mode==='revision_race')pending.updatedAt='2026-10-02T00:01:00Z';
   const b=base(pending);
   if(staged&&!receipt&&mode==='parent_changed')b.game.latestDeployment.updatedAt='2026-10-01T00:02:00Z';
   if(mode==='missing_pending')delete b.pending;
   if(mode==='wrong_target')b.environment.projectId=ids[5];
   if(mode==='disabled_migration')b.game.preDeployCommand=[];
   if(mode==='already_image')b.game.source={image:candidate().reference,repo:null};
   if(mode==='other_repo')b.game.source.repo='other/repository';
   if(staged&&!receipt&&mode==='credential_race')b.pending.patch.services[target.serviceId].deploy.registryCredentials.password='changed';
   return b;
  }
  if(query.startsWith('mutation KingdomImageStage')){
   trace.push('stage');assert.equal(v.environmentId,target.environmentId);assert.equal(v.merge,true);
   staged={id:patchId,environmentId:target.environmentId,status:'STAGED',createdAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',appliedAt:null,lastAppliedError:null,patch:structuredClone(v.input)};
   if(mode==='stage_ack_lost')throw Error(secret);
   if(mode==='stage_unrelated')staged.patch.services[ids[4]]={variables:{PRIVATE:{value:secret}}};
   if(mode==='stage_wrong_value')staged.patch.services[target.serviceId].variables.KINGDOM_RELEASE_BACKUP_PROOF.value='changed';
   if(mode==='credential_missing')delete staged.patch.services[target.serviceId].deploy.registryCredentials;
   if(mode==='credential_changed')staged.patch.services[target.serviceId].deploy.registryCredentials.password='changed';
   if(mode==='credential_extra')staged.patch.services[target.serviceId].deploy.extra=true;
   if(mode==='credential_wrong_path'){const svc=staged.patch.services[target.serviceId];svc.source.registryCredentials=svc.deploy.registryCredentials;delete svc.deploy;}
   return {environmentStageChanges:structuredClone(staged)};
  }
  if(query.startsWith('mutation KingdomImageCommit')){
   trace.push('commit');assert.match(query,/skipDeploys:true/);assert.equal(v.environmentId,target.environmentId);assert.equal(inspectCount,2);
   receipt={...structuredClone(staged),status:'COMMITTED',appliedAt:'2026-10-02T00:00:01Z',updatedAt:'2026-10-02T00:00:01Z'};
   game.source={image:candidate().reference,repo:null};
   if(mode==='commit_ack_lost')throw Error(secret);
   return {environmentPatchCommitStaged:'opaque-workflow-receipt'};
  }
  if(query.startsWith('query KingdomImageWorkflow')){
   trace.push('workflow');assert.equal(v.workflowId,'opaque-workflow-receipt');
   return {workflowStatus:{status:mode==='workflow_timeout'?'Running':'Complete',error:mode==='workflow_failed'?secret:null}};
  }
  if(query.startsWith('query KingdomImageReceipt')){
   trace.push('receipt');assert.equal(v.patchId,patchId);
   const b={...base(cleared()),receipt:structuredClone(receipt)};
   if(mode==='receipt_wrong_id')b.receipt.id=ids[5];
   if(mode==='receipt_changed_patch')b.receipt.patch.services[target.serviceId].source.image='changed';
   if(mode==='credential_receipt_changed')b.receipt.patch.services[target.serviceId].deploy.registryCredentials.password='changed';
   if(mode==='pending_race')b.pending={id:ids[5],environmentId:target.environmentId,status:'STAGED',patch:{services:{[ids[4]]:{variables:{PRIVATE:{value:secret}}}}}};
   if(mode==='unexpected_restart')b.game.latestDeployment.id=newId;
   if(mode==='source_not_applied')b.game.source.image=null;
   return b;
  }
  if(query.startsWith('mutation KingdomImageDeploy')){
   trace.push('deploy');assert.deepEqual(v,{environmentId:target.environmentId,serviceId:target.serviceId});
   if(mode==='deploy_ack_lost')throw Error(secret);
   return {serviceInstanceDeployV2:newId};
  }
  if(query.startsWith('query KingdomImageDeployment')){
   trace.push('identity');assert.equal(v.id,newId);
   return {deployment:{...identity,id:newId,status:'QUEUED',serviceId:mode==='wrong_deployment_service'?ids[4]:target.serviceId,
    snapshotId:'internal-image-snapshot-is-allowed',meta:{image:mode==='wrong_deployment_image'?'ghcr.io/other/game:latest':candidate().reference}}};
  }
  throw Error('Unexpected fixture request');
 };
 const run=()=>deployImage(settings,approval(),values,{api,wait:async ms=>{clock+=ms;},now:()=>clock,credentials:install?{username:'catillatio',password:secret}:undefined,log:code=>logs.push(code)});
 return {run,api,settings,values,trace,logs};
}
for(const mode of ['success','same_committed_placeholder','empty_placeholder'])test('one exact image deployment follows staged receipt and unchanged parent: '+mode,async()=>{
 const f=fixture(mode);assert.equal(await f.run(),newId);
 assert.deepEqual(f.trace,['inspect','stage','inspect','commit','workflow','receipt','receipt','deploy','identity']);
 assert.deepEqual(f.logs,['PATCH_STAGED','CONFIG_COMMITTED_NO_DEPLOY','DEPLOYMENT_QUEUED']);
 assert.doesNotMatch(JSON.stringify(f.logs),/private|token|https:|credential/);
});
test('read-only target preflight performs no staging, upload, backup, signing or deploy',async()=>{
 const f=fixture();const r=await preflightImageTarget(f.settings,approval(),{api:f.api});assert.equal(r.target.serviceId,ids[2]);assert.deepEqual(f.trace,['inspect']);
});
for(const [mode,mutations]of[
 ['unrelated_pending',[]],['missing_pending',[]],['wrong_target',[]],['disabled_migration',[]],
 ['stage_ack_lost',['stage']],['stage_unrelated',['stage']],['stage_wrong_value',['stage']],['revision_race',['stage']],['parent_changed',['stage']],
 ['commit_ack_lost',['stage','commit']],['workflow_failed',['stage','commit']],['workflow_timeout',['stage','commit']],
 ['receipt_wrong_id',['stage','commit']],['receipt_changed_patch',['stage','commit']],['pending_race',['stage','commit']],['unexpected_restart',['stage','commit']],['source_not_applied',['stage','commit']],
 ['deploy_ack_lost',['stage','commit','deploy']],['wrong_deployment_service',['stage','commit','deploy']],['wrong_deployment_image',['stage','commit','deploy']]
])test('failure never retries a mutation or falls back to source/latest: '+mode,async()=>{
 const f=fixture(mode);await assert.rejects(f.run());assert.deepEqual(f.trace.filter(x=>['stage','commit','deploy'].includes(x)),mutations);
 for(const label of mutations)assert.equal(f.trace.filter(x=>x===label).length,1);
 assert.ok(!f.logs.some(x=>x.includes(secret)));
});
test('pre-backup parent binding cannot be replaced by a different healthy deployment',async()=>{const f=fixture();f.settings.imageTargetDigest='0'.repeat(64);await assert.rejects(f.run());assert.deepEqual(f.trace,['inspect']);});
test('unknown or credential-bearing patch entries cannot reach the provider',async()=>{
 const f=fixture();f.values.DATABASE_URL=secret;await assert.rejects(f.run());assert.deepEqual(f.trace,[]);
});
test('absent or explicit empty staging is distinct from missing/uncertain data',()=>{
 emptyImagePatch(null,ids[1]);emptyImagePatch({id:'opaque',environmentId:ids[1],status:'STAGED',appliedAt:null,lastAppliedError:null,createdAt:'2026-10-02T00:00:01Z',updatedAt:'2026-10-02T00:00:01Z',patch:{services:{},volumes:{},buckets:{},sharedVariables:{}}},ids[1]);
 for(const v of [undefined,{}, {environmentId:ids[1],status:'STAGED',lastAppliedError:null,patch:{volumes:{}}}])assert.throws(()=>emptyImagePatch(v,ids[1]));
 assert.equal(imageReleaseKeys.length,7);
});
test('preflight authenticates a previous committed placeholder without restaging or replaying it',async()=>{
 const f=fixture(),prior={id:patchId,environmentId:ids[1],status:'COMMITTED',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:01:00Z',appliedAt:'2026-10-01T00:01:00Z',lastAppliedError:null,patch:{services:{[ids[4]]:{variables:{PRIVATE:{value:secret}}}}}};
 let reads=0;
 const api=async(q,v)=>{
  if(q.startsWith('query KingdomImageInspect'))return {...await f.api(q,v),pending:structuredClone(prior)};
  assert.match(q,/^query KingdomImageReceipt/);reads++;assert.equal(v.patchId,patchId);
  return {...await f.api('query KingdomImageInspect',v),pending:structuredClone(prior),receipt:structuredClone(prior)};
 };
 await preflightImageTarget(f.settings,approval(),{api});assert.equal(reads,1);assert.deepEqual(f.trace,['inspect','inspect']);
});

for(const mode of ['success','same_committed_placeholder','empty_placeholder'])test('first protected image transition stages credentials with exact source/proof and never restarts early: '+mode,async()=>{
 const f=fixture(mode,{install:true});assert.equal(await f.run(),newId);
 assert.deepEqual(f.trace,['inspect','stage','inspect','commit','workflow','receipt','receipt','deploy','identity']);
 assert.deepEqual(f.logs,['PATCH_STAGED','CONFIG_COMMITTED_NO_DEPLOY','DEPLOYMENT_QUEUED']);assert.ok(!JSON.stringify(f.logs).includes(secret));
});
for(const [mode,mutations]of [
 ['already_image',[]],['other_repo',[]],['credential_missing',['stage']],['credential_changed',['stage']],['credential_extra',['stage']],['credential_wrong_path',['stage']],['credential_race',['stage']],
 ['credential_receipt_changed',['stage','commit']],['commit_ack_lost',['stage','commit']],['unexpected_restart',['stage','commit']],['deploy_ack_lost',['stage','commit','deploy']]
])test('first-transition credential failure holds without mutation retry: '+mode,async()=>{
 const f=fixture(mode,{install:true});await assert.rejects(f.run());assert.deepEqual(f.trace.filter(t=>['stage','commit','deploy'].includes(t)),mutations);
 for(const name of mutations)assert.equal(f.trace.filter(t=>t===name).length,1);assert.ok(!JSON.stringify(f.logs).includes(secret));
});
test('credentials cannot be smuggled through a preconfigured release or invalid handoff',async()=>{
 const cases=[['preconfigured',{username:'catillatio',password:secret}],...['other','empty','extra'].map(kind=>['install-read-only',kind==='other'?{username:'other',password:secret}:kind==='empty'?{username:'catillatio',password:''}:{username:'catillatio',password:secret,extra:true}])];
 for(const [setup,credentials]of cases){
  const f=fixture();f.settings.registrySetup=setup;
  await assert.rejects(deployImage(f.settings,approval(),f.values,{api:f.api,credentials}));assert.deepEqual(f.trace,[]);
 }
});

test('failed latest attempt is distinct from the sole authoritative healthy active deployment',async()=>{
 const f=fixture('success',{failedLatest:true,regional:true,install:true});
 const before=await preflightImageTarget(f.settings,approval(),{api:f.api});
 const snapshot=JSON.parse(before.baseline);assert.equal(snapshot.latestDeployment.id,failedId);assert.equal(snapshot.latestDeployment.status,'FAILED');
 assert.equal(snapshot.activeDeployments[0].id,oldId);assert.equal(snapshot.activeDeployments[0].status,'SUCCESS');assert.deepEqual(snapshot.regionalReplicas,{iad:1});
 assert.ok(!before.baseline.includes(secret));assert.deepEqual(f.trace,['inspect']);
 const release=fixture('success',{failedLatest:true,regional:true,install:true});assert.equal(await release.run(),newId);assert.deepEqual(release.trace,['inspect','stage','inspect','commit','workflow','receipt','receipt','deploy','identity']);
});
test('target queries ask for runtime instances and a bounded server-filtered in-flight check',()=>{
 assert.match(imageInspectQuery,/instances\{id status\}/);assert.match(imageInspectQuery,/environment\([^)]*\)\{id projectId name config\}/);
 assert.match(imageInspectQuery,/inFlight:deployments\(input:\{projectId:\$projectId,environmentId:\$environmentId,serviceId:\$serviceId,status:\{in:\[WAITING,NEEDS_APPROVAL,QUEUED,INITIALIZING,BUILDING,DEPLOYING,REMOVING\]\}\},first:1\)/);
});
const invalidTargets={
 'no active deployment':b=>{b.game.activeDeployments=[];},
 'two active deployments':b=>{b.game.activeDeployments.push({...structuredClone(b.game.activeDeployments[0]),id:newId});},
 'failed active':b=>{b.game.activeDeployments[0].status='FAILED';},
 'stopped active':b=>{b.game.activeDeployments[0].deploymentStopped=true;},
 'crashed instance':b=>{b.game.activeDeployments[0].instances[0].status='CRASHED';},
 'no running instance':b=>{b.game.activeDeployments[0].instances=[];},
 'two running instances':b=>{b.game.activeDeployments[0].instances.push({id:'other',status:'RUNNING'});},
 'wrong active scope':b=>{b.game.activeDeployments[0].serviceId=ids[4];},
 'wrong latest scope':b=>{b.game.latestDeployment.environmentId=ids[4];},
 'unlisted older success':b=>{b.game.latestDeployment.status='SUCCESS';},
 'latest still running despite terminal status':b=>{b.game.latestDeployment.instances=[{id:'unexpected',status:'RUNNING'}];},
 'latest earlier than active':b=>{b.game.latestDeployment.createdAt='2026-09-30T00:00:00Z';},
 'unknown latest status':b=>{b.game.latestDeployment.status='FUTURE_STATUS';},
 'missing in-flight result':b=>{delete b.inFlight;},
 'null replicas without regional evidence':b=>{delete b.environment.config.services[ids[2]].deploy.multiRegionConfig;},
 'two configured regional replicas':b=>{b.environment.config.services[ids[2]].deploy.multiRegionConfig.iad.numReplicas=2;},
 'multiple configured regions exceed one':b=>{b.environment.config.services[ids[2]].deploy.multiRegionConfig.ams={numReplicas:1};},
 'zero configured replicas':b=>{b.environment.config.services[ids[2]].deploy.multiRegionConfig.iad.numReplicas=0;},
 'string replica count':b=>{b.environment.config.services[ids[2]].deploy.multiRegionConfig.iad.numReplicas='1';},
 'undefined legacy replica count':b=>{delete b.game.numReplicas;},
 'wrong root directory':b=>{b.game.rootDirectory='/other';},
 'wrong health path':b=>{b.game.healthcheckPath='/other';},
 'wrong health timeout':b=>{b.game.healthcheckTimeout=121;},
 'wrong restart policy':b=>{b.game.restartPolicyType='ALWAYS';},
 'wrong repository':b=>{b.game.source.repo='other/repository';}
};
for(const [name,edit]of Object.entries(invalidTargets))test('read-only active-target validation rejects '+name,async()=>{
 const f=fixture('success',{failedLatest:true,regional:true,edit});await assert.rejects(preflightImageTarget(f.settings,approval(),{api:f.api}));assert.deepEqual(f.trace,['inspect']);
});
for(const status of ['WAITING','NEEDS_APPROVAL','QUEUED','INITIALIZING','BUILDING','DEPLOYING','REMOVING'])test('no in-flight '+status+' attempt is accepted or ignored behind a failed latest',async()=>{
 const f=fixture('success',{failedLatest:true,regional:true,edit:b=>{b.inFlight.edges=[{node:{id:newId}}];}});
 await assert.rejects(preflightImageTarget(f.settings,approval(),{api:f.api}));assert.deepEqual(f.trace,['inspect']);
 const latest=fixture('success',{failedLatest:true,regional:true,edit:b=>{b.game.latestDeployment.status=status;}});await assert.rejects(preflightImageTarget(latest.settings,approval(),{api:latest.api}));assert.deepEqual(latest.trace,['inspect']);
});
for(const point of ['before commit','after commit'])for(const field of ['active identity','active timestamp','active instance','failed latest identity','failed latest timestamp','regional config','new in-flight attempt'])test('exact target binding rejects '+field+' changes '+point,async()=>{
 const edit=(b,state)=>{
  if(!state.staged||state.committed!==(point==='after commit'))return;
  const d=b.game.activeDeployments[0];
  if(field==='active identity')d.id=newId;
  if(field==='active timestamp')d.updatedAt='2026-10-01T00:02:00Z';
  if(field==='active instance')d.instances[0].id='restarted-instance';
  if(field==='failed latest identity')b.game.latestDeployment.id=newId;
  if(field==='failed latest timestamp')b.game.latestDeployment.updatedAt='2026-10-01T01:02:00Z';
  if(field==='regional config')b.environment.config.services[ids[2]].deploy.multiRegionConfig={ams:{numReplicas:1}};
  if(field==='new in-flight attempt')b.inFlight.edges=[{node:{id:newId}}];
 };
 const f=fixture('success',{failedLatest:true,regional:true,edit});await assert.rejects(f.run());assert.deepEqual(f.trace.filter(x=>['stage','commit','deploy'].includes(x)),point==='before commit'?['stage']:['stage','commit']);
});
test('private environment values cannot influence the non-secret target digest',async()=>{
 const f=fixture('success',{failedLatest:true,regional:true}),changed=fixture('success',{failedLatest:true,regional:true,edit:b=>{b.environment.config.services[ids[2]].variables.PRIVATE.value='other synthetic credential';}});
 const a=await preflightImageTarget(f.settings,approval(),{api:f.api}),b=await preflightImageTarget(changed.settings,approval(),{api:changed.api});assert.equal(a.baseline,b.baseline);
});
test('source changed by another editor cannot pass the fresh pre-commit read',async()=>{
 const f=fixture('success',{failedLatest:true,regional:true,edit:(b,state)=>{if(state.staged&&!state.committed)b.game.source={image:candidate().reference,repo:null};}});
 await assert.rejects(f.run());assert.deepEqual(f.trace.filter(x=>['stage','commit','deploy'].includes(x)),['stage']);
});
