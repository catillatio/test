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

const base=new URL('../../',import.meta.url).pathname;
const failureCategories=new WeakMap();
const categories=new Set(['WORKER_VARIABLE_STAGING','WORKER_UPLOAD','DEPLOYMENT_IDENTITY','BACKUP_RESTORE_VERIFICATION']);
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
 const store=recoveryStore(),out=process.env.GITHUB_WORKSPACE+'/.release-artifacts';
 await mkdir(out,{recursive:true,mode:0o700});
 const railwayArgs=['--project',settings.projectId,'--environment',settings.environmentId];
 const deploy=async(service,root=process.env.GITHUB_WORKSPACE)=>{
  const upload=()=>command('railway',['up',root,...railwayArgs,'--service',service,'--detach','--json',...(service===settings.workerServiceId?['--path-as-root']:[]),'--message','Kingdom Come '+settings.sha],{cwd:root});
  const queued=service===settings.workerServiceId?await during('WORKER_UPLOAD',upload):await upload();
  return during('DEPLOYMENT_IDENTITY',()=>verifyQueuedDeployment(queued,{projectId:settings.projectId,environmentId:settings.environmentId,serviceId:service},{token:process.env.RAILWAY_TOKEN}));
 };
 const stage=async(service,values)=>{
  const apply=()=>command('railway',['variable','set',...railwayArgs,'--service',service,'--skip-deploys',...Object.entries(values).map(([key,value])=>key+'='+value)]);
  if(service===settings.workerServiceId)await during('WORKER_VARIABLE_STAGING',apply);
  else await apply();
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
    ...['worker','transfer','candidate','protocol','proof'].map(name=>'deployment/release/'+name+'.mjs')]){
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
  assert.equal(process.env.KINGDOM_BACKUP_KEY_VERIFIED,'true','Verify owner-key decryption during a rehearsal before promotion.');
  assert.match(process.env.KINGDOM_RECOVERY_ARTIFACT_ID??'',/^[1-9][0-9]{0,24}$/);
  const downloaded=process.env.RUNNER_TEMP+'/verified-backup';
  const {request,report,backupKey}=await during('BACKUP_RESTORE_VERIFICATION',async()=>{
   const saved=JSON.parse(await readFile(downloaded+'/backup-manifest.json','utf8'));
   const {request,report,backupKey}=saved;
   assert.equal(request.sha,settings.sha);assert.equal(request.projectId,settings.projectId);assert.equal(request.environmentId,settings.environmentId);
   assert.equal(request.gameServiceId,settings.gameServiceId);assert.equal(request.workerServiceId,settings.workerServiceId);
   assert.equal(request.sourceHost,settings.sourceHost);assert.equal(request.sourceDatabase,settings.sourceDatabase);assert.equal(request.restoreHost,settings.restoreHost);
   assert.equal(request.candidateDigest,await candidateDigest());assert.equal(request.backupRecipient,process.env.KINGDOM_BACKUP_RECIPIENT);
   assert.equal(backupKey,'kingdom-releases/'+settings.sha+'/'+request.jobId+'/realm.dump.age');checkJobReport(report,request);
   assert.deepEqual(await fileDigest(downloaded+'/realm.dump.age'),{sha256:report.backup.encryptedSha256,bytes:report.backup.encryptedBytes},'The retained Actions artifact differs from the verified recovery object.');
   return saved;
  });
  const proof=signProof({protocol:'kingdom-release-proof-v2',repository:'catillatio/test',branch:'release/production',approvalEnvironment:'production',
   ...Object.fromEntries(['jobId','sha','candidateDigest','projectId','environmentId','gameServiceId','sourceHost','sourceDatabase','restoreHost','copy','origin'].map(key=>[key,request[key]])),
   backupSha256:report.backup.sha256,backupBytes:report.backup.bytes,encryptedSha256:report.backup.encryptedSha256,preservationSha256:report.restoredCopy.sha256,
   artifactId:process.env.KINGDOM_RECOVERY_ARTIFACT_ID,independentRecoveryVerified:true,backupKeyVerified:true,
   issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()},privateKey);
  await stage(settings.gameServiceId,{KINGDOM_AUTOMATED_RELEASES:'1',KINGDOM_RELEASE_SHA:settings.sha,KINGDOM_RESTORE_TEST_DATABASE:request.copy,KINGDOM_RELEASE_BACKUP_PROOF:proof});
  const deploymentId=await deploy(settings.gameServiceId);let healthy=false;
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
  const post=await requestJob('verify');
  await during('BACKUP_RESTORE_VERIFICATION',()=>{assert.ok(post.report.accounts>=report.accounts);assert.equal(post.report.sourceClusterDigest,report.sourceClusterDigest);});
  const login=await fetch(settings.origin+'/login',{redirect:'error',signal:AbortSignal.timeout(8000)});
  assert.equal(login.status,200);assert.ok((await login.text()).includes('Enter the realm'));
  await writeFile(out+'/post-deploy.json',JSON.stringify({passed:true,sha:settings.sha,deploymentId,health:'ready',privateStatus:post.report,anonymousLogin:200},null,2));
  console.log('Exact-release health, signed pre-deploy guard, saved realm and login verified. No provisioning ran.');
 }finally{store.close();}
}
main().catch(error=>{
 console.error((failureCategories.get(error)??'RELEASE_SAFETY')+': FAIL');
 console.error('Release safety check failed. Production promotion stopped; provider output and credentials are not logged.');
 process.exitCode=1;
});
