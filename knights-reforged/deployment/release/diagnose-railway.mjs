import {pathToFileURL} from 'node:url';
import {uuid} from './protocol.mjs';

export const railwayDiagnosticLabels=Object.freeze([
 'RAILWAY_TARGET_CONFIG','RAILWAY_TOKEN_AUTH','RAILWAY_PROJECT_ACCESS',
 'RAILWAY_ENVIRONMENT_ACCESS','RAILWAY_GAME_SERVICE_ACCESS','RAILWAY_WORKER_SERVICE_ACCESS'
]);
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
 const checks=Object.fromEntries(railwayDiagnosticLabels.map(label=>[label,false]));
 const projectId=env.RAILWAY_PROJECT_ID,environmentId=env.RAILWAY_ENVIRONMENT_ID;
 const services=[env.RAILWAY_GAME_SERVICE_ID,env.RAILWAY_RELEASE_WORKER_SERVICE_ID];
 if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/release/production'
  ||env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||![projectId,environmentId,...services].every(id)||services[0]===services[1])return checks;
 checks.RAILWAY_TARGET_CONFIG=true;
 if(typeof env.RAILWAY_TOKEN!=='string'||!env.RAILWAY_TOKEN||/\s/.test(env.RAILWAY_TOKEN)||env.RAILWAY_API_TOKEN)return checks;
 async function read(query,variables={}){
  try{
   const response=await fetcher('https://backboard.railway.com/graphql/v2',{
    method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
    headers:{'content-type':'application/json','project-access-token':env.RAILWAY_TOKEN},
    body:JSON.stringify({query,variables})
   });
   if(!response.ok)return null;
   const result=await response.json();
   if(result.errors!==undefined&&(!Array.isArray(result.errors)||result.errors.length))return null;
   return result.data??null;
  }catch{return null;}
 }
 const token=(await read(queries.token))?.projectToken;
 if(!id(token?.projectId)||!id(token?.environmentId))return checks;
 checks.RAILWAY_TOKEN_AUTH=true;
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
 process.exitCode=railwayDiagnosticLabels.every(label=>checks[label]===true)?0:1;
}
