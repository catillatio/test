import assert from 'node:assert/strict';
import {executeAdoption} from './adoption-coordinator.mjs';
import {authenticateAdoption} from './adoption-artifact.mjs';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {coordinator,deliveryScope,deliveryProtocol,input,receipt,operations,signArm} from './protocol.mjs';
import {liveGuards} from '../guards.mjs';
import {handoffStore} from './store.mjs';
import {platform} from './platform.mjs';
import {makeBundle} from './bundle.mjs';
import {readObject,writeObject} from './io.mjs';
import {hash} from '../protocol.mjs';
import {installDisabled,setupOperations} from './install.mjs';
import {uuid} from '../../protocol.mjs';
import {asDeliveryFailure,reportDeliveryFailure} from './failure.mjs';
export function command(executable,args,{cwd}){
 return new Promise((resolve,reject)=>{const c=spawn(executable,args,{cwd,stdio:['ignore','pipe','pipe'],timeout:120000});let text='';c.stderr.resume();c.stdout.on('data',b=>{text+=b;if(text.length>2000000)c.kill();});c.once('error',()=>reject(Error('Delivery command failed.')));c.once('close',n=>n===0?resolve(text):reject(Error('Delivery command failed.')));});
}
export async function executeCoordinator({env=process.env,store,provider,bundle,signal,log=()=>{},fetcher=globalThis.fetch}={}){
 const c=coordinator(env),scope=deliveryScope(JSON.parse(env.KINGDOM_RETENTION_SCOPE)),id=env.RETENTION_REQUEST_ID,operation=env.RETENTION_OPERATION;
 assert.match(id??'',uuid);assert.ok(operations.includes(operation));assert.notEqual(operation,'adopt');
 assert.equal(env.RAILWAY_PROJECT_ID,scope.projectId);assert.equal(env.RAILWAY_ENVIRONMENT_ID,scope.environmentId);
 for(const key of ['DATABASE_URL','KINGDOM_RESTORE_DATABASE_URL','KINGDOM_RELEASE_SIGNING_KEY','KINGDOM_RETENTION_SIGNING_KEY','KINGDOM_RETENTION_DATABASE_URL','KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL','KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL'])assert.ok(!env[key]);
 const guards=liveGuards(scope,{githubToken:env.GH_TOKEN,fetcher});await guards.coordinated({coordinator:c});signal?.throwIfAborted();
 await provider.preflight(scope);
 const deliveryKey=generateKeyPairSync('ed25519');
 const run=c.runId+'_1',frames={},deployments={},deadline=Date.now()+840000;
 const grant=(name,method)=>store.grant(run,id,name,method),io={signal,fetcher,deadline,wait:true};
 const probe=await grant('probe.json','PUT');await writeObject(probe,{requestId:id},io);await writeObject(probe,{requestId:id},{...io,expectExisting:true});
 try{
  for(const role of ['authorizer','executor']){
   signal?.throwIfAborted();const image=await bundle(role,c.headSha);
   const urls={inputGet:await grant('input.json','GET'),readyPut:await grant(role+'-ready.json','PUT'),armGet:await grant(role+'-arm.json','GET'),resultPut:await grant(role+'-result.json','PUT'),signatureGet:await grant('signature.json','GET')};
   if(role==='authorizer'){urls.inputPut=await grant('input.json','PUT');urls.permitPut=await grant('permit.json','PUT');}else urls.permitGet=await grant('permit.json','GET');
   const f={deliveryVerifyKey:deliveryKey.publicKey.export({type:'spki',format:'pem'}),protocol:deliveryProtocol,role,operation,requestId:id,scope,coordinator:c,codeDigest:image.codeDigest,createdAt:new Date().toISOString(),expiresAt:new Date(deadline).toISOString(),githubToken:env.GH_TOKEN,origin:store.origin,urls};frames[role]=f;
   deployments[role]=await provider.launch(role,f,image.directory);
  }
  for(const role of ['authorizer','executor'])receipt(await readObject(await grant(role+'-ready.json','GET'),io),frames[role],deployments[role],'ready');
  await writeObject(await grant('context.json','PUT'),{protocol:deliveryProtocol,scope,coordinator:c,requestId:id,operation,deployments,deliveryVerifyKey:frames.executor.deliveryVerifyKey,codeDigests:Object.fromEntries(Object.entries(frames).map(([role,f])=>[role,f.codeDigest]))},io);
  log('PRIVATE_PREPARATION_READY');
  const data=input(await readObject(await grant('input.json','GET'),io),frames.executor);
  io.deadline=Math.min(deadline,Date.parse(data.state.observedAt)+300000);
  await guards.coordinated(data.state);assert.equal(await guards.health(),data.state.activeSha);signal?.throwIfAborted();
  for(const role of ['authorizer','executor'])await writeObject(await grant(role+'-arm.json','PUT'),signArm(frames[role],deployments[role],hash(data),deliveryKey.privateKey),io);
  log(operation==='retire'?'PRIVATE_REQUEST_READY_FOR_SIGNING':'PRIVATE_REQUEST_READY',operation==='retire'?hash(data):undefined);
  for(const role of ['authorizer','executor']){
   const result=receipt(await readObject(await grant(role+'-result.json','GET'),io),frames[role],deployments[role],'completed');assert.equal(result.inputDigest,hash(data));
   await provider.completion(deployments[role],scope,role,{deadline,signal});
  }

 }finally{
  // Independent bounded stop/verification even when the primary signal aborted.
  // A lost launch acknowledgement is never retried or treated as permission.
  const results=await Promise.allSettled(Object.entries(deployments).map(([role,deployment])=>provider.stop(deployment,scope,role)));
  const failed=results.find(r=>r.status==='rejected');if(failed)throw asDeliveryFailure(failed.reason,'DELIVERY_CLEANUP');
 }
 log('PASS');return {passed:true};
}
async function main(){
 const control=new AbortController(),cancel=()=>control.abort();process.once('SIGTERM',cancel);process.once('SIGINT',cancel);
 const installation=setupOperations.includes(process.env.RETENTION_OPERATION),store=installation?null:handoffStore(),directories=[];
 try{
  await (installation?installDisabled:process.env.RETENTION_OPERATION==='adopt'?executeAdoption:executeCoordinator)({env:process.env,store,authenticate:(data,f)=>authenticateAdoption(data,f,{githubToken:process.env.GH_TOKEN,command,temp:process.env.RUNNER_TEMP,signal:control.signal}),provider:platform(process.env.RAILWAY_TOKEN,{command}),signal:control.signal,log:(s,digest)=>{console.log('RETENTION_DELIVERY: '+s);if(digest)console.log((process.env.RETENTION_OPERATION==='adopt'?'ADOPTION_REVIEW_COMMENT: adoption ':'RETENTION_REVIEW_COMMENT: retention ')+process.env.RETENTION_REQUEST_ID+' '+digest);},bundle:async(role,sha)=>{
   const dir=await mkdtemp(join(process.env.RUNNER_TEMP,'retention-'+role+'-'));directories.push(dir);
   return {...await makeBundle(role,new URL('../../../..',import.meta.url).pathname,dir,sha),directory:dir};
  }});
 }finally{store?.close();for(const d of directories)await rm(d,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{reportDeliveryFailure(error);process.exitCode=1;});
