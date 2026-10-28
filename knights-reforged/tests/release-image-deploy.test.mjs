import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deployImage,preflightImageTarget,emptyImagePatch,imageReleaseKeys,imageInspectQuery,imageSourceMutation,inspectImageTargetState,imageHandoffFailure} from '../deployment/release/image-deploy.mjs';
import {canonical} from '../deployment/release/image-policy.mjs';
import {inspectImageTarget,sanitizedTargetMetadata} from '../deployment/release/inspect-image-target.mjs';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {candidate,approval,ids} from './fixtures/release-image.mjs';
const secret='synthetic-private-proof provider-token https://private.invalid/?credential=fixture';
const oldId='77777777-7777-4777-8777-777777777777',newId='88888888-8888-4888-8888-888888888888',patchId='99999999-9999-4999-8999-999999999999';
const failedId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const capturedObservation=JSON.parse(readFileSync(new URL('./fixtures/railway-image-target-observation-5.json',import.meta.url),'utf8'));
function fixture(mode='success',{install=false,failedLatest=false,regional=false,providerShape=false,delta=false,existingCredentials=false,credentialDelta='both',edit}={}){
 const target={projectId:ids[0],environmentId:ids[1],serviceId:ids[2]},trace=[],logs=[];let staged,receipt,sourceUpdated=false,clock=0,inspectCount=0;
 const identity={id:oldId,...target,status:'SUCCESS',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:01:00Z',deploymentStopped:false,instances:[{id:'running-game-instance',status:'RUNNING'}]};
 let game={serviceId:target.serviceId,environmentId:target.environmentId,startCommand:'node deployment/start.mjs',preDeployCommand:['node deployment/migrate.mjs'],healthcheckPath:'/healthz',healthcheckTimeout:120,numReplicas:1,restartPolicyType:'ON_FAILURE',rootDirectory:'/knights-reforged',source:{image:null,repo:'catillatio/test'},latestDeployment:identity,activeDeployments:[structuredClone(identity)]};
 if(failedLatest)game.latestDeployment={...structuredClone(identity),id:failedId,status:'FAILED',createdAt:'2026-10-01T01:00:00Z',updatedAt:'2026-10-01T01:01:00Z',deploymentStopped:true,instances:[]};
 if(regional)game.numReplicas=null;
 if(providerShape){
  const fields=capturedObservation.fields;
  game.healthcheckTimeout=fields['game.healthcheckTimeout'];
  game.activeDeployments[0].instances=fields['active.instances.status'].map((status,i)=>({id:'synthetic-game-instance-'+i,status}));
 }
 const {source,...snapshot}=game;
 const settings={registrySetup:install?'install-read-only':'preconfigured',sha:candidate().sha,projectId:target.projectId,environmentId:target.environmentId,gameServiceId:target.serviceId,imageTargetDigest:createHash('sha256').update(canonical({...snapshot,environmentScope:{projectId:target.projectId,environmentId:target.environmentId},regionalReplicas:regional?{iad:1}:null})).digest('hex')};
 const values={KINGDOM_AUTOMATED_RELEASES:'1',KINGDOM_RELEASE_SHA:candidate().sha,KINGDOM_RESTORE_TEST_DATABASE:'kc_fixture_restore_test',KINGDOM_RELEASE_BACKUP_PROOF:secret,KINGDOM_RELEASE_ARTIFACT_KIND:'oci-image-v1',KINGDOM_RELEASE_IMAGE_REFERENCE:candidate().reference,KINGDOM_RELEASE_IMAGE_DIGEST:candidate().manifestDigest};
 const emptyPlaceholder=()=>({id:'opaque-empty-id',environmentId:target.environmentId,status:'STAGED',appliedAt:null,lastAppliedError:null,createdAt:'2026-10-02T00:00:01Z',updatedAt:'2026-10-02T00:00:01Z',patch:{}});
 const cleared=()=>mode==='same_committed_placeholder'?structuredClone(receipt):mode==='empty_placeholder'||providerShape?emptyPlaceholder():null;
 const base=pending=>{
  const applied=receipt?Object.fromEntries(imageReleaseKeys.map(k=>[k,{value:values[k]}])):{KINGDOM_AUTOMATED_RELEASES:{value:'1'}};
  const deploy={...(regional?{multiRegionConfig:{iad:{numReplicas:1}}}:{}),...((receipt&&install)||existingCredentials?{registryCredentials:{username:'catillatio',password:secret}}:{})};
  const b={project:{id:target.projectId,name:'merry-patience',environments:{edges:[{node:{id:target.environmentId,projectId:target.projectId,deletedAt:null}}],pageInfo:{hasNextPage:false,hasPreviousPage:false}}},environment:{id:target.environmentId,projectId:target.projectId,name:'production',config:{services:{[target.serviceId]:{source:sourceUpdated?{image:candidate().reference}:{repo:'catillatio/test',branch:'fixture-legacy-branch',commitSha:'0'.repeat(40)},deploy,variables:{PRIVATE:{value:secret},...applied}}}}},game:structuredClone(game),inFlight:{edges:[]},pending};
  edit?.(b,{staged:!!staged,committed:!!receipt,sourceUpdated});return b;
 };
 const api=async(query,v)=>{
  if(query.startsWith('query KingdomImageInspect')){
   trace.push('inspect');inspectCount++;
   let pending=receipt?cleared():staged?structuredClone(staged):providerShape?emptyPlaceholder():null;
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
   if(delta)delete staged.patch.services[target.serviceId].variables.KINGDOM_AUTOMATED_RELEASES;
   if(install&&credentialDelta==='none')delete staged.patch.services[target.serviceId].deploy;
   if(install&&credentialDelta==='password')delete staged.patch.services[target.serviceId].deploy.registryCredentials.username;
   if(install&&credentialDelta==='username')delete staged.patch.services[target.serviceId].deploy.registryCredentials.password;
   if(mode==='stage_ack_lost')throw Error(secret);
   if(mode==='stage_unrelated')staged.patch.services[ids[4]]={variables:{PRIVATE:{value:secret}}};
   if(mode==='stage_wrong_value')staged.patch.services[target.serviceId].variables.KINGDOM_RELEASE_BACKUP_PROOF.value='changed';
   if(mode==='credential_missing')delete staged.patch.services[target.serviceId].deploy.registryCredentials;
   if(mode==='credential_changed')staged.patch.services[target.serviceId].deploy.registryCredentials.password='changed';
   if(mode==='credential_redacted')staged.patch.services[target.serviceId].deploy.registryCredentials.password='[REDACTED]';
   if(mode==='credential_extra')staged.patch.services[target.serviceId].deploy.extra=true;
   if(mode==='credential_wrong_path'){const svc=staged.patch.services[target.serviceId];svc.source={registryCredentials:svc.deploy.registryCredentials};delete svc.deploy;}
   return {environmentStageChanges:structuredClone(staged)};
  }
  if(query.startsWith('mutation KingdomImageCommit')){
   trace.push('commit');assert.match(query,/skipDeploys:true/);assert.equal(v.environmentId,target.environmentId);assert.equal(inspectCount,2);
   receipt={...structuredClone(staged),status:'COMMITTED',appliedAt:'2026-10-02T00:00:01Z',updatedAt:'2026-10-02T00:00:01Z'};
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
   if(mode==='receipt_changed_patch')b.receipt.patch.services[target.serviceId].variables.KINGDOM_RELEASE_IMAGE_REFERENCE.value='changed';
   if(mode==='credential_receipt_changed')b.receipt.patch.services[target.serviceId].deploy.registryCredentials.password='changed';
   if(mode==='pending_race')b.pending={id:ids[5],environmentId:target.environmentId,status:'STAGED',patch:{services:{[ids[4]]:{variables:{PRIVATE:{value:secret}}}}}};
   if(mode==='unexpected_restart')b.game.latestDeployment.id=newId;
   if(mode==='source_not_applied'&&sourceUpdated)b.game.source.image=null;
   return b;
  }
  if(query.startsWith('mutation KingdomImageSource')){
   trace.push('source');assert.equal(query,imageSourceMutation);
   assert.deepEqual(v,{environmentId:target.environmentId,serviceId:target.serviceId,input:{source:{image:candidate().reference,repo:null}}});
   sourceUpdated=true;game.source={image:candidate().reference,repo:null};
   if(mode==='source_ack_lost')throw Error(secret);
   return {serviceInstanceUpdate:true};
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
 assert.deepEqual(f.trace,['inspect','stage','inspect','commit','workflow','receipt','receipt','source','receipt','receipt','deploy','identity']);
 assert.deepEqual(f.logs,['PATCH_STAGED','CONFIG_COMMITTED_NO_DEPLOY','SOURCE_UPDATE_REQUESTED','SOURCE_VERIFIED_NO_DEPLOY','DEPLOYMENT_QUEUED']);
 assert.doesNotMatch(JSON.stringify(f.logs),/private|token|https:|credential/);
});
test('read-only target preflight performs no staging, upload, backup, signing or deploy',async()=>{
 const f=fixture();const r=await preflightImageTarget(f.settings,approval(),{api:f.api});assert.equal(r.target.serviceId,ids[2]);assert.deepEqual(f.trace,['inspect']);
});
for(const [mode,mutations]of[
 ['unrelated_pending',[]],['missing_pending',[]],['wrong_target',[]],['disabled_migration',[]],
 ['stage_ack_lost',['stage']],['stage_unrelated',['stage']],['stage_wrong_value',['stage']],['revision_race',['stage']],['parent_changed',['stage']],
 ['commit_ack_lost',['stage','commit']],['workflow_failed',['stage','commit']],['workflow_timeout',['stage','commit']],
 ['receipt_wrong_id',['stage','commit']],['receipt_changed_patch',['stage','commit']],['pending_race',['stage','commit']],['unexpected_restart',['stage','commit']],['source_not_applied',['stage','commit','source']],
 ['deploy_ack_lost',['stage','commit','source','deploy']],['wrong_deployment_service',['stage','commit','source','deploy']],['wrong_deployment_image',['stage','commit','source','deploy']]
])test('failure never retries a mutation or falls back to source/latest: '+mode,async()=>{
 const f=fixture(mode);await assert.rejects(f.run());assert.deepEqual(f.trace.filter(x=>['stage','commit','source','deploy'].includes(x)),mutations);
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
 assert.deepEqual(f.trace,['inspect','stage','inspect','commit','workflow','receipt','receipt','source','receipt','receipt','deploy','identity']);
 assert.deepEqual(f.logs,['PATCH_STAGED','CONFIG_COMMITTED_NO_DEPLOY','SOURCE_UPDATE_REQUESTED','SOURCE_VERIFIED_NO_DEPLOY','DEPLOYMENT_QUEUED']);assert.ok(!JSON.stringify(f.logs).includes(secret));
});
for(const [mode,mutations]of [
 ['already_image',[]],['other_repo',[]],['credential_missing',['stage']],['credential_changed',['stage']],['credential_extra',['stage']],['credential_wrong_path',['stage']],['credential_race',['stage']],
 ['credential_receipt_changed',['stage','commit']],['commit_ack_lost',['stage','commit']],['unexpected_restart',['stage','commit']],['deploy_ack_lost',['stage','commit','source','deploy']]
])test('first-transition credential failure holds without mutation retry: '+mode,async()=>{
 const f=fixture(mode,{install:true});await assert.rejects(f.run());assert.deepEqual(f.trace.filter(t=>['stage','commit','source','deploy'].includes(t)),mutations);
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
 const release=fixture('success',{failedLatest:true,regional:true,install:true});assert.equal(await release.run(),newId);assert.deepEqual(release.trace,['inspect','stage','inspect','commit','workflow','receipt','receipt','source','receipt','receipt','deploy','identity']);
});
test('target queries ask for runtime instances and a bounded server-filtered in-flight check',()=>{
 assert.match(imageInspectQuery,/instances\{id status\}/);assert.match(imageInspectQuery,/environment\([^)]*\)\{id projectId name config\(decryptVariables:true\)\}/);
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
 const f=fixture('success',{failedLatest:true,regional:true,edit});await assert.rejects(f.run());assert.deepEqual(f.trace.filter(x=>['stage','commit','source','deploy'].includes(x)),point==='before commit'?['stage']:['stage','commit']);
});
test('private environment values cannot influence the non-secret target digest',async()=>{
 const f=fixture('success',{failedLatest:true,regional:true}),changed=fixture('success',{failedLatest:true,regional:true,edit:b=>{b.environment.config.services[ids[2]].variables.PRIVATE.value='other synthetic credential';}});
 const a=await preflightImageTarget(f.settings,approval(),{api:f.api}),b=await preflightImageTarget(changed.settings,approval(),{api:changed.api});assert.equal(a.baseline,b.baseline);
});
test('source changed by another editor cannot pass the fresh pre-commit read',async()=>{
 const f=fixture('success',{failedLatest:true,regional:true,edit:(b,state)=>{if(state.staged&&!state.committed)b.game.source={image:candidate().reference,repo:null};}});
 await assert.rejects(f.run());assert.deepEqual(f.trace.filter(x=>['stage','commit','source','deploy'].includes(x)),['stage']);
});

const inspectEnv={GITHUB_REPOSITORY:'catillatio/test',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/release/production',GITHUB_RUN_ATTEMPT:'1',
 KINGDOM_IMAGE_TARGET_INSPECTION:'true',RAILWAY_TOKEN:'synthetic-token',RAILWAY_PROJECT_ID:ids[0],RAILWAY_ENVIRONMENT_ID:ids[1],RAILWAY_GAME_SERVICE_ID:ids[2]};
test('protected inspection invokes the actual shared target checks with one read and no release authorization',async()=>{
 const f=fixture('success',{failedLatest:true,regional:true});const result=await inspectImageTarget(inspectEnv,{api:f.api});
 assert.equal(result.result,'MATCH');assert.equal(result.authorizesRelease,false);assert.equal(result.firstRejected,null);assert.equal(result.reads,1);assert.deepEqual(f.trace,['inspect']);
 assert.ok(result.checks.every(c=>c.passed===true));assert.ok(result.checks.some(c=>c.field==='game.source.repo'));assert.equal(result.metadata['latest.status'],'FAILED');
 assert.doesNotMatch(JSON.stringify(result),/synthetic|private\.invalid|[a-f0-9]{8}-[a-f0-9]{4}-|sha256:|credential=|\bvalue\b/);
});
test('an observer receives detached values and cannot mutate or bypass an acceptance assertion',async()=>{
 const f=fixture('success',{failedLatest:true,regional:true,edit:b=>{b.environment.config.services[ids[2]].deploy.multiRegionConfig.iad.numReplicas=2;}});
 await assert.rejects(inspectImageTargetState(f.settings,{api:f.api,observe:(_field,_expected,value)=>{if(value&&typeof value==='object'&&value.iad)value.iad.numReplicas=1;return true;}}));
 assert.deepEqual(f.trace,['inspect']);
});
for(const [field,expected,actual,edit]of[
 ['game.healthcheckTimeout','120_OR_UNSET_DEFAULT_300','MISSING',b=>{delete b.game.healthcheckTimeout;b.game.restartPolicyType='ALWAYS';}],
 ['game.restartPolicyType','ON_FAILURE','MISSING',b=>{delete b.game.restartPolicyType;}],
 ['game.rootDirectory','EXPECTED_ROOT',false,b=>{b.game.rootDirectory=null;}],
 ['active.instances.status','RUNNING_OR_REMOVED',['CREATED'],b=>{b.game.activeDeployments[0].instances[0].status='CREATED';}],
 ['latest.instances.status','ALL_EXITED',['REMOVED'],b=>{b.game.latestDeployment.instances=[{id:secret,status:'REMOVED'}];}],
 ['game.regionalReplicas.total','1',2,b=>{b.environment.config.services[ids[2]].deploy.multiRegionConfig.iad.numReplicas=2;}],
 ['pending.appliedAt','NULL','STRING',b=>{b.pending={environmentId:ids[1],status:'STAGED',lastAppliedError:null,id:secret,appliedAt:secret};}],
 ['pending.lastAppliedError','NULL','STRING',b=>{b.pending={environmentId:ids[1],status:'STAGED',lastAppliedError:secret};}]
])test('read-only inspection identifies the first actual assertion, not a replacement policy: '+field,async()=>{
 const f=fixture('success',{failedLatest:true,regional:true,edit});const result=await inspectImageTarget(inspectEnv,{api:f.api});
 assert.equal(result.result,'REJECTED');assert.deepEqual(result.firstRejected,{field,expected,actual});assert.equal(result.failureCategory,'ASSERTION');assert.equal(result.authorizesRelease,false);assert.deepEqual(f.trace,['inspect']);
 assert.doesNotMatch(JSON.stringify(result),/synthetic|private\.invalid|[a-f0-9]{8}-[a-f0-9]{4}-|credential=/);
});
test('bad inspection context, TLS or credential format makes zero provider calls',async()=>{
 for(const change of [{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'push'},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_RUN_ATTEMPT:'2'},{KINGDOM_IMAGE_TARGET_INSPECTION:'false'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{RAILWAY_TOKEN:'bad\nheader'},{RAILWAY_API_TOKEN:secret},{RAILWAY_PROJECT_ID:''}]){
  let calls=0;const result=await inspectImageTarget({...inspectEnv,...change},{api:async()=>{calls++;throw Error(secret);}});assert.equal(result.result,'REJECTED');assert.equal(calls,0);assert.equal(result.authorizesRelease,false);assert.ok(!JSON.stringify(result).includes(secret));
 }
});
test('transport failures are unverified, sanitized and never retried or represented as an assertion mismatch',async()=>{
 let calls=0;const result=await inspectImageTarget(inspectEnv,{api:async()=>{calls++;throw Error(secret);}});
 assert.equal(calls,1);assert.equal(result.result,'UNVERIFIED');assert.equal(result.firstRejected,null);assert.equal(result.failureCategory,'UNVERIFIED');assert.ok(!JSON.stringify(result).includes(secret));
});
test('unknown status strings, timestamps, IDs, patch variables and exception diffs never escape inspection',async()=>{
 const f=fixture('success',{failedLatest:true,regional:true,edit:b=>{
  b.game.healthcheckTimeout=secret;b.game.restartPolicyType=secret;b.game.latestDeployment.status=secret;b.game.latestDeployment.createdAt=secret;
  b.game.latestDeployment.instances=[{id:secret,status:secret}];b.game.source.image=secret;
 }});
 const result=await inspectImageTarget(inspectEnv,{api:f.api});assert.equal(result.firstRejected.actual,'STRING');assert.doesNotMatch(JSON.stringify(result),/synthetic|https?:|credential=|[a-f0-9]{8}-[a-f0-9]{4}-/);
});
test('actual inspection entrypoint emits only sanitized JSON through authenticated query-only transport',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'image-target-inspection-'));
 try{
  const f=fixture('success',{failedLatest:true,regional:true,edit:b=>{delete b.game.healthcheckTimeout;}}),data=await f.api(imageInspectQuery,{projectId:ids[0],environmentId:ids[1],serviceId:ids[2]});
  const preload=join(folder,'provider.mjs');
  writeFileSync(preload,`import assert from 'node:assert/strict';globalThis.fetch=async(url,options)=>{assert.equal(url,'https://backboard.railway.com/graphql/v2');assert.equal(options.headers['project-access-token'],'synthetic-token');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');const body=JSON.parse(options.body);assert.match(body.query,/^query KingdomImageInspect\\(/);assert.doesNotMatch(body.query,/mutation|subscription/);return {ok:true,status:200,text:async()=>JSON.stringify({data:${JSON.stringify(data)}})};};`);
  const result=spawnSync(process.execPath,['--import',preload,new URL('../deployment/release/inspect-image-target.mjs',import.meta.url).pathname],{env:{PATH:process.env.PATH,...inspectEnv},encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);assert.equal(result.stderr,'');
  const lines=result.stdout.trim().split('\n');assert.ok(lines.every(l=>/^IMAGE_TARGET_(INSPECTION|FIRST_REJECTION|CHECK|FIELD): /.test(l)));
  assert.deepEqual(JSON.parse(lines[1].slice('IMAGE_TARGET_FIRST_REJECTION: '.length)),{field:'game.healthcheckTimeout',expected:'120_OR_UNSET_DEFAULT_300',actual:'MISSING'});
  assert.equal(JSON.parse(lines[0].slice('IMAGE_TARGET_INSPECTION: '.length)).authorizesRelease,false);
  assert.doesNotMatch(result.stdout,/synthetic|https?:|credential=|[a-f0-9]{8}-[a-f0-9]{4}-/);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('workflow offers opt-in read-only inspection under the existing owner gate and production mutex',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/railway-authorization-diagnostic.yml',import.meta.url),'utf8');
 assert.match(workflow,/image_target_inspection:[\s\S]*?type: boolean\n        default: false/);
 assert.match(workflow,/\(inputs.image_target_inspection \|\| inputs.image_handoff_inspection \|\| inputs.image_commit_history_inspection\) && 'kingdom-come-production'/);assert.match(workflow,/cancel-in-progress: false/);assert.match(workflow,/environment: production/);
 assert.match(workflow,/if: '!inputs.image_target_inspection && !inputs.image_handoff_inspection && !inputs.image_commit_history_inspection'/);assert.match(workflow,/if: inputs.image_target_inspection && !inputs.image_handoff_inspection && !inputs.image_commit_history_inspection/);assert.match(workflow,/run: node knights-reforged\/deployment\/release\/inspect-image-target.mjs/);
 assert.doesNotMatch(workflow,/image\.mjs publish|run\.mjs|worker\.mjs|upload-artifact|packages: write|KINGDOM_BACKUP_|SIGNING|railway up/);
 const targetStep=workflow.split('- name: Inspect exact first image handoff assertions without writes')[1].split('- name:')[0];assert.doesNotMatch(targetStep,/REGISTRY_READ_TOKEN/);
 const source=readFileSync(new URL('../deployment/release/inspect-image-target.mjs',import.meta.url),'utf8');assert.match(source,/\[imageInspectQuery,imageReceiptQuery\]\.includes\(query\)/);assert.match(source,/assert\.ok\(\+\+reads<=2\)/);
 assert.doesNotMatch(source,/child_process|console\.(error|warn)|error\.(message|stack)|writeFile|createHash|deployImage\(/);
});

for(const install of [false,true])for(const delta of [false,true])test('complete handoff verifies all seven effective values for '+(delta?'six-change':'seven-change')+' patch, credentials '+install,async()=>{
 const f=fixture('success',{install,delta});assert.equal(await f.run(),newId);
 assert.deepEqual(f.trace.filter(x=>['stage','commit','source','deploy'].includes(x)),['stage','commit','source','deploy']);
});
for(const mode of ['stage_ack_lost','stage_unrelated','stage_wrong_value','revision_race','parent_changed','credential_redacted','credential_race','credential_receipt_changed','commit_ack_lost','pending_race','deploy_ack_lost'])test('six-change handoff retains fail-closed/no-retry behavior: '+mode,async()=>{
 const f=fixture(mode,{install:true,delta:true});await assert.rejects(f.run());
 for(const mutation of ['stage','commit','source','deploy'])assert.ok(f.trace.filter(x=>x===mutation).length<=1);
 assert.ok(!f.logs.some(x=>x.includes(secret)));
 if(['stage_ack_lost','stage_unrelated','stage_wrong_value','revision_race','parent_changed','credential_redacted','credential_race'].includes(mode))assert.equal(f.trace.includes('commit'),false);
 if(mode==='credential_redacted')assert.deepEqual(f.trace,['inspect','stage']);
});
for(const phase of ['initial','precommit','postcommit'])test('omitted variable must have exact authenticated applied value at '+phase,async()=>{
 const f=fixture('success',{install:true,delta:true,edit:(b,state)=>{
  if(phase==='initial'&&!state.staged||phase==='precommit'&&state.staged&&!state.committed||phase==='postcommit'&&state.committed)b.environment.config.services[ids[2]].variables.KINGDOM_AUTOMATED_RELEASES.value='0';
 }});
 await assert.rejects(f.run(),e=>['EFFECTIVE_RELEASE_VALUE','APPLIED_RELEASE_VALUES'].includes(imageHandoffFailure(e)));
 assert.equal(f.trace.includes('deploy'),false);assert.equal(f.trace.includes('commit'),phase==='postcommit');
});
for(const name of imageReleaseKeys)test('every applied release value is rechecked after commit: '+name,async()=>{
 const f=fixture('success',{install:true,delta:true,edit:(b,state)=>{if(state.committed)b.environment.config.services[ids[2]].variables[name].value='forged';}});
 await assert.rejects(f.run(),e=>imageHandoffFailure(e)==='APPLIED_RELEASE_VALUES');assert.equal(f.trace.includes('deploy'),false);
});
test('a value changed after the committed receipt is rejected in the immediate pre-deploy read',async()=>{
 let committedReads=0;
 const f=fixture('success',{install:true,delta:true,edit:(b,state)=>{if(state.committed&&++committedReads===2)b.environment.config.services[ids[2]].variables.KINGDOM_RELEASE_SHA.value='forged';}});
 await assert.rejects(f.run(),e=>imageHandoffFailure(e)==='APPLIED_RELEASE_VALUES');assert.equal(committedReads,2);assert.equal(f.trace.includes('deploy'),false);
});

const sourceScopeFailures={
 'missing enumeration':b=>{delete b.project.environments;},
 'truncated enumeration':b=>{b.project.environments.pageInfo.hasNextPage=true;},
 'missing preceding page':b=>{b.project.environments.pageInfo.hasPreviousPage=true;},
 'missing completeness flag':b=>{delete b.project.environments.pageInfo.hasNextPage;},
 'no environment':b=>{b.project.environments.edges=[];},
 'other non-fork environment':b=>{b.project.environments.edges.push({node:{id:ids[4],projectId:ids[0],deletedAt:null}});},
 'unverified presumed fork':b=>{b.project.environments.edges.push({node:{id:ids[4],projectId:ids[0],deletedAt:null,isEphemeral:true}});},
 'wrong environment':b=>{b.project.environments.edges[0].node.id=ids[4];},
 'wrong project':b=>{b.project.environments.edges[0].node.projectId=ids[4];},
 'deleted environment':b=>{b.project.environments.edges[0].node.deletedAt='2026-10-01T00:00:00Z';}
};
for(const [name,edit]of Object.entries(sourceScopeFailures))test('typed setter scope is rejected before recovery preflight: '+name,async()=>{
 const f=fixture('success',{edit});await assert.rejects(preflightImageTarget(f.settings,approval(),{api:f.api}));assert.deepEqual(f.trace,['inspect']);
});
for(const phase of ['precommit','presource','postsource','predeploy'])test('a newly added environment stops the transition at '+phase,async()=>{
 let receiptReads=0;
 const f=fixture('success',{install:true,edit:(b,state)=>{
  if(state.committed)receiptReads++;
  const fail=phase==='precommit'&&state.staged&&!state.committed||phase==='presource'&&receiptReads===2||phase==='postsource'&&receiptReads===3||phase==='predeploy'&&receiptReads===4;
  if(fail)sourceScopeFailures['other non-fork environment'](b);
 }});
 await assert.rejects(f.run());assert.equal(f.trace.includes('deploy'),false);assert.equal(f.trace.includes('source'),['postsource','predeploy'].includes(phase));
});
for(const response of [null,{}, {serviceInstanceUpdate:false},{serviceInstanceUpdate:null},{serviceInstanceUpdate:'true'},{serviceInstanceUpdate:true,extra:secret}])test('typed mutation requires exact Boolean acknowledgment: '+JSON.stringify(response).replaceAll(secret,'PRIVATE'),async()=>{
 const f=fixture('success',{install:true}),api=async(q,v)=>{const r=await f.api(q,v);return q===imageSourceMutation?response:r;};
 await assert.rejects(deployImage(f.settings,approval(),f.values,{api,credentials:{username:'catillatio',password:secret}}),e=>imageHandoffFailure(e)==='SOURCE_UPDATE_ACKNOWLEDGMENT');
 assert.deepEqual(f.trace.filter(x=>['stage','commit','source','deploy'].includes(x)),['stage','commit','source']);
 assert.ok(!JSON.stringify(f.logs).includes(secret));
});
test('lost typed acknowledgment leaves the applied image un-retried and never deploys',async()=>{
 const f=fixture('source_ack_lost',{install:true});await assert.rejects(f.run());assert.equal(f.trace.filter(x=>x==='source').length,1);assert.equal(f.trace.includes('deploy'),false);
 assert.deepEqual(f.logs,['PATCH_STAGED','CONFIG_COMMITTED_NO_DEPLOY','SOURCE_UPDATE_REQUESTED']);
});
for(const source of [{image:'other',repo:null},{image:candidate().reference,repo:'catillatio/test'},null])test('effective source mismatch after a typed success cannot deploy: '+JSON.stringify(source),async()=>{
 const f=fixture('success',{edit:(b,state)=>{if(state.sourceUpdated)b.game.source=source;}});await assert.rejects(f.run(),e=>imageHandoffFailure(e)==='APPLIED_IMAGE_SOURCE');assert.equal(f.trace.includes('deploy'),false);
});
for(const raw of [{image:'other'},{image:candidate().reference,repo:'catillatio/test'},{image:candidate().reference,commitSha:'0'.repeat(40)},{image:candidate().reference,branch:'legacy'},{image:candidate().reference,unknown:secret},null])test('serialized source must independently match the cleared source: '+Object.keys(raw??{}).join(','),async()=>{
 const f=fixture('success',{edit:(b,state)=>{if(state.sourceUpdated)b.environment.config.services[ids[2]].source=raw;}});
 await assert.rejects(f.run(),e=>imageHandoffFailure(e)==='APPLIED_IMAGE_SOURCE');assert.equal(f.trace.includes('deploy'),false);
});
test('provider can serialize explicit repo null after the typed update',async()=>{
 const f=fixture('success',{edit:(b,state)=>{if(state.sourceUpdated)b.environment.config.services[ids[2]].source.repo=null;}});assert.equal(await f.run(),newId);
});
for(const source of [{image:candidate().reference},{image:candidate().reference,repo:null}])test('source fields are forbidden in the configuration-only commit: '+Object.keys(source).join(','),async()=>{
 const f=fixture(),api=async(q,v)=>{const r=await f.api(q,v);if(q.startsWith('mutation KingdomImageStage'))r.environmentStageChanges.patch.services[ids[2]].source=source;return r;};
 await assert.rejects(deployImage(f.settings,approval(),f.values,{api}),e=>imageHandoffFailure(e)==='PATCH_SERVICE_KEYS');assert.deepEqual(f.trace,['inspect','stage']);
});
const privateConfigurationDrift={
 'unrelated variable':b=>{b.environment.config.services[ids[2]].variables.PRIVATE.value='changed';},
 'shared variable':b=>{b.environment.config.sharedVariables={UNRELATED:{value:secret}};},
 'other service':b=>{b.environment.config.services[ids[4]]={variables:{PRIVATE:{value:secret}}};},
 'build option':b=>{b.environment.config.services[ids[2]].build={buildCommand:'unexpected'};}
};
for(const phase of ['precommit','postcommit','presource','postsource','predeploy'])for(const [name,change]of Object.entries(privateConfigurationDrift))test('full private configuration drift holds: '+phase+' '+name,async()=>{
 let receiptReads=0;const f=fixture('success',{install:true,edit:(b,state)=>{
  if(state.committed)receiptReads++;
  if(phase==='precommit'&&state.staged&&!state.committed||phase==='postcommit'&&receiptReads===1||phase==='presource'&&receiptReads===2||phase==='postsource'&&receiptReads===3||phase==='predeploy'&&receiptReads===4)change(b);
 }});
 await assert.rejects(f.run(),e=>imageHandoffFailure(e)===(phase==='precommit'?'PRECOMMIT_CONFIGURATION_DRIFT':'UNRELATED_CONFIGURATION_DRIFT'));
 assert.equal(f.trace.includes('deploy'),false);assert.equal(f.trace.includes('source'),['postsource','predeploy'].includes(phase));
});
for(const phase of ['postcommit','presource','postsource','predeploy'])test('applied registry credentials must stay exact: '+phase,async()=>{
 let receiptReads=0;const targetRead={postcommit:1,presource:2,postsource:3,predeploy:4}[phase];
 const f=fixture('success',{install:true,edit:(b,state)=>{if(state.committed&&++receiptReads===targetRead)b.environment.config.services[ids[2]].deploy.registryCredentials.password='[REDACTED]';}});
 await assert.rejects(f.run(),e=>imageHandoffFailure(e)==='APPLIED_REGISTRY_CREDENTIALS');assert.equal(f.trace.includes('deploy'),false);
});
for(const what of ['source','active instance','latest identity','in flight','pending','release proof'])test('drift after verified source is rejected immediately before deployment: '+what,async()=>{
 let reads=0;const f=fixture('success',{install:true,edit:(b,state)=>{
  if(!state.sourceUpdated||++reads!==2)return;
  if(what==='source')b.game.source.repo='catillatio/test';
  if(what==='active instance')b.game.activeDeployments[0].instances[0].id='restarted';
  if(what==='latest identity')b.game.latestDeployment.id=newId;
  if(what==='in flight')b.inFlight.edges=[{node:{id:newId}}];
  if(what==='pending')b.pending={id:ids[5],environmentId:ids[1],status:'STAGED',patch:{services:{[ids[2]]:{source:{repo:'other'}}}}};
  if(what==='release proof')b.environment.config.services[ids[2]].variables.KINGDOM_RELEASE_BACKUP_PROOF.value='forged';
 }});
 await assert.rejects(f.run());assert.equal(f.trace.filter(x=>x==='source').length,1);assert.equal(f.trace.includes('deploy'),false);
});
test('configuration commit cannot secretly perform the source transition',async()=>{
 const f=fixture('success',{edit:(b,state)=>{if(state.committed&&!state.sourceUpdated)b.game.source={image:candidate().reference,repo:null};}});
 await assert.rejects(f.run(),e=>imageHandoffFailure(e)==='SOURCE_UNCHANGED_DURING_CONFIG_COMMIT');assert.equal(f.trace.includes('source'),false);assert.equal(f.trace.includes('deploy'),false);
});
for(const credentialDelta of ['both','username','password','none'])test('an existing exact credential can be omitted from the staged delta: '+credentialDelta,async()=>{
 const f=fixture('success',{install:true,existingCredentials:true,credentialDelta,delta:true});assert.equal(await f.run(),newId);
 assert.deepEqual(f.trace.filter(x=>['stage','commit','source','deploy'].includes(x)),['stage','commit','source','deploy']);
});
for(const credentialDelta of ['username','password','none'])test('omitted credential fields never imply missing applied credentials match: '+credentialDelta,async()=>{
 const f=fixture('success',{install:true,credentialDelta});await assert.rejects(f.run());assert.deepEqual(f.trace,['inspect','stage']);
});
for(const phase of ['initial','precommit'])for(const replacement of ['[REDACTED]','wrong-private-password'])test('unchanged credential delta requires exact private applied values: '+phase+' '+replacement,async()=>{
 const f=fixture('success',{install:true,existingCredentials:true,credentialDelta:'none',edit:(b,state)=>{
  if(phase==='initial'&&!state.staged||phase==='precommit'&&state.staged&&!state.committed)b.environment.config.services[ids[2]].deploy.registryCredentials.password=replacement;
 }});
 await assert.rejects(f.run(),e=>imageHandoffFailure(e)==='REGISTRY_PASSWORD');assert.equal(f.trace.includes('commit'),false);
});
test('an already image-backed service can update to the next exact digest without credential reinstallation',async()=>{
 const prior=candidate().reference.replace('b'.repeat(64),'f'.repeat(64));
 const f=fixture('success',{existingCredentials:true,edit:(b,state)=>{if(!state.sourceUpdated){b.game.source={image:prior,repo:null};b.environment.config.services[ids[2]].source={image:prior};}}});
 assert.equal(await f.run(),newId);assert.equal(f.trace.filter(x=>x==='source').length,1);
});
for(const source of [undefined,null,{repo:'other/repository'},{repo:'catillatio/test',image:candidate().reference}])test('preflight rejects mismatched serialized/effective source views: '+(source===undefined?'missing':source===null?'null':Object.keys(source).join(',')),async()=>{
 const f=fixture('success',{edit:b=>{b.environment.config.services[ids[2]].source=source;}});
 await assert.rejects(preflightImageTarget(f.settings,approval(),{api:f.api}));assert.deepEqual(f.trace,['inspect']);
});
test('published monorepo source.rootDirectory survives the typed transition unchanged',async()=>{
 const f=fixture('success',{install:true,edit:b=>{b.environment.config.services[ids[2]].source.rootDirectory='/knights-reforged';}});
 assert.equal(await f.run(),newId);
});
for(const changed of [undefined,'/other',null])test('typed transition cannot remove or reinterpret the monorepo root: '+String(changed),async()=>{
 const f=fixture('success',{edit:(b,state)=>{const source=b.environment.config.services[ids[2]].source;if(!state.sourceUpdated)source.rootDirectory='/knights-reforged';else if(changed!==undefined)source.rootDirectory=changed;}});
 await assert.rejects(f.run(),e=>imageHandoffFailure(e)==='APPLIED_IMAGE_SOURCE');assert.equal(f.trace.includes('deploy'),false);
});
test('an initial serialized root conflicting with the effective root stops before recovery',async()=>{
 const f=fixture('success',{edit:b=>{b.environment.config.services[ids[2]].source.rootDirectory='/other';}});
 await assert.rejects(preflightImageTarget(f.settings,approval(),{api:f.api}));assert.deepEqual(f.trace,['inspect']);
});

test('captured sanitized provider shape passes the shared read-only guard with synthetic identity envelopes',async()=>{
 const f=fixture('success',{install:true,failedLatest:true,regional:true,providerShape:true});
 const data=await f.api(imageInspectQuery,{projectId:ids[0],environmentId:ids[1],serviceId:ids[2]});
 const actual=sanitizedTargetMetadata(data,{serviceId:ids[2]});
 for(const [field,value]of Object.entries(capturedObservation.fields))assert.deepEqual(actual[field],value,field);
 const inspected=fixture('success',{install:true,failedLatest:true,regional:true,providerShape:true});
 const result=await inspectImageTarget(inspectEnv,{api:inspected.api});assert.equal(result.result,'MATCH');assert.equal(result.firstRejected,null);assert.deepEqual(inspected.trace,['inspect']);
 const baseline=JSON.parse((await preflightImageTarget(f.settings,approval(),{api:f.api})).baseline);
 assert.equal(baseline.healthcheckTimeout,null);assert.deepEqual(baseline.activeDeployments[0].instances.map(i=>i.status),['REMOVED','RUNNING']);
 assert.equal(capturedObservation.firstRejected.field,'game.healthcheckTimeout');assert.equal(capturedObservation.firstRejected.actual,null);
});
test('complete synthetic first handoff preserves raw null timeout and all removed/running identities through the exact commit',async()=>{
 const f=fixture('success',{install:true,failedLatest:true,regional:true,providerShape:true});assert.equal(await f.run(),newId);
 assert.deepEqual(f.trace,['inspect','stage','inspect','commit','workflow','receipt','receipt','source','receipt','receipt','deploy','identity']);
});
for(const value of [undefined,0,-1,121,300,Number.NaN,'120','300',{},[]])test('timeout rejects unsupported/missing explicit setting '+String(value),async()=>{
 const f=fixture('success',{failedLatest:true,regional:true,providerShape:true,edit:b=>{b.game.healthcheckTimeout=value;}});
 await assert.rejects(preflightImageTarget(f.settings,approval(),{api:f.api}));assert.deepEqual(f.trace,['inspect']);
});
for(const where of ['service','shared','serialized','missing config','unknown variable map'])test('null timeout requires verified unset configuration and no override: '+where,async()=>{
 const f=fixture('success',{failedLatest:true,regional:true,providerShape:true,edit:b=>{
  const service=b.environment.config.services[ids[2]];
  if(where==='service')service.variables.RAILWAY_HEALTHCHECK_TIMEOUT_SEC={value:secret};
  if(where==='shared')b.environment.config.sharedVariables={RAILWAY_HEALTHCHECK_TIMEOUT_SEC:{value:secret}};
  if(where==='serialized')service.deploy.healthcheckTimeout=600;
  if(where==='missing config')delete service.deploy;
  if(where==='unknown variable map')service.variables=[];
 }});
 await assert.rejects(preflightImageTarget(f.settings,approval(),{api:f.api}));assert.deepEqual(f.trace,['inspect']);
});
for(const status of ['CREATED','INITIALIZING','RESTARTING','REMOVING','CRASHED','STOPPED','EXITED','SKIPPED','OTHER'])test('removed history does not permit another non-running or uncertain instance: '+status,async()=>{
 const f=fixture('success',{failedLatest:true,regional:true,providerShape:true,edit:b=>{b.game.activeDeployments[0].instances[0].status=status;}});
 await assert.rejects(preflightImageTarget(f.settings,approval(),{api:f.api}));assert.deepEqual(f.trace,['inspect']);
});
test('removed history cannot hide two running instances, duplicate identity or no running instance',async()=>{
 for(const edit of [b=>{b.game.activeDeployments[0].instances.push({id:'other-running',status:'RUNNING'});},b=>{b.game.activeDeployments[0].instances[0].id=b.game.activeDeployments[0].instances[1].id;},b=>{b.game.activeDeployments[0].instances[1].status='REMOVED';}]){
  const f=fixture('success',{failedLatest:true,regional:true,providerShape:true,edit});await assert.rejects(preflightImageTarget(f.settings,approval(),{api:f.api}));assert.deepEqual(f.trace,['inspect']);
 }
});
for(const point of ['before commit','after commit'])for(const change of ['raw timeout','removed identity','running identity','override'])test('captured shape remains immutably bound across '+point+': '+change,async()=>{
 const f=fixture('success',{install:true,failedLatest:true,regional:true,providerShape:true,edit:(b,state)=>{
  if(!state.staged||state.committed!==(point==='after commit'))return;
  if(change==='raw timeout')b.game.healthcheckTimeout=120;
  if(change==='removed identity')b.game.activeDeployments[0].instances[0].id='other-removed-instance';
  if(change==='running identity')b.game.activeDeployments[0].instances[1].id='restarted-running-instance';
  if(change==='override')b.environment.config.services[ids[2]].variables.RAILWAY_HEALTHCHECK_TIMEOUT_SEC={value:'600'};
 }});
 await assert.rejects(f.run());assert.deepEqual(f.trace.filter(x=>['stage','commit','source','deploy'].includes(x)),point==='before commit'?['stage']:['stage','commit']);
});
