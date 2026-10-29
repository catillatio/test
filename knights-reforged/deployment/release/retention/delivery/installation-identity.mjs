// One fixed, authenticated READ. Never log provider errors, bodies or credentials.
const endpoint='https://backboard.railway.com/graphql/v2';
export const installationIdentityQuery='query RetentionInstallationTokenIdentity { projectToken { projectId environmentId } }';
export class InstallationIdentityError extends Error {
 constructor(code){super('RETENTION_INSTALLATION_FAILURE: '+code);this.code=code;}
}
const fail=code=>{throw new InstallationIdentityError(code);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export async function verifyInstallationToken(token,target,{fetcher=globalThis.fetch,signal}={}){
 if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token))fail('TOKEN_MISSING_OR_INVALID');
 const deadline=AbortSignal.timeout(15000);
 const bounded=signal?AbortSignal.any([signal,deadline]):deadline;
 let response;
 try{
  bounded.throwIfAborted();
  response=await fetcher(endpoint,{method:'POST',redirect:'error',cache:'no-store',signal:bounded,
   headers:{'content-type':'application/json','project-access-token':token},
   body:JSON.stringify({query:installationIdentityQuery})});
 }catch{fail('TOKEN_TRANSPORT');}
 if(response.status===401||response.status===403)fail('TOKEN_AUTHENTICATION');
 if(response.status!==200)fail('TOKEN_HTTP');
 // Stream-bounded body, not a size check after an unlimited allocation.
 let data;
 try{
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{
   for(;;){const {done,value}=await reader.read();if(done)break;
    bytes+=value.byteLength;if(bytes>16384){await reader.cancel();fail('TOKEN_RESPONSE_SHAPE');}chunks.push(value);
   }
  }finally{reader.releaseLock();}
  data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }catch{fail('TOKEN_RESPONSE_SHAPE');}
 if(!object(data)||data.errors!==undefined&&(!Array.isArray(data.errors)||data.errors.length!==0))fail('TOKEN_AUTHORIZATION_OR_QUERY');
 const identity=data.data?.projectToken;
 if(!object(identity)||typeof identity.projectId!=='string'||!(identity.environmentId===null||typeof identity.environmentId==='string'))fail('TOKEN_RESPONSE_SHAPE');
 const project=identity.projectId===target.projectId,environment=identity.environmentId===target.environmentId;
 if(!project&&!environment)fail('TOKEN_PROJECT_AND_ENVIRONMENT_MISMATCH');
 if(!project)fail('TOKEN_PROJECT_MISMATCH');
 if(!environment)fail('TOKEN_ENVIRONMENT_MISMATCH');
 return {project:'MATCH',environment:'MATCH'};
}
