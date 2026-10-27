// Full disposable delivery rehearsal. Actual coordinator, SDK grants, two built
// workers, private TLS handoff, signer and PostgreSQL. Railway/GitHub CONTROL
// APIs and CLI upload are pinned contract fixtures, not live provider deployments.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm,rename,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import https from 'node:https';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {handoffStore} from '../deployment/release/retention/delivery/store.mjs';
import {platform} from '../deployment/release/retention/delivery/platform.mjs';
import {makeBundle} from '../deployment/release/retention/delivery/bundle.mjs';
import {executeCoordinator} from '../deployment/release/retention/delivery/coordinator.mjs';
import {signRequest} from '../deployment/release/retention/delivery/signer.mjs';
import {readObject,writeObject} from '../deployment/release/retention/delivery/io.mjs';
import {hash} from '../deployment/release/retention/protocol.mjs';
import {prepareDatabase} from './fixtures/retention-delivery-database.mjs';
import {keys,publicKey,approve} from '../tests/fixtures/release-retention.mjs';
const app=fileURLToPath(new URL('../',import.meta.url));
const executor=process.env.KINGDOM_RETENTION_OPERATOR_IMAGE,authorizer=process.env.KINGDOM_RETENTION_AUTHORIZER_IMAGE;
for(const image of [executor,authorizer])assert.match(image??'',/^kingdom-come:[a-z0-9-]+$/);
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:10000000,stdio:['ignore','pipe','pipe']}).trim();
const id=randomUUID().slice(0,8),prefix='kc-delivery-test-'+id,net=prefix,volume=prefix+'-journal',dir=await mkdtemp(join(tmpdir(),prefix+'-'));
const containers=[],notes=[],bundleDirs=[];let fixture,store,serverPort;
const pass=s=>{notes.push(s);console.log('PASS: '+s);};
const file=n=>join(dir,n),save=async(n,v)=>{await writeFile(file(n+'.next'),JSON.stringify(v),{mode:0o600});await rename(file(n+'.next'),file(n));};
const load=async n=>JSON.parse(await readFile(file(n),'utf8'));
const objectFile=key=>file('objects/'+createHash('sha256').update(key).digest('hex'));
const wait=async(fn,ms=15000)=>{const end=Date.now()+ms;for(;;){try{const x=await fn();if(x)return x;}catch{}assert.ok(Date.now()<end,'Disposable fixture deadline');await delay(100);}};
let runtimeState,scope,control,allDeployments={},activeContainers={};
let refreshQueue=Promise.resolve();
const refresh=()=>{const operation=refreshQueue.then(async()=>{
 const provider=await load('provider.json');
 for(const [deployment,name] of Object.entries(allDeployments)){
  const s=JSON.parse(docker('inspect',name))[0].State,d=provider.deployments[deployment];
  if(!s.Running){d.deploymentStopped=true;d.instances[0].status='EXITED';d.status=s.ExitCode===0?'SUCCESS':'CRASHED';}
 }
 await save('provider.json',provider);
 });refreshQueue=operation.catch(()=>{});return operation;};
const fetcher=async(url,options={})=>{
 const u=new URL(url);assert.ok(['api.github.com','realm.fixture.invalid','backboard.railway.com','objects.fixture.invalid'].includes(u.hostname));
 if(u.hostname==='backboard.railway.com')await refresh();
 const result=await new Promise((resolve,reject)=>{
  const r=https.request({hostname:'127.0.0.1',port:serverPort,path:u.pathname+u.search,servername:u.hostname,ca:certificate,method:options.method||'GET',headers:{...options.headers,host:u.host},signal:options.signal},response=>{const b=[];response.on('data',c=>b.push(c));response.on('end',()=>resolve(new Response(Buffer.concat(b),{status:response.statusCode,headers:response.headers})));});r.on('error',reject);if(options.body)r.write(options.body);r.end();
 });
 if(u.hostname==='backboard.railway.com'&&options.body){
  const q=JSON.parse(options.body);if(q.query.includes('RetentionDeliveryStop(')){
   const name=allDeployments[q.variables.id];assert.ok(name);docker('stop','--time','2',name);await refresh();
  }
 }
 return result;
};
let certificate;
try{
 await mkdir(file('objects'),{mode:0o700});await save('grants.json',[]);
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',file('server.key'),'-out',file('server.crt'),'-subj','/CN=retention-disposable-fixture','-addext','subjectAltName=DNS:api.github.com,DNS:realm.fixture.invalid,DNS:backboard.railway.com,DNS:objects.fixture.invalid,IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE'],{stdio:'ignore'});
 certificate=await readFile(file('server.crt'));await writeFile(file('server.mjs'),await readFile(new URL('./fixtures/retention-delivery-server.mjs',import.meta.url)),{mode:0o600});
 docker('network','create',net);docker('volume','create',volume);
 const pgName=prefix+'-pg';containers.push(pgName);docker('run','-d','--name',pgName,'--network',net,'--network-alias','copy.railway.internal','--tmpfs','/var/lib/postgresql','-p','127.0.0.1::5432','-e','POSTGRES_USER=knights','-e','POSTGRES_PASSWORD=disposable-only','-e','POSTGRES_DB=kingdom_delivery_test','postgres:18-bookworm');
 const pgPort=docker('port',pgName,'5432/tcp').split(':').at(-1);await wait(()=>docker('exec',pgName,'pg_isready','-h','127.0.0.1','-U','knights','-d','kingdom_delivery_test').includes('accepting'));
 const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:app,encoding:'utf8'}).trim();
 fixture=await prepareDatabase(new URL('postgres://knights:disposable-only@127.0.0.1:'+pgPort+'/kingdom_delivery_test'),randomUUID(),sha);scope=fixture.scope;runtimeState=fixture.state;
 control={runId:'999',sha,status:'in_progress',pauseBeforeDrop:false,loseExecutorAck:false};await save('control.json',control);
 function service(serviceId,serviceName){return {serviceId,serviceName,environmentId:scope.environmentId,source:null,startCommand:null,buildCommand:null,preDeployCommand:null,rootDirectory:null,cronSchedule:null,restartPolicyType:'NEVER',numReplicas:1,healthcheckPath:null,service:{repoTriggers:{edges:[]}},domains:{serviceDomains:[],customDomains:[]},activeDeployments:[]};}
 const preflight={project:{id:scope.projectId,name:'merry-patience'},environment:{id:scope.environmentId,projectId:scope.projectId,name:'production',serviceInstances:{edges:[service(scope.operatorServiceId,'KingdomCopyRetention'),service(scope.delivery.authorizerServiceId,'KingdomCopyAuthorizer')].map(node=>({node}))},volumeInstances:{edges:[{node:{volumeId:scope.delivery.journalVolumeId,serviceId:scope.operatorServiceId,mountPath:'/run/kingdom-retention',isPendingDeletion:false}}]}},pending:null};
 await save('provider.json',{preflight,deployments:{}});
 const actorEnv=role=>({NODE_ENV:'production',KINGDOM_RETENTION_ENABLED:'1',RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,RAILWAY_SERVICE_ID:role==='executor'?scope.operatorServiceId:scope.delivery.authorizerServiceId,KINGDOM_RETENTION_PG_SERVICE_ID:scope.verificationServiceId,KINGDOM_RETENTION_WORKER_ADMIN_DATABASE:scope.adminDatabase,KINGDOM_RETENTION_VERIFY_KEY:publicKey,[role==='executor'?'KINGDOM_RETENTION_DATABASE_URL':'KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL']:'postgres://kc_retention_'+(role==='executor'?'runtime:disposable-runtime-only':'authorizer:disposable-authorizer-only')+'@copy.railway.internal/'+scope.adminDatabase,...(role==='executor'?{RAILWAY_VOLUME_MOUNT_PATH:'/run/kingdom-retention',RAILWAY_VOLUME_NAME:'retention-private-journals'}:{})});
 await save('variables.json',{[scope.operatorServiceId]:actorEnv('executor'),[scope.delivery.authorizerServiceId]:actorEnv('authorizer')});
 const server=prefix+'-tls';containers.push(server);docker('run','-d','--name',server,'--user',String(process.getuid()),'--network',net,'--network-alias','api.github.com','--network-alias','realm.fixture.invalid','--network-alias','backboard.railway.com','--network-alias','objects.fixture.invalid','--sysctl','net.ipv4.ip_unprivileged_port_start=0','-p','127.0.0.1::443','--mount','type=bind,src='+dir+',dst=/fixture','--entrypoint','node',executor,'/fixture/server.mjs');
 serverPort=docker('port',server,'443/tcp').split(':').at(-1);await wait(async()=>{const r=await fetcher(scope.origin+'/healthz');return r.status===200;});
 const initEnv={KINGDOM_RETENTION_ENABLED:'0',KINGDOM_RETENTION_INITIALIZE_JOURNAL:'owner-approved',RAILWAY_VOLUME_MOUNT_PATH:'/run/kingdom-retention',RAILWAY_VOLUME_NAME:'retention-private-journals',RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,RAILWAY_SERVICE_ID:scope.operatorServiceId,KINGDOM_RETENTION_JOURNAL_VOLUME_ID:scope.delivery.journalVolumeId};
 assert.match(docker('run','--rm','--network','none','--user','0','--mount','type=volume,src='+volume+',dst=/run/kingdom-retention',...Object.entries(initEnv).flatMap(([k,v])=>['-e',k+'='+v]),'--entrypoint','node',executor,'deployment/release/retention/delivery/initialize-journal.mjs'),/PASS/);
 pass('dedicated journal volume initialized without credentials; executor remains non-root');
 const realStore=handoffStore({KINGDOM_RETENTION_STORE_ENDPOINT:'https://objects.fixture.invalid',KINGDOM_RETENTION_STORE_REGION:'fixture',KINGDOM_RETENTION_STORE_BUCKET:'retention-fixture',KINGDOM_RETENTION_STORE_PATH_STYLE:'true',KINGDOM_RETENTION_STORE_ACCESS_KEY_ID:'disposable-access',KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY:'disposable-secret'});
 const grantCache=new Map();let grantQueue=Promise.resolve();store={get origin(){return realStore.origin;},grant(run,id,name,method){const operation=grantQueue.then(async()=>{const key=run+'/'+id+'/'+name+'/'+method;if(grantCache.has(key))return grantCache.get(key);const url=await realStore.grant(run,id,name,method);const list=await load('grants.json');list.push({url,method,key:'retention-fixture/retention-delivery/'+run+'/'+id+'/'+name});await save('grants.json',list);grantCache.set(key,url);return url;});grantQueue=operation.catch(()=>{});return operation;},close:()=>realStore.close()};
 let sequence=0,wrongService=false;
 const bundle=async(role,head)=>{const d=await mkdtemp(join(dir,role+'-bundle-'));bundleDirs.push(d);const image=await makeBundle(role,app,d,head);return {...image,directory:d};};
 const command=async(executable,args,{cwd})=>{
  assert.equal(executable,'railway');assert.equal(args[0],'up');assert.ok(args.includes('--path-as-root')&&args.includes('--detach')&&args.includes('--json'));assert.equal(args[1],cwd);
  const service=args[args.indexOf('--service')+1],role=service===scope.operatorServiceId?'executor':'authorizer';assert.ok([scope.operatorServiceId,scope.delivery.authorizerServiceId].includes(service));
  const image=role==='executor'?executor:authorizer,expected=JSON.parse(await readFile(join(cwd,'delivery-image.json'),'utf8'));
  assert.deepEqual(JSON.parse(docker('run','--rm','--network','none','--entrypoint','cat',image,'/app/delivery-image.json')),expected);
  const variables=(await load('variables.json'))[service],deployment=randomUUID(),name=prefix+'-'+role+'-'+(++sequence);containers.push(name);allDeployments[deployment]=name;activeContainers[role]=name;
  const env={...variables,RAILWAY_DEPLOYMENT_ID:deployment,NODE_EXTRA_CA_CERTS:'/fixture/server.crt'};if(wrongService&&role==='executor')env.RAILWAY_SERVICE_ID=scope.gameServiceId;
  docker('run','-d','--name',name,'--network',net,'--mount','type=bind,src='+file('server.crt')+',dst=/fixture/server.crt,readonly',...(role==='executor'?['--mount','type=volume,src='+volume+',dst=/run/kingdom-retention']:[]),...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),image);
  const p=await load('provider.json');p.deployments[deployment]={id:deployment,projectId:scope.projectId,environmentId:scope.environmentId,serviceId:service,status:'SUCCESS',deploymentStopped:false,instances:[{id:randomUUID(),status:'RUNNING'}]};await save('provider.json',p);
  return JSON.stringify({deploymentId:deployment,logsUrl:'https://unused.invalid'});
 };
 const provider=platform('disposable-provider-token',{fetcher,command});
 const exists=async f=>(await fixture.db.query('SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1) AS v',[f.database.name])).rows[0].v;
 const run=async({target=fixture.copies[0],operation='retire',cancelAt,expired=false,missing=false,loseAck=false,wrongCommit=false,wrongJob=false,wrongBranch=false,priorApproval,before}={})=>{
  const requestId=randomUUID(),abort=new AbortController();activeContainers={};control={...control,sha:wrongCommit?'b'.repeat(40):sha,wrongJob,wrongBranch,status:'in_progress',pauseBeforeDrop:false,loseExecutorAck:loseAck};await save('control.json',control);
  const c={...runtimeState.coordinator,runId:control.runId},s={...runtimeState,coordinator:c,observedAt:new Date().toISOString()};
  const env={...{GITHUB_REPOSITORY:'catillatio/test',GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_JOB:'retire',GITHUB_RUN_ID:control.runId,GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,GH_TOKEN:'disposable-github-read'},KINGDOM_RETENTION_EXECUTION_APPROVED:'1',KINGDOM_RETENTION_SCOPE:JSON.stringify(scope),RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,RETENTION_REQUEST_ID:requestId,RETENTION_OPERATION:operation};
  let asynchronous,watch;
  const task=executeCoordinator({env,store,provider,bundle,signal:abort.signal,fetcher,log:(stage,reviewDigest)=>{
   console.log('DELIVERY_STAGE: '+stage);
   if(stage==='PRIVATE_PREPARATION_READY'){
    // Match the Railway Console boundary: create synthetic private inputs AS the
    // container's non-root user, independent of the hosted runner UID (1001).
    const privateFiles={'/tmp/fixture-state.json':JSON.stringify(s)};
    if(before)privateFiles['/tmp/fixture-before.json']=before;
    execFileSync('docker',['exec','-i',activeContainers.authorizer,'node','-e','let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{const fs=require("fs");for(const [p,v] of Object.entries(JSON.parse(s)))fs.writeFileSync(p,v,{mode:0o600,flag:"wx"});});'],{input:JSON.stringify(privateFiles),stdio:['pipe','pipe','pipe']});
    const args=['exec',activeContainers.authorizer,'node','deployment/release/retention/delivery/prepare.mjs','--state','/tmp/fixture-state.json','--owner-reviewed'];
    if(operation==='retire')args.push('--oid',target.database.oid);else args.push('--prior-approval',priorApproval,'--before','/tmp/fixture-before.json');
    const summary=JSON.parse(docker(...args));assert.equal(summary.retirement_authorized,false);
   }
   if(stage==='PRIVATE_REQUEST_READY_FOR_SIGNING')asynchronous=(async()=>{
    control.reviewComment='retention '+requestId+' '+reviewDigest;await save('control.json',control);
    if(cancelAt==='during'){control.pauseBeforeDrop=true;await save('control.json',control);}
    if(missing){setTimeout(()=>abort.abort(),1500);return;}
    if(expired){const data=await readObject(await store.grant(control.runId+'_1',requestId,'input.json','GET'),{fetcher});const approval=approve(data.data.plan,data.state,{scope:data.scope,now:Date.now()-600000}).encoded;await writeObject(await store.grant(control.runId+'_1',requestId,'signature.json','PUT'),{inputDigest:hash(data),approval},{fetcher});return;}
    const signEnv={...env,GITHUB_JOB:'sign-retirement',KINGDOM_RETENTION_VERIFY_KEY:publicKey};
    await signRequest({env:signEnv,store,fetcher,runAuthorize:async data=>{
     const d=await mkdtemp(join(tmpdir(),'retention-isolated-signer-'));for(const [n,v] of Object.entries({scope:data.scope,state:data.state,plan:data.data.plan}))await writeFile(join(d,n+'.json'),JSON.stringify(v),{mode:0o600});
     await writeFile(join(d,'key.pem'),keys.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
     execFileSync(process.execPath,['deployment/release/retention/authorize.mjs','--scope',join(d,'scope.json'),'--state',join(d,'state.json'),'--plan',join(d,'plan.json'),'--private-key',join(d,'key.pem'),'--out',join(d,'approval.txt'),'--release-lock-held'],{cwd:app,env:{PATH:process.env.PATH},stdio:'pipe'});
     const result=(await readFile(join(d,'approval.txt'),'utf8')).trim();await rm(d,{recursive:true,force:true});return result;
    }});
   })().catch(()=>abort.abort());
  }});
  if(cancelAt==='before')abort.abort();
  if(cancelAt==='during')watch=(async()=>{await wait(async()=>{try{return !!(await stat(file('before-drop-reached')));}catch{return false;}},30000);control.status='cancelled';await save('control.json',control);abort.abort();control.pauseBeforeDrop=false;await save('control.json',control);})().catch(()=>abort.abort());
  if(expired||wrongService)watch=(async()=>{await wait(()=>{const n=activeContainers.executor;return n&&JSON.parse(docker('inspect',n))[0].State.Running===false;},30000);abort.abort();})().catch(()=>abort.abort());
  let result,error;const failureWatch=setInterval(()=>{try{for(const name of Object.values(activeContainers)){const s=JSON.parse(docker('inspect',name))[0].State;if(!s.Running&&s.ExitCode!==0)abort.abort();}}catch{}},500);const safetyTimer=setTimeout(()=>abort.abort(),90000);try{result=await task;}catch(e){error=e;}finally{clearInterval(failureWatch);clearTimeout(safetyTimer);await asynchronous;await watch;
   if(error)for(const [role,name] of Object.entries(activeContainers)){try{const logs=docker('logs',name);console.log('DISPOSABLE_WORKER_STATUS: '+role+' '+(logs.match(/RETENTION_DELIVERY_WORKER: (PASS|FAIL|DISABLED)/)?.[1]||'NO_RECEIPT'));}catch{}}
   if(error){const counts=(await fixture.db.query('SELECT event,count(*)::int AS n FROM release_retention.audit GROUP BY event')).rows;console.log('DISPOSABLE_AUDIT_COUNTS: '+JSON.stringify(counts));try{const failure=docker('run','--rm','--network','none','--mount','type=volume,src='+volume+',dst=/run/kingdom-retention','--entrypoint','node',executor,'-e','const fs=require("fs");const p="/run/kingdom-retention/"+'+JSON.stringify(requestId)+'+"/results/999-1.json.failure.json";if(fs.existsSync(p))console.log(JSON.parse(fs.readFileSync(p)).category)');if(failure)console.log('DISPOSABLE_CLI_CATEGORY: '+failure);}catch{}}
   for(const name of Object.values(activeContainers)){try{docker('rm',name);}catch{}}
   for(const [key,name] of Object.entries(allDeployments))if(Object.values(activeContainers).includes(name))delete allDeployments[key];
  }
  return {result,error,requestId,state:s};
 };
 const good=await run();if(good.error)await writeFile('/tmp/retention-delivery-fixture-private-error.txt',good.error.stack);assert.ok(!good.error,'Authorized delivery must complete');assert.equal(await exists(fixture.copies[0]),false);await fixture.preservation([fixture.copies[0].database.name]);
 const audit=(await fixture.db.query("SELECT count(*)::int AS n FROM release_retention.audit WHERE event='deleted'")).rows[0].n;assert.equal(audit,1);
 pass('actual coordinator, independent signer, separate permit issuer and non-root executor retire one disposable copy exactly once');
 for(const patch of [{wrongCommit:true},{wrongJob:true},{wrongBranch:true}]){const rejected=await run({target:fixture.copies[1],...patch});assert.ok(rejected.error);assert.equal(await exists(fixture.copies[1]),true);}
 pass('wrong GitHub branch, job or commit cannot launch or authorize the private delivery');
 const noStart=await run({target:fixture.copies[1],cancelAt:'before'});assert.ok(noStart.error);assert.equal(await exists(fixture.copies[1]),true);
 pass('cancelled coordinator cannot launch or arm execution');
 const interrupted=await run({target:fixture.copies[1],cancelAt:'during'});assert.ok(interrupted.error);assert.equal(await exists(fixture.copies[1]),true);
 const interruptedPath='/run/kingdom-retention/'+interrupted.requestId+'/results/999-1.json.before.json';
 assert.equal(docker('run','--rm','--network','none','--mount','type=volume,src='+volume+',dst=/run/kingdom-retention','--entrypoint','node',executor,'-e','const fs=require("fs");const p='+JSON.stringify(interruptedPath)+';console.log(fs.statSync(p).mode&63)'), '0');
 pass('cancellation during retirement closes workers before DROP and preserves the private baseline across container removal');
 control.pauseBeforeDrop=false;await save('control.json',control);await rm(file('before-drop-reached'),{force:true});
 wrongService=true;const mismatched=await run({target:fixture.copies[1]});wrongService=false;assert.ok(mismatched.error);assert.equal(await exists(fixture.copies[1]),true);
 pass('substituted Railway service identity cannot obtain an armed execution');
 const unsigned=await run({target:fixture.copies[1],missing:true});assert.ok(unsigned.error);assert.equal(await exists(fixture.copies[1]),true);
 const rejected=await run({target:fixture.copies[1],expired:true});assert.ok(rejected.error);assert.equal(await exists(fixture.copies[1]),true);
 pass('missing or cryptographically valid but expired signed authorization cannot create a permit or delete the selected database');
 const lost=await run({target:fixture.copies[1],loseAck:true});assert.ok(lost.error);assert.equal(await exists(fixture.copies[1]),false);
 const resultPath='/run/kingdom-retention/'+lost.requestId+'/results/999-1.json';
 const originalBefore=docker('run','--rm','--network','none','--mount','type=volume,src='+volume+',dst=/run/kingdom-retention','--entrypoint','cat',executor,resultPath+'.before.json');
 const savedResult=JSON.parse(docker('run','--rm','--network','none','--mount','type=volume,src='+volume+',dst=/run/kingdom-retention','--entrypoint','cat',executor,resultPath));assert.equal(savedResult.verification.allUntargetedIdentitiesPreserved,true);assert.equal(savedResult.verification.filesystemBytesReclaimed,null);
 control.loseExecutorAck=false;control.runId='1000';await save('control.json',control);
 const reconciled=await run({operation:'reconcile',priorApproval:savedResult.approvalId,before:originalBefore});assert.ok(!reconciled.error);
 assert.equal((await fixture.db.query("SELECT count(*)::int AS n FROM release_retention.audit WHERE event='deleted'")).rows[0].n,2);await fixture.preservation([fixture.copies[0].database.name,fixture.copies[1].database.name]);
 pass('lost acknowledgement never causes automatic retry; read-only reconciliation preserves exactly two total deletion outcomes and all survivors');
 const evidence={kind:'disposable-delivery-provider-contract-rehearsal',passed:true,realRailwayDeployment:false,liveGithubDispatch:false,tests:notes,syntheticCopies:6,botsPerCopy:900,humansPerCopy:2,unrelatedBusinessRowsPreserved:true,durableJournalRestartVerified:true,filesystemReclamationClaimed:false};
 await mkdir(join(app,'test-results'),{recursive:true});await writeFile(join(app,'test-results/retention-delivery-verification.json'),JSON.stringify(evidence,null,2));
}catch(error){console.error('DISPOSABLE_DELIVERY_FIXTURE_FAILED: '+(error.code||error.name)+': '+error.message.slice(0,250));throw error;}finally{
 if(store)store.close();if(fixture)await fixture.db.end().catch(()=>{});
 for(const name of containers.reverse())try{docker('rm','-f',name);}catch{}
 try{docker('volume','rm',volume);}catch{}try{docker('network','rm',net);}catch{}
 await rm(dir,{recursive:true,force:true});
}
