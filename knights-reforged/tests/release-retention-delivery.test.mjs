import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {scope,fixture,scenario,approve,publicKey,keys} from './fixtures/release-retention.mjs';
import {hash,checkScope,checkEnvironment,checkAuthorizerEnvironment} from '../deployment/release/retention/protocol.mjs';
import {makePlan} from '../deployment/release/retention/retention.mjs';
import {coordinator,frame,input,makeReceipt,githubEnvironment,verifyArm,signArm} from '../deployment/release/retention/delivery/protocol.mjs';
import {executeCoordinator} from '../deployment/release/retention/delivery/coordinator.mjs';
import {signRequest} from '../deployment/release/retention/delivery/signer.mjs';
import {checkPreflight,platform,preflightQuery} from '../deployment/release/retention/delivery/platform.mjs';
import {roleFiles} from '../deployment/release/retention/delivery/bundle.mjs';
const clone=x=>structuredClone(x);
const now=Date.now(),copies=[1,2,3,4].map(n=>fixture(n,{now,age:50-n})),scene=scenario(copies,now);
const state=scene.state,plan=makePlan(scene.snapshot,state,scope);plan.rows=plan.rows.filter(r=>r.oid===copies[0].database.oid);plan.reclaimableBytes=plan.rows[0].bytes;
const env={...githubEnvironment(state.coordinator,'fixture-read-token'),KINGDOM_RETENTION_EXECUTION_APPROVED:'1',KINGDOM_RETENTION_SCOPE:JSON.stringify(scope),RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,RETENTION_REQUEST_ID:randomUUID(),RETENTION_OPERATION:'retire'};
const payload={protocol:'kingdom-retention-delivery-v1',operation:'retire',requestId:env.RETENTION_REQUEST_ID,scope,state,data:{plan}};
function github(url){
 if(url.endsWith('/approvals'))return Response.json([{state:'approved',comment:'retention '+payload.requestId+' '+hash(payload),user:{login:'catillatio'},environments:[{name:'retention-signing'}]}]);
 if(url===scope.origin+'/healthz')return Response.json({status:'ready',release:'phase4.7',commit:state.activeSha});
 if(url.endsWith('/jobs?per_page=100'))return Response.json({total_count:3,jobs:[{name:'owner-approval',status:'completed',conclusion:'success',run_attempt:1},{name:'retire',status:'in_progress',run_attempt:1},{name:'sign-retirement',status:'waiting',run_attempt:1}]});
 if(url.includes('/workflows/production-release.yml/runs?'))return Response.json({total_count:0,workflow_runs:[]});
 return Response.json({id:999,run_attempt:1,status:'in_progress',path:state.coordinator.workflow,event:'workflow_dispatch',head_branch:'release/production',head_repository:{full_name:'catillatio/test'},head_sha:state.coordinator.headSha});
}
function harness(){
 const objects=new Map([['input.json',clone(payload)]]),calls=[],frames={},ids={};
 const store={origin:'https://objects.fixture.invalid',grant:async(_run,_id,name,method)=>'https://objects.fixture.invalid/'+name+'?method='+method};
 const fetcher=async(url,options={})=>{
  if(!url.startsWith(store.origin))return github(url);
  const name=new URL(url).pathname.slice(1);
  if(options.method==='PUT'){
   calls.push(['put',name]);assert.equal(options.headers['if-none-match'],'*');
   if(objects.has(name))return new Response('',{status:412});objects.set(name,JSON.parse(options.body));return new Response('',{status:200});
  }
  assert.ok(objects.has(name),'Missing fixture object '+name);return Response.json(objects.get(name));
 };
 const provider={preflight:async()=>calls.push(['preflight']),launch:async(role,f)=>{
  calls.push(['launch',role]);frames[role]=f;ids[role]=randomUUID();objects.set(role+'-ready.json',makeReceipt(f,ids[role],'ready'));objects.set(role+'-result.json',makeReceipt(f,ids[role],'completed',hash(payload)));return ids[role];
 },completion:async(id,_scope,role)=>{calls.push(['complete',role]);assert.equal(id,ids[role]);},stop:async(id,_scope,role)=>{calls.push(['stop',role]);assert.equal(id,ids[role]);}};
 return {objects,calls,frames,ids,store,fetcher,provider,bundle:async(role,sha)=>({directory:'/private/fixed-'+role,codeDigest:hash(role)})};
}
for(const role of ['executor','authorizer'])test('actual independent '+role+' service identity is required',()=>{
 const variable=role==='executor'?'KINGDOM_RETENTION_DATABASE_URL':'KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL';
 const actor=role==='executor'?'kc_retention_runtime':'kc_retention_authorizer';
 const vars={NODE_ENV:'production',KINGDOM_RETENTION_ENABLED:'1',RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,RAILWAY_SERVICE_ID:role==='executor'?scope.operatorServiceId:scope.delivery.authorizerServiceId,KINGDOM_RETENTION_PG_SERVICE_ID:scope.verificationServiceId,KINGDOM_RETENTION_WORKER_ADMIN_DATABASE:scope.adminDatabase,[variable]:'postgres://'+actor+':private@copy.railway.internal/'+scope.adminDatabase};
 const check=role==='executor'?checkEnvironment:checkAuthorizerEnvironment;assert.ok(check(vars,scope));
 for(const id of [undefined,randomUUID(),scope.gameServiceId,scope.productionServiceId,scope.verificationServiceId,scope.verificationWorkerServiceId,role==='executor'?scope.delivery.authorizerServiceId:scope.operatorServiceId])assert.throws(()=>check({...vars,RAILWAY_SERVICE_ID:id},scope));
});
test('legacy scopes remain readable but cannot impersonate a separate authorizer',()=>{
 const legacy=clone(scope);delete legacy.delivery;assert.equal(checkScope(legacy),legacy);
 assert.throws(()=>checkAuthorizerEnvironment({NODE_ENV:'production',KINGDOM_RETENTION_ENABLED:'1'},legacy));
 for(const patch of [{authorizerServiceId:scope.operatorServiceId},{authorizerServiceId:scope.gameServiceId},{authorizerServiceId:undefined},{journalVolumeId:'bad'},{protocol:'other'}])assert.throws(()=>checkScope({...scope,delivery:{...scope.delivery,...patch}}));
});
for(const patch of [{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'push'},{GITHUB_JOB:'sign-retirement'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_SHA:'bad'},{GITHUB_REPOSITORY:'attacker/test'},{KINGDOM_RETENTION_EXECUTION_APPROVED:'0'}])test('coordinator rejects '+Object.keys(patch).join(),()=>assert.throws(()=>coordinator({...env,...patch})));
test('private delivery verifies both ready identities before arming and stops exact workers before returning',async()=>{
 const h=harness(),logs=[];assert.deepEqual(await executeCoordinator({...h,env,log:s=>logs.push(s)}),{passed:true});
 assert.equal(h.calls.filter(c=>c[0]==='launch').length,2);assert.equal(h.calls.filter(c=>c[0]==='stop').length,2);
 for(const role of ['executor','authorizer'])assert.equal(verifyArm(h.objects.get(role+'-arm.json'),h.frames[role],h.ids[role]),hash(payload));
 assert.ok(h.calls.findIndex(c=>c[0]==='put'&&c[1]==='context.json')>h.calls.findIndex(c=>c[0]==='launch'&&c[1]==='executor'));
 assert.ok(logs.every(s=>/^[A-Z_]+$/.test(s)));assert.ok(!JSON.stringify(logs).includes(env.GH_TOKEN));
});
test('wrong ready deployment, source or commit cannot arm either worker',async()=>{
 for(const key of ['deploymentId','codeDigest','coordinator']){
  const h=harness(),launch=h.provider.launch;h.provider.launch=async(role,f)=>{const id=await launch(role,f);if(role==='executor'){const r=h.objects.get(role+'-ready.json');r[key]=key==='coordinator'?{...r.coordinator,headSha:'1'.repeat(40)}:randomUUID();}return id;};
  await assert.rejects(executeCoordinator({...h,env}));assert.equal(h.calls.filter(c=>c[0]==='put'&&c[1].endsWith('-arm.json')).length,0);
 }
});
test('cancellation before execution launches nothing; cancellation after launch stops only its exact deployment',async()=>{
 let h=harness(),c=new AbortController();c.abort();await assert.rejects(executeCoordinator({...h,env,signal:c.signal}));assert.equal(h.calls.length,0);
 h=harness();c=new AbortController();const launch=h.provider.launch;h.provider.launch=async(...a)=>{const id=await launch(...a);c.abort();return id;};
 await assert.rejects(executeCoordinator({...h,env,signal:c.signal}));assert.equal(h.calls.filter(x=>x[0]==='launch').length,1);assert.equal(h.calls.filter(x=>x[0]==='stop').length,1);assert.equal(h.objects.has('executor-arm.json'),false);
});
test('lost launch acknowledgement is not retried or followed by arming',async()=>{
 const h=harness();h.provider.launch=async()=>{h.calls.push(['launch']);throw Error('Private provider secret must not be logged');};
 await assert.rejects(executeCoordinator({...h,env}));assert.equal(h.calls.filter(c=>c[0]==='launch').length,1);assert.equal(h.objects.has('executor-arm.json'),false);
});
test('unverified shutdown cannot return a successful completion',async()=>{
 const h=harness();h.provider.stop=async()=>{throw Error('Synthetic stop lost');};await assert.rejects(executeCoordinator({...h,env}));
});
test('private handoff rejects stale state, wrong operation and an expanded multi-copy selection',()=>{
 const f={scope,coordinator:state.coordinator,operation:'retire',requestId:payload.requestId};
 for(const p of [{...payload,state:{...state,observedAt:new Date(0).toISOString()}},{...payload,operation:'reconcile'},{...payload,data:{plan:{...plan,rows:[plan.rows[0],{...plan.rows[0],name:copies[1].database.name}]}}}])assert.throws(()=>input(p,f));
});
test('signer has no Railway/SQL authority; missing input or stale/mismatched job cannot be signed',async()=>{
 const h=harness(),signed=approve(plan,state,{now:Date.now()});
 const f={protocol:payload.protocol,role:'executor',requestId:payload.requestId,coordinator:state.coordinator,codeDigest:hash('executor'),deliveryVerifyKey:publicKey},dep=randomUUID();
 h.objects.set('context.json',{protocol:payload.protocol,scope,coordinator:state.coordinator,requestId:payload.requestId,operation:'retire',deployments:{executor:dep},codeDigests:{executor:f.codeDigest},deliveryVerifyKey:publicKey});
 h.objects.set('executor-arm.json',signArm(f,dep,hash(payload),keys.privateKey));
 const vars={...env,GITHUB_JOB:'sign-retirement',KINGDOM_RETENTION_VERIFY_KEY:publicKey};
 assert.deepEqual(await signRequest({...h,env:vars,runAuthorize:async()=>signed.encoded}),{passed:true});assert.equal(h.objects.get('signature.json').inputDigest,hash(payload));
 for(const key of ['RAILWAY_TOKEN','RAILWAY_API_TOKEN','DATABASE_URL','KINGDOM_RETENTION_DATABASE_URL','KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL','KINGDOM_RELEASE_SIGNING_KEY'])await assert.rejects(signRequest({...h,env:{...vars,[key]:'forbidden'},runAuthorize:async()=>{throw Error('must not sign');}}));
 h.objects.delete('input.json');await assert.rejects(signRequest({...h,env:vars,runAuthorize:async()=>{throw Error('must not sign');}}));
});
test('fixed bundles keep signer/adopter/installer out of execution images',async()=>{
 assert.ok(!roleFiles('executor').some(p=>/authorize|permit|adoption|register\.mjs|observations\.sql|public\//.test(p)));
 assert.ok(!roleFiles('authorizer').some(p=>/authorize\.mjs|adoption|register\.mjs|cli\.mjs|job\.mjs/.test(p)));
 const w=await readFile(new URL('../../.github/workflows/recovery-copy-retention.yml',import.meta.url),'utf8');
 assert.doesNotMatch(w,/self-hosted|runner-group|upload-artifact|schedule:|inputs\.(?:image|command|script|url)/);assert.match(w,/environment: retention-signing/);
 const signer=w.slice(w.indexOf('  sign-retirement:'));assert.doesNotMatch(signer,/RAILWAY_TOKEN|DATABASE_URL/);
 assert.equal(await readFile(new URL('../deployment/release/retention/workflow.yml',import.meta.url),'utf8'),w);
});
function preflightFixture(){
 const service=(serviceId,serviceName)=>({serviceId,environmentId:scope.environmentId,serviceName,source:null,startCommand:null,buildCommand:null,preDeployCommand:null,rootDirectory:null,cronSchedule:null,restartPolicyType:'NEVER',numReplicas:1,healthcheckPath:null,service:{repoTriggers:{edges:[]}},domains:{serviceDomains:[],customDomains:[]},activeDeployments:[]});
 const config={services:Object.fromEntries([scope.operatorServiceId,scope.delivery.authorizerServiceId].map(id=>[id,{deploy:{multiRegionConfig:{iad:{numReplicas:1}}}}]))};
 return {project:{id:scope.projectId,name:'merry-patience'},environment:{id:scope.environmentId,projectId:scope.projectId,name:'production',config,serviceInstances:{edges:[service(scope.operatorServiceId,'KingdomCopyRetention'),service(scope.delivery.authorizerServiceId,'KingdomCopyAuthorizer')].map(node=>({node}))},volumeInstances:{edges:[{node:{volumeId:scope.delivery.journalVolumeId,serviceId:scope.operatorServiceId,mountPath:'/run/kingdom-retention',isPendingDeletion:false}}]}},pending:null};
}
test('preflight accepts only dedicated private stopped services and the exact independent journal volume',()=>{
 const f=preflightFixture();checkPreflight(f,scope);
 const changes=[d=>d.project.id=randomUUID(),d=>d.environment.name='staging',d=>d.pending={environmentId:scope.environmentId,status:'STAGED',appliedAt:null,lastAppliedError:null,patch:{services:{unrelated:{name:'changed'}}}},d=>d.environment.serviceInstances.edges[0].node.serviceId=scope.gameServiceId,d=>d.environment.serviceInstances.edges[0].node.source={repo:'catillatio/test',image:null},d=>d.environment.serviceInstances.edges[0].node.service.repoTriggers.edges.push({node:{id:randomUUID()}}),d=>d.environment.serviceInstances.edges[0].node.startCommand='arbitrary',d=>d.environment.serviceInstances.edges[0].node.cronSchedule='* * * * *',d=>d.environment.serviceInstances.edges[0].node.restartPolicyType='ALWAYS',d=>d.environment.serviceInstances.edges[0].node.numReplicas=2,d=>d.environment.serviceInstances.edges[0].node.domains.serviceDomains.push({id:randomUUID()}),d=>d.environment.serviceInstances.edges[0].node.activeDeployments.push({deploymentStopped:false,instances:[{status:'RUNNING'}]}),d=>d.environment.volumeInstances.edges[0].node.volumeId=randomUUID(),d=>d.environment.volumeInstances.edges[0].node.serviceId=scope.verificationServiceId,d=>d.environment.volumeInstances.edges[0].node.mountPath='/var/lib/postgresql',d=>d.environment.volumeInstances.edges[0].node.isPendingDeletion=true];
 for(const change of changes){const bad=clone(f);change(bad);assert.throws(()=>checkPreflight(bad,scope));}
});
test('preflight accepts the authenticated Railway regional-only replica shape and matching legacy counts',()=>{
 // Observed on both undeployed workers after the reviewed infrastructure commit:
 // legacy count null, deploy.multiRegionConfig exactly {iad:{numReplicas:1}}.
 for(const counts of [[null,null],[1,1],[null,1],[1,null]]){
  const f=preflightFixture();f.environment.serviceInstances.edges.forEach(({node},i)=>{node.numReplicas=counts[i];});
  checkPreflight(f,scope);
 }
});
test('each exact worker requires explicit one-replica iad evidence, even when the legacy count is one',()=>{
 const invalid=[undefined,null,{},[],{iad:{}},{iad:{numReplicas:null}},{iad:{numReplicas:0}},{iad:{numReplicas:2}},{iad:{numReplicas:-1}},{iad:{numReplicas:0.5}},{iad:{numReplicas:'1'}},{iad:{numReplicas:true}},{ams:{numReplicas:1}},{IAD:{numReplicas:1}},{iad:{numReplicas:1},ams:{numReplicas:1}},{iad:{numReplicas:1},ams:{numReplicas:0}}];
 for(const index of [0,1])for(const legacy of [null,1])for(const regions of invalid){
  const f=preflightFixture(),s=f.environment.serviceInstances.edges[index].node;
  s.numReplicas=legacy;f.environment.config.services[s.serviceId].deploy.multiRegionConfig=regions;
  assert.throws(()=>checkPreflight(f,scope));
 }
});
test('regional proof never overrides a missing or contradictory legacy replica count',()=>{
 for(const index of [0,1])for(const count of [undefined,0,2,-1,0.5,'1',true,NaN,Infinity]){
  const f=preflightFixture();f.environment.serviceInstances.edges[index].node.numReplicas=count;
  assert.throws(()=>checkPreflight(f,scope));
 }
});
test('regional evidence cannot be absent or borrowed from another service',()=>{
 for(const edit of [f=>delete f.environment.config,f=>f.environment.config=null,f=>delete f.environment.config.services,
  ...[scope.operatorServiceId,scope.delivery.authorizerServiceId].flatMap(id=>[
   f=>delete f.environment.config.services[id],f=>f.environment.config.services[id].deploy=null,
   f=>{f.environment.config.services[scope.gameServiceId]=f.environment.config.services[id];delete f.environment.config.services[id];}
  ])]){
  const f=preflightFixture();for(const {node} of f.environment.serviceInstances.edges)node.numReplicas=null;
  edit(f);assert.throws(()=>checkPreflight(f,scope));
 }
});
test('provider preflight reads regional proof privately and rejects unsafe evidence before proxy checks or launch',async()=>{
 for(const valid of [true,false]){
  const f=preflightFixture(),calls=[];
  for(const {node} of f.environment.serviceInstances.edges)node.numReplicas=null;
  // Unrelated configuration is not replica evidence and is never returned/logged.
  f.environment.config.services[scope.gameServiceId]={variables:{unrelated:'synthetic-private-sentinel'}};
  if(!valid)f.environment.config.services[scope.delivery.authorizerServiceId].deploy.multiRegionConfig.iad.numReplicas=2;
  const p=platform('fixture-token',{command:async()=>assert.fail('Preflight must not launch a worker'),fetcher:async(url,o)=>{
   assert.equal(url,'https://backboard.railway.com/graphql/v2');assert.equal(o.redirect,'error');
   const q=JSON.parse(o.body);assert.match(q.query,/^query /);calls.push(q);
   if(q.query===preflightQuery){assert.match(q.query,/config\(decryptVariables:false\)/);assert.deepEqual(q.variables,{projectId:scope.projectId,environmentId:scope.environmentId});return Response.json({data:f});}
   assert.match(q.query,/RetentionDeliveryNetwork/);return Response.json({data:{tcpProxies:[]}});
  }});
  if(valid){assert.equal(await p.preflight(scope),undefined);assert.equal(calls.length,3);assert.deepEqual(calls.slice(1).map(c=>c.variables.serviceId),[scope.operatorServiceId,scope.delivery.authorizerServiceId]);}
  else{await assert.rejects(p.preflight(scope));assert.equal(calls.length,1);}
 }
});
test('Railway API transport stages only one frame with skipDeploys and independently verifies the queued target',async()=>{
 const calls=[],id=randomUUID(),variables={KINGDOM_RETENTION_ENABLED:'1'};
 const fetcher=async(url,options)=>{
  assert.equal(url,'https://backboard.railway.com/graphql/v2');assert.equal(options.redirect,'error');assert.ok(options.headers['project-access-token']);
  const q=JSON.parse(options.body);calls.push(q);
  if(q.query.includes('RetentionDeliveryStage')){assert.deepEqual(Object.keys(q.variables.variables),['KINGDOM_RETENTION_JOB']);assert.match(q.query,/skipDeploys:true/);Object.assign(variables,q.variables.variables);return Response.json({data:{variableCollectionUpsert:true}});}
  if(q.query.includes('RetentionDeliveryVariables'))return Response.json({data:{variables}});
  return Response.json({data:{deployment:{id,projectId:scope.projectId,environmentId:scope.environmentId,serviceId:scope.operatorServiceId}}});
 };
 const p=platform('fixture-token',{fetcher,command:async(bin,args)=>{assert.equal(bin,'railway');assert.ok(args.includes('--path-as-root'));assert.ok(!JSON.stringify(args).includes(env.GH_TOKEN));return JSON.stringify({deploymentId:id,logsUrl:'https://ignored.invalid'});}});
 assert.equal(await p.launch('executor',{scope,coordinator:state.coordinator},'/private/bundle'),id);assert.equal(calls.filter(x=>x.query.includes('RetentionDeliveryStage')).length,1);
});
test('exact-ID stop never selects latest or touches a different service; an ambiguous mutation is never retried',async()=>{
 const id=randomUUID();let stopped=false,writes=0;
 const f=async(_url,o)=>{const q=JSON.parse(o.body);assert.equal(q.variables.id,id);
  if(q.query.includes('RetentionDeliveryStop(')){writes++;stopped=true;return Response.json({data:{deploymentRemove:true}});}
  return Response.json({data:{deployment:{id,projectId:scope.projectId,environmentId:scope.environmentId,serviceId:scope.operatorServiceId,deploymentStopped:stopped,instances:[{id:'one',status:stopped?'EXITED':'RUNNING'}]}}});};
 await platform('fixture-token',{fetcher:f}).stop(id,scope,'executor');assert.equal(writes,1);
 await assert.rejects(platform('fixture-token',{fetcher:f}).stop(id,scope,'authorizer'));assert.equal(writes,1);
 let attempts=0;await assert.rejects(platform('fixture-token',{fetcher:async(u,o)=>{const q=JSON.parse(o.body);if(q.query.includes('RetentionDeliveryStop(')){attempts++;throw Error('lost acknowledgement');}return Response.json({data:{deployment:{id,projectId:scope.projectId,environmentId:scope.environmentId,serviceId:scope.operatorServiceId,deploymentStopped:false,instances:[{status:'RUNNING'}]}}});}}).stop(id,scope,'executor'));assert.equal(attempts,1);
});
test('frame rejects arbitrary URLs, missing keys, extra commands, stale frames and substituted role',()=>{
 const f={deliveryVerifyKey:publicKey,protocol:payload.protocol,role:'executor',operation:'retire',requestId:payload.requestId,scope,coordinator:state.coordinator,codeDigest:hash('executor'),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString(),githubToken:'fixture-read',origin:'https://objects.fixture.invalid',urls:Object.fromEntries(['inputGet','readyPut','armGet','resultPut','signatureGet','permitGet'].map(n=>[n,'https://objects.fixture.invalid/'+n]))};
 const vars={RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,RAILWAY_SERVICE_ID:scope.operatorServiceId,RAILWAY_DEPLOYMENT_ID:randomUUID()};frame(f,vars,'executor');
 for(const changed of [{...f,command:'bad'},{...f,role:'authorizer'},{...f,expiresAt:new Date(0).toISOString()},{...f,urls:{...f.urls,inputGet:'http://objects.fixture.invalid/file'}},{...f,urls:{...f.urls,inputGet:'https://other.invalid/file'}},{...f,urls:{...f.urls,inputGet:'https://secret@objects.fixture.invalid/file'}}])assert.throws(()=>frame(changed,vars,'executor'));
});
test('dashboard installation is explicitly gated, cannot enable retirement and never needs SQL or signing credentials',async()=>{
 const {installationTarget,installDisabled}=await import('../deployment/release/retention/delivery/install.mjs');
 const t={...Object.fromEntries(['projectId','environmentId','operatorServiceId','gameServiceId','productionServiceId','verificationServiceId','verificationWorkerServiceId'].map(k=>[k,scope[k]])),authorizerServiceId:scope.delivery.authorizerServiceId,journalVolumeId:scope.delivery.journalVolumeId};
 const vars={...env,RETENTION_OPERATION:'initialize-journal',KINGDOM_RETENTION_EXECUTION_APPROVED:'0',KINGDOM_RETENTION_INSTALLATION_APPROVED:'1',KINGDOM_RETENTION_INSTALL_TARGET:JSON.stringify(t)};
 assert.equal(installationTarget(vars).operatorServiceId,scope.operatorServiceId);
 for(const patch of [{RETENTION_OPERATION:'retire'},{KINGDOM_RETENTION_INSTALLATION_APPROVED:'0'},{GITHUB_REF:'refs/heads/untrusted'},{GITHUB_RUN_ATTEMPT:'2'}])assert.throws(()=>installationTarget({...vars,...patch}));
 let initialized=0,reset=0,stopped=0;
 const provider={tokenIdentity:async target=>{assert.equal(target.projectId,scope.projectId);},preflight:async()=>{},install:async(role)=>{assert.equal(role,'executor');initialized++;return randomUUID();},completion:async()=>{},resetInstallation:async()=>{reset++;},stop:async()=>{stopped++;}};
 await installDisabled({env:vars,provider,bundle:async()=>({directory:'/private/committed-bundle'}),fetcher:async u=>github(u)});
 assert.equal(initialized,1);assert.equal(reset,1);assert.equal(stopped,0);
 assert.throws(()=>coordinator(vars));
});
test('the retirement signer cannot replace the coordinator-frozen input or arm another deployment',async()=>{
 const h=harness();await executeCoordinator({...h,env});const f=h.frames.executor,dep=h.ids.executor,arm=h.objects.get('executor-arm.json');
 assert.equal(verifyArm(arm,f,dep),hash(payload));
 assert.throws(()=>verifyArm(arm,f,randomUUID()));
 const tampered=clone(arm),body=JSON.parse(Buffer.from(tampered.payload,'base64url'));body.inputDigest='0'.repeat(64);tampered.payload=Buffer.from(JSON.stringify(body)).toString('base64url');assert.throws(()=>verifyArm(tampered,f,dep));
 const forged=signArm(f,dep,'0'.repeat(64),keys.privateKey);assert.throws(()=>verifyArm(forged,f,dep));
});
test('owner review must approve this exact request/digest; bypass, another user or another digest cannot authorize it',async()=>{
 const {ownerReview}=await import('../deployment/release/retention/delivery/approval.mjs');
 const good={state:'approved',comment:'retention '+payload.requestId+' '+hash(payload),user:{login:'catillatio'},environments:[{name:'retention-signing'}]};
 await ownerReview(state.coordinator,payload.requestId,hash(payload),{githubToken:'fixture',fetcher:async()=>Response.json([good])});
 for(const record of [[],[{...good,state:'rejected'}],[{...good,comment:'other'}],[{...good,user:{login:'another'}}],[{...good,environments:[{name:'production'}]}],[good,good]])await assert.rejects(ownerReview(state.coordinator,payload.requestId,hash(payload),{githubToken:'fixture',fetcher:async()=>Response.json(record)}));
});
test('dedicated handoff supports actual SDK virtual-hosted and path-style origins without sharing backup credentials',async()=>{
 const {handoffStore}=await import('../deployment/release/retention/delivery/store.mjs');
 const base={KINGDOM_RETENTION_STORE_ENDPOINT:'https://t3.storageapi.dev',KINGDOM_RETENTION_STORE_REGION:'auto',KINGDOM_RETENTION_STORE_BUCKET:'retention-fixture',KINGDOM_RETENTION_STORE_ACCESS_KEY_ID:'fixture-access',KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY:'fixture-secret'};
 for(const style of ['true','false']){const s=handoffStore({...base,KINGDOM_RETENTION_STORE_PATH_STYLE:style});try{
  const url=await s.grant('999_1',payload.requestId,'input.json','GET');assert.equal(s.origin,new URL(url).origin);assert.equal(new URL(url).hostname,style==='true'?'t3.storageapi.dev':'retention-fixture.t3.storageapi.dev');
  await assert.rejects(s.grant('999_1',payload.requestId,'realm.dump.age','GET'));await assert.rejects(s.grant('999_1',payload.requestId,'input.json','DELETE'));
 }finally{s.close();}}
 assert.throws(()=>handoffStore({...base,KINGDOM_BACKUP_ACCESS_KEY_ID:'forbidden'}));
});
