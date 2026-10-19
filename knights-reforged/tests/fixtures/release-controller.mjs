// Offline subprocess fixture. Intercept only the controller's external-operation
// boundaries; its guards, crypto, identity verifier, report checks and catch run.
import {registerHooks,syncBuiltinESMExports} from 'node:module';
import {appendFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {copyName,protocol} from '../../deployment/release/protocol.mjs';
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
  backup:{sha256:'3'.repeat(64),bytes:200000,encryptedSha256:'4'.repeat(64),encryptedBytes:200500,recipient:request.backupRecipient,conditionalWriteVerified:true,exportRoundTripVerified:true},
  restoredCopy:{passed:true,accounts:452,bots:450,existingTablesVerified:64,migrationReplay:'unchanged',liveDatabaseConnected:false,
   restoredDatabase:request.copy,restoredHost:request.restoreHost,sha256:'5'.repeat(64)}};
}
function saved(){
 const jobId='gh_123_1_'+'c'.repeat(32);
 const request={protocol,mode:'prepare',jobId,sha:process.env.GITHUB_SHA,candidateDigest:'d'.repeat(64),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString(),
  projectId:ids[0],environmentId:ids[1],gameServiceId:ids[2],workerServiceId:ids[4],sourceHost:'game-db.railway.internal',sourceDatabase:'railway',restoreHost:'verify-db.railway.internal',
  origin:'https://realm.fixture.invalid',backupOrigin:'https://recovery.fixture.invalid',backupRecipient:process.env.KINGDOM_BACKUP_RECIPIENT,copy:copyName(jobId)};
 return {request,report:reportFor(request),backupKey:'kingdom-releases/'+request.sha+'/'+jobId+'/realm.dump.age'};
}
let request;
const fixture={
 store:()=>({grant:async(key,method)=>grant(method),close:()=>record('store_close')}),
 readFile:async()=>{record('read_retained');if(mode==='retained_missing')throw new Error(secret);return JSON.stringify(saved());},
 writeFile:async(path,text)=>{record('manifest');if(mode==='manifest_failure')throw new Error(secret);
  const value=JSON.parse(text);if(value.request.urls||value.report.urls)return block();},
 mkdir:async()=>{},mkdtemp:async()=>{record('bundle');return '/fixture/worker-source';},
 cp:async()=>{if(mode==='bundle_failure')throw new Error(secret);},rm:async()=>record('cleanup'),
 fileDigest:async()=>{record('digest');return {sha256:(mode==='retained_corrupt'?'0':'4').repeat(64),bytes:200500};},
 getReport:async()=>{
  record('report');if(mode==='report_failure')throw new Error(secret);
  const report=reportFor(request);
  if(mode==='restore_failure')report.restoredCopy.passed=false;
  if(mode==='report_identity')report.workerDeploymentId=ids[3];
  return report;
 },
 getFile:async()=>{record('download');if(mode==='download_failure')throw new Error(secret);},
 spawn:(executable,args)=>{
  if(executable!=='railway')return block();
  const service=args[args.indexOf('--service')+1];let failure=false,output='';
  if(args[0]==='variable'&&args[1]==='set'){
   if(!args.includes('--skip-deploys'))return block();
   if(service===ids[4]){
    record('stage');failure=mode==='stage_failure';
    const encoded=args.find(value=>value.startsWith('KINGDOM_RELEASE_JOB_REQUEST='));if(!encoded)return block();
    request=JSON.parse(Buffer.from(encoded.slice('KINGDOM_RELEASE_JOB_REQUEST='.length),'base64url'));
   }else if(service===ids[2]){record('game_stage');failure=mode==='game_stage';}
   else return block();
  }else if(args[0]==='up'){
   if(!args.includes('--detach')||!args.includes('--json'))return block();
   if(service===ids[4]){record('upload');failure=mode==='upload_failure';}
   else if(service===ids[2]){record('game_upload');failure=mode==='game_upload';}
   else return block();
   output=mode==='invalid_json'?secret:JSON.stringify({...(mode==='missing_id'?{}:{deploymentId}),logsUrl:'https://provider.fixture.invalid/?secret=fixture'});
  }else return block();
  const process=new EventEmitter();process.stdout=new PassThrough();process.stderr=new PassThrough();process.kill=()=>process.emit('close',1);
  queueMicrotask(()=>{process.stdout.end(failure?secret:output);process.stderr.end(secret);process.emit('close',failure?1:0);});
  return process;
 }
};
globalThis.releaseFixture=fixture;
globalThis.fetch=async(url,options)=>{
 if(url!=='https://backboard.railway.com/graphql/v2'||options.method!=='POST'||options.redirect!=='error')return block();
 const body=JSON.parse(options.body);if(body.variables.id!==deploymentId||!/^query KingdomReleaseDeploymentIdentity/.test(body.query))return block();
 record('metadata');if(mode==='metadata_failure')throw new Error(secret);
 const serviceId=mode.startsWith('game_')?ids[2]:ids[4];
 return {ok:true,json:async()=>({data:{deployment:{id:deploymentId,projectId:ids[0],environmentId:ids[1],serviceId:mode==='game_identity'?ids[4]:serviceId}}})};
};
const mocks={
 'node:child_process':'export const spawn=(...args)=>globalThis.releaseFixture.spawn(...args);',
 'node:fs/promises':['readFile','writeFile','mkdir','mkdtemp','cp','rm'].map(name=>'export const '+name+'=(...args)=>globalThis.releaseFixture.'+name+'(...args);').join('\n'),
 './store.mjs':'export const recoveryStore=()=>globalThis.releaseFixture.store();',
 './candidate.mjs':"export const candidateDigest=async()=>'d'.repeat(64);",
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
