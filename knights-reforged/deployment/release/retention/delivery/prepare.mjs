// Owner invokes this ONLY in the private authorizer's Railway Console, after
// PRIVATE_PREPARATION_READY. It reads existing catalogs; it never installs a
// permit, transfers ownership or deletes a database. No owner-PC execution.
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {frame,input,deliveryProtocol} from './protocol.mjs';
import {imageIdentity} from './image.mjs';
import {writeObject} from './io.mjs';
import {checkAuthorizerEnvironment,hash,evidenceRecord} from '../protocol.mjs';
import {inspect} from '../retention.mjs';
import {liveGuards} from '../guards.mjs';
let client;
try{
 process.umask(0o077);assert.notEqual(process.getuid(),0);assert.equal(process.env.KINGDOM_RETENTION_ENABLED,'1');
 const {values}=parseArgs({options:{state:{type:'string'},oid:{type:'string'},manifest:{type:'string'},before:{type:'string'},'prior-approval':{type:'string'},'owner-reviewed':{type:'boolean'}}});
 assert.equal(values['owner-reviewed'],true);const image=await imageIdentity();assert.equal(image.role,'authorizer');
 const f=frame(JSON.parse(Buffer.from(process.env.KINGDOM_RETENTION_JOB,'base64url')),process.env,'authorizer');assert.equal(f.codeDigest,image.codeDigest);
 const state=JSON.parse(await readFile(values.state,'utf8'));
 if(state.scope!==undefined)assert.deepEqual(state.scope,f.scope);if(state.coordinator!==undefined)assert.deepEqual(state.coordinator,f.coordinator);
 // Scope/job are current delivery context, not manufactured database evidence.
 // observedAt, references, pins and closure MUST be the owner's fresh attestation.
 state.scope=f.scope;state.coordinator=f.coordinator;
 const guards=liveGuards(f.scope,{githubToken:f.githubToken});await guards.coordinated(state);assert.equal(await guards.health(),state.activeSha);
 const payload={protocol:deliveryProtocol,operation:f.operation,requestId:f.requestId,scope:f.scope,state,data:{}};
 if(f.operation==='retire'){
  assert.match(values.oid??'',/^[1-9][0-9]{0,9}$/);assert.ok(!values.manifest&&!values.before&&!values['prior-approval']);
  client=new pg.Client({connectionString:checkAuthorizerEnvironment(process.env,f.scope),connectionTimeoutMillis:5000,query_timeout:15000,application_name:'kingdom-retention-private-review'});await client.connect();
  await client.query('BEGIN READ ONLY');
  const identity=(await client.query('SELECT current_user AS actor,current_database() AS database,(SELECT system_identifier::text FROM pg_control_system()) AS cluster')).rows[0];
  assert.equal(identity.actor,'kc_retention_authorizer');assert.equal(identity.database,f.scope.adminDatabase);assert.equal(createHash('sha256').update(identity.cluster).digest('hex'),f.scope.clusterDigest);
  const plan=await inspect(client,state,f.scope),target=plan.rows.find(r=>r.oid===values.oid);assert.equal(target?.eligible,true);
  const record=(await client.query('SELECT evidence FROM release_retention.copies WHERE name=$1',[target.name])).rows[0];
  await guards.beforeDelete({jobId:record.evidence.request.jobId,evidence:record.evidence},state);
  payload.data.plan={...plan,rows:[target],reclaimableBytes:target.bytes};await client.query('ROLLBACK');
 }else if(f.operation==='adoption-review'){
  assert.ok(values.manifest&&!values.oid&&!values.before&&!values['prior-approval']);payload.data.manifest=JSON.parse(await readFile(values.manifest,'utf8'));evidenceRecord(payload.data.manifest,f.scope);
 }else{
  assert.ok(values.before&&values['prior-approval']&&!values.oid&&!values.manifest);payload.data.before=JSON.parse(await readFile(values.before,'utf8'));payload.data.priorApproval=values['prior-approval'];
 }
 input(payload,f);await writeObject(f.urls.inputPut,payload);
 console.log(JSON.stringify({kind:'private-owner-review-summary',request_id:f.requestId,operation:f.operation,exactly_one_selected_target:f.operation==='retire',target_matches_selected_oid:f.operation==='retire',input_digest:hash(payload),signature_issued:false,retirement_authorized:false}));
}catch{console.error('RETENTION_PRIVATE_PREPARATION: FAIL');process.exitCode=1;}
finally{if(client)await client.end().catch(()=>{});}
