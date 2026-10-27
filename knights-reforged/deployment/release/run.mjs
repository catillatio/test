// Approved GitHub environment only. Railway control uses documented HTTPS
// deployments. No SSH, remote shell, public PostgreSQL or TOFU is used.
import assert from 'node:assert/strict';
import {randomBytes,createPrivateKey,createPublicKey} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,cp,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {releaseInputs} from './guard.mjs';
import {candidateDigest} from './candidate.mjs';
import {checkRequest,checkJobReport,copyName,protocol} from './protocol.mjs';
import {getFile,getReport,fileDigest} from './transfer.mjs';
import {recoveryStore} from './store.mjs';
import {signProof} from './proof.mjs';
import {verifyQueuedDeployment,waitForWorkerCompletion} from './deployment.mjs';
import {uploadSource} from './upload.mjs';
import {checkImageApproval} from './image-policy.mjs';
import {authenticateImage} from './image.mjs';
import {deployImage,verifyImageDeployment} from './image-deploy.mjs';
import {railwayClient} from './registrar-config.mjs';

const base=new URL('../../',import.meta.url).pathname;
const failureCategories=new WeakMap();
const categories=new Set(['WORKER_VARIABLE_STAGING','WORKER_UPLOAD','DEPLOYMENT_IDENTITY','BACKUP_RESTORE_VERIFICATION',
 'RECOVERY_PROOF_PREPARATION','GAME_VARIABLE_STAGING','GAME_UPLOAD','GAME_DEPLOYMENT_IDENTITY','IMAGE_CANDIDATE_VERIFICATION','GAME_IMAGE_DEPLOYMENT']);
async function during(category,operation){
 if(!categories.has(category))throw new Error('Unknown release operation.');
 try{return await operation();}
 catch(error){
  if(failureCategories.has(error))throw error;
  // Classify only this controller's boundaries. Never retain or inspect the
  // provider's error, message, properties, stack, or causal exception.
  const failure=new Error('Release operation failed.');
  failureCategories.set(failure,category);throw failure;
 }
}
function command(executable,args,{cwd=base}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{cwd,stdio:['ignore','pipe','pipe'],timeout:120000});let output='';
  child.stderr.resume();child.stdout.on('data',chunk=>{output+=chunk;if(output.length>2000000)child.kill();});
  child.once('error',()=>reject(new Error('Authenticated release control failed.')));
  child.once('close',code=>code===0?resolve(output):reject(new Error('Authenticated release control failed; promotion stopped.')));
 });
}
async function main(){
 process.umask(0o077);
 const mode=process.argv[2];assert.ok(['prepare','promote'].includes(mode));
 const settings=releaseInputs(process.env);
 assert.ok(process.env.RAILWAY_TOKEN&&!process.env.RAILWAY_API_TOKEN,'Use the dedicated project/environment token.');
 const privateKey=createPrivateKey(process.env.KINGDOM_RELEASE_SIGNING_KEY);
 assert.equal(privateKey.asymmetricKeyType,'ed25519');
 assert.deepEqual(createPublicKey(privateKey).export({type:'spki',format:'der'}),createPublicKey(process.env.KINGDOM_RELEASE_VERIFY_KEY).export({type:'spki',format:'der'}),'Release signing and verification keys differ.');
 let image,imageTargetDigest;
 if(settings.gameTransport==='oci-image-v1')image=await during('IMAGE_CANDIDATE_VERIFICATION',async()=>{
  const approval=JSON.parse(await readFile(join(process.env.RUNNER_TEMP,'verified-image-candidate.json'),'utf8'));
  checkImageApproval(approval,{sourceSha:settings.sha,candidate:await candidateDigest(),reference:approval.candidate.reference,digest:approval.candidate.manifestDigest,identity:approval.candidate.identity});
  assert.equal(approval.artifactId,process.env.KINGDOM_IMAGE_ARTIFACT_ID);assert.equal(approval.candidate.prepareRunId,process.env.KINGDOM_IMAGE_RUN_ID);assert.equal(approval.candidate.manifestDigest,process.env.KINGDOM_IMAGE_MANIFEST_DIGEST);
  const target=JSON.parse(await readFile(join(process.env.RUNNER_TEMP,'verified-image-target.json'),'utf8'));
  assert.equal(target.sha,settings.sha);assert.equal(target.jobId,settings.id);assert.equal(target.definitionDigest,approval.definitionDigest);
  assert.ok(Number.isFinite(target.checkedAt)&&target.checkedAt<=Date.now()+10000&&target.expiresAt>Date.now()&&target.expiresAt-target.checkedAt<=2700000);
  assert.match(target.runningTargetDigest,/^[a-f0-9]{64}$/);imageTargetDigest=target.runningTargetDigest;
  if(mode==='promote')await authenticateImage(approval,process.env);
  return approval;
 });
 const store=recoveryStore(),out=process.env.GITHUB_WORKSPACE+'/.release-artifacts';
 await mkdir(out,{recursive:true,mode:0o700});
 const railwayArgs=['--project',settings.projectId,'--environment',settings.environmentId];
 const deploy=async(service,root=process.env.GITHUB_WORKSPACE)=>{
  const upload=()=>uploadSource({spawn,root,projectId:settings.projectId,environmentId:settings.environmentId,serviceId:service,sha:settings.sha,worker:service===settings.workerServiceId,
   log:event=>console.log('RELEASE_UPLOAD: '+JSON.stringify(event))});
  const queued=await during(service===settings.workerServiceId?'WORKER_UPLOAD':'GAME_UPLOAD',upload);
  return during(service===settings.workerServiceId?'DEPLOYMENT_IDENTITY':'GAME_DEPLOYMENT_IDENTITY',()=>verifyQueuedDeployment(queued,{projectId:settings.projectId,environmentId:settings.environmentId,serviceId:service},{token:process.env.RAILWAY_TOKEN}));
 };
 const stage=async(service,values)=>{
  const apply=()=>command('railway',['variable','set',...railwayArgs,'--service',service,'--skip-deploys',...Object.entries(values).map(([key,value])=>key+'='+value)]);
  await during(service===settings.workerServiceId?'WORKER_VARIABLE_STAGING':'GAME_VARIABLE_STAGING',apply);
 };
 async function requestJob(jobMode){
  const jobId=settings.id+'_'+randomBytes(16).toString('hex'),prefix='kingdom-releases/'+settings.sha+'/'+jobId+'/';
  const reportKey=prefix+jobMode+'.json',backupKey=prefix+'realm.dump.age';
  const reportPut=await store.grant(reportKey,'PUT'),reportGet=await store.grant(reportKey,'GET');
  const request=checkRequest({protocol,mode:jobMode,jobId,sha:settings.sha,candidateDigest:await candidateDigest(),
   createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString(),
   projectId:settings.projectId,environmentId:settings.environmentId,gameServiceId:settings.gameServiceId,workerServiceId:settings.workerServiceId,
   sourceHost:settings.sourceHost,sourceDatabase:settings.sourceDatabase,restoreHost:settings.restoreHost,
   origin:settings.origin,backupOrigin:new URL(reportPut).origin,backupRecipient:process.env.KINGDOM_BACKUP_RECIPIENT,
   copy:copyName(jobId),urls:{reportPut,...(jobMode==='prepare'?{backupPut:await store.grant(backupKey,'PUT'),backupGet:await store.grant(backupKey,'GET')}:{})}});
  // Runtime-only grants are never put into image layers or recovery artifacts.
  await stage(settings.workerServiceId,{KINGDOM_RELEASE_WORKER:'1',KINGDOM_RELEASE_JOB_REQUEST:Buffer.from(JSON.stringify(request)).toString('base64url')});
  // A whitelisted, standalone source bundle cannot inherit the game's start,
  // migration, healthcheck or legacy config file. No local dependencies/secrets.
  const bundle=await mkdtemp(join(process.env.RUNNER_TEMP,'kingdom-worker-'));
  let deploymentId;
  try{
   for(const path of ['package.json','package-lock.json','tsconfig.json','src','public','views','migrations','rulesets',
    'deployment/start.mjs','deployment/migrate.mjs','deployment/check-upgrade.mjs','deployment/environment.mjs',
    ...['worker','transfer','candidate','protocol','proof','image-policy'].map(name=>'deployment/release/'+name+'.mjs'),
    ...['observation.mjs','observations.sql','register-verified.mjs','inspect-registrar.mjs'].map(name=>'deployment/release/retention/'+name)]){
    await mkdir(dirname(join(bundle,path)),{recursive:true});await cp(join(base,path),join(bundle,path),{recursive:true,errorOnExist:true,force:false});
   }
   await cp(join(base,'deployment/release/Dockerfile'),join(bundle,'Dockerfile'),{errorOnExist:true,force:false});
   deploymentId=await deploy(settings.workerServiceId,bundle);
  }finally{await rm(bundle,{recursive:true,force:true});}
  console.log('Private verification job queued through the authenticated Railway deployment API.');
  // One shared budget: waiting must not extend the report window or job expiry.
  const deadline=Math.min(Date.now()+1200000,Date.parse(request.expiresAt));
  await during('BACKUP_RESTORE_VERIFICATION',()=>waitForWorkerCompletion(deploymentId,{projectId:settings.projectId,environmentId:settings.environmentId,serviceId:settings.workerServiceId},
   {token:process.env.RAILWAY_TOKEN,deadline,onStatus:code=>console.log('PRIVATE_WORKER_COMPLETION: '+code)}));
  const report=await during('BACKUP_RESTORE_VERIFICATION',async()=>checkJobReport(await getReport(reportGet,{wait:true,deadline,onStatus:code=>console.log('PRIVATE_REPORT_READ: '+code)}),request));
  await during('DEPLOYMENT_IDENTITY',()=>assert.equal(report.workerDeploymentId,deploymentId,'Evidence came from a different worker deployment.'));
  return {request,report,backupKey};
 }
 try{
  if(mode==='prepare'){
   const {request,report,backupKey}=await requestJob('prepare');
   await during('BACKUP_RESTORE_VERIFICATION',async()=>{
    await getFile(await store.grant(backupKey,'GET'),out+'/realm.dump.age',{sha256:report.backup.encryptedSha256,bytes:report.backup.encryptedBytes});
    const {urls,...publicRequest}=request;
    await writeFile(out+'/backup-manifest.json',JSON.stringify({request:publicRequest,report,backupKey},null,2));
   });
   console.log('Encrypted recovery independently exported and verified; isolated restored-copy migration/replay passed.');
   return;
  }
  const {request,report,proof}=await during('RECOVERY_PROOF_PREPARATION',async()=>{
   assert.equal(process.env.KINGDOM_BACKUP_KEY_VERIFIED,'true','Verify owner-key decryption during a rehearsal before promotion.');
   assert.match(process.env.KINGDOM_RECOVERY_ARTIFACT_ID??'',/^[1-9][0-9]{0,24}$/);
   const downloaded=process.env.RUNNER_TEMP+'/verified-backup';
   const saved=JSON.parse(await readFile(downloaded+'/backup-manifest.json','utf8'));
   const {request,report,backupKey}=saved;
   assert.equal(request.sha,settings.sha);assert.equal(request.projectId,settings.projectId);assert.equal(request.environmentId,settings.environmentId);
   assert.equal(request.gameServiceId,settings.gameServiceId);assert.equal(request.workerServiceId,settings.workerServiceId);
   assert.equal(request.sourceHost,settings.sourceHost);assert.equal(request.sourceDatabase,settings.sourceDatabase);assert.equal(request.restoreHost,settings.restoreHost);
   assert.equal(request.candidateDigest,await candidateDigest());assert.equal(request.backupRecipient,process.env.KINGDOM_BACKUP_RECIPIENT);
   assert.equal(backupKey,'kingdom-releases/'+settings.sha+'/'+request.jobId+'/realm.dump.age');checkJobReport(report,request);
   assert.deepEqual(await fileDigest(downloaded+'/realm.dump.age'),{sha256:report.backup.encryptedSha256,bytes:report.backup.encryptedBytes},'The retained Actions artifact differs from the verified recovery object.');
   const proof=signProof({protocol:image?'kingdom-release-proof-v3':'kingdom-release-proof-v2',...(image?{image}:{}),repository:'catillatio/test',branch:'release/production',approvalEnvironment:'production',
    ...Object.fromEntries(['jobId','sha','candidateDigest','projectId','environmentId','gameServiceId','sourceHost','sourceDatabase','restoreHost','copy','origin'].map(key=>[key,request[key]])),
    backupSha256:report.backup.sha256,backupBytes:report.backup.bytes,encryptedSha256:report.backup.encryptedSha256,preservationSha256:report.restoredCopy.sha256,
    artifactId:process.env.KINGDOM_RECOVERY_ARTIFACT_ID,independentRecoveryVerified:true,backupKeyVerified:true,
    issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()},privateKey);
   return {request,report,proof};
  });
  const values={KINGDOM_AUTOMATED_RELEASES:'1',KINGDOM_RELEASE_SHA:settings.sha,KINGDOM_RESTORE_TEST_DATABASE:request.copy,KINGDOM_RELEASE_BACKUP_PROOF:proof};
  let deploymentId;
  if(image){
   Object.assign(values,{KINGDOM_RELEASE_ARTIFACT_KIND:'oci-image-v1',KINGDOM_RELEASE_IMAGE_REFERENCE:image.candidate.reference,KINGDOM_RELEASE_IMAGE_DIGEST:image.candidate.manifestDigest});
   deploymentId=await during('GAME_IMAGE_DEPLOYMENT',()=>deployImage({...settings,imageTargetDigest},image,values,{token:process.env.RAILWAY_TOKEN,log:code=>console.log('IMAGE_RELEASE: '+code)}));
  }else{
   await stage(settings.gameServiceId,values);deploymentId=await deploy(settings.gameServiceId);
  }
  let healthy=false;
  for(let attempt=0;attempt<120;attempt++){
   const recent=JSON.parse(await command('railway',['deployment','list',...railwayArgs,'--service',settings.gameServiceId,'--json','--limit','10']));
   const deployment=recent.find(item=>item.id===deploymentId);
   assert.ok(Array.isArray(recent),'Deployment evidence is unavailable.');
   if(deployment)assert.ok(!['FAILED','CRASHED','REMOVED','REMOVING','SKIPPED'].includes(deployment.status),'Exact production deployment failed; stop without database rollback.');
   try{
    const response=await fetch(settings.origin+'/healthz',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
    const health=await response.json();if(response.ok&&health.status==='ready'&&health.release==='phase4.7'&&health.commit===settings.sha&&deployment?.status==='SUCCESS'){healthy=true;break;}
   }catch{}
   await new Promise(resolve=>setTimeout(resolve,5000));
  }
  assert.ok(healthy,'Exact-release health verification failed. Use the documented code rollback.');
  if(image)await during('GAME_DEPLOYMENT_IDENTITY',async()=>{
   const d=await verifyImageDeployment(deploymentId,{projectId:settings.projectId,environmentId:settings.environmentId,serviceId:settings.gameServiceId},image.candidate.reference,{api:railwayClient(process.env.RAILWAY_TOKEN)});
   assert.equal(d.status,'SUCCESS');
  });
  const post=await requestJob('verify');
  await during('BACKUP_RESTORE_VERIFICATION',()=>{assert.ok(post.report.accounts>=report.accounts);assert.equal(post.report.sourceClusterDigest,report.sourceClusterDigest);});
  const login=await fetch(settings.origin+'/login',{redirect:'error',signal:AbortSignal.timeout(8000)});
  assert.equal(login.status,200);assert.ok((await login.text()).includes('Enter the realm'));
  await writeFile(out+'/post-deploy.json',JSON.stringify({passed:true,sha:settings.sha,deploymentId,health:'ready',privateStatus:post.report,anonymousLogin:200,
   ...(image?{artifactKind:'oci-image-v1',imageReference:image.candidate.reference,imageManifestDigest:image.candidate.manifestDigest,imageConfigDigest:image.candidate.configDigest,imageCandidateArtifactId:image.artifactId,imageCandidateArtifactDigest:image.artifactDigest}:{})},null,2));
  console.log('Exact-release health, signed pre-deploy guard, saved realm and login verified. No provisioning ran.');
 }finally{store.close();}
}
main().catch(error=>{
 console.error((failureCategories.get(error)??'RELEASE_SAFETY')+': FAIL');
 console.error('Release safety check failed. Production promotion stopped; provider output and credentials are not logged.');
 process.exitCode=1;
});
