import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {coordinator,deliveryScope,deliveryProtocol,input,receipt,signArm,adoptionTarget} from './protocol.mjs';
import {adoptionInput} from './adoption-operation.mjs';
import {hash,emergencyOids,checkState} from '../protocol.mjs';
import {liveGuards} from '../guards.mjs';
import {ownerReview} from './approval.mjs';
import {readObject,writeObject} from './io.mjs';
import {deliveryStep} from './failure.mjs';
import {uuid} from '../../protocol.mjs';
export async function executeAdoption({env,store,provider,bundle,authenticate,signal,fetcher=globalThis.fetch,log=()=>{}}){
 return deliveryStep('ADOPTION_OPERATION',async()=>{
  const c=coordinator(env),scope=deliveryScope(JSON.parse(env.KINGDOM_RETENTION_SCOPE)),id=env.RETENTION_REQUEST_ID;
  assert.equal(env.RETENTION_OPERATION,'adopt');assert.match(id??'',uuid);assert.match(env.KINGDOM_RETENTION_ADOPTER_SERVICE_ID??'',uuid);
  assert.equal(env.RAILWAY_PROJECT_ID,scope.projectId);assert.equal(env.RAILWAY_ENVIRONMENT_ID,scope.environmentId);
  for(const [k,v] of Object.entries(env))if(/DATABASE_URL|ADOPTER_DB_|SIGNING_KEY/.test(k))assert.ok(!v);
  const guards=liveGuards(scope,{githubToken:env.GH_TOKEN,fetcher});await guards.coordinated({coordinator:c});signal?.throwIfAborted();
  await provider.tokenIdentity(scope,{signal});
  const adoption=adoptionTarget(await deliveryStep('ADOPTION_PREFLIGHT',()=>provider.adoptionPreflight(scope,env.KINGDOM_RETENTION_ADOPTER_SERVICE_ID)),scope);assert.equal(adoption.serviceId,env.KINGDOM_RETENTION_ADOPTER_SERVICE_ID);
  const key=generateKeyPairSync('ed25519'),frames={},deployments={},deadline=Date.now()+840000;
  const grant=(name,method)=>store.grant(c.runId+'_1',id,name,method),io={fetcher,signal,deadline,wait:true};
  const probe=await grant('probe.json','PUT');await writeObject(probe,{requestId:id},io);await writeObject(probe,{requestId:id},{...io,expectExisting:true});
  const makeFrame=async(role,image)=>{
   const urls={inputGet:await grant('input.json','GET'),readyPut:await grant(role+'-ready.json','PUT'),armGet:await grant(role+'-arm.json','GET'),resultPut:await grant(role+'-result.json','PUT')};
   if(role==='adopter')Object.assign(urls,{baselinePut:await grant('adoption-baseline.json','PUT'),baselineGet:await grant('adoption-baseline.json','GET'),proceedGet:await grant('adopter-proceed.json','GET')});
   else{Object.assign(urls,{signatureGet:await grant('signature.json','GET'),postcheckGet:await grant('adoption-postcheck.json','GET')});if(role==='authorizer')Object.assign(urls,{inputPut:await grant('input.json','PUT'),permitPut:await grant('permit.json','PUT')});else urls.permitGet=await grant('permit.json','GET');}
   return {protocol:deliveryProtocol,role,operation:'adopt',requestId:id,scope,coordinator:c,codeDigest:image.codeDigest,createdAt:new Date().toISOString(),expiresAt:new Date(deadline).toISOString(),githubToken:env.GH_TOKEN,origin:store.origin,urls,deliveryVerifyKey:key.publicKey.export({type:'spki',format:'pem'}),adoption};
  };
  let adopterStopAttempted=false;
  try{
   for(const role of ['authorizer','executor']){
    signal?.throwIfAborted();const image=await bundle(role,c.headSha),f=frames[role]=await makeFrame(role,image);
    deployments[role]=await deliveryStep('ADOPTION_UPLOAD',()=>provider.adoptionLaunch(role,f,image.directory));
    await provider.running(deployments[role],scope,role,{deadline,signal});
   }
   // Read grants are separately signed; never derive a GET from a PUT URL.
   for(const role of ['authorizer','executor'])receipt(await readObject(await grant(role+'-ready.json','GET'),io),frames[role],deployments[role],'ready');
   log('PRIVATE_PREPARATION_READY');
   const data=input(await readObject(await grant('input.json','GET'),io),frames.executor),selected=adoptionInput(data,frames.executor),digest=hash(data);
   io.deadline=Math.min(deadline,Date.parse(data.state.observedAt)+300000);
   const authentication=await deliveryStep('ADOPTION_ARTIFACT',()=>authenticate(data,frames.executor));
   await writeObject(await grant('context.json','PUT'),{protocol:deliveryProtocol,scope,coordinator:c,requestId:id,operation:'adopt',adoption,deployments,codeDigests:Object.fromEntries(Object.entries(frames).map(([r,f])=>[r,f.codeDigest])),deliveryVerifyKey:frames.executor.deliveryVerifyKey},io);
   await writeObject(await grant('adoption-review-arm.json','PUT'),signArm(frames.authorizer,deployments.authorizer,digest,key.privateKey),io);
   log('ADOPTION_REVIEW_READY',digest);
   const approval=await readObject(await grant('adoption-approval.json','GET'),io);assert.deepEqual(approval,{requestId:id,coordinator:c,inputDigest:digest});
   await ownerReview(c,id,digest,{githubToken:env.GH_TOKEN,fetcher,purpose:'adoption'});
   await guards.beforeDelete({jobId:selected.payload.jobId,evidence:selected.manifest},data.state);signal?.throwIfAborted();
   await writeObject(await grant('adoption-intent.json','PUT'),{requestId:id,coordinator:c,inputDigest:digest,authentication,adoption},io);
   checkState(data.state,scope);const image=await bundle('adopter',c.headSha),f=frames.adopter=await makeFrame('adopter',image);
   deployments.adopter=await deliveryStep('ADOPTION_UPLOAD',()=>provider.launchAdopter(f,image.directory));
   await provider.adoptionRunning(deployments.adopter,scope,adoption,{deadline:io.deadline,signal});
   receipt(await readObject(await grant('adopter-ready.json','GET'),io),f,deployments.adopter,'ready');
   await writeObject(await grant('adopter-arm.json','PUT'),signArm(f,deployments.adopter,digest,key.privateKey),io);
   const before=await readObject(await grant('adoption-baseline.json','GET'),io),target=before.databases?.find(d=>d.name===selected.payload.name);
   assert.ok(target&&!target.template);assert.equal(target.oid,selected.payload.oid);assert.equal(target.owner,selected.payload.owner);
   for(const oid of emergencyOids)assert.ok(before.databases.some(d=>d.oid===oid));
   await guards.beforeDelete({jobId:selected.payload.jobId,evidence:selected.manifest},data.state);signal?.throwIfAborted();
   await writeObject(await grant('adopter-proceed.json','PUT'),signArm(f,deployments.adopter,digest,key.privateKey,hash(before)),io);
   const outcome=await readObject(await grant('adopter-result.json','GET'),io);receipt(outcome.receipt,f,deployments.adopter,'completed');assert.equal(outcome.receipt.inputDigest,digest);assert.equal(outcome.baselineDigest,hash(before));
   adopterStopAttempted=true;await provider.stopAdopter(deployments.adopter,scope,adoption,{signal});
   const postcheck={inputDigest:digest,before};await writeObject(await grant('adoption-postcheck.json','PUT'),postcheck,io);
   for(const role of ['authorizer','executor'])await writeObject(await grant(role+'-arm.json','PUT'),signArm(frames[role],deployments[role],digest,key.privateKey,hash(postcheck)),io);
   for(const role of ['authorizer','executor']){const result=receipt(await readObject(await grant(role+'-result.json','GET'),io),frames[role],deployments[role],'completed');assert.equal(result.inputDigest,digest);await provider.completion(deployments[role],scope,role,{deadline,signal});}
  }finally{
   const stopped=await Promise.allSettled(Object.entries(deployments).map(([role,id])=>role==='adopter'?(adopterStopAttempted?Promise.resolve():provider.stopAdopter(id,scope,adoption)):provider.stop(id,scope,role)));
   let reset;try{await provider.resetAdoption(scope);}catch{reset=true;}
   if(stopped.some(r=>r.status==='rejected')||reset)await deliveryStep('ADOPTION_CLEANUP',()=>{throw Error();});
  }
  log('ADOPTION_PASS');return {passed:true};
 });
}
