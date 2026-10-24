// Optional metadata only. Never imports cleanup, approval issuance or release control.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {checkJobReport,copyName,privateDatabase,uuid,digest,protocol,httpsOrigin} from '../protocol.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item)).digest('hex');
const pick=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value[key]]));
export const registrationFields=['name','oid','owner','maintenanceDatabase','clusterDigest','sourceClusterDigest','jobId','workerDeploymentId','projectId','environmentId','gameServiceId','workerServiceId','sha','candidateDigest','sourceHost','sourceDatabase','restoreHost','createdAt','expiresAt','backupSha256','encryptedSha256','preservationSha256','reportSha256','evidenceSha256','accounts','bots','existingTablesVerified','passed','migrationReplay','liveDatabaseConnected'];

export function registrationConfig(env,request,report,{replay=false}={}){
 assert.equal(env.KINGDOM_COPY_REGISTRATION_ENABLED,'1');assert.equal(env.NODE_ENV,'production');assert.equal(env.KINGDOM_RELEASE_WORKER,'1');
 assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 for(const key of ['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGSSLMODE','KINGDOM_RETENTION_DATABASE_URL','KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL','KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL','KINGDOM_RELEASE_SIGNING_KEY'])assert.ok(!env[key]);
 const scope=JSON.parse(env.KINGDOM_COPY_REGISTRATION_SCOPE);
 assert.deepEqual(Object.keys(scope).sort(),['clusterDigest','environmentId','gameServiceId','maintenanceDatabase','projectId','sourceClusterDigest','verificationDatabaseServiceId','workerServiceId'].sort());
 for(const key of ['projectId','environmentId','gameServiceId','workerServiceId','verificationDatabaseServiceId'])assert.match(scope[key]??'',uuid);
 assert.equal(new Set([scope.gameServiceId,scope.workerServiceId,scope.verificationDatabaseServiceId]).size,3);
 for(const key of ['clusterDigest','sourceClusterDigest'])assert.match(scope[key]??'',digest);assert.notEqual(scope.clusterDigest,scope.sourceClusterDigest);
 const target=privateDatabase(env.KINGDOM_COPY_REGISTRATION_DATABASE_URL);
 assert.equal(decodeURIComponent(target.url.username),'kc_copy_registrar');assert.ok(target.url.password);
 assert.equal(target.host,request.restoreHost);assert.equal(target.name,scope.maintenanceDatabase);
 assert.notEqual(target.host,request.sourceHost);
 assert.equal(env.RAILWAY_PROJECT_ID,scope.projectId);assert.equal(env.RAILWAY_ENVIRONMENT_ID,scope.environmentId);assert.equal(env.RAILWAY_SERVICE_ID,scope.workerServiceId);
 assert.match(env.RAILWAY_DEPLOYMENT_ID??'',uuid);
 for(const key of ['projectId','environmentId','gameServiceId','workerServiceId'])assert.equal(request[key],scope[key]);
 assert.equal(request.mode,'prepare');assert.equal(report.restoreClusterDigest,scope.clusterDigest);assert.equal(report.sourceClusterDigest,scope.sourceClusterDigest);
 if(!replay)assert.equal(report.workerDeploymentId,env.RAILWAY_DEPLOYMENT_ID);
 return {scope,url:target.url.href};
}
export async function captureCopyIdentity(client,request,report,env){
 assert.equal(env.KINGDOM_COPY_REGISTRATION_ENABLED,'1');
 assert.equal(report.workerDeploymentId,env.RAILWAY_DEPLOYMENT_ID);checkJobReport(report,request);
 const restore=privateDatabase(env.KINGDOM_RESTORE_DATABASE_URL);assert.equal(restore.host,request.restoreHost);
 // This is the existing validated verification connection with its existing lock.
 let row;await client.query('BEGIN READ ONLY');
 try{
 await client.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='2s'");
 row=(await client.query(`SELECT d.oid::text AS oid,r.rolname AS owner,current_database() AS "maintenanceDatabase",
  EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE locktype='advisory' AND classid=0 AND objid=61824087 AND objsubid=1 AND mode='ExclusiveLock' AND pid=pg_backend_pid() AND granted) AS locked
  FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.oid=d.datdba WHERE d.datname=$1 AND NOT d.datistemplate`,[request.copy])).rows[0];
 }finally{await client.query('ROLLBACK');}
 assert.equal(row?.locked,true);assert.equal(row.maintenanceDatabase,restore.name);
 const identity={...pick(row,['oid','owner','maintenanceDatabase']),clusterDigest:report.restoreClusterDigest};
 observationPayload({request,report:{...report,verifiedCopyIdentity:identity},backupKey:'kingdom-releases/'+request.sha+'/'+request.jobId+'/realm.dump.age'});
 return identity;
}
export function observationPayload(manifest){
 const {request:q,report:r}=manifest;
 assert.equal(q.protocol,protocol);assert.equal(q.mode,'prepare');assert.equal(q.copy,copyName(q.jobId));
 assert.match(q.jobId??'',/^gh_[0-9]{1,20}_[0-9]{1,5}_[a-f0-9]{32}$/);assert.match(q.sha??'',/^[a-f0-9]{40}$/);assert.match(q.candidateDigest??'',digest);
 for(const key of ['projectId','environmentId','gameServiceId','workerServiceId'])assert.match(q[key]??'',uuid);assert.notEqual(q.gameServiceId,q.workerServiceId);
 for(const key of ['sourceHost','restoreHost'])assert.match(q[key]??'',/^[a-z0-9.-]+\.railway\.internal$/);assert.notEqual(q.sourceHost,q.restoreHost);
 assert.match(q.sourceDatabase??'',/^[a-zA-Z0-9_-]{1,63}$/);assert.ok(!q.sourceDatabase.endsWith('_restore_test'));
 httpsOrigin(q.origin);assert.match(q.backupRecipient??'',/^age1[a-z0-9]{58}$/);
 const created=Date.parse(q.createdAt),expires=Date.parse(q.expiresAt);
 assert.ok(Number.isFinite(created)&&created<=Date.now()+60000&&expires>created&&expires-created<=3600000);
 assert.equal(new Date(created).toISOString(),q.createdAt);assert.equal(new Date(expires).toISOString(),q.expiresAt);
 checkJobReport(r,q);
 for(const n of [r.accounts,r.bots,r.restoredCopy.accounts,r.restoredCopy.bots,r.restoredCopy.existingTablesVerified])assert.ok(Number.isSafeInteger(n));
 const i=r.verifiedCopyIdentity;assert.match(i?.oid??'',/^[1-9][0-9]{0,9}$/);assert.ok(BigInt(i.oid)<=4294967295n);
 assert.match(i.owner??'',/^[a-zA-Z_][a-zA-Z0-9_$-]{0,62}$/);assert.match(i.maintenanceDatabase??'',/^[a-zA-Z0-9_-]{1,63}$/);assert.ok(!i.maintenanceDatabase.endsWith('_restore_test'));
 assert.equal(i.clusterDigest,r.restoreClusterDigest);
 const backupKey='kingdom-releases/'+q.sha+'/'+q.jobId+'/realm.dump.age';assert.equal(manifest.backupKey,backupKey);
 // Whitelist all nested fields before hashing. No request URLs, arbitrary report
 // properties, database credentials or signed grants enter the metadata record.
 const publicRequest=pick(q,['protocol','mode','jobId','sha','candidateDigest','createdAt','expiresAt','projectId','environmentId','gameServiceId','workerServiceId','sourceHost','sourceDatabase','restoreHost','origin','backupRecipient','copy']);
 const publicReport={...pick(r,['protocol','mode','jobId','sha','candidateDigest','projectId','environmentId','gameServiceId','workerServiceId','sourceHost','sourceDatabase','restoreHost','copy','passed','workerDeploymentId','sourceClusterDigest','restoreClusterDigest','accounts','bots']),
  backup:pick(r.backup,['sha256','bytes','encryptedSha256','encryptedBytes','recipient','conditionalWriteVerified','exportRoundTripVerified']),
  restoredCopy:pick(r.restoredCopy,['passed','accounts','bots','existingTablesVerified','migrationReplay','liveDatabaseConnected','restoredDatabase','restoredHost','sha256']),verifiedCopyIdentity:pick(i,['oid','owner','maintenanceDatabase','clusterDigest'])};
 return {name:q.copy,...pick(i,['oid','owner','maintenanceDatabase','clusterDigest']),sourceClusterDigest:r.sourceClusterDigest,
  ...pick(q,['jobId','projectId','environmentId','gameServiceId','workerServiceId','sha','candidateDigest','sourceHost','sourceDatabase','restoreHost','createdAt','expiresAt']),workerDeploymentId:r.workerDeploymentId,
  backupSha256:r.backup.sha256,encryptedSha256:r.backup.encryptedSha256,preservationSha256:r.restoredCopy.sha256,reportSha256:hash(publicReport),evidenceSha256:hash({request:publicRequest,report:publicReport,backupKey}),
  accounts:r.accounts,bots:r.bots,existingTablesVerified:r.restoredCopy.existingTablesVerified,passed:true,migrationReplay:'unchanged',liveDatabaseConnected:false};
}
export async function checkObservationCatalog(client){
 await client.query('SET search_path=pg_catalog,pg_temp');
 const row=(await client.query(`SELECT current_user AS actor,
  EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN (current_user,'kc_retention_owner') AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AS privileged,
  EXISTS(SELECT 1 FROM pg_roles WHERE rolname<>current_user AND pg_has_role(current_user,oid,'MEMBER')) AS member,
  has_schema_privilege(current_user,'release_observations','CREATE') AS ddl,
  has_database_privilege(current_user,current_database(),'CREATE') AS database_ddl,
  has_table_privilege(current_user,'release_observations.verified_copies','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AS writable,
  has_any_column_privilege(current_user,'release_observations.verified_copies','INSERT,UPDATE') AS column_write,
  has_schema_privilege(current_user,'release_retention','USAGE') AS cleanup_schema,
  has_function_privilege(current_user,(SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='release_retention' AND p.proname='record_event'),'EXECUTE') AS cleanup,
  has_table_privilege(current_user,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='release_retention' AND c.relname='permits'),'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AS authorizes,
  has_any_column_privilege(current_user,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='release_retention' AND c.relname='permits'),'INSERT,UPDATE') AS column_authorizes`)).rows[0];
 assert.equal(row.actor,'kc_copy_registrar');for(const [key,value] of Object.entries(row))if(key!=='actor')assert.equal(value,false);
 const sql=await readFile(new URL('./observations.sql',import.meta.url),'utf8');
 const functions=(await client.query(`SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,r.rolname AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='release_observations' ORDER BY p.proname`)).rows;
 assert.deepEqual(functions.map(f=>f.proname),['no_rewrite','record_verified_copy']);
 for(const f of functions){
  assert.equal(f.owner,'kc_retention_owner');assert.equal(f.prosecdef,f.proname==='record_verified_copy');assert.deepEqual(f.proconfig,['search_path=pg_catalog, pg_temp']);
  const match=sql.match(new RegExp('CREATE FUNCTION release_observations\\.'+f.proname+'\\([^]*? AS \\$\\$([^]*?)\\$\\$;'));assert.ok(match);assert.equal(f.prosrc,match[1]);
 }
 const tables=(await client.query(`SELECT c.relname,r.rolname AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='release_observations' AND c.relkind='r'`)).rows;
 assert.deepEqual(tables,[{relname:'verified_copies',owner:'kc_retention_owner'}]);
 const triggers=(await client.query(`SELECT t.tgname,t.tgenabled,t.tgtype,p.proname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='release_observations' AND NOT t.tgisinternal`)).rows;
 assert.deepEqual(triggers,[{tgname:'observations_immutable',tgenabled:'O',tgtype:58,proname:'no_rewrite'}]);
}
export async function recordObservation(client,payload){
 await checkObservationCatalog(client);
 const result=(await client.query('SELECT * FROM release_observations.record_verified_copy($1)',[payload])).rows[0];
 assert.equal(String(result.database_oid),payload.oid);assert.ok(Number.isFinite(+new Date(result.first_observed_at)));assert.equal(+new Date(result.first_observed_at),+new Date(result.verified_at));return result;
}
export async function registerVerifiedCopy(manifest,env,{replay=false}={}){
 const payload=observationPayload(manifest),{url,scope}=registrationConfig(env,manifest.request,manifest.report,{replay});
 assert.equal(payload.maintenanceDatabase,scope.maintenanceDatabase);
 const client=new pg.Client({connectionString:url,connectionTimeoutMillis:5000,query_timeout:5000,options:'-c statement_timeout=5000 -c lock_timeout=2000',application_name:'kingdom-copy-registration'});
 let disconnected=false;client.on('error',()=>{disconnected=true;});
 const timeout=setTimeout(()=>{disconnected=true;client.end().catch(()=>{});},20000);timeout.unref();
 try{await client.connect();const result=await recordObservation(client,payload);assert.equal(disconnected,false);return result;}
 finally{clearTimeout(timeout);await client.end().catch(()=>{});}
}
