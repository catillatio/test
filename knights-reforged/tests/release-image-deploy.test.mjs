import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deployImage,preflightImageTarget,emptyImagePatch,imageReleaseKeys} from '../deployment/release/image-deploy.mjs';
import {canonical} from '../deployment/release/image-policy.mjs';
import {candidate,approval,ids} from './fixtures/release-image.mjs';
const secret='synthetic-private-proof provider-token https://private.invalid/?credential=fixture';
const oldId='77777777-7777-4777-8777-777777777777',newId='88888888-8888-4888-8888-888888888888',patchId='99999999-9999-4999-8999-999999999999';
function fixture(mode='success'){
 const target={projectId:ids[0],environmentId:ids[1],serviceId:ids[2]},trace=[],logs=[];let staged,receipt,clock=0,inspectCount=0;
 const identity={id:oldId,...target,status:'SUCCESS',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:01:00Z',deploymentStopped:false};
 let game={serviceId:target.serviceId,environmentId:target.environmentId,startCommand:'node deployment/start.mjs',preDeployCommand:['node deployment/migrate.mjs'],healthcheckPath:'/healthz',healthcheckTimeout:120,numReplicas:1,restartPolicyType:'ON_FAILURE',rootDirectory:'/knights-reforged',source:{image:null,repo:'catillatio/test'},latestDeployment:identity,activeDeployments:[structuredClone(identity)]};
 const {source,...snapshot}=game;
 const settings={sha:candidate().sha,projectId:target.projectId,environmentId:target.environmentId,gameServiceId:target.serviceId,imageTargetDigest:createHash('sha256').update(canonical(snapshot)).digest('hex')};
 const values={KINGDOM_AUTOMATED_RELEASES:'1',KINGDOM_RELEASE_SHA:candidate().sha,KINGDOM_RESTORE_TEST_DATABASE:'kc_fixture_restore_test',KINGDOM_RELEASE_BACKUP_PROOF:secret,KINGDOM_RELEASE_ARTIFACT_KIND:'oci-image-v1',KINGDOM_RELEASE_IMAGE_REFERENCE:candidate().reference,KINGDOM_RELEASE_IMAGE_DIGEST:candidate().manifestDigest};
 const cleared=()=>mode==='same_committed_placeholder'?structuredClone(receipt):mode==='empty_placeholder'?{id:'opaque-empty-id',environmentId:target.environmentId,status:'STAGED',appliedAt:null,lastAppliedError:null,createdAt:'2026-10-02T00:00:01Z',updatedAt:'2026-10-02T00:00:01Z',patch:{}}:null;
 const base=pending=>({project:{id:target.projectId,name:'merry-patience'},environment:{id:target.environmentId,projectId:target.projectId,name:'production'},game:structuredClone(game),pending});
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
   return b;
  }
  if(query.startsWith('mutation KingdomImageStage')){
   trace.push('stage');assert.equal(v.environmentId,target.environmentId);assert.equal(v.merge,true);
   staged={id:patchId,environmentId:target.environmentId,status:'STAGED',createdAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',appliedAt:null,lastAppliedError:null,patch:structuredClone(v.input)};
   if(mode==='stage_ack_lost')throw Error(secret);
   if(mode==='stage_unrelated')staged.patch.services[ids[4]]={variables:{PRIVATE:{value:secret}}};
   if(mode==='stage_wrong_value')staged.patch.services[target.serviceId].variables.KINGDOM_RELEASE_BACKUP_PROOF.value='changed';
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
 const run=()=>deployImage(settings,approval(),values,{api,wait:async ms=>{clock+=ms;},now:()=>clock,log:code=>logs.push(code)});
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
