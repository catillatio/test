import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
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
 assert.doesNotMatch(result.stdout+result.stderr,/SYNTHETIC_UNSAFE_EXCEPTION_DETAIL_MUST_NOT_BE_LOGGED|synthetic-credential-must-not-leak|fixture\.invalid|railway\.internal|postgres:/,'Raw tool/provider output and credentials stay private');
 const diagnostics=[],progress=[];
 const stderr=result.stderr.split('\n').filter(line=>{
  if(line.startsWith('PRIVATE_VERIFICATION_TOOL: ')){diagnostics.push(JSON.parse(line.slice('PRIVATE_VERIFICATION_TOOL: '.length)));return false;}
  if(line.startsWith('UPGRADE_PROGRESS: ')){progress.push(JSON.parse(line.slice('UPGRADE_PROGRESS: '.length)));return false;}
  return true;
 }).join('\n');
 return {...result,stderr,rawStderr:result.stderr,diagnostics,progress,trace:readFileSync(trace,'utf8').trim().split('\n').filter(Boolean)};
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

for(const [mode,expected,events]of[
 ['success','PASS',['registration-identity','report-upload','registration-write']],
 ['registration_failure','FAIL',['registration-identity','report-upload','registration-write']],
 ['registration_identity_failure','FAIL',['registration-identity','report-upload']]
])test('opt-in registration is ordered after verified report upload and failure is metadata-only: '+mode,()=>{
 const result=run(mode,{overrides:{KINGDOM_COPY_REGISTRATION_ENABLED:'1',KINGDOM_COPY_REGISTRATION_DATABASE_URL:'synthetic-credential-must-not-leak'}});
 assert.equal(result.status,0);assert.equal(result.stderr,expected==='FAIL'?'COPY_REGISTRATION: FAIL\n':'');assert.equal(result.stdout,(expected==='PASS'?'COPY_REGISTRATION: PASS\n':'')+'Private release verification completed. No source database was changed.\n');
 assert.deepEqual(result.trace,[...successTrace.slice(0,successTrace.indexOf('report-upload')),...events,...cleanup]);
});
test('an opt-in report upload failure cannot register or be swallowed by optional error handling',()=>{
 const result=run('report_failure',{overrides:{KINGDOM_COPY_REGISTRATION_ENABLED:'1'}});assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,'Private release verification failed at verified-recovery-report'+suffix);
 assert.deepEqual(result.trace,[...successTrace.slice(0,successTrace.indexOf('report-upload')),'registration-identity','report-upload',...cleanup]);
});
test('an opt-in migration failure cannot capture identity, upload success or register metadata',()=>{
 const result=run('migration_failure',{overrides:{KINGDOM_COPY_REGISTRATION_ENABLED:'1'}});assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,'Private release verification failed at copy-migrations-and-preservation'+suffix);
 assert.ok(!result.trace.some(event=>event.startsWith('registration-')||event==='report-upload'));
});
test('post-deployment verify skips registration even if its future opt-in is enabled',()=>{
 const result=run('success',{jobMode:'verify',overrides:{KINGDOM_COPY_REGISTRATION_ENABLED:'1'}});
 assert.equal(result.status,0);assert.equal(result.stdout,'Private release verification completed. No source database was changed.\n');assert.deepEqual(result.trace,[...source,'report-upload']);
});

test('an invalid verification report cannot be certified by the optional registration catch',()=>{
 const result=run('invalid_migration_report',{overrides:{KINGDOM_COPY_REGISTRATION_ENABLED:'1'}});assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,'COPY_REGISTRATION: FAIL\nPrivate release verification failed at verified-recovery-report'+suffix);
 assert.ok(!result.trace.includes('report-upload'));assert.ok(!result.trace.includes('registration-write'));
});


for(const [mode,category,exitCode,signal]of[
 ['migration_failure','EXIT_NONZERO',1,null],
 ['migration_signal','SIGNAL',null,'SIGKILL'],
 ['migration_unknown_signal','SIGNAL',null,null],
 ['migration_spawn_throw','SPAWN_FAILURE',null,null],
 ['migration_spawn_event_error','SPAWN_FAILURE',null,null],
 ['migration_timeout','TIMEOUT',null,'SIGTERM'],
 ['migration_output_limit_zero','OUTPUT_LIMIT',0,null],
 ['migration_output_limit_signal','OUTPUT_LIMIT',null,'SIGTERM']
])test('tool failure retains only bounded termination metadata and never certifies recovery: '+mode,()=>{
 const result=run(mode,{overrides:{KINGDOM_COPY_REGISTRATION_ENABLED:'1'}});
 assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,'Private release verification failed at copy-migrations-and-preservation'+suffix);
 assert.equal(result.diagnostics.length,2,'one start and one failure even after error/duplicate close events');
 assert.deepEqual(result.diagnostics[0],{gate:'copy-migrations-and-preservation',event:'start',elapsed_ms:0,timeout_ms:600000});
 const failure=result.diagnostics[1];
 assert.deepEqual(Object.keys(failure).sort(),['category','elapsed_ms','event','exit_code','gate','signal','timeout_ms']);
 assert.equal(failure.gate,'copy-migrations-and-preservation');assert.equal(failure.event,'failure');assert.equal(failure.category,category);
 assert.equal(failure.timeout_ms,600000);assert.ok(Number.isSafeInteger(failure.elapsed_ms)&&failure.elapsed_ms>=0&&failure.elapsed_ms<15000);
 assert.equal(failure.exit_code,exitCode);assert.equal(failure.signal,signal);
 assert.deepEqual(result.trace.slice(-cleanup.length),cleanup,'plaintext cleanup and lock/connection cleanup remain intact');
 assert.ok(!result.trace.some(event=>event.startsWith('registration-')||event==='report-upload'));
 if(mode==='migration_timeout'){
  assert.ok(result.trace.includes('timeout-armed')&&result.trace.includes('timeout-fired'));
  assert.equal(result.trace.filter(event=>event==='kill-SIGTERM').length,1,'one SIGTERM at the original deadline, no tool retry');
 }
});

test('exact stdout limit remains accepted, while excess output cannot succeed with exit zero',()=>{
 const accepted=run('migration_output_at_limit');assert.equal(accepted.status,0);assert.equal(accepted.stderr,'');
 assert.deepEqual(accepted.trace,successTrace);assert.equal(accepted.diagnostics.length,1);
 const exceeded=run('migration_output_limit_zero');assert.equal(exceeded.status,1);
 assert.equal(exceeded.diagnostics.at(-1).category,'OUTPUT_LIMIT');assert.equal(exceeded.diagnostics.at(-1).exit_code,0);
});

const upgradePhases=['population','snapshot-before','migrate','snapshot-after','preservation-compare','migrate-replay','snapshot-replay','replay-compare'];
const expectedProgress=upgradePhases.flatMap((phase,i)=>['start','complete'].map((event,j)=>({phase,event,elapsed_ms:i*2+j})));
for(const mode of ['migration_progress_valid','migration_progress_spoof'])test('strict progress is fixed-shape, ordered, bounded and deduplicated: '+mode,()=>{
 const result=run(mode);assert.equal(result.status,0);assert.equal(result.stderr,'');
 assert.deepEqual(result.progress,expectedProgress);
 assert.equal(result.diagnostics.length,1);assert.deepEqual(result.trace,successTrace);
 assert.equal(result.rawStderr.split('\n').filter(line=>line.startsWith('UPGRADE_PROGRESS: ')).length,16);
});
test('progress from unrelated subprocesses is discarded even with the exact allowed prefix',()=>{
 const result=run('backup_progress_spoof');assert.equal(result.status,0);assert.deepEqual(result.progress,[]);
 assert.deepEqual(result.trace,successTrace);
});
test('well-formed progress does not authorize success after the checker fails',()=>{
 const result=run('migration_progress_failure',{overrides:{KINGDOM_COPY_REGISTRATION_ENABLED:'1'}});
 assert.equal(result.status,1);assert.deepEqual(result.progress,expectedProgress.slice(0,3));
 assert.equal(result.diagnostics.at(-1).category,'EXIT_NONZERO');
 assert.ok(!result.trace.some(event=>event.startsWith('registration-')||event==='report-upload'));
 assert.deepEqual(result.trace.slice(-cleanup.length),cleanup);
});


test('real local child deadline and spawn error retain safe metadata without database/network access',{timeout:5000},async()=>{
 // Load the actual inline runtime implementation without invoking the private
 // worker entrypoint, its environment guard or any external database boundary.
 const source=readFileSync(worker,'utf8'),runtime=source.slice(source.indexOf('const toolGates='),source.indexOf('\nfunction pgEnvironment'));
 const messages=[];
 const execute=new Function('spawn','setTimeout','clearTimeout','process','console',"let gate='copy-migrations-and-preservation';\n"+runtime+'\nreturn execute;')(
  spawn,setTimeout,clearTimeout,process,{error:line=>messages.push(line)});
 await assert.rejects(execute(process.execPath,['-e','setTimeout(()=>process.exit(0),1000)'],{env:{PATH:process.env.PATH},timeout:30}),/Private verification tool failed/);
 const timeout=JSON.parse(messages.at(-1).slice('PRIVATE_VERIFICATION_TOOL: '.length));
 assert.equal(timeout.category,'TIMEOUT');assert.equal(timeout.timeout_ms,30);assert.equal(timeout.signal,'SIGTERM');
 assert.ok(Number.isSafeInteger(timeout.elapsed_ms)&&timeout.elapsed_ms>=0);
 await assert.rejects(execute('/nonexistent-kingdom-verification-test-executable',[],{env:{PATH:process.env.PATH},timeout:30}),/Private verification tool failed/);
 const missing=JSON.parse(messages.at(-1).slice('PRIVATE_VERIFICATION_TOOL: '.length));
 assert.equal(missing.category,'SPAWN_FAILURE');assert.equal(missing.signal,null);assert.equal(missing.exit_code,null);
 assert.doesNotMatch(messages.join('\n'),/nonexistent-|setTimeout|PATH|Private verification tool failed/);
});
