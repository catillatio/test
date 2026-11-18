// Authenticated HTTPS metadata only. No release imports and no provider text in errors.
import assert from 'node:assert/strict';
import {uuid} from './protocol.mjs';
export async function railwayRead(query,variables,token,{fetcher=globalThis.fetch}={}){
 assert.ok(typeof token==='string'&&token.trim()&&!/\s/.test(token));assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 const response=await fetcher('https://backboard.railway.com/graphql/v2',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{'content-type':'application/json','project-access-token':token},body:JSON.stringify({query,variables})});
 assert.equal(response.ok,true);const body=await response.json();assert.ok(body.errors===undefined||(Array.isArray(body.errors)&&body.errors.length===0));return body.data;
}
export async function verifyToken(context,token,options){
 const d=await railwayRead('query KingdomOperatorToken { projectToken { projectId environmentId } }',{},token,options);
 assert.equal(d?.projectToken?.projectId,context.projectId);assert.equal(d?.projectToken?.environmentId,context.environmentId);
}
export async function verifyDeployment(id,context,token,options,serviceId=context.operatorServiceId){
 assert.match(id,uuid);const d=await railwayRead('query KingdomOperatorDeployment($id: String!) { deployment(id: $id) { id projectId environmentId serviceId } }',{id},token,options);
 assert.equal(d?.deployment?.id,id);assert.equal(d.deployment.projectId,context.projectId);assert.equal(d.deployment.environmentId,context.environmentId);assert.equal(d.deployment.serviceId,serviceId);return id;
}
export async function deploymentMessages(id,token,options){
 assert.match(id,uuid);const d=await railwayRead('query KingdomOperatorLogs($id: String!, $limit: Int) { deploymentLogs(deploymentId: $id, limit: $limit) { message } }',{id,limit:100},token,options);
 assert.ok(Array.isArray(d?.deploymentLogs)&&d.deploymentLogs.length<=100);return d.deploymentLogs.map(l=>l.message).filter(m=>typeof m==='string');
}

// Provider posture is authenticated and checked before staging AND before SQL.
// Missing fields are unsafe; do not infer safe defaults from unavailable data.
export async function verifyService(context,token,{serviceId=context.operatorServiceId,...options}={}){
 assert.ok([context.operatorServiceId,context.bootstrapServiceId].includes(serviceId));
 const d=await railwayRead(`query KingdomOperatorPosture($id:String!,$env:String!){
  service(id:$id){id projectId deletedAt repoTriggers(first:1){edges{node{id}}}}
  serviceInstance(serviceId:$id,environmentId:$env){serviceId environmentId builder dockerfilePath rootDirectory railwayConfigFile buildCommand startCommand preDeployCommand
   restartPolicyType restartPolicyMaxRetries numReplicas cronSchedule healthcheckPath sleepApplication source{repo image} domains{customDomains{id} serviceDomains{id}}}
  tcpProxies(environmentId:$env,serviceId:$id){id}
 }`,{id:serviceId,env:context.environmentId},token,options);
 assert.equal(d?.service?.id,serviceId);assert.equal(d.service.projectId,context.projectId);assert.equal(d.service.deletedAt,null);assert.deepEqual(d.service.repoTriggers?.edges,[]);
 const s=d?.serviceInstance;assert.equal(s?.serviceId,serviceId);assert.equal(s.environmentId,context.environmentId);
 assert.equal(s.builder,'DOCKERFILE');assert.ok(s.dockerfilePath===null||s.dockerfilePath==='Dockerfile');assert.ok(s.rootDirectory===null||s.rootDirectory==='/'||s.rootDirectory==='');
 for(const k of ['railwayConfigFile','buildCommand','startCommand','cronSchedule','healthcheckPath'])assert.equal(s[k],null);
 assert.ok(s.preDeployCommand===null||(Array.isArray(s.preDeployCommand)&&s.preDeployCommand.length===0));
 assert.equal(s.restartPolicyType,'NEVER');assert.equal(s.restartPolicyMaxRetries,0);assert.equal(s.numReplicas,1);assert.equal(s.sleepApplication,false);
 assert.ok(s.source===null||(s.source?.repo===null&&s.source?.image===null));assert.deepEqual(s.domains?.customDomains,[]);assert.deepEqual(s.domains?.serviceDomains,[]);assert.deepEqual(d.tcpProxies,[]);
 return true;
}
