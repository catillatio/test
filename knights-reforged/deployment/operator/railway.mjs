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
export async function verifyDeployment(id,context,token,options){
 assert.match(id,uuid);const d=await railwayRead('query KingdomOperatorDeployment($id: String!) { deployment(id: $id) { id projectId environmentId serviceId } }',{id},token,options);
 assert.equal(d?.deployment?.id,id);assert.equal(d.deployment.projectId,context.projectId);assert.equal(d.deployment.environmentId,context.environmentId);assert.equal(d.deployment.serviceId,context.operatorServiceId);return id;
}
export async function deploymentMessages(id,token,options){
 assert.match(id,uuid);const d=await railwayRead('query KingdomOperatorLogs($id: String!, $limit: Int) { deploymentLogs(deploymentId: $id, limit: $limit) { message } }',{id,limit:100},token,options);
 assert.ok(Array.isArray(d?.deploymentLogs)&&d.deploymentLogs.length<=100);return d.deploymentLogs.map(l=>l.message).filter(m=>typeof m==='string');
}
