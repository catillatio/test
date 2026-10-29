import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {approveAdoption} from '../deployment/release/retention/delivery/approve-adoption.mjs';
import {executeAdoption} from '../deployment/release/retention/delivery/adoption-coordinator.mjs';
import {adoptionInput,rawDigest,verifyAdoptionPreservation} from '../deployment/release/retention/delivery/adoption-operation.mjs';
import {authenticateAdoption} from '../deployment/release/retention/delivery/adoption-artifact.mjs';
import {adopterConnection} from '../deployment/release/retention/delivery/adopter.mjs';
import {adoptionMethods,credentialReferences,checkAdopter} from '../deployment/release/retention/delivery/adoption-platform.mjs';
import {coordinator,input,frame,makeReceipt,signArm,verifyArm} from '../deployment/release/retention/delivery/protocol.mjs';
import {roleFiles} from '../deployment/release/retention/delivery/bundle.mjs';
import {checkEnvironment,checkAuthorizerEnvironment,hash} from '../deployment/release/retention/protocol.mjs';
import {fixture,scope,scenario} from './fixtures/release-retention.mjs';
const clone=v=>structuredClone(v),privateText='synthetic-private-admin-value-must-never-escape';
function context(){
 const now=Date.now(),copies=[fixture(910,{now,age:0,owner:'postgres'}),fixture(911,{now,age:0,owner:'postgres'})];
 const state=scenario(copies,now).state,adoption={serviceId:randomUUID(),futureAfter:new Date(now-600000).toISOString()};
 const manifest=copies[0].catalog.evidence,bytes=Buffer.from(JSON.stringify(manifest));
 const f={scope,coordinator:state.coordinator,operation:'adopt',requestId:randomUUID(),adoption};
 const data={protocol:'kingdom-retention-delivery-v1',scope,state,operation:'adopt',requestId:f.requestId,data:{manifestBytes:bytes.toString('base64url'),manifestSha256:rawDigest(bytes),expectedOid:manifest.report.verifiedCopyIdentity.oid,artifactId:'123',adoption}};
 const env={KINGDOM_RETENTION_EXECUTION_APPROVED:'0',KINGDOM_RETENTION_ADOPTION_APPROVED:'1',KINGDOM_RETENTION_ADOPTER_SERVICE_ID:adoption.serviceId,KINGDOM_RETENTION_SCOPE:JSON.stringify(scope),RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,GITHUB_REPOSITORY:'catillatio/test',GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_JOB:'retire',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:state.coordinator.runId,GITHUB_SHA:state.coordinator.headSha,GH_TOKEN:'synthetic-read-token',RETENTION_OPERATION:'adopt',RETENTION_REQUEST_ID:f.requestId};
 const before={now:new Date().toISOString(),databases:[...copies.map(c=>c.database),...['106971','129180'].map(oid=>({name:'emergency_'+oid,oid,owner:'postgres',template:false,bytes:'100',connections:0}))],catalog:[],pins:[],observations:[]};
 return {copies,state,adoption,manifest,bytes,f,data,env,before};
}
function harness(){
 const x=context(),objects=new Map([['input.json',x.data]]),calls=[],frames={},ids={};
 const store={origin:'https://objects.fixture.invalid',grant:async(_run,_id,name,method)=>store.origin+'/'+name+'?method='+method};
 const github=async url=>{
  calls.push(['github',url]);
  if(url.endsWith('/approvals'))return Response.json([{state:'approved',user:{login:'catillatio'},environments:[{name:'retention-signing'}],comment:'adoption '+x.f.requestId+' '+hash(x.data)}]);
  if(url.endsWith('/healthz'))return Response.json({status:'ready',release:'phase4.7',commit:x.state.activeSha});
  if(url.includes('/workflows/production-release.yml/runs?'))return Response.json({total_count:0,workflow_runs:[]});
  if(url.endsWith('/jobs?per_page=100'))return Response.json({total_count:2,jobs:[{name:'owner-approval',status:'completed',conclusion:'success',run_attempt:1},{name:'retire',status:'in_progress',run_attempt:1}]});
  const match=url.match(/\/runs\/(\d+)\/attempts\/1$/);assert.ok(match);const current=match[1]==='999';
  return Response.json({id:Number(match[1]),run_attempt:1,status:current?'in_progress':'completed',event:'workflow_dispatch',head_branch:'release/production',path:current?x.state.coordinator.workflow:'.github/workflows/production-release.yml',head_repository:{full_name:'catillatio/test'},head_sha:current?x.state.coordinator.headSha:x.manifest.request.sha});
 };
 const fetcher=async(url,o={})=>{
  if(!url.startsWith(store.origin))return github(url);
  const name=new URL(url).pathname.slice(1);
  if(o.method==='PUT'){
   calls.push(['put',name]);assert.equal(o.headers['if-none-match'],'*');if(objects.has(name))return new Response('',{status:412});objects.set(name,JSON.parse(o.body));
   if(name==='adopter-proceed.json')objects.set('adopter-result.json',{receipt:makeReceipt(frames.adopter,ids.adopter,'completed',hash(x.data)),baselineDigest:hash(x.before),result:{alreadyAdopted:false},verification:{retirementAuthorized:false}});
   for(const role of ['executor','authorizer'])if(name===role+'-arm.json')objects.set(role+'-result.json',makeReceipt(frames[role],ids[role],'completed',hash(x.data)));
   return new Response('',{status:200});
  }
  assert.ok(objects.has(name),'Missing fixture object '+name);return Response.json(objects.get(name));
 };
 const launch=async(role,f)=>{calls.push(['launch',role]);frames[role]=f;ids[role]=randomUUID();objects.set(role+'-ready.json',makeReceipt(f,ids[role],'ready'));return ids[role];};
 const provider={tokenIdentity:async()=>calls.push(['token']),adoptionPreflight:async()=>x.adoption,
  adoptionLaunch:launch,running:async()=>{},launchAdopter:async f=>{assert.ok(objects.has('adoption-approval.json'));assert.ok(objects.has('adoption-intent.json'));objects.set('adoption-baseline.json',x.before);return launch('adopter',f);},adoptionRunning:async()=>{},
  completion:async(_id,_scope,role)=>calls.push(['complete',role]),stop:async(_id,_scope,role)=>calls.push(['stop',role]),stopAdopter:async()=>calls.push(['stop','adopter']),resetAdoption:async()=>calls.push(['reset'])};
 return {...x,objects,calls,frames,ids,store,fetcher,provider,bundle:async role=>({directory:'/synthetic/'+role,codeDigest:hash(role)}),authenticate:async()=>{calls.push(['authenticate']);return {archiveDigest:'sha256:'+'a'.repeat(64)};},log:(s,d)=>{calls.push(['log',s]);if(s==='ADOPTION_REVIEW_READY')objects.set('adoption-approval.json',{requestId:x.f.requestId,coordinator:x.state.coordinator,inputDigest:d});}};
}
test('two-phase delivery: exact owner review, durable intent, frozen baseline, independent postcheck, exact cleanup',async()=>{
 const h=harness();assert.deepEqual(await executeAdoption(h),{passed:true});
 assert.deepEqual(h.calls.filter(c=>c[0]==='launch').map(c=>c[1]),['authorizer','executor','adopter']);
 assert.equal(h.calls.filter(c=>c[0]==='stop'&&c[1]==='adopter').length,1);assert.equal(h.calls.filter(c=>c[0]==='reset').length,1);
 assert.ok(h.calls.findIndex(c=>c[0]==='authenticate')<h.calls.findIndex(c=>c[0]==='launch'&&c[1]==='adopter'));
 assert.ok(h.calls.findIndex(c=>c[0]==='put'&&c[1]==='adoption-intent.json')<h.calls.findIndex(c=>c[0]==='launch'&&c[1]==='adopter'));
 assert.ok(h.calls.findIndex(c=>c[0]==='put'&&c[1]==='adopter-proceed.json')<h.calls.findIndex(c=>c[0]==='put'&&c[1]==='executor-arm.json'));
 assert.equal(verifyArm(h.objects.get('adopter-proceed.json'),h.frames.adopter,h.ids.adopter,hash(h.before)),hash(h.data));
 const post=h.objects.get('adoption-postcheck.json');assert.equal(verifyArm(h.objects.get('executor-arm.json'),h.frames.executor,h.ids.executor,hash(post)),hash(h.data));
 assert.ok(!JSON.stringify([...h.objects.values()]).includes(privateText));assert.equal(h.env.KINGDOM_RETENTION_EXECUTION_APPROVED,'0');
});
for(const failure of ['artifact','owner','upload','stop','reset','cancel'])test(failure+' failure is closed, bounded, secret-safe and never replays a privileged launch',async()=>{
 const h=harness(),controller=new AbortController();h.signal=controller.signal;
 if(failure==='artifact')h.authenticate=async()=>{throw Error(privateText);};
 if(failure==='owner'){const f=h.fetcher;h.fetcher=async(u,o)=>u.endsWith('/approvals')?Response.json([]):f(u,o);}
 if(failure==='upload')h.provider.launchAdopter=async()=>{h.calls.push(['launch','adopter']);throw Error(privateText);};
 if(failure==='stop')h.provider.stopAdopter=async()=>{h.calls.push(['stop','adopter']);throw Error(privateText);};
 if(failure==='reset')h.provider.resetAdoption=async()=>{h.calls.push(['reset']);throw Error(privateText);};
 if(failure==='cancel'){const f=h.provider.adoptionLaunch;h.provider.adoptionLaunch=async(...args)=>{const id=await f(...args);controller.abort();return id;};}
 await assert.rejects(executeAdoption(h),e=>{assert.ok(!String(e).includes(privateText));return true;});
 assert.ok(h.calls.filter(c=>c[0]==='launch'&&c[1]==='adopter').length<=1);
 assert.ok(h.calls.filter(c=>c[0]==='stop'&&c[1]==='adopter').length<=1);
 assert.equal(h.calls.filter(c=>c[0]==='reset').length,1);
 if(['artifact','owner','cancel'].includes(failure))assert.ok(!h.calls.some(c=>c[0]==='launch'&&c[1]==='adopter'));
});
test('no retry/default OFF/retirement separation before provider mutation',async()=>{
 const h=harness();for(const patch of [{GITHUB_RUN_ATTEMPT:'2'},{KINGDOM_RETENTION_ADOPTION_APPROVED:'0'},{KINGDOM_RETENTION_EXECUTION_APPROVED:'1'},{GITHUB_REF:'refs/heads/unmerged'},{KINGDOM_RETENTION_ADOPTER_SERVICE_ID:scope.operatorServiceId},{KINGDOM_RETENTION_ADOPTER_DB_PASSWORD:privateText}]){
  const c=harness();await assert.rejects(executeAdoption({...c,env:{...c.env,...patch},provider:{...c.provider,adoptionPreflight:async()=>{throw Error('test preflight cannot authorize drift');}}}));assert.equal(c.calls.filter(x=>x[0]==='launch').length,0);
 }
 assert.throws(()=>coordinator({...h.env,RETENTION_OPERATION:'retire'}));
});
test('future-only original evidence and explicit holds cannot be bypassed',()=>{
 for(const patch of [d=>d.data.manifestSha256='0'.repeat(64),d=>d.data.expectedOid='106971',d=>d.state.currentRecoveryCopy=JSON.parse(Buffer.from(d.data.manifestBytes,'base64url')).request.copy,d=>d.state.pinnedCopies=[JSON.parse(Buffer.from(d.data.manifestBytes,'base64url')).request.copy],d=>d.state.pendingCopies=[JSON.parse(Buffer.from(d.data.manifestBytes,'base64url')).request.copy],d=>d.state.closedJobIds=[],d=>d.state.observedAt=new Date(0).toISOString()]){
  const c=context();patch(c.data);assert.throws(()=>adoptionInput(c.data,c.f));
 }
 const c=context();c.f.adoption.futureAfter=new Date().toISOString();assert.throws(()=>adoptionInput(c.data,c.f));
 const blocked=fixture(40758163475,{now:Date.now(),age:0});blocked.catalog.evidence.report.verifiedCopyIdentity.oid='30000';
 const bytes=Buffer.from(JSON.stringify(blocked.catalog.evidence));const x=context();Object.assign(x.data.data,{manifestBytes:bytes.toString('base64url'),manifestSha256:rawDigest(bytes),expectedOid:'30000'});assert.throws(()=>adoptionInput(x.data,x.f));
});
test('independent postcheck rejects collateral identity changes, new/reused databases and missing emergencies',()=>{
 const c=context(),expected=c.manifest.report.verifiedCopyIdentity,target={name:c.manifest.request.copy,...expected};
 const after=clone(c.before);after.databases[0].owner='kc_release_copy_owner';assert.equal(verifyAdoptionPreservation(c.before,after,target).retirementAuthorized,false);
 for(const mutate of [d=>d.databases[1].owner='other',d=>d.databases[1].oid='123',d=>d.databases.pop(),d=>d.databases.push({...d.databases[1],name:'new'}),d=>d.databases[0].oid='456',d=>d.databases[2].name='renamed-emergency']){const wrong=clone(after);mutate(wrong);assert.throws(()=>verifyAdoptionPreservation(c.before,wrong,target));}
});
test('private connection construction escapes credentials and enforces the exact private target',()=>{
 const c=context(),password='private@:/%#?\nvalue';
 const env={KINGDOM_RETENTION_ADOPTER_DB_HOST:scope.host,KINGDOM_RETENTION_ADOPTER_DB_NAME:scope.adminDatabase,KINGDOM_RETENTION_ADOPTER_DB_USER:'postgres',KINGDOM_RETENTION_ADOPTER_DB_PASSWORD:password};
 const conn=adopterConnection(env,c.f);assert.equal(decodeURIComponent(conn.url.password),password);assert.equal(conn.host,scope.host);
 assert.throws(()=>adopterConnection({...env,KINGDOM_RETENTION_ADOPTER_DB_HOST:'public.invalid'},c.f));
 for(const role of ['executor','authorizer']){
  const vars={NODE_ENV:'production',KINGDOM_RETENTION_ENABLED:'1',RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,RAILWAY_SERVICE_ID:role==='executor'?scope.operatorServiceId:scope.delivery.authorizerServiceId,KINGDOM_RETENTION_PG_SERVICE_ID:scope.verificationServiceId,KINGDOM_RETENTION_WORKER_ADMIN_DATABASE:scope.adminDatabase,[role==='executor'?'KINGDOM_RETENTION_DATABASE_URL':'KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL']:'postgres://kc_retention_'+(role==='executor'?'runtime':'authorizer')+':synthetic@'+scope.host+'/'+scope.adminDatabase};
  const check=role==='executor'?checkEnvironment:checkAuthorizerEnvironment;
  for(const key of Object.keys(credentialReferences))assert.throws(()=>check({...vars,[key]:privateText},scope));
 }
});
test('adopter packaging is distinct, non-root/default OFF and isolated from both existing images',async()=>{
 const files=roleFiles('adopter');assert.ok(files.some(p=>p.endsWith('/adoption.mjs')));assert.ok(!files.some(p=>/\/(?:signer|authorize|permit|cli|job)\.mjs$/.test(p)));
 for(const role of ['executor','authorizer'])assert.ok(!roleFiles(role).some(p=>/adopter\.mjs|adoption-operation\.mjs|\/adoption\.mjs/.test(p)));
 const docker=await readFile(new URL('../deployment/release/retention/delivery/Adopter.Dockerfile',import.meta.url),'utf8');
 assert.match(docker,/USER node/);assert.match(docker,/KINGDOM_RETENTION_ADOPTER_ENABLED=0/);assert.doesNotMatch(docker,/--mount=type=secret|DATABASE_URL|ADOPTER_DB_/);
 const w=await readFile(new URL('../../.github/workflows/recovery-copy-retention.yml',import.meta.url),'utf8');
 const reviewer=w.slice(w.indexOf('  approve-adoption:'),w.indexOf('  sign-retirement:'));assert.match(reviewer,/environment: retention-signing/);assert.doesNotMatch(reviewer,/RAILWAY_TOKEN|DATABASE_URL|ADOPTER_DB_|SIGNING_KEY/);
 assert.match(w,/KINGDOM_RETENTION_ADOPTION_APPROVED == '1' && vars.KINGDOM_RETENTION_EXECUTION_APPROVED == '0'/);assert.match(w,/group: kingdom-come-production/);
 assert.equal(await readFile(new URL('../deployment/release/retention/workflow.yml',import.meta.url),'utf8'),w);
});

function providerFixture(c){
 const id=c.adoption.serviceId;
 const s={serviceId:id,serviceName:'KingdomCopyAdopter',environmentId:scope.environmentId,source:null,startCommand:null,buildCommand:null,preDeployCommand:null,rootDirectory:null,cronSchedule:null,restartPolicyType:'NEVER',numReplicas:null,healthcheckPath:null,service:{createdAt:c.adoption.futureAfter,repoTriggers:{edges:[]}},domains:{serviceDomains:[],customDomains:[]},activeDeployments:[]};
 return {project:{id:scope.projectId},environment:{id:scope.environmentId,projectId:scope.projectId,name:'production',config:{services:{[id]:{deploy:{multiRegionConfig:{iad:{numReplicas:1}}}}}},serviceInstances:{edges:[{node:s},{node:{serviceId:scope.verificationServiceId,serviceName:'KingdomReleaseCopy',environmentId:scope.environmentId}}]},volumeInstances:{edges:[]}},pending:null};
}
test('provider preflight rejects inherited source/network/replica drift and binds the server-created cutoff',()=>{
 const c=context(),d=providerFixture(c);assert.deepEqual(checkAdopter(d,scope,c.adoption.serviceId),c.adoption);
 for(const mutate of [x=>x.environment.id=randomUUID(),x=>x.environment.serviceInstances.edges[0].node.source={repo:'other',image:null},x=>x.environment.serviceInstances.edges[0].node.numReplicas=2,x=>x.environment.serviceInstances.edges[0].node.service.createdAt=null,x=>x.environment.serviceInstances.edges[0].node.cronSchedule='* * * * *',x=>x.environment.serviceInstances.edges[0].node.domains.serviceDomains.push({id:'public'}),x=>x.environment.config.services[c.adoption.serviceId].deploy.multiRegionConfig={ams:{numReplicas:1}},x=>x.environment.volumeInstances.edges.push({node:{serviceId:c.adoption.serviceId}}),x=>x.pending={environmentId:scope.environmentId,status:'STAGED',lastAppliedError:null,appliedAt:null,patch:{services:{other:{changed:true}}}}]){const wrong=clone(d);mutate(wrong);assert.throws(()=>checkAdopter(wrong,scope,c.adoption.serviceId));}
});
test('provider installs only unrendered private references on the adopter and clears them with skipDeploys/replace',async()=>{
 const c=context(),id=c.adoption.serviceId,baseline={NODE_ENV:'production',KINGDOM_RETENTION_ADOPTER_ENABLED:'0',RAILWAY_RUN_UID:'1000'},deploymentId=randomUUID(),calls=[];let values=clone(baseline);
 const api=async(q,args)=>{
  calls.push({q,args});if(q==='preflight')return providerFixture(c);if(q.includes('Network'))return {tcpProxies:[]};
  if(q.startsWith('query RetentionAdoptionVariables')){assert.match(q,/unrendered:true/);return {variables:clone(values)};}
  assert.ok(['stage','RetentionAdoptionReset'].some(x=>q.includes(x)));assert.match(q,/skipDeploys:true/);assert.equal(args.serviceId,id);assert.equal(args.environmentId,scope.environmentId);values=clone(args.variables);return {variableCollectionUpsert:true};
 };
 const p=adoptionMethods(api,{preflight:async()=>{}},{command:async()=>JSON.stringify({deploymentId}),token:'synthetic',fetcher:async()=>Response.json({data:{deployment:{id:deploymentId,projectId:scope.projectId,environmentId:scope.environmentId,serviceId:id}}}),preflightQuery:'preflight',stageMutation:'stage skipDeploys:true',stopMutation:'stop'});
 assert.deepEqual(await p.adoptionPreflight(scope,id),c.adoption);
 assert.equal(await p.launchAdopter({...c.f,role:'adopter',codeDigest:hash('adopter')},'/synthetic'),deploymentId);
 for(const [k,v] of Object.entries(credentialReferences))assert.equal(values[k],v);
 assert.ok(!JSON.stringify(values).includes(privateText));await p.resetAdoption(scope);assert.deepEqual(values,baseline);
 assert.equal(calls.filter(c=>c.q.includes('RetentionAdoptionReset')).length,2);
});
test('cleanup never overwrites a competing edit or retries an uncertain reset acknowledgment',async()=>{
 for(const mode of ['drift','lost-reset']){
  const c=context(),id=c.adoption.serviceId,base={NODE_ENV:'production',KINGDOM_RETENTION_ADOPTER_ENABLED:'0',RAILWAY_RUN_UID:'1000'};let values=clone(base),writes=0;
  const p=adoptionMethods(async(q,args)=>{
   if(q==='preflight')return providerFixture(c);if(q.includes('Network'))return {tcpProxies:[]};if(q.startsWith('query RetentionAdoptionVariables'))return {variables:clone(values)};
   writes++;values=clone(args.variables);if(writes===2&&mode==='lost-reset')throw Error(privateText);return {variableCollectionUpsert:true};
  },{}, {command:async()=>{throw Error('Synthetic lost upload acknowledgment');},preflightQuery:'preflight',stageMutation:'stage'});
  await assert.rejects(p.launchAdopter(c.f,'/synthetic'));
  if(mode==='drift')values.UNRELATED='competing-change';await assert.rejects(p.resetAdoption(scope));assert.equal(writes,mode==='drift'?1:2);
 }
});
test('retained archive authentication binds closed release, server artifact digest, byte count and original manifest',async()=>{
 const c=context(),zip=Buffer.from('synthetic-authenticated-archive'),temp=await mkdtemp(join(tmpdir(),'adoption-artifact-unit-'));
 const run={id:910,run_attempt:1,status:'completed',conclusion:'success',path:'.github/workflows/production-release.yml',event:'workflow_dispatch',head_branch:'release/production',head_repository:{full_name:'catillatio/test'},head_sha:c.manifest.request.sha,created_at:new Date(Date.now()-120000).toISOString()};
 const artifact={id:123,workflow_run:{id:910,head_sha:run.head_sha},name:'kingdom-recovery-910-1',expired:false,digest:'sha256:'+rawDigest(zip),size_in_bytes:zip.length};
 try{for(const bad of ['none','digest','run','manifest','host']){
  const a=clone(artifact),r=clone(run);if(bad==='digest')a.digest='sha256:'+'0'.repeat(64);if(bad==='run')r.status='in_progress';let downloads=0;
  const fetcher=async(url,o)=>{
   if(url.includes('/attempts/'))return Response.json(r);if(url.endsWith('/artifacts/123'))return Response.json(a);
   if(url.endsWith('/zip'))return new Response(null,{status:302,headers:{location:bad==='host'?'https://untrusted.invalid/archive':'https://example.blob.core.windows.net/archive'}});
   downloads++;assert.equal(o.headers,undefined);return new Response(zip);
  };
  const args={githubToken:'synthetic-github-token',fetcher,temp,command:async(_cmd,args)=>args[0]==='-Z1'?'realm.dump.age\nbackup-manifest.json\n':bad==='manifest'?'{}':c.bytes.toString('utf8')};
  if(bad==='none')assert.equal((await authenticateAdoption(c.data,c.f,args)).manifestSha256,c.data.data.manifestSha256);
  else await assert.rejects(authenticateAdoption(c.data,c.f,args));assert.ok(downloads<=1);
 }}finally{await rm(temp,{recursive:true,force:true});}
});


test('existing protected reviewer verifies the frozen adoption arm and cannot receive signing or SQL authority',async()=>{
 const h=harness();await executeAdoption(h);h.objects.delete('adoption-approval.json');
 const env={...h.env,GITHUB_JOB:'approve-adoption'};
 assert.deepEqual(await approveAdoption(env,{store:h.store,fetcher:h.fetcher}),{passed:true});
 assert.deepEqual(h.objects.get('adoption-approval.json'),{requestId:h.f.requestId,coordinator:h.state.coordinator,inputDigest:hash(h.data)});
 for(const patch of [{KINGDOM_RETENTION_SIGNING_KEY:privateText},{KINGDOM_RETENTION_ADOPTER_DB_PASSWORD:privateText},{RAILWAY_TOKEN:privateText}])await assert.rejects(approveAdoption({...env,...patch},{store:h.store,fetcher:h.fetcher}));
 h.objects.delete('adoption-approval.json');const arm=h.objects.get('adoption-review-arm.json');h.objects.set('adoption-review-arm.json',{...arm,signature:'A'.repeat(86)});
 await assert.rejects(approveAdoption(env,{store:h.store,fetcher:h.fetcher}));assert.equal(h.objects.has('adoption-approval.json'),false);
});

test('restricted worker reset touches only operation fields, retaining installed credentials and settings',async()=>{
 const c=context(),id=scope.operatorServiceId,baseline={NODE_ENV:'production',KINGDOM_RETENTION_ENABLED:'0',KINGDOM_RETENTION_DATABASE_URL:'private-installed-reference',EXISTING:'unchanged'};let values=clone(baseline);const writes=[];
 const p=adoptionMethods(async(q,args)=>{
  if(q.startsWith('query RetentionAdoptionVariables'))return {variables:clone(values)};
  writes.push(clone(args.variables));assert.equal(q,'stage skipDeploys:true');Object.assign(values,args.variables);return {variableCollectionUpsert:true};
 },{launch:async(_role,f)=>{values.KINGDOM_RETENTION_JOB=Buffer.from(JSON.stringify(f)).toString('base64url');return randomUUID();}}, {stageMutation:'stage skipDeploys:true'});
 await p.adoptionLaunch('executor',c.f,'/synthetic');assert.equal(values.KINGDOM_RETENTION_ENABLED,'1');await p.resetAdoption(scope);
 assert.deepEqual(values,{...baseline,KINGDOM_RETENTION_JOB:''});assert.deepEqual(writes,[{KINGDOM_RETENTION_ENABLED:'1'},{KINGDOM_RETENTION_ENABLED:'0',KINGDOM_RETENTION_JOB:''}]);
});
