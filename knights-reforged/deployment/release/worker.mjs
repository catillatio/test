// A private, single-use Railway start command, not an HTTP/SSH endpoint.
// Only PostgreSQL backups leave this service, encrypted to the owner plus an
// ephemeral restore key. No S3 credentials or owner private key enter the job.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,statfs} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createDatabase} from '../../dist/db.js';
import {validateDeploymentEnvironment} from '../environment.mjs';
import {candidateDigest} from './candidate.mjs';
import {protocol,checkRequest,checkWorkerEnvironment,checkJobReport} from './protocol.mjs';
import {fileDigest,putFile,getFile,putReport} from './transfer.mjs';
let gate='configuration';

function execute(executable,args,{env=process.env,input,timeout=600000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{env,stdio:['pipe','pipe','pipe'],timeout});let output='';
  child.stderr.resume();child.stdout.on('data',chunk=>{output+=chunk;if(output.length>1000000)child.kill();});
  child.once('error',()=>reject(new Error('Private verification tool failed.')));
  child.once('close',code=>code===0?resolve(output):reject(new Error('Private verification tool failed.')));child.stdin.end(input);
 });
}
function pgEnvironment(target,readOnly=false){
 return {...process.env,PGHOST:target.url.hostname,PGPORT:'5432',PGDATABASE:target.name,
  PGUSER:decodeURIComponent(target.url.username),PGPASSWORD:decodeURIComponent(target.url.password),
  PGCONNECT_TIMEOUT:'15',PGOPTIONS:readOnly?'-c default_transaction_read_only=on -c statement_timeout=600000':''};
}
async function readStatus(url){
 const db=createDatabase(url.href),client=await db.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const row=(await client.query(`SELECT (SELECT count(*)::int FROM accounts) AS accounts,
   (SELECT count(*)::int FROM development_bots) AS bots,
   (SELECT count(*)::int FROM development_bots WHERE active) AS active_bots,
   (SELECT max(name) FROM schema_migrations) AS "schemaHead",
   EXISTS(SELECT 1 FROM private_alpha_initializations WHERE id='railway-phase43-private-alpha-v1') AS initialized,
   pg_database_size(current_database())::text AS "sourceBytes",
   (SELECT system_identifier::text FROM pg_control_system()) AS "clusterId"`)).rows[0];
  assert.equal(row.bots,450);assert.ok(row.accounts>=451);assert.equal(row.initialized,true);
  return row;
 }finally{await client.query('ROLLBACK').catch(()=>{});client.release();await db.end();}
}
async function main(){
 process.umask(0o077);validateDeploymentEnvironment();
 assert.match(process.env.KINGDOM_RELEASE_JOB_REQUEST??'',/^[A-Za-z0-9_-]{1,30000}$/,'A private release request is required.');
 const request=checkRequest(JSON.parse(Buffer.from(process.env.KINGDOM_RELEASE_JOB_REQUEST,'base64url').toString('utf8')));
 const {source,restore}=checkWorkerEnvironment(process.env,request);
 gate='candidate-fingerprint';assert.equal(await candidateDigest(),request.candidateDigest,'The private job is not the checked candidate.');
 gate='read-only-source-status';
 const sourceStatus=await readStatus(source.url);
 const sourceClusterDigest=createHash('sha256').update(sourceStatus.clusterId).digest('hex');
 const report={...Object.fromEntries(['jobId','mode','sha','candidateDigest','projectId','environmentId','gameServiceId','workerServiceId','sourceHost','sourceDatabase','restoreHost','copy'].map(key=>[key,request[key]])),
  protocol,passed:true,workerDeploymentId:process.env.RAILWAY_DEPLOYMENT_ID,sourceClusterDigest,accounts:sourceStatus.accounts,bots:sourceStatus.bots};
 if(request.mode==='verify'){
  Object.assign(report,{schemaHead:sourceStatus.schemaHead,active_bots:sourceStatus.active_bots,initialized:sourceStatus.initialized});
  gate='post-deployment-report';checkJobReport(report,request);await putReport(request.urls.reportPut,report);return;
 }
 // All administrative operations below target the independent verification
 // cluster. The original PostgreSQL receives read-only queries and pg_dump.
 gate='independent-verification-database-connection';const scratch=createDatabase(restore.url.href);
 let lock,folder;
 try{
  lock=await scratch.connect();
  gate='independent-verification-working-directory';folder=await mkdtemp(join(tmpdir(),'kingdom-release-'));
  gate='independent-verification-cluster-identity';
  const cluster=(await lock.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id;
  report.restoreClusterDigest=createHash('sha256').update(cluster).digest('hex');
  assert.notEqual(report.restoreClusterDigest,sourceClusterDigest,'The verification cluster must be independent.');
  gate='independent-verification-advisory-lock';
  const locked=(await lock.query('SELECT pg_try_advisory_lock(61824087) AS acquired')).rows[0].acquired;
  assert.equal(locked,true,'Another private verification job is running.');
  gate='independent-verification-copy-absence';
  assert.equal((await lock.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',[request.copy])).rows[0].n,0,'A verification database already exists; never overwrite it.');
  gate='independent-verification-storage-capacity';
  const available=await statfs(folder),sourceBytes=BigInt(sourceStatus.sourceBytes);
  assert.ok(BigInt(available.bavail)*BigInt(available.bsize)>sourceBytes*5n+134217728n,'Insufficient temporary verification space.');
  const dump=join(folder,'realm.dump'),encrypted=join(folder,'realm.dump.age'),downloaded=join(folder,'downloaded.dump.age'),restored=join(folder,'restored.dump'),identity=join(folder,'restore.agekey');
  gate='read-only-backup';await execute('pg_dump',['--format=custom','--no-owner','--no-acl','--lock-wait-timeout=15000','--file='+dump],{env:pgEnvironment(source,true)});
  await execute('pg_restore',['--list',dump]);const plain=await fileDigest(dump);assert.ok(plain.bytes>100000);
  gate='backup-encryption';await execute('age-keygen',['-o',identity]);const ephemeral=(await execute('age-keygen',['-y',identity])).trim();
  await execute('age',['--encrypt','--recipient',request.backupRecipient,'--recipient',ephemeral,'--output',encrypted,dump]);
  gate='encrypted-export';const cipher=await fileDigest(encrypted);await putFile(request.urls.backupPut,encrypted);
  // Exercise the provider's actual precondition enforcement. Re-sending the
  // identical ciphertext cannot damage recovery if a provider ignores it,
  // but any response other than Precondition Failed stops this release.
  gate='conditional-write-enforcement';await putFile(request.urls.backupPut,encrypted,{verifyExisting:true});
  gate='encrypted-export-round-trip';await getFile(request.urls.backupGet,downloaded,cipher);
  await execute('age',['--decrypt','--identity',identity,'--output',restored,downloaded]);
  assert.deepEqual(await fileDigest(restored),plain,'The exported encrypted recovery object cannot restore the original archive.');
  await execute('pg_restore',['--list',restored]);
  gate='isolated-restore';await execute('createdb',['--maintenance-db='+restore.name,'--',request.copy],{env:pgEnvironment(restore)});
  await execute('pg_restore',['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname='+request.copy,restored],{env:pgEnvironment(restore)});
  gate='copy-migrations-and-preservation';const result=await execute(process.execPath,['deployment/check-upgrade.mjs'],{env:{...process.env,KINGDOM_RESTORE_TEST_DATABASE:request.copy}});
  report.restoredCopy=JSON.parse(result);
  report.backup={sha256:plain.sha256,bytes:plain.bytes,encryptedSha256:cipher.sha256,encryptedBytes:cipher.bytes,recipient:request.backupRecipient,conditionalWriteVerified:true,exportRoundTripVerified:true};
  gate='verified-recovery-report';checkJobReport(report,request);await putReport(request.urls.reportPut,report);
 }finally{
  // No database or durable backup is automatically deleted. Only this job's
  // temporary plaintext and ephemeral decryption key are removed.
  try{if(folder)await rm(folder,{recursive:true,force:true});}
  finally{
   if(lock){await lock.query('SELECT pg_advisory_unlock(61824087)').catch(()=>{});lock.release();}
   await scratch.end();
  }
 }
}
main().then(()=>console.log('Private release verification completed. No source database was changed.')).catch(()=>{
 console.error('Private release verification failed at '+gate+'. No promotion is authorized; credentials and provider output are withheld.');process.exitCode=1;
});
