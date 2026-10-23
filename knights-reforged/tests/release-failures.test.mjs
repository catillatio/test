import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const ids=Array.from({length:6},(_,i)=>String(i+1).repeat(8)+'-'+String(i+1).repeat(4)+'-4'+String(i+1).repeat(3)+'-8'+String(i+1).repeat(3)+'-'+String(i+1).repeat(12));
const keys=generateKeyPairSync('ed25519');
const folder=mkdtempSync(join(tmpdir(),'release-failures-'));after(()=>rmSync(folder,{recursive:true,force:true}));
const controller=new URL('../deployment/release/run.mjs',import.meta.url),preload=fileURLToPath(new URL('./fixtures/release-controller.mjs',import.meta.url));
const env={PATH:process.env.PATH,GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',
 KINGDOM_RELEASE_ENABLED:'true',KINGDOM_RAILWAY_AUTODEPLOY_DISABLED:'true',KINGDOM_RELEASE_TRANSPORT:'private-job-v2',
 RAILWAY_PROJECT_ID:ids[0],RAILWAY_ENVIRONMENT_ID:ids[1],RAILWAY_GAME_SERVICE_ID:ids[2],RAILWAY_PG_SERVICE_ID:ids[3],RAILWAY_RELEASE_WORKER_SERVICE_ID:ids[4],RAILWAY_VERIFY_PG_SERVICE_ID:ids[5],
 KINGDOM_DATABASE_HOST:'game-db.railway.internal',KINGDOM_DATABASE_NAME:'railway',KINGDOM_RESTORE_DATABASE_HOST:'verify-db.railway.internal',KINGDOM_PRODUCTION_ORIGIN:'https://realm.fixture.invalid',
 RAILWAY_TOKEN:'synthetic-project-token-not-a-credential',KINGDOM_BACKUP_RECIPIENT:'age1'+'a'.repeat(58),
 KINGDOM_RELEASE_SIGNING_KEY:keys.privateKey.export({type:'pkcs8',format:'pem'}),KINGDOM_RELEASE_VERIFY_KEY:keys.publicKey.export({type:'spki',format:'pem'}),
 GITHUB_WORKSPACE:fileURLToPath(new URL('../../',import.meta.url)),RUNNER_TEMP:folder,KINGDOM_BACKUP_KEY_VERIFIED:'true',KINGDOM_RECOVERY_ARTIFACT_ID:'123456'};
const generic='Release safety check failed. Production promotion stopped; provider output and credentials are not logged.\n';
const queued='Private verification job queued through the authenticated Railway deployment API.\n';
const ready=queued+'PRIVATE_WORKER_COMPLETION: COMPLETED\n';
const complete='Encrypted recovery independently exported and verified; isolated restored-copy migration/replay passed.\n';
let number=0;
function run(mode,command='prepare',overrides={}){
 const trace=join(folder,'trace-'+number++),forbidden=trace+'-forbidden';writeFileSync(trace,'');
 const result=spawnSync(process.execPath,['--import',preload,fileURLToPath(controller),command],{
  env:{...env,FIXTURE_MODE:mode,FIXTURE_IDS:JSON.stringify(ids),FIXTURE_CONTROLLER_URL:controller.href,FIXTURE_TRACE:trace,FIXTURE_FORBIDDEN:forbidden,...overrides},
  encoding:'utf8',timeout:15000
 });
 assert.equal(existsSync(forbidden),false,'No unmocked network, subprocess, or additional provider operation is allowed.');
 return {...result,trace:readFileSync(trace,'utf8').trim().split('\n').filter(Boolean)};
}
const uploaded=['stage','bundle','upload'],identified=[...uploaded,'metadata','cleanup'],completed=[...identified,'worker_completion'];
for(const [mode,category,trace,stdout]of[
 ['stage_failure','WORKER_VARIABLE_STAGING',['stage','store_close'],''],
 ['upload_failure','WORKER_UPLOAD',[...uploaded,'cleanup','store_close'],''],
 ['invalid_json','DEPLOYMENT_IDENTITY',[...uploaded,'cleanup','store_close'],''],
 ['missing_id','DEPLOYMENT_IDENTITY',[...uploaded,'cleanup','store_close'],''],
 ['metadata_failure','DEPLOYMENT_IDENTITY',[...identified,'store_close'],''],
 ['report_failure','BACKUP_RESTORE_VERIFICATION',[...completed,'report','store_close'],ready],
 ['restore_failure','BACKUP_RESTORE_VERIFICATION',[...completed,'report','store_close'],ready],
 ['report_identity','DEPLOYMENT_IDENTITY',[...completed,'report','store_close'],ready],
 ['download_failure','BACKUP_RESTORE_VERIFICATION',[...completed,'report','download','store_close'],ready],
 ['manifest_failure','BACKUP_RESTORE_VERIFICATION',[...completed,'report','download','manifest','store_close'],ready],
 ['bundle_failure','RELEASE_SAFETY',['stage','bundle','cleanup','store_close'],'']
])test('controller stops and reports only the fixed failure category: '+mode,()=>{
 const result=run(mode);assert.equal(result.status,1);assert.equal(result.stderr,category+': FAIL\n'+generic);assert.equal(result.stdout,stdout);assert.deepEqual(result.trace,trace);
});

test('successful prepare waits for the exact worker and preserves recovery evidence ordering',()=>{
 const result=run('success');assert.equal(result.status,0);assert.equal(result.stderr,'');assert.equal(result.stdout,ready+complete);
 assert.deepEqual(result.trace,[...completed,'report','download','manifest','store_close']);
});

test('precondition errors cannot spoof a category or leak exception details before any provider operation',()=>{
 for(const changed of [{GITHUB_REF:'refs/heads/main'},{KINGDOM_RELEASE_SIGNING_KEY:'WORKER_UPLOAD: FAIL synthetic-private-key-that-must-not-be-printed'}]){
  const result=run('success','prepare',changed);assert.equal(result.status,1);assert.equal(result.stderr,'RELEASE_SAFETY: FAIL\n'+generic);assert.equal(result.stdout,'');assert.deepEqual(result.trace,[]);
 }
});

for(const [mode,category,trace]of[
 ['retained_missing','BACKUP_RESTORE_VERIFICATION',['read_retained','store_close']],
 ['retained_corrupt','BACKUP_RESTORE_VERIFICATION',['read_retained','digest','store_close']],
 ['game_stage','RELEASE_SAFETY',['read_retained','digest','game_stage','store_close']],
 ['game_upload','RELEASE_SAFETY',['read_retained','digest','game_stage','game_upload','store_close']],
 ['game_identity','DEPLOYMENT_IDENTITY',['read_retained','digest','game_stage','game_upload','metadata','store_close']]
])test('promotion preserves backup gates and does not mislabel game operations: '+mode,()=>{
 const result=run(mode,'promote');assert.equal(result.status,1);assert.equal(result.stderr,category+': FAIL\n'+generic);assert.equal(result.stdout,'');assert.deepEqual(result.trace,trace);
});


test('a delayed S3 report returning 403 then 200 still requires real controller validation, export and retention',()=>{
 const result=run('report_readiness');assert.equal(result.status,0);assert.equal(result.stderr,'');
 assert.equal(result.stdout,ready+'PRIVATE_REPORT_READ: HTTP_403\nPRIVATE_REPORT_READ: JSON_RECEIVED\n'+complete);
 assert.deepEqual(result.trace,[...completed,'report','report_get_403','report_get_200','download','manifest','store_close']);
});

test('persistent report denial emits fixed HTTP/deadline diagnostics and cannot reach recovery export or promotion',()=>{
 const result=run('report_denied');assert.equal(result.status,1);
 assert.equal(result.stderr,'BACKUP_RESTORE_VERIFICATION: FAIL\n'+generic);
 assert.equal(result.stdout,ready+'PRIVATE_REPORT_READ: HTTP_403\nPRIVATE_REPORT_READ: DEADLINE\n');
 assert.deepEqual(result.trace,[...completed,'report','report_get_403','store_close']);
});


test('an unexpected HTTP 400 emits its exact fixed category and cannot reach export or promotion',()=>{
 const result=run('report_bad_status');assert.equal(result.status,1);
 assert.equal(result.stderr,'BACKUP_RESTORE_VERIFICATION: FAIL\n'+generic);
 assert.equal(result.stdout,ready+'PRIVATE_REPORT_READ: HTTP_400\nPRIVATE_REPORT_READ: HTTP_REJECTED\n');
 assert.deepEqual(result.trace,[...completed,'report','report_get_400','store_close']);
});


for(const [mode,code]of[['worker_failed','TERMINATED'],['worker_api_failure','API_REJECTED'],['worker_wrong_service','IDENTITY_REJECTED']])test('worker completion gate stops before any report or backup GET: '+mode,()=>{
 const result=run(mode);assert.equal(result.status,1);assert.equal(result.stderr,'BACKUP_RESTORE_VERIFICATION: FAIL\n'+generic);
 assert.equal(result.stdout,queued+'PRIVATE_WORKER_COMPLETION: '+code+'\n');
 assert.deepEqual(result.trace,[...completed,'store_close']);
});

test('the controller waits for the exact running worker to exit before its first report GET',()=>{
 const result=run('worker_delayed');assert.equal(result.status,0);assert.equal(result.stderr,'');
 assert.equal(result.stdout,queued+'PRIVATE_WORKER_COMPLETION: WAITING\nPRIVATE_WORKER_COMPLETION: COMPLETED\n'+complete);
 assert.deepEqual(result.trace,[...identified,'worker_running','worker_completion','report','download','manifest','store_close']);
});

test('HTTP 408 after verified worker completion still fails immediately without downloading recovery',()=>{
 const result=run('report_timeout_status');assert.equal(result.status,1);assert.equal(result.stderr,'BACKUP_RESTORE_VERIFICATION: FAIL\n'+generic);
 assert.equal(result.stdout,ready+'PRIVATE_REPORT_READ: HTTP_408\nPRIVATE_REPORT_READ: HTTP_REJECTED\n');
 assert.deepEqual(result.trace,[...completed,'report','report_get_408','store_close']);
});
