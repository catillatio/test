import assert from 'node:assert/strict';
import timers from 'node:timers/promises';
import {uuid} from './protocol.mjs';

// Railway CLI v5.70.0, existing-service `up --detach --json`, returns only
// deploymentId and logsUrl. Neither the upload output nor its URL establishes
// target identity. Read it independently from the authenticated Railway API.
const identityQuery=`query KingdomReleaseDeploymentIdentity($id: String!) {
 deployment(id: $id) { id projectId environmentId serviceId }
}`;

export async function verifyQueuedDeployment(output,expected,{token,fetcher=globalThis.fetch}={}){
 try{
  for(const key of ['projectId','environmentId','serviceId']){assert.match(expected[key],uuid);assert.equal(expected[key].length,36);}
  assert.ok(typeof token==='string'&&token.trim()&&!/[\r\n]/.test(token));
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
  const queued=JSON.parse(output);
  assert.match(queued?.deploymentId,uuid);
  assert.equal(queued.deploymentId.length,36);
  // No caller-supplied endpoint, redirect, logs URL, or echoed target arguments.
  const response=await fetcher('https://backboard.railway.com/graphql/v2',{
   method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
   headers:{'content-type':'application/json','project-access-token':token},
   body:JSON.stringify({query:identityQuery,variables:{id:queued.deploymentId}})
  });
  assert.equal(response.ok,true);
  const metadata=await response.json();
  assert.ok(metadata.errors===undefined||(Array.isArray(metadata.errors)&&metadata.errors.length===0));
  const deployment=metadata.data?.deployment;
  assert.equal(deployment?.id,queued.deploymentId);
  for(const key of ['projectId','environmentId','serviceId'])assert.equal(deployment[key],expected[key]);
  return queued.deploymentId;
 }catch{
  // Provider errors can contain credentials or URLs. Never propagate them,
  // assertion values, or a causal exception into release logs.
  throw new Error('Railway deployment identity could not be verified. Production promotion stopped.');
 }
}


// In the pinned API, SUCCESS includes a running process. A one-shot worker is
// finished only when its sole instance EXITED and all deployment instances stopped.
const completionQuery=`query KingdomReleaseWorkerCompletion($id: String!) {
 deployment(id: $id) { id projectId environmentId serviceId status deploymentStopped instances { id status } }
}`;
export async function waitForWorkerCompletion(deploymentId,expected,{token,deadline=Date.now()+1200000,signal,onStatus=()=>{},fetcher=globalThis.fetch}={}){
 const seen=new Set(),status=code=>{if(!seen.has(code)){seen.add(code);onStatus(code);}};
 const fail=code=>{status(code);throw new Error('Exact private worker completion could not be verified. Production promotion stopped.');};
 try{
  assert.match(deploymentId,uuid);assert.equal(deploymentId.length,36);
  for(const key of ['projectId','environmentId','serviceId']){assert.match(expected[key],uuid);assert.equal(expected[key].length,36);}
  assert.ok(typeof token==='string'&&token.trim()&&!/[\r\n]/.test(token));
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');assert.ok(Number.isFinite(deadline));
 }catch{fail('CONFIGURATION_REJECTED');}
 const end=Math.min(deadline,Date.now()+1200000);
 const check=()=>{if(signal?.aborted)fail('ABORTED');if(Date.now()>=end)fail('DEADLINE');};
 let instanceId;
 for(;;){
  check();let metadata;
  try{
   const attempt=AbortSignal.timeout(Math.max(1,Math.min(15000,end-Date.now())));
   const response=await fetcher('https://backboard.railway.com/graphql/v2',{
    method:'POST',redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,attempt]):attempt,
    headers:{'content-type':'application/json','project-access-token':token},
    body:JSON.stringify({query:completionQuery,variables:{id:deploymentId}})
   });
   if(response.ok!==true){await response.body?.cancel();throw new Error('Private worker metadata request failed.');}
   metadata=await response.json();
   assert.ok(metadata.errors===undefined||(Array.isArray(metadata.errors)&&metadata.errors.length===0));
  }catch{check();fail('API_REJECTED');}
  check();const deployment=metadata?.data?.deployment;
  if(deployment?.id!==deploymentId||['projectId','environmentId','serviceId'].some(key=>deployment[key]!==expected[key]))fail('IDENTITY_REJECTED');
  if(['FAILED','CRASHED','REMOVED','REMOVING','SKIPPED'].includes(deployment.status))fail('TERMINATED');
  if(!['WAITING','QUEUED','INITIALIZING','BUILDING','DEPLOYING','SUCCESS'].includes(deployment.status)||
   typeof deployment.deploymentStopped!=='boolean'||!Array.isArray(deployment.instances)||deployment.instances.length>1)fail('STATE_REJECTED');
  const instance=deployment.instances[0];
  if(deployment.instances.length===1){
   if(!instance||typeof instance.id!=='string'||!instance.id||instance.id.length>200||!['CREATED','INITIALIZING','RUNNING','EXITED'].includes(instance.status))fail('STATE_REJECTED');
   if(instanceId!==undefined&&instance.id!==instanceId)fail('IDENTITY_REJECTED');
   instanceId=instance.id;
  }else if(instanceId!==undefined||deployment.status==='SUCCESS')fail('STATE_REJECTED');
  if(deployment.status==='SUCCESS'&&deployment.deploymentStopped===true&&instance?.status==='EXITED'){
   status('COMPLETED');return deploymentId;
  }
  status('WAITING');check();
  try{await timers.setTimeout(Math.min(5000,end-Date.now()),undefined,{signal});}
  catch{check();fail('API_REJECTED');}
 }
}
