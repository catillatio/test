import {pathToFileURL} from 'node:url';
import {uuid} from './protocol.mjs';

export const railwayDiagnosticLabels=Object.freeze([
 'RAILWAY_TARGET_CONFIG','RAILWAY_TOKEN_AUTH','RAILWAY_PROJECT_ACCESS',
 'RAILWAY_ENVIRONMENT_ACCESS','RAILWAY_GAME_SERVICE_ACCESS','RAILWAY_WORKER_SERVICE_ACCESS'
]);
// Only these literals can leave the authentication boundary. Never emit
// provider messages, exception properties, token bytes or scope values.
export const railwayAuthDetails=Object.freeze([
 'UNVERIFIED','NONE','TOKEN_MISSING','TOKEN_FORMAT_INVALID','CONFLICTING_API_TOKEN',
 'HTTPS_TRANSPORT_FAILURE','HTTP_401','HTTP_403','HTTP_429','HTTP_5XX','HTTP_OTHER',
 'GRAPHQL_RESPONSE_INVALID','GRAPHQL_REJECTED','TOKEN_METADATA_INVALID','TOKEN_SCOPE_MISMATCH'
]);
const httpFailure=status=>status===401?'HTTP_401':status===403?'HTTP_403':status===429?'HTTP_429':
 Number.isInteger(status)&&status>=500&&status<=599?'HTTP_5XX':'HTTP_OTHER';
const id=value=>typeof value==='string'&&value.length===36&&uuid.test(value);
const queries={
 token:'query KingdomRailwayToken { projectToken { projectId environmentId } }',
 project:'query KingdomRailwayProject($id: String!) { project(id: $id) { id } }',
 environment:'query KingdomRailwayEnvironment($id: String!, $projectId: String!) { environment(id: $id, projectId: $projectId) { id projectId } }',
 service:'query KingdomRailwayService($serviceId: String!, $environmentId: String!) { service(id: $serviceId) { id projectId } serviceInstance(serviceId: $serviceId, environmentId: $environmentId) { serviceId environmentId } }'
};

// Only fixed queries at the documented HTTPS API. No CLI, variables, deployment
// metadata/logs, database connection, application startup, or write operation.
export async function railwayAuthorization(env,{fetcher=globalThis.fetch}={}){
 const checks={...Object.fromEntries(railwayDiagnosticLabels.map(label=>[label,false])),authDetail:'UNVERIFIED'};
 const projectId=env.RAILWAY_PROJECT_ID,environmentId=env.RAILWAY_ENVIRONMENT_ID;
 const services=[env.RAILWAY_GAME_SERVICE_ID,env.RAILWAY_RELEASE_WORKER_SERVICE_ID];
 if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/release/production'
  ||env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||![projectId,environmentId,...services].every(id)||services[0]===services[1])return checks;
 checks.RAILWAY_TARGET_CONFIG=true;
 if(env.RAILWAY_TOKEN===undefined||env.RAILWAY_TOKEN===''){checks.authDetail='TOKEN_MISSING';return checks;}
 // Opaque tokens are not trimmed or assumed to be UUIDs. Reject whitespace,
 // control/non-ASCII bytes that cannot safely form the project-token header.
 if(typeof env.RAILWAY_TOKEN!=='string'||/[^\x21-\x7e]/.test(env.RAILWAY_TOKEN)){checks.authDetail='TOKEN_FORMAT_INVALID';return checks;}
 if(env.RAILWAY_API_TOKEN){checks.authDetail='CONFLICTING_API_TOKEN';return checks;}
 async function read(query,variables={},authentication=false){
  let response;
  try{
   response=await fetcher('https://backboard.railway.com/graphql/v2',{
    method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
    headers:{'content-type':'application/json','project-access-token':env.RAILWAY_TOKEN},
    body:JSON.stringify({query,variables})
   });
  }catch{if(authentication)checks.authDetail='HTTPS_TRANSPORT_FAILURE';return null;}
  if(!response.ok){if(authentication)checks.authDetail=httpFailure(response.status);return null;}
  let result;
  try{result=await response.json();}
  catch{if(authentication)checks.authDetail='GRAPHQL_RESPONSE_INVALID';return null;}
  if(!result||typeof result!=='object'||Array.isArray(result)||result.errors!==undefined&&!Array.isArray(result.errors)){
   if(authentication)checks.authDetail='GRAPHQL_RESPONSE_INVALID';return null;
  }
  if(result.errors?.length){if(authentication)checks.authDetail='GRAPHQL_REJECTED';return null;}
  if(authentication)checks.authDetail='TOKEN_METADATA_INVALID';
  return result.data??null;
 }
 const token=(await read(queries.token,{},true))?.projectToken;
 if(!id(token?.projectId)||!id(token?.environmentId))return checks;
 checks.RAILWAY_TOKEN_AUTH=true;
 checks.authDetail=token.projectId===projectId&&token.environmentId===environmentId?'NONE':'TOKEN_SCOPE_MISMATCH';
 // An authenticated token for a different scope must never pass target access.
 if(token.projectId!==projectId)return checks;
 const [project,environment]=await Promise.all([
  read(queries.project,{id:projectId}),
  token.environmentId===environmentId?read(queries.environment,{id:environmentId,projectId}):null
 ]);
 checks.RAILWAY_PROJECT_ACCESS=project?.project?.id===projectId;
 checks.RAILWAY_ENVIRONMENT_ACCESS=environment?.environment?.id===environmentId&&environment?.environment?.projectId===projectId;
 if(!checks.RAILWAY_PROJECT_ACCESS||!checks.RAILWAY_ENVIRONMENT_ACCESS)return checks;
 const results=await Promise.all(services.map(async serviceId=>{
  const data=await read(queries.service,{serviceId,environmentId});
  return data?.service?.id===serviceId&&data?.service?.projectId===projectId
   &&data?.serviceInstance?.serviceId===serviceId&&data?.serviceInstance?.environmentId===environmentId;
 }));
 [checks.RAILWAY_GAME_SERVICE_ACCESS,checks.RAILWAY_WORKER_SERVICE_ACCESS]=results;
 return checks;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let checks={};
 try{checks=await railwayAuthorization(process.env);}catch{}
 for(const label of railwayDiagnosticLabels)console.log(label+': '+(checks[label]===true?'PASS':'FAIL'));
 const detail=railwayAuthDetails.includes(checks.authDetail)?checks.authDetail:'UNVERIFIED';
 console.log('RAILWAY_AUTH_DETAIL: '+detail);
 process.exitCode=railwayDiagnosticLabels.every(label=>checks[label]===true)&&detail==='NONE'?0:1;
}
