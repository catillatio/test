// A separate, non-destructive trust boundary. The normal runtime cannot insert
// permits or access this credential. No release signing key or DROP privilege.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {checkApproval,checkAuthorizerEnvironment,hash,copyPattern,policy} from './protocol.mjs';
import {liveGuards} from './guards.mjs';
import {inspect} from './retention.mjs';

export async function installPermit(client,{scope,state,plan,approval:encoded,verifyKey,now=()=>Date.now()}){
 const approval=checkApproval(encoded,verifyKey,plan,state,scope,{now:now()});
 assert.deepEqual(plan.scope,scope);policy(plan.policy);assert.equal(plan.stateSha256,hash(state));
 assert.ok(Array.isArray(plan.rows)&&plan.rows.length<=10000&&new Set(plan.rows.map(row=>row.name)).size===plan.rows.length);
 await client.query('SET search_path=pg_catalog,pg_temp');
 const identity=(await client.query('SELECT current_user AS actor,current_database() AS database,(SELECT system_identifier::text FROM pg_control_system()) AS cluster')).rows[0];
 const permissions=(await client.query(`SELECT
  (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user) AS privileged,
  EXISTS(SELECT 1 FROM pg_roles WHERE rolname<>current_user AND pg_has_role(current_user,oid,'MEMBER')) AS member,
  has_schema_privilege(current_user,'release_retention','CREATE') AS schema_ddl,
  has_database_privilege(current_user,current_database(),'CREATE') AS database_ddl,
  has_any_column_privilege(current_user,'release_retention.audit','INSERT,UPDATE') AS audit_columns,
  has_any_column_privilege(current_user,'release_retention.copies','INSERT,UPDATE') AS provenance_columns,
  has_any_column_privilege(current_user,'release_retention.pins','INSERT,UPDATE') AS pin_columns,
  has_any_column_privilege(current_user,'release_retention.permits','UPDATE') AS permit_columns,
  has_table_privilege(current_user,'release_retention.audit','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AS audit_write,
  has_table_privilege(current_user,'release_retention.copies','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AS provenance_write,
  has_table_privilege(current_user,'release_retention.pins','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AS pin_write,
  has_table_privilege(current_user,'release_retention.permits','UPDATE,DELETE,TRUNCATE,TRIGGER') AS permit_rewrite,
  has_column_privilege(current_user,'release_retention.permits','registered_at','INSERT') AS override_time,
  has_column_privilege(current_user,'release_retention.permits','registered_by','INSERT') AS override_actor,
  has_function_privilege(current_user,'release_retention.record_event(text,text,text,oid,text)','EXECUTE') AS record_event`)).rows[0];
 for(const value of Object.values(permissions))assert.equal(value,false);
 assert.equal(identity.actor,'kc_retention_authorizer');assert.equal(identity.database,scope.adminDatabase);
 assert.equal(createHash('sha256').update(identity.cluster).digest('hex'),scope.clusterDigest);
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL statement_timeout='15s'");await client.query("SET LOCAL lock_timeout='2s'");
  // Different advisory-lock namespace from the worker's single-bigint lock.
  await client.query('SELECT pg_advisory_xact_lock(61824088,hashtext($1))',[approval.id]);
  const existing=(await client.query('SELECT encoded_approval,plan_sha256,state_sha256,plan,state,cluster_identifier,maintenance_database,expires_at FROM release_retention.permits WHERE approval_id=$1',[approval.id])).rows[0];
  if(existing){
   assert.equal(existing.encoded_approval,encoded);assert.equal(existing.plan_sha256,hash(plan));assert.equal(existing.state_sha256,hash(state));
   assert.equal(hash(existing.plan),hash(plan));assert.equal(hash(existing.state),hash(state));
   assert.equal(existing.cluster_identifier,identity.cluster);assert.equal(existing.maintenance_database,identity.database);
   assert.equal(+new Date(existing.expires_at),Date.parse(approval.expiresAt));
  }else{
   const fresh=await inspect(client,state,scope,plan.policy),targets=plan.rows.filter(row=>row.eligible);
   for(const target of targets){
    assert.match(target.name,copyPattern);
    const actual=fresh.rows.find(row=>row.name===target.name);
    assert.equal(actual?.eligible,true);assert.equal(actual.oid,target.oid);assert.equal(actual.evidenceSha256,target.evidenceSha256);
   }
   await client.query(`INSERT INTO release_retention.permits(approval_id,expires_at,plan_sha256,state_sha256,encoded_approval,plan,state,cluster_identifier,maintenance_database)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[approval.id,approval.expiresAt,hash(plan),hash(state),encoded,plan,state,identity.cluster,identity.database]);
  }
  checkApproval(encoded,verifyKey,plan,state,scope,{now:now()});
  await client.query('COMMIT');return approval.id;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
async function main(){
 let client,disconnected=false;
 try{
  process.umask(0o077);
  const {values}=parseArgs({options:{scope:{type:'string'},state:{type:'string'},plan:{type:'string'},approval:{type:'string'},'ready-out':{type:'string'}}});
  const read=async path=>{const text=await readFile(path,'utf8');assert.ok(Buffer.byteLength(text)<=2000000);return JSON.parse(text);};
  const scope=await read(values.scope),state=await read(values.state),plan=await read(values.plan),approval=(await readFile(values.approval,'utf8')).trim();
  const url=checkAuthorizerEnvironment(process.env,scope);
  // Reject bad signatures before connecting, even to the independent cluster.
  checkApproval(approval,process.env.KINGDOM_RETENTION_VERIFY_KEY,plan,state,scope);
  client=new pg.Client({connectionString:url,connectionTimeoutMillis:5000,application_name:'kingdom-copy-permit'});
  client.on('error',()=>{disconnected=true;});await client.connect();
  await liveGuards(scope,{githubToken:process.env.GH_TOKEN}).coordinated(state);
  await installPermit(client,{scope,state,plan,approval,verifyKey:process.env.KINGDOM_RETENTION_VERIFY_KEY});
  assert.equal(disconnected,false);
  if(values['ready-out']){
   const hashes={};for(const [name,path] of [['scope.json',values.scope],['state.json',values.state],['plan.json',values.plan],['approval.txt',values.approval]])hashes[name]=createHash('sha256').update(await readFile(path)).digest('hex');
   const text=JSON.stringify(hashes)+'\n';
   try{await writeFile(values['ready-out'],text,{mode:0o600,flag:'wx'});}catch(error){assert.equal(error.code,'EEXIST');assert.equal(await readFile(values['ready-out'],'utf8'),text);}
  }
  console.log('COPY_RETENTION_PERMIT: PASS');
 }catch{console.error('COPY_RETENTION_PERMIT: FAIL');process.exitCode=1;}
 finally{if(client)await client.end().catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
