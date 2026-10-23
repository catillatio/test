import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {checkScope,checkState,checkApproval,policy,hash,copyPattern,evidenceRecord,retentionProtocol} from './protocol.mjs';

// The SAME session-level lock as worker.mjs. Never terminate connections or
// use DROP ... FORCE. A concurrently opened connection makes PostgreSQL refuse.
export const releaseLock=61824087;
const roles=['kc_retention_runtime','kc_release_copy_owner','kc_retention_owner','kc_retention_authorizer'];
const qname=name=>{assert.match(name,copyPattern);return '"'+name+'"';};
const bytes=value=>{assert.match(String(value),/^(0|[1-9][0-9]*)$/);return BigInt(value);};

export async function checkCatalog(client){
 const row=(await client.query(`SELECT current_user AS actor,
  (SELECT bool_or(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=ANY($1)) AS privileged,
  pg_has_role(current_user,'kc_retention_owner','MEMBER') AS owns_catalog,
  pg_has_role(current_user,'kc_release_copy_owner','MEMBER') AS owns_copies,
  has_schema_privilege(current_user,'release_retention','CREATE') AS schema_ddl,
  has_database_privilege(current_user,current_database(),'CREATE') AS database_ddl`,[roles])).rows[0];
 assert.equal(row.actor,roles[0]);assert.equal(row.privileged,false);assert.equal(row.owns_catalog,false);assert.equal(row.owns_copies,true);
 assert.equal(row.schema_ddl,false);assert.equal(row.database_ddl,false);
 const memberships=(await client.query("SELECT rolname FROM pg_roles WHERE rolname<>current_user AND pg_has_role(current_user,oid,'MEMBER') ORDER BY rolname")).rows;
 assert.deepEqual(memberships,[{rolname:'kc_release_copy_owner'}]);
 const tables=(await client.query(`SELECT c.relname,r.rolname AS owner,
  has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AS writable
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
  WHERE n.nspname='release_retention' AND c.relkind='r' ORDER BY c.relname COLLATE "C"`)).rows;
 assert.deepEqual(tables,[{relname:'audit',owner:roles[2],writable:false},{relname:'copies',owner:roles[2],writable:false},{relname:'permits',owner:roles[2],writable:false},{relname:'pins',owner:roles[2],writable:false}]);
 // Verify installed guard bodies and attributes against the reviewed source,
 // not merely that functions with familiar names happen to exist.
 const sql=await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8');
 const functions=(await client.query(`SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,r.rolname AS owner
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
  WHERE n.nspname='release_retention' ORDER BY p.proname`)).rows;
 assert.equal(functions.length,2);
 for(const f of functions){
  assert.equal(f.owner,roles[2]);assert.equal(f.prosecdef,f.proname==='record_event');assert.deepEqual(f.proconfig,['search_path=pg_catalog, pg_temp']);
  const match=sql.match(new RegExp('CREATE FUNCTION release_retention\\.'+f.proname+'\\([^]*? AS \\$\\$([^]*?)\\$\\$;'));
  assert.ok(match);assert.equal(f.prosrc,match[1]);
 }
 const triggers=(await client.query(`SELECT t.tgname,t.tgenabled,t.tgtype,p.proname FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE n.nspname='release_retention' AND NOT t.tgisinternal ORDER BY t.tgname COLLATE "C"`)).rows;
 assert.deepEqual(triggers,['audit_immutable','copies_immutable','permits_immutable','pins_immutable'].map(tgname=>({tgname,tgenabled:'O',tgtype:58,proname:'no_rewrite'})));
}
export async function lockCluster(client,scope){
 checkScope(scope);
 await client.query('SET search_path=pg_catalog,pg_temp');
 const row=(await client.query(`SELECT current_database() AS database,(SELECT system_identifier::text FROM pg_control_system()) AS cluster`)).rows[0];
 assert.equal(row.database,scope.adminDatabase);
 assert.equal(createHash('sha256').update(row.cluster).digest('hex'),scope.clusterDigest);
 assert.equal((await client.query('SELECT pg_try_advisory_lock(61824087) AS acquired')).rows[0].acquired,true);
 await client.query("SET statement_timeout='15s'");await client.query("SET lock_timeout='2s'");
 await checkCatalog(client);
}
export async function snapshot(client){
 const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
 const databases=(await client.query(`SELECT d.datname AS name,d.oid::text AS oid,r.rolname AS owner,d.datistemplate AS template,
  pg_database_size(d.oid)::text AS bytes,
  (SELECT count(*)::int FROM pg_stat_activity a WHERE a.datid=d.oid) AS connections
  FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba ORDER BY d.datname`)).rows;
 const catalog=(await client.query('SELECT name,database_oid::text AS oid,owner_name AS owner,verified_at,first_observed_at,evidence,evidence_sha256 FROM release_retention.copies ORDER BY name')).rows;
 const pins=(await client.query('SELECT DISTINCT ON(name) name,pinned FROM release_retention.pins ORDER BY name,sequence DESC')).rows;
 return {now:new Date(now).toISOString(),databases,catalog,pins};
}
export function makePlan(snapshot,state,scope,limits={}){
 checkState(state,scope,{now:Date.parse(snapshot.now)});assert.ok(Array.isArray(snapshot.pins));
 for(const pin of snapshot.pins){assert.match(pin.name,copyPattern);assert.equal(typeof pin.pinned,'boolean');}
 const durablePins=new Set(snapshot.pins.filter(pin=>pin.pinned).map(pin=>pin.name));
 const settings=policy(limits),known=new Map();
 for(const row of snapshot.catalog){
  try{
   const evidence=evidenceRecord(row.evidence,scope);
   assert.equal(evidence.evidenceSha256,row.evidence_sha256);assert.equal(evidence.name,row.name);
   assert.equal(row.owner,'kc_release_copy_owner');assert.match(row.oid,/^[1-9][0-9]*$/);
   const observed=Date.parse(row.first_observed_at),verified=Date.parse(row.verified_at),created=Date.parse(row.evidence.request.createdAt);
   assert.ok(Number.isFinite(observed)&&Number.isFinite(verified)&&Number.isFinite(created));
   assert.ok(created<=verified&&verified<=observed&&observed<=Date.parse(snapshot.now));
   known.set(row.name,{...row,...evidence,observed,verified});
  }catch{/* Incomplete, altered or untrusted provenance is always protected. */}
 }
 const existing=new Set(snapshot.databases.filter(row=>known.get(row.name)?.oid===row.oid&&known.get(row.name)?.owner===row.owner&&!row.template).map(row=>row.name));
 const newest=new Set([...known.values()].filter(row=>existing.has(row.name)).sort((a,b)=>b.verified-a.verified||(a.name<b.name?-1:a.name>b.name?1:0)).slice(0,settings.keep).map(row=>row.name));
 const present=new Map(snapshot.databases.map(row=>[row.name,row]));
 assert.ok(present.has(state.currentRecoveryCopy),'The current recovery reference must exist.');
 const rows=snapshot.databases.map(row=>{
  const reasons=[],record=known.get(row.name);bytes(row.bytes);
  if(!copyPattern.test(row.name)||row.template)reasons.push('outside-copy-scope');
  if(!record)reasons.push('unproven-provenance');
  if(row.owner!=='kc_release_copy_owner'||record&&(record.oid!==row.oid||record.owner!==row.owner))reasons.push('ownership-or-identity-mismatch');
  if(row.name===state.currentRecoveryCopy)reasons.push('current-recovery');
  if(record&&record.evidence.request.sha===state.activeSha)reasons.push('active-release-candidate');
  if(durablePins.has(row.name))reasons.push('durably-pinned');
  if(state.pinnedCopies.includes(row.name))reasons.push('pinned');
  if(state.pendingCopies.includes(row.name))reasons.push('pending-release');
  if(record&&!state.closedJobIds.includes(record.jobId))reasons.push('release-not-confirmed-closed');
  if(record&&newest.has(row.name))reasons.push('newest-verified');
  if(record&&Date.parse(snapshot.now)-record.observed<settings.minAgeHours*3600000)reasons.push('within-age-window');
  if(!Number.isInteger(row.connections)||row.connections!==0)reasons.push('in-use-or-unknown');
  return {name:row.name,oid:row.oid,bytes:row.bytes,eligible:reasons.length===0,reasons:reasons.length?reasons:['obsolete-verified-copy'],evidenceSha256:record?.evidenceSha256??null};
 });
 return {protocol:retentionProtocol,scope,policy:settings,observedAt:snapshot.now,stateSha256:hash(state),rows,
  reclaimableBytes:rows.filter(row=>row.eligible).reduce((sum,row)=>sum+bytes(row.bytes),0n).toString()};
}
export async function inspect(client,state,scope,limits){return makePlan(await snapshot(client),state,scope,limits);}
export async function cleanup(client,{scope,state,plan,approval:encoded,verifyKey,beforeDelete,now=()=>Date.now()}){
 assert.equal((await client.query('SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype=\'advisory\' AND classid=0 AND objid=61824087 AND objsubid=1 AND mode=\'ExclusiveLock\' AND pid=pg_backend_pid() AND granted) AS held')).rows[0].held,true);
 await checkCatalog(client);
 assert.equal(typeof beforeDelete,'function','Live release coordination is required.');
 const approval=checkApproval(encoded,verifyKey,plan,state,scope,{now:now()});
 assert.equal(plan.protocol,retentionProtocol);assert.deepEqual(plan.scope,scope);policy(plan.policy);
 assert.equal(plan.stateSha256,hash(state));assert.ok(Array.isArray(plan.rows)&&plan.rows.length<=10000);
 assert.equal(new Set(plan.rows.map(row=>row.name)).size,plan.rows.length);
 const grant=(await client.query('SELECT encoded_approval,plan_sha256,state_sha256,plan,state FROM release_retention.permits WHERE approval_id=$1',[approval.id])).rows[0];
 assert.ok(grant);assert.equal(grant.encoded_approval,encoded);assert.equal(grant.plan_sha256,hash(plan));assert.equal(grant.state_sha256,hash(state));assert.equal(hash(grant.plan),hash(plan));assert.equal(hash(grant.state),hash(state));
 const result={protocol:retentionProtocol,approvalId:approval.id,planSha256:hash(plan),dropped:[],alreadyAbsent:[],measuredDatabaseBytesRemoved:'0'};
 let removed=0n;
 for(const target of plan.rows.filter(row=>row.eligible)){
  // Re-check freshness and all rules after every previous deletion; never rely
  // on the old dry-run's connections, ordering, ownership, OIDs or pin state.
  checkApproval(encoded,verifyKey,plan,state,scope,{now:now()});
  assert.match(target.name,copyPattern);assert.match(target.oid,/^[1-9][0-9]*$/);
  const current=await inspect(client,state,scope,plan.policy),row=current.rows.find(row=>row.name===target.name);
  const prior=(await client.query(`SELECT event,plan_sha256,database_oid::text AS oid FROM release_retention.audit WHERE approval_id=$1 AND name=$2`,[approval.id,target.name])).rows;
  assert.ok(prior.every(event=>event.plan_sha256===hash(plan)&&event.oid===target.oid));
  const record=async event=>(await client.query('SELECT release_retention.record_event($1,$2,$3,$4,$5) AS bytes',[approval.id,hash(plan),target.name,target.oid,event])).rows[0].bytes;
  if(!row){
   assert.ok(prior.some(event=>event.event==='intent'),'Never infer a deletion without a matching durable intent.');
   await record('absent');result.alreadyAbsent.push(target.name);continue;
  }
  assert.equal(row.eligible,true);assert.equal(row.oid,target.oid);assert.equal(row.evidenceSha256,target.evidenceSha256);
  assert.ok(!prior.some(event=>['deleted','absent'].includes(event.event)),'A completed target must not reappear.');
  const provenance=(await client.query('SELECT evidence FROM release_retention.copies WHERE name=$1',[row.name])).rows[0];
  await beforeDelete({jobId:provenance.evidence.request.jobId,evidence:provenance.evidence},state);
  // Recheck connections after the external read-only guards, immediately before DROP.
  assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1',[row.name])).rows[0].n,0);
  await record('intent'); // Autocommit BEFORE the nontransactional DROP.
  checkApproval(encoded,verifyKey,plan,state,scope,{now:now()});
  try{await client.query('DROP DATABASE '+qname(row.name));}
  catch{await record('refused');throw new Error('Retention deletion refused.');}
  assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',[row.name])).rows[0].n,0);
  const measured=await record('deleted');removed+=bytes(measured);result.dropped.push(row.name);
 }
 result.measuredDatabaseBytesRemoved=removed.toString();
 return result;
}
