import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {copyName,protocol} from '../deployment/release/protocol.mjs';

const folder=mkdtempSync(join(tmpdir(),'worker-substages-'));after(()=>rmSync(folder,{recursive:true,force:true}));
const worker=new URL('../deployment/release/worker.mjs',import.meta.url),preload=fileURLToPath(new URL('./fixtures/release-worker.mjs',import.meta.url));
const ids=Array.from({length:5},(_,i)=>String(i+1).repeat(8)+'-'+String(i+1).repeat(4)+'-4'+String(i+1).repeat(3)+'-8'+String(i+1).repeat(3)+'-'+String(i+1).repeat(12));
const grant=()=>{const url=new URL('https://recovery.fixture.invalid/object');for(const [key,value]of Object.entries({'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Expires':'3600','X-Amz-Signature':'b'.repeat(64),'X-Amz-SignedHeaders':'host;if-none-match'}))url.searchParams.set(key,value);return url.href;};
const env={PATH:process.env.PATH,NODE_ENV:'production',KINGDOM_PRIVATE_ALPHA:'1',KINGDOM_RELEASE_WORKER:'1',
 RAILWAY_PROJECT_ID:ids[0],RAILWAY_ENVIRONMENT_ID:ids[1],RAILWAY_SERVICE_ID:ids[3],RAILWAY_DEPLOYMENT_ID:ids[4],
 APP_ORIGIN:'https://realm.fixture.invalid',KINGDOM_BACKUP_ORIGIN:'https://recovery.fixture.invalid',
 DATABASE_URL:'postgres://fixture:fixture@game-db.railway.internal/railway',KINGDOM_RESTORE_DATABASE_URL:'postgres://fixture:fixture@verify-db.railway.internal/railway'};
let number=0;
function run(mode,{jobMode='prepare',overrides={}}={}){
 const jobId='gh_123_1_'+'a'.repeat(32);
 const request={protocol,mode:jobMode,jobId,sha:'c'.repeat(40),candidateDigest:'d'.repeat(64),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString(),
  projectId:ids[0],environmentId:ids[1],gameServiceId:ids[2],workerServiceId:ids[3],sourceHost:'game-db.railway.internal',sourceDatabase:'railway',restoreHost:'verify-db.railway.internal',
  origin:env.APP_ORIGIN,backupOrigin:env.KINGDOM_BACKUP_ORIGIN,backupRecipient:'age1'+'a'.repeat(58),copy:copyName(jobId),urls:{backupPut:grant(),backupGet:grant(),reportPut:grant()}};
 const trace=join(folder,'trace-'+number++),forbidden=trace+'-forbidden';writeFileSync(trace,'');
 const result=spawnSync(process.execPath,['--import',preload,fileURLToPath(worker)],{env:{...env,FIXTURE_MODE:mode,FIXTURE_WORKER_URL:worker.href,FIXTURE_TRACE:trace,FIXTURE_FORBIDDEN:forbidden,
  KINGDOM_RELEASE_JOB_REQUEST:Buffer.from(JSON.stringify(request)).toString('base64url'),...overrides},encoding:'utf8',timeout:15000});
 assert.equal(result.error,undefined,'The offline worker subprocess must finish.');
 assert.equal(existsSync(forbidden),false,'Real network, DNS, child processes and unexpected external operations are blocked.');
 return {...result,trace:readFileSync(trace,'utf8').trim().split('\n').filter(Boolean)};
}
const source=['source-pool','source-connect','source-read-only','source-status','source-rollback','source-release','source-close'];
const prerequisites=['restore-pool','restore-connect','temporary-directory','cluster-query','advisory-lock','copy-check','storage-check'];
const cleanup=['temporary-cleanup','advisory-unlock','restore-release','restore-close'];
const suffix='. No promotion is authorized; credentials and provider output are withheld.\n';
for(const [mode,substage,last,tail]of[
 ['pool_failure','database-connection','restore-pool',[]],
 ['connection_failure','database-connection','restore-connect',['restore-close']],
 ['directory_failure','working-directory','temporary-directory',cleanup.slice(1)],
 ['cluster_query_failure','cluster-identity','cluster-query',cleanup],
 ['same_cluster','cluster-identity','cluster-query',cleanup],
 ['lock_query_failure','advisory-lock','advisory-lock',cleanup],
 ['busy_lock','advisory-lock','advisory-lock',cleanup],
 ['copy_query_failure','copy-absence','copy-check',cleanup],
 ['existing_copy','copy-absence','copy-check',cleanup],
 ['space_query_failure','storage-capacity','storage-check',cleanup],
 ['insufficient_space','storage-capacity','storage-check',cleanup],
 ['exact_space_limit','storage-capacity','storage-check',cleanup]
])test('worker fails closed with a fixed substage and unchanged cleanup: '+mode,()=>{
 const result=run(mode);assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,'Private release verification failed at independent-verification-'+substage+suffix);
 assert.deepEqual(result.trace,[...source,...prerequisites.slice(0,prerequisites.indexOf(last)+1),...tail]);
});

const successTrace=[...source,...prerequisites,'backup','archive-list','plain-digest','ephemeral-key','ephemeral-recipient','encrypt','cipher-digest',
 'encrypted-upload','conditional-upload','encrypted-download','decrypt','restored-digest','archive-list','create-copy','restore-copy','copy-migration-check','report-upload',...cleanup];
for(const mode of ['success','one_byte_above_limit'])test('successful preparation retains the complete backup and restoration gates: '+mode,()=>{
 const result=run(mode);assert.equal(result.status,0);assert.equal(result.stderr,'');
 assert.equal(result.stdout,'Private release verification completed. No source database was changed.\n');assert.deepEqual(result.trace,successTrace);
});

test('a later backup failure retains its existing gate and never uploads recovery or a report',()=>{
 const result=run('backup_failure');assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,'Private release verification failed at read-only-backup'+suffix);
 assert.deepEqual(result.trace,[...source,...prerequisites,'backup',...cleanup]);
});

test('a report upload failure retains its existing gate and does not publish a fallback failure envelope',()=>{
 const result=run('report_failure');assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,'Private release verification failed at verified-recovery-report'+suffix);assert.deepEqual(result.trace,successTrace);
});

for(const [mode,gate,trace,overrides]of[
 ['bad_worker_identity','configuration',[],{RAILWAY_SERVICE_ID:ids[2]}],
 ['bad_candidate','candidate-fingerprint',[],{}],
 ['source_failure','read-only-source-status',source.slice(0,2),{}]
])test('earlier failures keep their original diagnostics: '+mode,()=>{
 const result=run(mode,{overrides});assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,'Private release verification failed at '+gate+suffix);assert.deepEqual(result.trace,trace);
});

test('post-deployment verification stays read-only and skips all restore prerequisites',()=>{
 const result=run('success',{jobMode:'verify'});assert.equal(result.status,0);assert.equal(result.stderr,'');
 assert.equal(result.stdout,'Private release verification completed. No source database was changed.\n');assert.deepEqual(result.trace,[...source,'report-upload']);
});
