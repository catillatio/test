import assert from 'node:assert/strict';
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
