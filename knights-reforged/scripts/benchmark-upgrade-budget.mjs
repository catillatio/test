// Explicit local/disposable benchmark. Never invoked by startup or release.
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile,writeFile,stat,unlink,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve,isAbsolute} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createReadStream} from 'node:fs';
import {fixtureUrl} from './ci/isolation.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),base=fixtureUrl(process.env.TEST_DATABASE_URL);
const mode=process.argv[2],label=process.argv[3]??'candidate';
assert.ok(['--prepare','--measure'].includes(mode));assert.ok(['baseline','candidate'].includes(label));
const archive=resolve(process.env.SNAPSHOT_BUDGET_ARCHIVE??'/dev/shm/kr-snapshot-budget.dump');
assert.ok(archive.startsWith('/dev/shm/'),'Keep the synthetic archive in the explicitly disposable workspace');
const directory=resolve(process.env.SNAPSHOT_BUDGET_OUTPUT??'/dev/shm/kr-snapshot-budget');await mkdir(directory,{recursive:true});
const binaries=process.env.SNAPSHOT_PG_BIN;assert.ok(binaries&&isAbsolute(binaries),'Specify the compatible local PostgreSQL client binary directory');
const nonce=randomUUID().replaceAll('-',''),name='kc_budget_'+nonce+'_restore_test',target=new URL(base);target.pathname='/'+name;
const prefix=join(directory,(mode==='--prepare'?'fixture':label)+'-'+nonce),trace=prefix+'-tables.jsonl';
const admin=new pg.Client({connectionString:base.href});await admin.connect();let created=false,temporaryChecker;
function pgEnvironment(){return {PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH??'',PGHOST:base.hostname,PGPORT:base.port||'5432',PGUSER:decodeURIComponent(base.username),PGPASSWORD:decodeURIComponent(base.password),PGPASSFILE:'/dev/null',PGCONNECT_TIMEOUT:'5'};}
async function execute(executable,args,env,timeout=600000){
 return await new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},timeout);
  child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,timedOut,stdout,stderr});});
 });
}
async function archiveDigest(){const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);return hash.digest('hex');}
try{
 await admin.query('CREATE DATABASE "'+name+'" TEMPLATE template0');created=true;
 if(mode==='--prepare'){
  await assert.rejects(stat(archive),{code:'ENOENT'},'Never overwrite another archive');
  const {seedSnapshotBudgetFixture}=await import('../tests/fixtures/snapshot-budget-seed.mjs');
  const fixture=await seedSnapshotBudgetFixture(target.href);
  const dumped=await execute(join(binaries,'pg_dump'),['--format=custom','--compress=1','--no-owner','--no-acl','--dbname='+name,'--file='+archive],pgEnvironment());
  assert.equal(dumped.code,0,'Local synthetic dump failed');
  const list=await execute(join(binaries,'pg_restore'),['--list',archive],pgEnvironment());assert.equal(list.code,0,'Local archive is invalid');
  const report={synthetic:true,productionConnected:false,...fixture,archive,archiveSha256:await archiveDigest()};
  await writeFile(prefix+'-fixture.json',JSON.stringify(report,null,2)+'\n');await writeFile(prefix+'-archive-list.txt',list.stdout);console.log(JSON.stringify(report));
 }else{
  let checker=join(root,'deployment/check-upgrade.mjs');
  if(label==='baseline'){
   const ref=process.env.SNAPSHOT_BASELINE_REF??'cd1fc8e5052c023bb95f9a808ed7ebe1be4c482a';assert.match(ref,/^[a-f0-9]{40}$/);
   const source=await execute('git',['show',ref+':knights-reforged/deployment/check-upgrade.mjs'],{PATH:process.env.PATH},30000);assert.equal(source.code,0,'Baseline source unavailable');
   temporaryChecker=join(root,'deployment/kr-budget-baseline-'+nonce+'.mjs');await writeFile(temporaryChecker,source.stdout,{flag:'wx',mode:0o600});checker=temporaryChecker;
  }
  const sourceHash=async()=>createHash('sha256').update(await readFile(checker)).digest('hex'),sourceSha256=await sourceHash();
  const migrationHash=async()=>createHash('sha256').update(await readFile(join(root,'migrations/055_achievement_gold_lookup.sql'))).digest('hex'),migration055Sha256=await migrationHash();
  const archiveSha256=await archiveDigest();if(process.env.SNAPSHOT_ARCHIVE_SHA256)assert.equal(archiveSha256,process.env.SNAPSHOT_ARCHIVE_SHA256,'Fixture archive changed');
  const settings=(await admin.query("SELECT name,setting,unit FROM pg_settings WHERE name=ANY($1::text[])",[['autovacuum','shared_buffers','work_mem','data_checksums','jit','max_parallel_workers_per_gather','max_wal_size','checkpoint_timeout','fsync','full_page_writes']])).rows;
  const postgresLog=process.env.SNAPSHOT_PG_LOG;const logStart=postgresLog?(await stat(postgresLog)).size:0;
  const restoreStarted=performance.now(),restored=await execute(join(binaries,'pg_restore'),['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname='+name,archive],pgEnvironment());
  assert.equal(restored.code,0,'Fresh local restore failed');const restoreMs=performance.now()-restoreStarted;
  const lsn=(await admin.query('SELECT pg_current_wal_insert_lsn() AS lsn')).rows[0].lsn;
  const countersBefore=(await admin.query('SELECT temp_files,temp_bytes,blks_read,blks_hit,blk_read_time,blk_write_time FROM pg_stat_database WHERE datname=$1',[name])).rows[0];
  await writeFile(trace,'');const started=performance.now();
  const result=await execute(process.execPath,['--max-old-space-size=128','--import',join(root,'tests/fixtures/release-upgrade-budget.mjs'),checker],{
   PATH:process.env.PATH,NODE_NO_WARNINGS:'1',NODE_ENV:'production',KINGDOM_PRIVATE_ALPHA:'1',RAILWAY_SERVICE_ID:'11111111-1111-4111-8111-111111111111',RAILWAY_ENVIRONMENT_ID:'22222222-2222-4222-8222-222222222222',
   DATABASE_URL:'postgres://fixture:synthetic@source.railway.internal/railway',KINGDOM_RESTORE_DATABASE_URL:'postgres://fixture:synthetic@restore.railway.internal/railway',KINGDOM_RESTORE_TEST_DATABASE:name,
   FIXTURE_POSTGRES_URL:target.href,FIXTURE_TRACE:trace,FIXTURE_CHECKER_URL:new URL('file://'+checker).href
  });
  const checkerMs=performance.now()-started;assert.equal(await sourceHash(),sourceSha256,'Checker source changed during measurement');
  assert.equal(await migrationHash(),migration055Sha256,'Migration source changed during measurement');
  const counters=(await admin.query('SELECT temp_files,temp_bytes,blks_read,blks_hit,blk_read_time,blk_write_time FROM pg_stat_database WHERE datname=$1',[name])).rows[0];
  const walBytes=(await admin.query('SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(),$1)::text AS bytes',[lsn])).rows[0].bytes;
  await writeFile(prefix+'-stdout.json',result.stdout);await writeFile(prefix+'-stderr.log',result.stderr);
  if(postgresLog)await writeFile(prefix+'-postgres.log',(await readFile(postgresLog)).subarray(logStart));
  const phases=result.stderr.split('\n').filter(l=>l.startsWith('UPGRADE_PROGRESS: ')).map(l=>JSON.parse(l.slice('UPGRADE_PROGRESS: '.length)));
  const report={synthetic:true,productionConnected:false,label,sourceSha256,migration055Sha256,archiveSha256,restoreMs,checkerMs,localRestoreAndCheckerMs:restoreMs+checkerMs,code:result.code,signal:result.signal,timedOut:result.timedOut,phases,settings,countersBefore,countersAfter:counters,walBytes,trace};
  await writeFile(prefix+'-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  assert.equal(result.code,0,'Checker failed; retain the evidence, do not count this as passing');assert.equal(phases.length,16);assert.equal(JSON.parse(result.stdout).migrationReplay,'unchanged');
 }
}finally{
 // Only a new randomly named database created by this invocation, on loopback.
 // No FORCE, adoption, production or historical recovery-copy deletion exists.
 try{if(created)await admin.query('DROP DATABASE "'+name+'"');}finally{await admin.end();if(temporaryChecker)await unlink(temporaryChecker);}
}
