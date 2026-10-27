// Offline subprocess fixture. Intercept only the controller's external-operation
// boundaries; its guards, crypto, identity verifier, report checks and catch run.
import {registerHooks,syncBuiltinESMExports} from 'node:module';
import {appendFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {copyName,protocol} from '../../deployment/release/protocol.mjs';
import {getReport as readReport} from '../../deployment/release/transfer.mjs';
import {signProof as signReleaseProof,verifyProof} from '../../deployment/release/proof.mjs';
import {approval as imageApproval} from './release-image.mjs';
import http from 'node:http';import https from 'node:https';
import net from 'node:net';import tls from 'node:tls';
import dns from 'node:dns';import dgram from 'node:dgram';
import child from 'node:child_process';import workers from 'node:worker_threads';

const ids=JSON.parse(process.env.FIXTURE_IDS),mode=process.env.FIXTURE_MODE;
const deploymentId='77777777-7777-4777-8777-777777777777';
const secret='synthetic-private-provider-output https://fixture:fixture@private.invalid/?signature=fixture';
const record=label=>appendFileSync(process.env.FIXTURE_TRACE,label+'\n');
const block=()=>{appendFileSync(process.env.FIXTURE_FORBIDDEN,'blocked\n');throw new Error(secret);};
for(const [module,names]of[[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],
 [tls,['connect']],[dns,['lookup','resolve']],[dns.promises,['lookup','resolve']],[dgram,['createSocket']],
 [child,['spawn','exec','execFile','fork','spawnSync','execSync','execFileSync']],[workers,['Worker']]])for(const name of names)module[name]=block;
syncBuiltinESMExports();

function grant(method='GET'){
 const url=new URL('https://recovery.fixture.invalid/object');
 for(const [key,value]of Object.entries({'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Expires':'3600',
  'X-Amz-Signature':'b'.repeat(64),'X-Amz-SignedHeaders':method==='PUT'?'host;if-none-match':'host'}))url.searchParams.set(key,value);
 return url.href;
}
function reportFor(request){
 const {urls,...publicRequest}=request;
 return {...publicRequest,passed:true,workerDeploymentId:deploymentId,sourceClusterDigest:'1'.repeat(64),restoreClusterDigest:'2'.repeat(64),accounts:452,bots:450,
  ...(request.mode==='verify'?{schemaHead:'026_living_competition.sql',active_bots:450,initialized:true}:{}),
  backup:{sha256:'3'.repeat(64),bytes:200000,encryptedSha256:'4'.repeat(64),encryptedBytes:200500,recipient:request.backupRecipient,conditionalWriteVerified:true,exportRoundTripVerified:true},
  restoredCopy:{passed:true,accounts:452,bots:450,existingTablesVerified:64,migrationReplay:'unchanged',liveDatabaseConnected:false,
   restoredDatabase:request.copy,restoredHost:request.restoreHost,sha256:'5'.repeat(64)}};
}
function saved(){
 const jobId='gh_123_1_'+'c'.repeat(32);
 const request={protocol,mode:'prepare',jobId,sha:process.env.GITHUB_SHA,candidateDigest:'d'.repeat(64),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString(),
  projectId:ids[0],environmentId:ids[1],gameServiceId:ids[2],workerServiceId:ids[4],sourceHost:'game-db.railway.internal',sourceDatabase:'railway',restoreHost:'verify-db.railway.internal',
  origin:'https://realm.fixture.invalid',backupOrigin:'https://recovery.fixture.invalid',backupRecipient:process.env.KINGDOM_BACKUP_RECIPIENT,copy:copyName(jobId)};
 const report=reportFor(request),backupKey='kingdom-releases/'+request.sha+'/'+jobId+'/realm.dump.age';
 if(mode==='retained_wrong_commit')request.sha='f'.repeat(40);
 if(mode==='retained_wrong_candidate')request.candidateDigest='e'.repeat(64);
 if(mode==='retained_failed_restore')report.restoredCopy.passed=false;
 if(mode==='image_backup_failed')report.restoredCopy.passed=false;
 return {request,report,backupKey};
}
let request,workerCompleted=false,completionReads=0,completionStarted;
const fixture={
 store:()=>({grant:async(key,method)=>grant(method),close:()=>record('store_close')}),
 signProof:(...args)=>{
  record('proof');if(mode==='proof_failure')throw new Error(secret);
  if(mode==='proof_spoof'){
   const error=Object.create(null);
   for(const key of ['message','category','stack','cause','name'])Object.defineProperty(error,key,{get:block});
   throw error;
  }
  return signReleaseProof(...args);
 },
 readFile:async path=>{
  if(String(path).endsWith('/verified-image-candidate.json')){record('read_image_candidate');if(mode==='image_candidate_missing')throw Error(secret);return JSON.stringify(imageApproval());}
  if(String(path).endsWith('/verified-image-target.json')){record('read_image_target');if(mode==='image_target_missing')throw Error(secret);return JSON.stringify({sha:process.env.GITHUB_SHA,jobId:'gh_123_1',definitionDigest:imageApproval().definitionDigest,checkedAt:Date.now()-1000,expiresAt:mode==='image_target_stale'?0:Date.now()+2600000,runningTargetDigest:'f'.repeat(64)});}
  record('read_retained');if(mode==='retained_missing')throw new Error(secret);return JSON.stringify(saved());
 },
 writeFile:async(path,text)=>{record('manifest');if(mode==='manifest_failure')throw new Error(secret);
  const value=JSON.parse(text);if(mode.startsWith('image_')&&String(path).endsWith('/post-deploy.json')){if(value.passed!==true||value.deploymentId!=='88888888-8888-4888-8888-888888888888')return block();return;}
  if(value.request.urls||value.report.urls)return block();},
 mkdir:async()=>{},mkdtemp:async()=>{record('bundle');return '/fixture/worker-source';},
 cp:async()=>{if(mode==='bundle_failure')throw new Error(secret);},rm:async()=>record('cleanup'),
 fileDigest:async()=>{record('digest');return {sha256:(mode==='retained_corrupt'?'0':'4').repeat(64),bytes:200500};},
 getReport:async(url,options)=>{
  if(!workerCompleted||!Number.isFinite(options?.deadline)||options.deadline>Date.parse(request.expiresAt)||options.deadline>completionStarted+1200000)return block();
  record('report');if(mode==='report_failure')throw new Error(secret);
  if(mode==='report_readiness'||mode==='report_denied'||mode==='report_bad_status'||mode==='report_timeout_status')return readReport(url,{...options,...(mode==='report_denied'?{deadline:Date.now()+500}:{})});
  const report=reportFor(request);
  if(mode==='restore_failure')report.restoredCopy.passed=false;
  if(mode==='report_identity')report.workerDeploymentId=ids[3];
  return report;
 },
 getFile:async()=>{record('download');if(mode==='download_failure')throw new Error(secret);},
 authenticateImage:async()=>{record('image_authenticate');if(mode==='image_registry_failed')throw Error(secret);},
 deployImage:async(settings,image,values)=>{
  record('image_deploy');if(mode==='image_provider_failure')throw Error(secret);
  const p=verifyProof(values.KINGDOM_RELEASE_BACKUP_PROOF,process.env.KINGDOM_RELEASE_VERIFY_KEY,
   {RAILWAY_PROJECT_ID:ids[0],RAILWAY_ENVIRONMENT_ID:ids[1],RAILWAY_SERVICE_ID:ids[2],APP_ORIGIN:'https://realm.fixture.invalid',DATABASE_URL:'postgres://fixture:fixture@game-db.railway.internal/railway',KINGDOM_RESTORE_DATABASE_URL:'postgres://fixture:fixture@verify-db.railway.internal/railway',KINGDOM_RELEASE_SHA:values.KINGDOM_RELEASE_SHA,KINGDOM_RESTORE_TEST_DATABASE:values.KINGDOM_RESTORE_TEST_DATABASE,KINGDOM_RELEASE_ARTIFACT_KIND:'oci-image-v1',KINGDOM_RELEASE_IMAGE_REFERENCE:values.KINGDOM_RELEASE_IMAGE_REFERENCE,KINGDOM_RELEASE_IMAGE_DIGEST:values.KINGDOM_RELEASE_IMAGE_DIGEST},'d'.repeat(64),{imageIdentity:image.candidate.identity});
  if(p.protocol!=='kingdom-release-proof-v3'||p.image.definitionDigest!==imageApproval().definitionDigest||settings.imageTargetDigest!=='f'.repeat(64))return block();
  return '88888888-8888-4888-8888-888888888888';
 },
 verifyImageDeployment:async()=>{record('image_identity');return {status:'SUCCESS'};},
 spawn:(executable,args)=>{
  if(executable!=='railway')return block();
  const service=args[args.indexOf('--service')+1];let failure=false,output='';
  if(args[0]==='variable'&&args[1]==='set'){
   if(!args.includes('--skip-deploys'))return block();
   if(service===ids[4]){
    record('stage');failure=mode==='stage_failure';
    const encoded=args.find(value=>value.startsWith('KINGDOM_RELEASE_JOB_REQUEST='));if(!encoded)return block();
    request=JSON.parse(Buffer.from(encoded.slice('KINGDOM_RELEASE_JOB_REQUEST='.length),'base64url'));
   }else if(service===ids[2]){
    record('game_stage');failure=mode==='game_stage';
    const value=key=>args.find(arg=>arg.startsWith(key+'='))?.slice(key.length+1);
    const proof=verifyProof(value('KINGDOM_RELEASE_BACKUP_PROOF'),process.env.KINGDOM_RELEASE_VERIFY_KEY,
     {RAILWAY_PROJECT_ID:ids[0],RAILWAY_ENVIRONMENT_ID:ids[1],RAILWAY_SERVICE_ID:ids[2],APP_ORIGIN:'https://realm.fixture.invalid',
      DATABASE_URL:'postgres://fixture:fixture@game-db.railway.internal/railway',KINGDOM_RESTORE_DATABASE_URL:'postgres://fixture:fixture@verify-db.railway.internal/railway',
      KINGDOM_RELEASE_SHA:value('KINGDOM_RELEASE_SHA'),KINGDOM_RESTORE_TEST_DATABASE:value('KINGDOM_RESTORE_TEST_DATABASE')},'d'.repeat(64));
    if(value('KINGDOM_AUTOMATED_RELEASES')!=='1'||proof.artifactId!==process.env.KINGDOM_RECOVERY_ARTIFACT_ID)return block();
   }
   else return block();
  }else if(args[0]==='up'){
   if(!args.includes('--detach')||!args.includes('--json')||!args.includes('--verbose'))return block();
   if(service===ids[4]){record('upload');failure=mode==='upload_failure';}
   else if(service===ids[2]){record('game_upload');failure=mode==='game_upload';}
   else return block();
   output=['invalid_json','game_invalid_json'].includes(mode)?secret:JSON.stringify({...(['missing_id','game_missing_id'].includes(mode)?{}:{deploymentId}),logsUrl:'https://provider.fixture.invalid/?secret=fixture'});
  }else if(mode.startsWith('image_')&&args[0]==='deployment'&&args[1]==='list'&&service===ids[2]){record('game_status');output=JSON.stringify([{id:'88888888-8888-4888-8888-888888888888',status:'SUCCESS'}]);}
  else return block();
  const task=new EventEmitter();task.stdout=new PassThrough();task.stderr=new PassThrough();task.kill=()=>task.emit('close',1);
  queueMicrotask(()=>{task.stdout.end(args[0]==='up'?'railway up\nservice: '+service+'\nenvironment: '+ids[1]+'\nbytes: 1024\n'+(failure?secret:output):failure?secret:output);task.stderr.end(secret);task.emit('close',failure?1:0);});
  return task;
 }
};
globalThis.releaseFixture=fixture;
let reportReads=0;
globalThis.fetch=async(url,options)=>{
 if(mode.startsWith('image_')&&url==='https://realm.fixture.invalid/healthz'){record('game_health');return Response.json({status:'ready',release:'phase4.7',commit:process.env.GITHUB_SHA});}
 if(mode.startsWith('image_')&&url==='https://realm.fixture.invalid/login'){record('game_login');return new Response('Enter the realm');}
 if(url.startsWith('https://recovery.fixture.invalid/object?')&&(mode==='report_readiness'||mode==='report_denied'||mode==='report_bad_status'||mode==='report_timeout_status')){
  if(options.redirect!=='error'||options.cache!=='no-store')return block();
  const status=mode==='report_bad_status'?400:mode==='report_timeout_status'?408:(++reportReads===1||mode==='report_denied'?403:200);
  record('report_get_'+status);
  return status!==200?new Response(secret,{status}):Response.json(reportFor(request));
 }
 if(url!=='https://backboard.railway.com/graphql/v2'||options.method!=='POST'||options.redirect!=='error')return block();
 const body=JSON.parse(options.body);if(body.variables.id!==deploymentId)return block();
 if(/^query KingdomReleaseWorkerCompletion/.test(body.query)){
  if(completionStarted===undefined)completionStarted=Date.now();
  const running=mode==='worker_delayed'&&++completionReads===1;
  record(running?'worker_running':'worker_completion');
  if(mode==='worker_api_failure')throw new Error(secret);
  const status=mode==='worker_failed'?'CRASHED':'SUCCESS';
  workerCompleted=!running&&status==='SUCCESS';
  return {ok:true,json:async()=>({data:{deployment:{id:deploymentId,projectId:ids[0],environmentId:ids[1],serviceId:mode==='worker_wrong_service'?ids[2]:ids[4],status,
   deploymentStopped:!running,instances:[{id:'fixture-worker-instance',status:running?'RUNNING':status==='CRASHED'?'CRASHED':'EXITED'}]}}})};
 }
 if(!/^query KingdomReleaseDeploymentIdentity/.test(body.query))return block();
 record('metadata');if(mode==='metadata_failure'||mode==='game_metadata_failure')throw new Error(secret);
 const serviceId=mode.startsWith('game_')?ids[2]:ids[4];
 return {ok:true,json:async()=>({data:{deployment:{id:deploymentId,projectId:ids[0],environmentId:ids[1],serviceId:mode==='game_identity'?ids[4]:serviceId}}})};
};
const mocks={
 'node:child_process':'export const spawn=(...args)=>globalThis.releaseFixture.spawn(...args);',
 'node:fs/promises':['readFile','writeFile','mkdir','mkdtemp','cp','rm'].map(name=>'export const '+name+'=(...args)=>globalThis.releaseFixture.'+name+'(...args);').join('\n'),
 './store.mjs':'export const recoveryStore=()=>globalThis.releaseFixture.store();',
 './candidate.mjs':"export const candidateDigest=async()=>'d'.repeat(64);",
 './proof.mjs':'export const signProof=(...args)=>globalThis.releaseFixture.signProof(...args);',
 './image.mjs':'export const authenticateImage=(...args)=>globalThis.releaseFixture.authenticateImage(...args);',
 './image-deploy.mjs':'export const deployImage=(...args)=>globalThis.releaseFixture.deployImage(...args);export const verifyImageDeployment=(...args)=>globalThis.releaseFixture.verifyImageDeployment(...args);',
 './transfer.mjs':['getFile','getReport','fileDigest'].map(name=>'export const '+name+'=(...args)=>globalThis.releaseFixture.'+name+'(...args);').join('\n')
};
const sources=new Map(Object.entries(mocks).map(([name,source])=>['release-fixture:'+encodeURIComponent(name),source]));
registerHooks({
 resolve(specifier,context,next){
  if(context.parentURL===process.env.FIXTURE_CONTROLLER_URL&&Object.hasOwn(mocks,specifier))return {url:'release-fixture:'+encodeURIComponent(specifier),shortCircuit:true};
  return next(specifier,context);
 },
 load(url,context,next){if(sources.has(url))return {format:'module',source:sources.get(url),shortCircuit:true};return next(url,context);}
});
