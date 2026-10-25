// Offline fixture for the real worker entrypoint. Only external boundaries are
// replaced; request/environment guards, assertions, report checks and catch run.
import assert from 'node:assert/strict';
import {registerHooks,syncBuiltinESMExports} from 'node:module';
import {appendFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import http from 'node:http';import https from 'node:https';
import net from 'node:net';import tls from 'node:tls';
import dns from 'node:dns';import dgram from 'node:dgram';
import child from 'node:child_process';import workers from 'node:worker_threads';
import {checkJobReport} from '../../deployment/release/protocol.mjs';

const mode=process.env.FIXTURE_MODE;
const request=JSON.parse(Buffer.from(process.env.KINGDOM_RELEASE_JOB_REQUEST,'base64url'));
const secret='SYNTHETIC_UNSAFE_EXCEPTION_DETAIL_MUST_NOT_BE_LOGGED';
const record=label=>appendFileSync(process.env.FIXTURE_TRACE,label+'\n');
const fail=()=>{const error=new Error(secret);error.gate=secret;error.category=secret;throw error;};
const block=()=>{appendFileSync(process.env.FIXTURE_FORBIDDEN,'blocked\n');return fail();};
for(const [module,names]of[[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],
 [tls,['connect']],[dns,['lookup','resolve']],[dns.promises,['lookup','resolve']],[dgram,['createSocket']],
 [child,['spawn','exec','execFile','fork','spawnSync','execSync','execFileSync']],[workers,['Worker']]])for(const name of names)module[name]=block;
syncBuiltinESMExports();globalThis.fetch=block;

const status={accounts:452,bots:450,active_bots:450,schemaHead:'025_level100_population.sql',initialized:true,sourceBytes:'2000000',clusterId:'1234567890'};
const plain={sha256:'1'.repeat(64),bytes:200000},cipher={sha256:'2'.repeat(64),bytes:200500};
const temporary='/offline-worker-only/kingdom-release-fixture';
const source={
 async connect(){record('source-connect');if(mode==='source_failure')return fail();return {
  async query(sql){
   if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'){record('source-read-only');return {rows:[]};}
   if(sql==='ROLLBACK'){record('source-rollback');return {rows:[]};}
   if(sql.includes('FROM accounts')&&sql.includes('pg_control_system()')){record('source-status');return {rows:[status]};}
   return block();
  },release(){record('source-release');}
 };},async end(){record('source-close');}
};
const restore={
 async connect(){record('restore-connect');if(mode==='connection_failure')return fail();return {
  async query(sql,values){
   if(sql==='SELECT system_identifier::text AS id FROM pg_control_system()'){
    record('cluster-query');if(mode==='cluster_query_failure')return fail();
    return {rows:[{id:mode==='same_cluster'?status.clusterId:'0987654321'}]};
   }
   if(sql==='SELECT pg_try_advisory_lock(61824087) AS acquired'){
    record('advisory-lock');if(mode==='lock_query_failure')return fail();return {rows:[{acquired:mode!=='busy_lock'}]};
   }
   if(sql==='SELECT count(*)::int AS n FROM pg_database WHERE datname=$1'){
    record('copy-check');assert.deepEqual(values,[request.copy]);if(mode==='copy_query_failure')return fail();return {rows:[{n:mode==='existing_copy'?1:0}]};
   }
   if(sql==='SELECT pg_advisory_unlock(61824087)'){record('advisory-unlock');return {rows:[]};}
   return block();
  },release(){record('restore-release');}
 };},async end(){record('restore-close');}
};
const fixture={
 createDatabase(url){
  if(url===process.env.DATABASE_URL){record('source-pool');return source;}
  if(url===process.env.KINGDOM_RESTORE_DATABASE_URL){record('restore-pool');if(mode==='pool_failure')return fail();return restore;}
  return block();
 },
 readFile:block,writeFile:block,
 async mkdtemp(){record('temporary-directory');if(mode==='directory_failure')return fail();return temporary;},
 async statfs(path){
  record('storage-check');assert.equal(path,temporary);if(mode==='space_query_failure')return fail();
  const required=Number(status.sourceBytes)*5+134217728;
  return {bavail:mode==='insufficient_space'?required-1:mode==='exact_space_limit'?required:mode==='one_byte_above_limit'?required+1:1000000000,bsize:1};
 },
 async rm(path,options){record('temporary-cleanup');assert.equal(path,temporary);assert.deepEqual(options,{recursive:true,force:true});},
 async fileDigest(path){
  if(path===temporary+'/realm.dump.age'){record('cipher-digest');return cipher;}
  if(path===temporary+'/realm.dump'){record('plain-digest');return plain;}
  if(path===temporary+'/restored.dump'){record('restored-digest');return plain;}
  return block();
 },
 async putFile(url,path,options){
  assert.equal(url,request.urls.backupPut);assert.equal(path,temporary+'/realm.dump.age');
  if(options){assert.deepEqual(options,{verifyExisting:true});record('conditional-upload');}else record('encrypted-upload');
 },
 async getFile(url,path,expected){record('encrypted-download');assert.equal(url,request.urls.backupGet);assert.equal(path,temporary+'/downloaded.dump.age');assert.deepEqual(expected,cipher);},
 async putReport(url,report){
  record('report-upload');assert.equal(url,request.urls.reportPut);checkJobReport(report,request);assert.equal(Object.hasOwn(report,'urls'),false);
  if(mode==='report_failure')return fail();
 },
 spawn(executable,args,options){
  let output='',failed=false;
  if(executable==='pg_dump'){
   record('backup');failed=mode==='backup_failure';assert.equal(options.env.PGOPTIONS,'-c default_transaction_read_only=on -c statement_timeout=600000');
   assert.equal(options.env.PGHOST,request.sourceHost);assert.equal(options.env.PGDATABASE,request.sourceDatabase);
   assert.deepEqual(args,['--format=custom','--no-owner','--no-acl','--lock-wait-timeout=15000','--file='+temporary+'/realm.dump']);
  }else if(executable==='pg_restore'&&args[0]==='--list'){
   assert.equal(args.length,2);assert.ok([temporary+'/realm.dump',temporary+'/restored.dump'].includes(args[1]));record('archive-list');
  }else if(executable==='age-keygen'){
   record(args[0]==='-o'?'ephemeral-key':'ephemeral-recipient');if(args[0]==='-y')output='age1'+'b'.repeat(58);
  }else if(executable==='age'){record(args[0]==='--encrypt'?'encrypt':'decrypt');
  }else if(executable==='createdb'){
   record('create-copy');assert.equal(options.env.PGHOST,request.restoreHost);assert.deepEqual(args,['--maintenance-db=railway','--',request.copy]);
  }else if(executable==='pg_restore'){
   record('restore-copy');assert.equal(options.env.PGHOST,request.restoreHost);
   assert.deepEqual(args,['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname='+request.copy,temporary+'/restored.dump']);
  }else if(executable===process.execPath&&args[0]==='deployment/check-upgrade.mjs'){
   record('copy-migration-check');assert.equal(options.env.KINGDOM_RESTORE_TEST_DATABASE,request.copy);
   output=JSON.stringify({passed:true,accounts:452,bots:450,existingTablesVerified:64,migrationReplay:'unchanged',liveDatabaseConnected:false,restoredDatabase:request.copy,restoredHost:request.restoreHost,sha256:'3'.repeat(64)});
  }else return block();
  const task=new EventEmitter();task.stdout=new PassThrough();task.stderr=new PassThrough();task.stdin=new PassThrough();task.kill=()=>task.emit('close',1);
  queueMicrotask(()=>{task.stdout.end(failed?secret:output);task.stderr.end(secret);task.emit('close',failed?1:0);});
  return task;
 }
};
globalThis.releaseWorkerFixture=fixture;
const mocks={
 'node:child_process':'export const spawn=(...args)=>globalThis.releaseWorkerFixture.spawn(...args);',
 'node:fs/promises':['mkdtemp','readFile','writeFile','rm','statfs'].map(name=>'export const '+name+'=(...args)=>globalThis.releaseWorkerFixture.'+name+'(...args);').join('\n'),
 '../../dist/db.js':'export const createDatabase=(...args)=>globalThis.releaseWorkerFixture.createDatabase(...args);',
 // This historical 450-bot fixture has no installed cohort. The real 900
 // provenance SQL is exercised separately against disposable PostgreSQL.
 '../../dist/expansion-population.js':'export const populationEvidence=async()=>null;',
 './candidate.mjs':"export const candidateDigest=async()=>(process.env.FIXTURE_MODE==='bad_candidate'?'e':'d').repeat(64);",
 './transfer.mjs':['fileDigest','putFile','getFile','putReport'].map(name=>'export const '+name+'=(...args)=>globalThis.releaseWorkerFixture.'+name+'(...args);').join('\n')
};
const sources=new Map(Object.entries(mocks).map(([name,source])=>['worker-fixture:'+encodeURIComponent(name),source]));
registerHooks({
 resolve(specifier,context,next){
  if(context.parentURL===process.env.FIXTURE_WORKER_URL&&Object.hasOwn(mocks,specifier))return {url:'worker-fixture:'+encodeURIComponent(specifier),shortCircuit:true};
  return next(specifier,context);
 },
 load(url,context,next){if(sources.has(url))return {format:'module',source:sources.get(url),shortCircuit:true};return next(url,context);}
});
