// Fixed-purpose one-shot worker. No HTTP listener, shell, arbitrary command or URL.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,lstat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {frame,input,makeReceipt,githubEnvironment,root,verifyArm} from './protocol.mjs';
import {readObject,writeObject} from './io.mjs';
import {imageIdentity} from './image.mjs';
import {ownerReview} from './approval.mjs';
import {verifyVolume,initializeVolume} from './volume.mjs';
import {hash,checkApproval,checkAuthorizerEnvironment} from '../protocol.mjs';
import {liveGuards} from '../guards.mjs';
import {writeBaseline} from '../journal.mjs';
import {publishReady} from '../ready.mjs';
let child,client,timer;
const aborted=new AbortController(),stop=()=>aborted.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);
try{
 process.umask(0o077);
 for(const [k,v] of Object.entries(process.env))if(k.startsWith('KINGDOM_RETENTION_ADOPTER_DB_')||k==='KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL')assert.ok(!v);
 if(process.env.KINGDOM_RETENTION_INITIALIZE_JOURNAL==='owner-approved'){
  await initializeVolume();
 }else if(process.env.KINGDOM_RETENTION_ENABLED!=='1'){
  assert.notEqual(process.getuid(),0);assert.equal(process.env.KINGDOM_RETENTION_ENABLED,'0');assert.ok(!process.env.KINGDOM_RETENTION_JOB);
  console.log('RETENTION_DELIVERY_WORKER: DISABLED');
  if(process.env.KINGDOM_RETENTION_CONSOLE_SETUP==='1'){
   for(const k of ['DATABASE_URL','KINGDOM_RESTORE_DATABASE_URL','KINGDOM_RETENTION_DATABASE_URL','KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL','KINGDOM_RETENTION_SIGNING_KEY','RAILWAY_TOKEN','RAILWAY_API_TOKEN'])assert.ok(!process.env[k]);
   const disabledImage=await imageIdentity();
   if(disabledImage.role==='executor')await verifyVolume(JSON.parse(process.env.KINGDOM_RETENTION_INSTALL_TARGET));
   console.log('RETENTION_INSTALLATION_CONSOLE: READY — disabled; no database access');
   await delay(900000,undefined,{signal:aborted.signal});
  }
 }else{
  assert.notEqual(process.getuid(),0);assert.ok(!process.env.NODE_OPTIONS&&!process.env.NODE_TLS_REJECT_UNAUTHORIZED);
  for(const k of ['RAILWAY_TOKEN','RAILWAY_API_TOKEN','KINGDOM_RELEASE_SIGNING_KEY','KINGDOM_RETENTION_SIGNING_KEY','KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL','DATABASE_URL','KINGDOM_RESTORE_DATABASE_URL','KINGDOM_RETENTION_STORE_ACCESS_KEY_ID','KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY'])assert.ok(!process.env[k]);
  const image=await imageIdentity(),raw=Buffer.from(process.env.KINGDOM_RETENTION_JOB??'','base64url');assert.ok(raw.length>0&&raw.length<=100000);
  const f=frame(JSON.parse(raw),process.env,image.role);assert.equal(f.codeDigest,image.codeDigest);
  const deploymentId=process.env.RAILWAY_DEPLOYMENT_ID,guards=liveGuards(f.scope,{githubToken:f.githubToken});
  if(image.role==='executor'){assert.ok(!process.env.KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL);await verifyVolume(f.scope);}
  else{assert.ok(!process.env.KINGDOM_RETENTION_DATABASE_URL);checkAuthorizerEnvironment(process.env,f.scope);}
  let checking=false,validUntil=Date.parse(f.expiresAt);
  const check=async()=>{assert.ok(Date.now()<validUntil);await guards.coordinated({coordinator:f.coordinator});};
  await check();timer=setInterval(async()=>{if(checking)return;checking=true;try{await check();}catch{stop();}finally{checking=false;}},5000);
  const io={signal:aborted.signal,deadline:Date.parse(f.expiresAt),wait:true};
  await writeObject(f.urls.readyPut,makeReceipt(f,deploymentId,'ready'),io);
  const arm=await readObject(f.urls.armGet,io);
  let adoptionPostcheck;
  if(f.operation==='adopt')adoptionPostcheck=await readObject(f.urls.postcheckGet,io);
  const armedDigest=verifyArm(arm,f,deploymentId,adoptionPostcheck?hash(adoptionPostcheck):undefined);
  await check();aborted.signal.throwIfAborted();
  const data=input(await readObject(f.urls.inputGet,io),f),inputDigest=hash(data);
  assert.equal(inputDigest,armedDigest);if(adoptionPostcheck)assert.equal(adoptionPostcheck.inputDigest,inputDigest);
  validUntil=Math.min(validUntil,Date.parse(data.state.observedAt)+300000);io.deadline=validUntil;
  assert.equal(await guards.health(),data.state.activeSha);
  let approval;
  if(f.operation==='retire'){
   const signed=await readObject(f.urls.signatureGet,io);assert.equal(signed.inputDigest,inputDigest);approval=signed.approval;
   checkApproval(approval,process.env.KINGDOM_RETENTION_VERIFY_KEY,data.data.plan,data.state,f.scope);
   await ownerReview(f.coordinator,f.requestId,inputDigest,{githubToken:f.githubToken});
  }
  if(image.role==='authorizer'){
   if(f.operation==='retire'){
    const pg=await import('pg');client=new pg.default.Client({connectionString:checkAuthorizerEnvironment(process.env,f.scope),connectionTimeoutMillis:5000,query_timeout:15000,application_name:'kingdom-retention-permit-delivery'});
    client.on('error',stop);await client.connect();
    const {installPermit}=await import('../permit.mjs');await check();aborted.signal.throwIfAborted();
    const end=()=>client.end().catch(()=>{});aborted.signal.addEventListener('abort',end,{once:true});
    await installPermit(client,{scope:f.scope,state:data.state,plan:data.data.plan,approval,verifyKey:process.env.KINGDOM_RETENTION_VERIFY_KEY});
    aborted.signal.throwIfAborted();await writeObject(f.urls.permitPut,{protocol:f.protocol,inputDigest,approvalDigest:hash(approval)},io);
   }
  }else{
   if(f.operation==='retire'){
    const permit=await readObject(f.urls.permitGet,io);assert.deepEqual(permit,{protocol:f.protocol,inputDigest,approvalDigest:hash(approval)});
   }
   await check();aborted.signal.throwIfAborted();
   const directory=root+'/'+f.requestId;
   await mkdir(directory,{mode:0o700}); // Existing request ID is never replayed.
   await writeBaseline(directory+'/delivery-claim.json',{requestId:f.requestId,coordinator:f.coordinator,deploymentId,codeDigest:f.codeDigest,inputDigest});
   const files={'scope.json':JSON.stringify(data.scope),'state.json':JSON.stringify(data.state)};
   if(f.operation==='retire')Object.assign(files,{'plan.json':JSON.stringify(data.data.plan),'approval.txt':approval+'\n'});
   else if(f.operation==='adopt'){files['manifest.json']=JSON.stringify(JSON.parse(Buffer.from(data.data.manifestBytes,'base64url')));files['before.json']=JSON.stringify(adoptionPostcheck.before);}
   else if(f.operation==='adoption-review')files['manifest.json']=JSON.stringify(data.data.manifest);
   else Object.assign(files,{'before.json':JSON.stringify(data.data.before),'prior-approval.txt':data.data.priorApproval+'\n'});
   for(const [name,body] of Object.entries(files))await writeFile(directory+'/'+name,body,{mode:0o600,flag:'wx'});
   await publishReady(directory+'/ready.json',Object.fromEntries(Object.keys(files).map(n=>[n,directory+'/'+n])));
   const env={...process.env,...githubEnvironment(f.coordinator,f.githubToken),RETENTION_REQUEST_ID:f.requestId,RETENTION_OPERATION:f.operation};
   delete env.KINGDOM_RETENTION_JOB;
   child=spawn(process.execPath,['deployment/release/retention/job.mjs'],{stdio:'ignore',env});
   const kill=()=>{child.kill('SIGTERM');const hard=setTimeout(()=>child.kill('SIGKILL'),1500);hard.unref();};aborted.signal.addEventListener('abort',kill,{once:true});
   const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
   assert.equal(code,0);aborted.signal.throwIfAborted();
   const result=JSON.parse(await readFile(directory+'/results/'+f.coordinator.runId+'-'+f.coordinator.runAttempt+'.json','utf8'));
   await writeBaseline(directory+'/delivery-completed.json',{inputDigest,deploymentId,result});
  }
  aborted.signal.throwIfAborted();
  await writeObject(f.urls.resultPut,makeReceipt(f,deploymentId,'completed',inputDigest),io);
  console.log('RETENTION_DELIVERY_WORKER: PASS');
 }
}catch{
 if(child&&child.exitCode===null)child.kill('SIGTERM');
 console.error('RETENTION_DELIVERY_WORKER: FAIL');process.exitCode=1;
}finally{if(timer)clearInterval(timer);if(client)await client.end().catch(()=>{});}
