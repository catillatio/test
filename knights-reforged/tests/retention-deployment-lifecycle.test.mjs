import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {platform} from '../deployment/release/retention/delivery/platform.mjs';
import {installDisabled} from '../deployment/release/retention/delivery/install.mjs';
import {DeliveryFailure,deliveryStep,failureCategory,reportDeliveryFailure} from '../deployment/release/retention/delivery/failure.mjs';
const epoch=Date.parse('2050-01-01T00:00:00Z'),token='synthetic-private-token',privateText='synthetic-private-provider-response-and-credential';
const ids=Array.from({length:6},()=>randomUUID()),id=ids[0];
const scope={projectId:ids[1],environmentId:ids[2],operatorServiceId:ids[3],delivery:{authorizerServiceId:ids[4],journalVolumeId:ids[5]}};
const instance=(status='RUNNING',name='instance-one')=>({id:name,status});
const state=overrides=>({id,projectId:scope.projectId,environmentId:scope.environmentId,serviceId:scope.operatorServiceId,status:'SUCCESS',deploymentStopped:false,instances:[instance()],...overrides});
const queued=status=>state({status,deploymentStopped:true,instances:[]});
const capture=p=>p.then(value=>({value}),error=>({error}));
const flush=async()=>{for(let i=0;i<120;i++)await Promise.resolve();};
function rejected(result,code){assert.equal(result.error?.code,code);assert.equal(result.error?.cause,undefined);assert.equal(result.error?.message,'RETENTION_DELIVERY_FAILURE: '+code);}
function harness(t,states,{mutation=()=>Response.json({data:{deploymentRemove:true}}),read}={}){
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});let index=0;const reads=[],writes=[];
 const provider=platform(token,{command:async()=>assert.fail('No upload in lifecycle tests'),fetcher:async(url,o)=>{
  assert.equal(url,'https://backboard.railway.com/graphql/v2');assert.equal(o.method,'POST');assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');assert.ok(o.signal instanceof AbortSignal);
  assert.equal(o.headers['project-access-token'],token);const q=JSON.parse(o.body);assert.deepEqual(q.variables,{id});
  if(q.query.startsWith('mutation ')){assert.match(q.query,/^mutation RetentionDeliveryStop\(/);writes.push(q);return mutation(q,o);}
  assert.match(q.query,/status deploymentStopped instances\{id status\}/);assert.doesNotMatch(q.query,/latest|variables\(|logs|meta/);reads.push(q);
  if(read)return read(index++,o);
  return Response.json({data:{deployment:states[Math.min(index++,states.length-1)]}});
 }});
 return {reads,writes,provider,start:options=>provider.running(id,scope,'executor',{deadline:epoch+10000,...options}),stop:options=>provider.stop(id,scope,'executor',options)};
}
test('queued/building stopped=true with no instances progresses to the exact healthy running worker',async t=>{
 const states=[queued('QUEUED'),queued('BUILDING'),state({status:'DEPLOYING',deploymentStopped:true,instances:[instance('CREATED')]}),state({status:'DEPLOYING',instances:[instance('INITIALIZING')]}),state()];
 const h=harness(t,states),result=capture(h.start());await flush();assert.equal(h.reads.length,1);
 for(let i=0;i<4;i++){t.mock.timers.tick(1000);await flush();assert.equal(h.reads.length,i+2);}
 assert.deepEqual(await result,{value:undefined});assert.equal(h.writes.length,0);
});
test('SUCCESS without instances or with a lagging stopped flag cannot be mistaken for readiness',async t=>{
 const h=harness(t,[queued('SUCCESS'),state({deploymentStopped:true}),state()]),result=capture(h.start());await flush();
 t.mock.timers.tick(1000);await flush();assert.equal(h.reads.length,2);
 t.mock.timers.tick(1000);await flush();assert.deepEqual(await result,{value:undefined});assert.equal(h.writes.length,0);
});
test('already-running exact worker requires only one metadata read',async t=>{
 const h=harness(t,[state()]);await h.start();assert.equal(h.reads.length,1);assert.equal(h.writes.length,0);
});
for(const status of ['FAILED','CRASHED','REMOVING','REMOVED','SKIPPED'])test('terminal startup '+status+' is rejected immediately',async t=>{
 const h=harness(t,[queued(status)]);rejected(await capture(h.start()),'STARTUP_TERMINAL');assert.equal(h.reads.length,1);assert.equal(h.writes.length,0);
});
test('a successful but exited one-shot is not a ready installation worker',async t=>{
 const h=harness(t,[state({deploymentStopped:true,instances:[instance('EXITED')]})]);rejected(await capture(h.start()),'STARTUP_EXITED');
});
for(const key of ['id','projectId','environmentId','serviceId'])test('startup rejects substituted '+key,async t=>{
 const h=harness(t,[state({[key]:randomUUID()})]);rejected(await capture(h.start()),'STARTUP_IDENTITY');assert.equal(h.writes.length,0);
});
test('later metadata must retain both deployment and instance identity',async t=>{
 const h=harness(t,[state({status:'DEPLOYING',instances:[instance('CREATED')]}),state({instances:[instance('RUNNING','replacement')]})]);
 const result=capture(h.start());await flush();t.mock.timers.tick(1000);await flush();rejected(await result,'STARTUP_STATE');
});
for(const [name,override] of [['unknown status',{status:privateText}],['multiple replicas',{instances:[instance(),instance('RUNNING','second')]}],['missing instances',{instances:undefined}],['invalid stopped flag',{deploymentStopped:'true'}],['unknown instance',{instances:[instance(privateText)]}]])test('startup fails closed for '+name,async t=>{
 const h=harness(t,[state(override)]);rejected(await capture(h.start()),'STARTUP_STATE');assert.equal(h.writes.length,0);
});
test('startup respects the original shorter deadline without another read',async t=>{
 const h=harness(t,[queued('BUILDING')]),result=capture(h.start({deadline:epoch+1500}));await flush();
 t.mock.timers.tick(1000);await flush();assert.equal(h.reads.length,2);
 t.mock.timers.tick(500);await flush();rejected(await result,'STARTUP_TIMEOUT');assert.equal(h.reads.length,2);
});
test('startup cannot extend beyond its ten-minute cap',async t=>{
 const h=harness(t,[queued('QUEUED')]),result=capture(h.start({deadline:epoch+3600000}));await flush();
 t.mock.timers.tick(600000);await flush();rejected(await result,'STARTUP_TIMEOUT');assert.equal(h.reads.length,1);
});
for(const phase of ['before','request','wait'])test('startup cancellation during '+phase+' is sanitized and launches nothing',async t=>{
 const c=new AbortController();const h=harness(t,[queued('BUILDING')],phase==='request'?{read:async(_i,o)=>new Promise((_r,reject)=>o.signal.addEventListener('abort',()=>reject(Error(privateText)),{once:true}))}:{});
 if(phase==='before')c.abort(Error(privateText));const result=capture(h.start({signal:c.signal}));await flush();c.abort(Error(privateText));await flush();
 rejected(await result,'STARTUP_CANCELLED');assert.equal(h.reads.length,phase==='before'?0:1);assert.equal(h.writes.length,0);
});
test('cancelled startup cannot report success after an in-flight response arrives',async t=>{
 const c=new AbortController(),h=harness(t,[],{read:async()=>{c.abort();return Response.json({data:{deployment:state()}});}});
 rejected(await capture(h.start({signal:c.signal})),'STARTUP_CANCELLED');
});
for(const status of ['QUEUED','BUILDING','SUCCESS'])test('cleanup cancels ambiguous empty-instance '+status+' once and verifies terminal removal',async t=>{
 const h=harness(t,[queued(status),queued('REMOVED')]);await h.stop();assert.equal(h.writes.length,1);assert.equal(h.reads.length,2);
});
test('queued cleanup waits through a delayed start after cancellation acknowledgement',async t=>{
 const h=harness(t,[queued('BUILDING'),state(),state({status:'REMOVING'}),state({status:'REMOVED',deploymentStopped:true,instances:[instance('EXITED')]})]);
 const result=capture(h.stop());await flush();assert.equal(h.writes.length,1);assert.equal(h.reads.length,2);
 t.mock.timers.tick(500);await flush();t.mock.timers.tick(500);await flush();assert.deepEqual(await result,{value:undefined});assert.equal(h.writes.length,1);
});
test('an already exiting removal is observed without another mutation',async t=>{
 const h=harness(t,[queued('REMOVING'),queued('REMOVED')]);await h.stop();assert.equal(h.writes.length,0);assert.equal(h.reads.length,2);
});
for(const status of ['FAILED','CRASHED','REMOVED','SKIPPED'])test('permanently stopped '+status+' needs no cleanup mutation',async t=>{
 const h=harness(t,[queued(status)]);await h.stop();assert.equal(h.reads.length,1);assert.equal(h.writes.length,0);
});
test('completed initialized journal worker with EXITED instance is preserved',async t=>{
 const h=harness(t,[state({deploymentStopped:true,instances:[instance('EXITED')]})]);await h.stop();assert.equal(h.writes.length,0);
});
for(const mutation of [()=>{throw Error(privateText);},()=>Response.json({data:{deploymentRemove:false}})])test('lost or false cleanup acknowledgement never retries or assumes shutdown',async t=>{
 const h=harness(t,[queued('BUILDING')],{mutation});rejected(await capture(h.stop()),'CLEANUP_ACK_UNCONFIRMED');assert.equal(h.writes.length,1);assert.equal(h.reads.length,1);
});
test('cleanup verifies its hard thirty-second cap and never repeats cancellation',async t=>{
 const h=harness(t,[queued('QUEUED')]),result=capture(h.stop({deadline:epoch+3600000}));await flush();assert.equal(h.writes.length,1);
 t.mock.timers.tick(30000);await flush();rejected(await result,'CLEANUP_TIMEOUT');assert.equal(h.writes.length,1);
});
test('cleanup respects shorter deadlines',async t=>{
 const h=harness(t,[queued('BUILDING')]),result=capture(h.stop({deadline:epoch+750}));await flush();
 t.mock.timers.tick(500);await flush();t.mock.timers.tick(250);await flush();rejected(await result,'CLEANUP_TIMEOUT');assert.equal(h.writes.length,1);
});
test('cleanup cancellation before a request performs no writes',async t=>{
 const c=new AbortController();c.abort(Error(privateText));const h=harness(t,[state()]);
 rejected(await capture(h.stop({signal:c.signal})),'CLEANUP_CANCELLED');assert.equal(h.reads.length,0);assert.equal(h.writes.length,0);
});
test('cleanup cancellation during observation never launches a second stop',async t=>{
 const c=new AbortController(),h=harness(t,[state()]);const result=capture(h.stop({signal:c.signal}));await flush();assert.equal(h.writes.length,1);
 c.abort(Error(privateText));await flush();rejected(await result,'CLEANUP_CANCELLED');assert.equal(h.writes.length,1);
});
test('cleanup stops on identity drift after its one acknowledged mutation',async t=>{
 const h=harness(t,[queued('BUILDING'),state({serviceId:scope.delivery.authorizerServiceId})]);
 rejected(await capture(h.stop()),'CLEANUP_IDENTITY');assert.equal(h.writes.length,1);
});
test('cleanup cannot cancel a different service or arbitrary role',async t=>{
 const h=harness(t,[state({serviceId:scope.delivery.authorizerServiceId})]);rejected(await capture(h.stop()),'CLEANUP_IDENTITY');assert.equal(h.writes.length,0);
 await assert.rejects(h.provider.stop(id,scope,'game'));assert.equal(h.writes.length,0);
});
test('unknown cleanup metadata fails closed before any mutation',async t=>{
 const h=harness(t,[state({status:privateText})]);rejected(await capture(h.stop()),'CLEANUP_STATE');assert.equal(h.writes.length,0);
});
for(const operation of ['start','stop'])for(const kind of ['transport','HTTP','GraphQL','missing'])test(operation+' '+kind+' errors are fixed categories with no retry',async t=>{
 const h=harness(t,[],{read:async()=>{
  if(kind==='transport')throw Error(privateText);
  if(kind==='HTTP')return new Response(privateText,{status:403});
  if(kind==='GraphQL')return Response.json({errors:[{message:privateText}]});
  return Response.json({data:{deployment:null}});
 }});
 const prefix=operation==='start'?'STARTUP':'CLEANUP';rejected(await capture(h[operation]()),prefix+(kind==='missing'?'_IDENTITY':'_API'));
 assert.equal(h.reads.length,1);assert.equal(h.writes.length,0);
});
test('unsafe lifecycle configuration is rejected without a provider request',async t=>{
 const h=harness(t,[state()]);
 rejected(await capture(h.start({deadline:NaN})),'STARTUP_CONFIGURATION');
 rejected(await capture(h.provider.stop('invalid',scope,'executor')),'CLEANUP_CONFIGURATION');
 rejected(await capture(h.start({deadline:epoch-1})),'STARTUP_TIMEOUT');assert.equal(h.reads.length,0);
});
test('fixed failure reporting never exposes messages, credentials, raw bodies or arbitrary codes',async()=>{
 const logs=[];reportDeliveryFailure(Error(privateText),s=>logs.push(s));reportDeliveryFailure(new DeliveryFailure(privateText),s=>logs.push(s));
 const failed=await capture(deliveryStep('INSTALLATION_UPLOAD',()=>{throw Error(privateText);}));rejected(failed,'INSTALLATION_UPLOAD');assert.equal(Object.hasOwn(failed.error,'cause'),false);
 assert.ok(logs.every(s=>!s.includes(privateText)));assert.equal(logs.filter(s=>s==='RETENTION_DELIVERY_FAILURE: UNCLASSIFIED').length,2);
 assert.equal(failureCategory({code:'STARTUP_API',message:privateText}),'UNCLASSIFIED');
 const run=spawnSync(process.execPath,['deployment/release/retention/delivery/coordinator.mjs'],{encoding:'utf8',env:{PATH:process.env.PATH}});
 assert.equal(run.status,1);assert.equal(run.stdout,'');assert.equal(run.stderr,logs.slice(0,2).join('\n')+'\n');
});

function installationFixture(){
 const target={projectId:scope.projectId,environmentId:scope.environmentId,operatorServiceId:scope.operatorServiceId,authorizerServiceId:scope.delivery.authorizerServiceId,journalVolumeId:scope.delivery.journalVolumeId,...Object.fromEntries(['gameServiceId','productionServiceId','verificationServiceId','verificationWorkerServiceId'].map(k=>[k,randomUUID()]))};
 const env={KINGDOM_RETENTION_INSTALLATION_APPROVED:'1',KINGDOM_RETENTION_EXECUTION_APPROVED:'0',RETENTION_OPERATION:'install-disabled',GITHUB_REPOSITORY:'catillatio/test',GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_JOB:'retire',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',GITHUB_SHA:'a'.repeat(40),GH_TOKEN:token,RAILWAY_PROJECT_ID:target.projectId,RAILWAY_ENVIRONMENT_ID:target.environmentId,KINGDOM_RETENTION_INSTALL_TARGET:JSON.stringify(target)};
 const calls=[],logs=[],deployed={executor:randomUUID(),authorizer:randomUUID()};
 const provider={tokenIdentity:async()=>calls.push(['identity']),preflight:async()=>calls.push(['preflight']),install:async(role,t,directory,operation)=>{calls.push(['install',role]);assert.equal(t.operatorServiceId,target.operatorServiceId);assert.equal(directory,'/synthetic/'+role);assert.equal(operation,env.RETENTION_OPERATION);return deployed[role];},running:async(id,t,role,o)=>{calls.push(['running',role]);assert.equal(id,deployed[role]);assert.equal(t.delivery.journalVolumeId,target.journalVolumeId);assert.ok(o.deadline>Date.now());},completion:async()=>calls.push(['complete']),stop:async(id,t,role,options)=>{calls.push(['stop',role]);assert.equal(id,deployed[role]);assert.equal(t.environmentId,target.environmentId);assert.equal(options,undefined);},resetInstallation:async()=>calls.push(['reset'])};
 return {env,provider,calls,logs,deployed,bundle:async role=>{calls.push(['bundle',role]);return {directory:'/synthetic/'+role};},log:s=>logs.push(s),fetcher:async(url,o)=>{
  assert.ok(url.startsWith('https://api.github.com/repos/catillatio/test/actions/runs/123/attempts/1'));assert.equal(o.headers.authorization,'Bearer '+token);assert.equal(o.redirect,'error');
  return Response.json(url.includes('/jobs?')?{total_count:2,jobs:[{name:'owner-approval',status:'completed',conclusion:'success'},{name:'retire',status:'in_progress',run_attempt:1}]}:{id:123,run_attempt:1,head_sha:env.GITHUB_SHA,head_branch:'release/production',event:'workflow_dispatch',status:'in_progress',path:'.github/workflows/recovery-copy-retention.yml',head_repository:{full_name:'catillatio/test'}});
 }};
}
test('disabled installation waits for the exact executor before uploading the exact authorizer',async()=>{
 const h=installationFixture();let ready;const original=h.provider.running;
 h.provider.running=async(...args)=>{await original(...args);if(args[2]==='executor')await new Promise(resolve=>{ready=resolve;});};
 const result=installDisabled(h);await flush();assert.deepEqual(h.calls.at(-1),['running','executor']);assert.equal(h.calls.some(c=>c[1]==='authorizer'),false);
 ready();await result;assert.deepEqual(h.calls.slice(-3),[['bundle','authorizer'],['install','authorizer'],['running','authorizer']]);
 assert.deepEqual(h.logs,['DISABLED_CONSOLES_READY']);assert.equal(h.calls.some(c=>['reset','complete','stop'].includes(c[0])),false);
});
test('installation and the real provider readiness adapter integrate across both queued-to-running deployments',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:epoch});const h=installationFixture(),reads=[],indexes={executor:0,authorizer:0};
 const real=platform(token,{fetcher:async(url,o)=>{
  assert.equal(url,'https://backboard.railway.com/graphql/v2');const q=JSON.parse(o.body);assert.match(q.query,/^query RetentionDeliveryStopIdentity/);
  const role=Object.keys(h.deployed).find(role=>h.deployed[role]===q.variables.id);assert.ok(role);reads.push(role);
  const stage=indexes[role]++,d=stage<2?queued(stage===0?'QUEUED':'BUILDING'):state();
  d.id=h.deployed[role];d.serviceId=role==='executor'?scope.operatorServiceId:scope.delivery.authorizerServiceId;
  return Response.json({data:{deployment:d}});
 }});
 h.provider.running=real.running;const result=capture(installDisabled(h));await flush();assert.deepEqual(reads,['executor']);
 for(let i=0;i<4;i++){t.mock.timers.tick(1000);await flush();}
 assert.deepEqual(await result,{value:undefined});assert.deepEqual(reads,['executor','executor','executor','authorizer','authorizer','authorizer']);
 assert.deepEqual(h.logs,['DISABLED_CONSOLES_READY']);assert.equal(h.calls.some(c=>['stop','reset','complete'].includes(c[0])),false);
});
test('installation cancellation during startup cleans up independently and never installs the next worker',async()=>{
 const h=installationFixture(),c=new AbortController();h.signal=c.signal;
 h.provider.running=async(_id,_target,role,o)=>{h.calls.push(['running',role]);c.abort(Error(privateText));assert.equal(o.signal,c.signal);throw new DeliveryFailure('STARTUP_CANCELLED');};
 rejected(await capture(installDisabled(h)),'STARTUP_CANCELLED');assert.deepEqual(h.calls.slice(-2),[['running','executor'],['stop','executor']]);
 assert.equal(h.calls.some(c=>c[1]==='authorizer'),false);assert.deepEqual(h.logs,['FAILURE_STARTUP_CANCELLED']);
});
test('startup failure preserves its category and attempts cleanup of both exact deployments even after a lost stop acknowledgement',async()=>{
 const h=installationFixture(),original=h.provider.running,stop=h.provider.stop;
 h.provider.running=async(...args)=>{await original(...args);if(args[2]==='authorizer')throw new DeliveryFailure('STARTUP_TERMINAL');};
 h.provider.stop=async(...args)=>{await stop(...args);if(args[2]==='executor')throw new DeliveryFailure('CLEANUP_ACK_UNCONFIRMED');};
 rejected(await capture(installDisabled(h)),'CLEANUP_ACK_UNCONFIRMED');assert.deepEqual(h.calls.slice(-2),[['stop','executor'],['stop','authorizer']]);
 assert.deepEqual(h.logs,['FAILURE_STARTUP_TERMINAL']);assert.equal(h.calls.filter(c=>c[0]==='install').length,2);
});
test('lost upload acknowledgement never retries, guesses an identity or reinitializes the journal',async()=>{
 const h=installationFixture();h.provider.install=async()=>{h.calls.push(['upload']);throw Error(privateText);};
 rejected(await capture(installDisabled(h)),'INSTALLATION_UPLOAD');assert.equal(h.calls.filter(c=>c[0]==='upload').length,1);
 assert.equal(h.calls.some(c=>['stop','reset','complete'].includes(c[0])),false);assert.deepEqual(h.logs,['FAILURE_INSTALLATION_UPLOAD']);
});
test('installation approval failure launches nothing and reports only a fixed category',async()=>{
 const h=installationFixture();h.env.KINGDOM_RETENTION_INSTALLATION_APPROVED='0';
 rejected(await capture(installDisabled(h)),'INSTALLATION_CONFIGURATION');assert.equal(h.calls.length,0);
});
test('journal reset failure cannot become an initialization success and contains no private cause',async()=>{
 const h=installationFixture();h.env.RETENTION_OPERATION='initialize-journal';h.provider.resetInstallation=async()=>{throw Error(privateText);};
 rejected(await capture(installDisabled(h)),'INSTALLATION_RESET');assert.equal(h.calls.filter(c=>c[0]==='install').length,1);assert.deepEqual(h.logs,[]);
});
