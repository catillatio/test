// Protected owner job only. No imports from release/ and no DB URL on GitHub.
import assert from 'node:assert/strict';
import {randomUUID,createHash,createPrivateKey,createPublicKey} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,cp,readdir,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {protocol,uuid,hash,checkContext,checkRequest,checkReview,checkReport,confirmation,signedRequest,canonical,digest,framePrefix} from './protocol.mjs';
import {verifyToken,verifyDeployment,deploymentMessages,railwayRead} from './railway.mjs';
import {preflight} from './preflight.mjs';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
function command(executable,args,{cwd=base}={}){return new Promise((resolve,reject)=>{
 const p=spawn(executable,args,{cwd,env:process.env,stdio:['ignore','pipe','pipe']}),parts=[];let size=0;
 p.stdout.on('data',b=>{size+=b.length;if(size>100000){p.kill();reject(new Error());}else parts.push(b);});p.stderr.resume();p.on('error',()=>reject(new Error()));p.on('close',c=>c===0?resolve(Buffer.concat(parts).toString()):reject(new Error()));
});}
export function settings(env){
 assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.KINGDOM_OPERATOR_ENABLED,'true');assert.equal(env.KINGDOM_OPERATOR_OWNER,'catillatio');
 const c=checkContext({projectId:env.RAILWAY_PROJECT_ID,environmentId:env.RAILWAY_ENVIRONMENT_ID,gameServiceId:env.RAILWAY_GAME_SERVICE_ID,pgServiceId:env.RAILWAY_PG_SERVICE_ID,releaseServiceId:env.RAILWAY_RELEASE_WORKER_SERVICE_ID,verifyPgServiceId:env.RAILWAY_VERIFY_PG_SERVICE_ID,operatorServiceId:env.RAILWAY_OPERATOR_SERVICE_ID,sourceHost:env.KINGDOM_DATABASE_HOST,sourceDatabase:env.KINGDOM_DATABASE_NAME});
 assert.ok(env.RAILWAY_TOKEN&&!env.RAILWAY_API_TOKEN);assert.match(env.KINGDOM_BACKUP_RECIPIENT,/^age1[a-z0-9]{58}$/);
 const privateKey=createPrivateKey(env.KINGDOM_OPERATOR_SIGNING_KEY),publicKey=createPublicKey(env.KINGDOM_OPERATOR_VERIFY_KEY);assert.equal(privateKey.asymmetricKeyType,'ed25519');assert.equal(publicKey.asymmetricKeyType,'ed25519');assert.deepEqual(createPublicKey(privateKey).export({type:'spki',format:'der'}),publicKey.export({type:'spki',format:'der'}));
 assert.notDeepEqual(publicKey.export({type:'spki',format:'der'}),createPublicKey(env.KINGDOM_EXISTING_RELEASE_VERIFY_KEY).export({type:'spki',format:'der'}),'Use a distinct operator signing key.');
 return c;
}
async function github(path,token,{fetcher=globalThis.fetch}={}){const response=await fetcher('https://api.github.com/repos/catillatio/test'+path,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json'}});assert.equal(response.ok,true);return response.json();}
export async function reviewedArtifact(env,context,{fetcher=globalThis.fetch,download}={}){
 assert.match(env.OPERATOR_REVIEW_RUN_ID??'',/^[0-9]{1,20}$/);assert.match(env.OPERATOR_REVIEW_ARTIFACT_ID??'',/^[0-9]{1,20}$/);assert.match(env.OPERATOR_REVIEW_DIGEST??'',hash);
 const options={fetcher},run=await github('/actions/runs/'+env.OPERATOR_REVIEW_RUN_ID,env.GH_TOKEN,options),artifact=await github('/actions/artifacts/'+env.OPERATOR_REVIEW_ARTIFACT_ID,env.GH_TOKEN,options);
 assert.equal(run.path,'.github/workflows/owner-operator.yml');assert.equal(run.event,'workflow_dispatch');assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');assert.equal(run.head_sha,env.GITHUB_SHA);assert.equal(run.head_branch,'release/production');assert.equal(run.head_repository?.full_name,'catillatio/test');assert.equal(run.actor?.login,'catillatio');assert.equal(run.triggering_actor?.login,'catillatio');
 assert.equal(artifact.expired,false);assert.equal(String(artifact.workflow_run?.id),String(run.id));assert.equal(artifact.workflow_run?.head_sha,run.head_sha);assert.equal(artifact.name,'owner-operator-'+run.id+'-'+run.run_attempt);assert.ok(artifact.size_in_bytes>0&&artifact.size_in_bytes<=64000);
 const report=await download(artifact.id);assert.equal(report.mode,'review');assert.equal(report.protocol,protocol);assert.equal(report.kind,'report');assert.equal(report.passed,true);assert.equal(report.eligible,true);assert.equal(report.sourceSha,env.GITHUB_SHA);assert.equal(canonical(report.context),canonical(context));assert.equal(report.reviewSha256,env.OPERATOR_REVIEW_DIGEST);assert.equal(digest(report.review),report.reviewSha256);
 assert.match(report.jobId,new RegExp('^op_'+run.id+'_'+run.run_attempt+'_[a-f0-9]{32}$'));
 checkReview(report.review,{context,sourceSha:env.GITHUB_SHA,action:env.OPERATOR_ACTION,allowExpired:env.OPERATOR_MODE==='verify'});if(env.OPERATOR_MODE==='apply')assert.equal(env.OPERATOR_CONFIRMATION,confirmation(report.review));return report.review;
}
async function downloadReview(id,env,temp){
 // GitHub authenticates the archive location. Never forward GH_TOKEN to it.
 const initial=await fetch('https://api.github.com/repos/catillatio/test/actions/artifacts/'+id+'/zip',{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.GH_TOKEN,accept:'application/vnd.github+json'}});
 assert.equal(initial.status,302);const location=new URL(initial.headers.get('location'));assert.equal(location.protocol,'https:');assert.ok(!location.username&&!location.password&&['.blob.core.windows.net','.githubusercontent.com'].some(s=>location.hostname.endsWith(s)));
 const response=await fetch(location,{redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(response.ok,true);
 const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;assert.ok(length<=64000);chunks.push(chunk);}
 const file=join(temp,'review.zip');await writeFile(file,Buffer.concat(chunks),{mode:0o600,flag:'wx'});
 return JSON.parse(await command('python3',[join(base,'deployment/operator/read-artifact.py'),file]));
}
export async function bundle(folder,sourceSha){
 const destination=join(folder,'bundle');await mkdir(destination);
 for(const name of ['package.json','package-lock.json','tsconfig.json','src','rulesets'])await cp(join(base,name),join(destination,name),{recursive:true});
 await mkdir(join(destination,'deployment'),{recursive:true});await cp(join(base,'deployment/operator'),join(destination,'deployment/operator'),{recursive:true});await cp(join(base,'deployment/operator/Dockerfile'),join(destination,'Dockerfile'));
 const files=[];async function walk(dir,prefix=''){for(const e of(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=prefix+e.name;if(e.isDirectory())await walk(join(dir,e.name),path+'/');else{assert.equal(e.isFile(),true);files.push({path,sha256:createHash('sha256').update(await readFile(join(dir,e.name))).digest('hex')});}}}
 await walk(destination);const manifest={sourceSha,files};await writeFile(join(destination,'operator-build.json'),JSON.stringify(manifest));return {destination,digest:digest(manifest)};
}
export async function collectReport(request,id,token,{getMessages=deploymentMessages,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=90}={}){
 for(let n=0;n<attempts;n++){
  const messages=await getMessages(id,token);
  if(messages.some(m=>/^OWNER_OPERATOR_[A-Z_]+: FAIL$/.test(m)))throw new Error();
  const frames=messages.filter(m=>m.startsWith(framePrefix));assert.ok(frames.length<=1);
  if(frames.length){assert.ok(frames[0].length<20000);const report=JSON.parse(Buffer.from(frames[0].slice(framePrefix.length),'base64url').toString());return checkReport(report,request,id);}
  await wait(5000);
 }
 throw new Error();
}
let gate='PREFLIGHT';
async function main(){
 const env={...process.env};const input={'review-name':['review','name_correction'],'review-gray':['review','gray_broadcast_hide'],'apply-name':['apply','name_correction'],'apply-gray':['apply','gray_broadcast_hide'],'verify-name':['verify','name_correction'],'verify-gray':['verify','gray_broadcast_hide'],'setup-audit':['setup','audit_setup']}[env.OPERATOR_INPUT];assert.ok(input);[env.OPERATOR_MODE,env.OPERATOR_ACTION]=input;await preflight(env);const context=settings(env);
 assert.ok(['review','apply','verify','setup'].includes(env.OPERATOR_MODE));assert.ok(['name_correction','gray_broadcast_hide','audit_setup'].includes(env.OPERATOR_ACTION));
 const temp=await mkdtemp(join(env.RUNNER_TEMP,'kingdom-owner-'));try{
  let reviewed=null;if(['apply','verify'].includes(env.OPERATOR_MODE)){gate='REVIEW_ATTESTATION';reviewed=await reviewedArtifact(env,context,{download:id=>downloadReview(id,env,temp)});}
  gate='RAILWAY_AUTHORIZATION';await verifyToken(context,env.RAILWAY_TOKEN);
  // Existing operator service only; never create/retarget a service or modify
  // game, database or verifier settings. CLI output stays captured, not logged.
  const service=await railwayRead('query KingdomOperatorService($id: String!, $env: String!) { service(id: $id) { id projectId } serviceInstance(serviceId: $id, environmentId: $env) { serviceId environmentId } }',{id:context.operatorServiceId,env:context.environmentId},env.RAILWAY_TOKEN);
  assert.equal(service?.service?.projectId,context.projectId);assert.equal(service?.service?.id,context.operatorServiceId);assert.equal(service?.serviceInstance?.environmentId,context.environmentId);assert.equal(service?.serviceInstance?.serviceId,context.operatorServiceId);
  gate='CODE_BUNDLE';const built=await bundle(temp,env.GITHUB_SHA),now=new Date();
  const request=checkRequest({protocol,kind:'request',mode:env.OPERATOR_MODE,action:env.OPERATOR_ACTION,jobId:'op_'+env.GITHUB_RUN_ID+'_'+env.GITHUB_RUN_ATTEMPT+'_'+randomUUID().replaceAll('-',''),authorizationId:reviewed?.authorization.id??randomUUID(),sourceSha:env.GITHUB_SHA,bundleDigest:built.digest,context,owner:'catillatio',createdAt:now.toISOString(),expiresAt:new Date(+now+900000).toISOString(),recipient:env.KINGDOM_BACKUP_RECIPIENT,field:reviewed?.field??(env.OPERATOR_ACTION==='gray_broadcast_hide'?'message_status':env.OPERATOR_FIELD),messageId:reviewed?.messageId??(env.OPERATOR_MESSAGE_ID||null),review:reviewed,confirmation:['apply','setup'].includes(env.OPERATOR_MODE)?env.OPERATOR_CONFIRMATION:null});
  const args=['--project',context.projectId,'--environment',context.environmentId,'--service',context.operatorServiceId];
  gate='OPERATOR_REQUEST_STAGING';await command('railway',['variable','set',...args,'--skip-deploys','KINGDOM_OPERATOR_REQUEST='+signedRequest(request,env.KINGDOM_OPERATOR_SIGNING_KEY)]);
  gate='OPERATOR_UPLOAD';const queued=JSON.parse(await command('railway',['up',built.destination,...args,'--path-as-root','--detach','--json','--message','Owner operator '+request.jobId],{cwd:built.destination}));
  gate='DEPLOYMENT_IDENTITY';await verifyDeployment(queued.deploymentId,context,env.RAILWAY_TOKEN);
  gate='PRIVATE_REPORT';const report=await collectReport(request,queued.deploymentId,env.RAILWAY_TOKEN);
  gate='LOCAL_ARTIFACT';const out=join(env.RUNNER_TEMP,'kingdom-owner-operator');await mkdir(out,{recursive:true,mode:0o700});const stem=request.mode==='review'?'review':'result';
  await writeFile(join(out,stem+'.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});await writeFile(join(out,stem+'.age'),Buffer.from(report.encrypted,'base64'),{mode:0o600,flag:'wx'});
  if(env.GITHUB_STEP_SUMMARY)await writeFile(env.GITHUB_STEP_SUMMARY,'Owner operator '+request.mode+' completed.\n\n'+(request.mode==='setup'?'Audit setup authorizes no account or broadcast change.':'Review digest: `'+report.reviewSha256+'`')+'\n\nDownload the encrypted operator artifact. Full target details are not in logs. No release or promotion was requested.\n',{flag:'a'});
  console.log('OWNER_OPERATOR_CONTROLLER: PASS');
 }finally{await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]?.endsWith('/controller.mjs')){
 for(const event of ['uncaughtException','unhandledRejection'])process.on(event,()=>{console.error('OWNER_OPERATOR_CONTROLLER_RUNTIME: FAIL');process.exit(1);});
 main().catch(()=>{console.error('OWNER_OPERATOR_'+gate+': FAIL');process.exitCode=1;});
}
