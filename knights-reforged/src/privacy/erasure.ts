import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {type Database,type Sql,transaction} from '../db.js';
import {privacySchema} from './gate.js';
import {privacyColumns} from './schema.js';
import {authenticate,permitContract,authorize,sha256,type SignedRecord,type ErasureIntent} from './authorization.js';
import {appendIntent,readJournal,type JournalState} from './journal.js';
const q=(name:string)=>'"'+name.replaceAll('"','""')+'"';
const deletedName='Deleted Warrior';
const tombstone=(account:string)=>'erased_'+account.replaceAll('-','').slice(0,16);
async function pinRelations(sql:Sql){const schema=(await sql.query('SELECT current_schema() AS schema')).rows[0]!.schema;assert.match(schema,/^[a-z_][a-z0-9_]*$/);await sql.query("SELECT set_config('search_path',$1,true)",[q(schema)+',pg_catalog,pg_temp']);}
// These are personal/social data, not balances or transaction/combat journals.
const deletes:Record<string,string>={
 sessions:'account_id=$2',trade_quotes:'account_id=$2',
  social_reports:'reporter_id=$1 OR message_id IN (SELECT id FROM realm_messages WHERE author_id=$1 OR profile_id=$1)',
 social_moderation:'character_id=$1 OR actor_id=$1 OR message_id IN (SELECT id FROM realm_messages WHERE author_id=$1 OR profile_id=$1)',
 social_mutes:'character_id=$1',social_blocks:'character_id=$1 OR blocked_id=$1',social_user_reports:'reporter_id=$1 OR target_id=$1',
 army_links:'low_id=$1 OR high_id=$1',army_invitation_codes:'character_id=$1',
 notification_reads:'character_id=$1 OR event_id IN (SELECT id FROM realm_messages WHERE author_id=$1 OR profile_id=$1) OR event_id IN (SELECT id FROM army_events WHERE actor_id=$1 OR target_id=$1)',
 realm_messages:'author_id=$1 OR profile_id=$1',army_events:'actor_id=$1 OR target_id=$1',
 competitive_attention_starts:'character_id=$1',army_attention_starts:'character_id=$1',notification_state:'character_id=$1',
 player_preferences:'character_id=$1',sound_preferences:'character_id=$1',tutorial_steps:'character_id=$1',tutorial_guides:'character_id=$1',
 community_policy_acceptances:'character_id=$1',content_policy_rejections:'character_id=$1',
 command_receipts:'account_id=$2',account_deletion_requests:'account_id=$2 AND id<>$3',
 authentication_limits:`key_hash IN (SELECT encode(sha256(convert_to(scope||':'||username,'UTF8')),'hex') FROM accounts WHERE id=$2)`
};
function expressions(table:string){
 let value='to_jsonb(t)',where='true';
 if(deletes[table])where=`NOT coalesce((${deletes[table]}),false)`;
 if(table==='accounts')value=`CASE WHEN id=$2 THEN to_jsonb(t)||jsonb_build_object('username',$4::text,'login_disabled',true) ELSE to_jsonb(t) END`;
 if(table==='champion_standings')value="CASE WHEN character_id=$1 THEN to_jsonb(t)||jsonb_build_object('eligible',false) ELSE to_jsonb(t) END";
 if(table==='characters')value=`CASE WHEN id=$1 THEN to_jsonb(t)||jsonb_build_object('name','Deleted Warrior') ELSE to_jsonb(t) END`;
 if(table==='account_deletion_requests')value=`CASE WHEN id=$3 THEN to_jsonb(t)||jsonb_build_object('status','completed','resolved_at',$5::timestamptz) ELSE to_jsonb(t) END`;
 if(table==='battles')value=`to_jsonb(t)||jsonb_build_object('snapshot',erase_account_identity_labels(snapshot,$1,$2,attacker_id=$1,defender_id=$1),'result',erase_account_identity_labels(result,$1,$2,attacker_id=$1,defender_id=$1))`;
 if(table==='command_receipts')value=`to_jsonb(t)||jsonb_build_object('result',${receiptRedaction()})`;
 return {value,where};
}
function receiptRedaction(){return `CASE WHEN result IS NULL THEN result ELSE
 CASE WHEN command_id IN(SELECT command_id FROM army_events WHERE actor_id=$1 OR target_id=$1)
  OR result->>'battleId' IN(SELECT id::text FROM battles WHERE attacker_id=$1 OR defender_id=$1)
  OR result#>>'{data,battle,attackerId}'=$1::text OR result#>>'{data,battle,defenderId}'=$1::text
 THEN erase_account_identity_labels(result,$1,$2)||jsonb_build_object('message','Action recorded.')
 ELSE erase_account_identity_labels(result,$1,$2) END END`;}
export async function assertReviewedSchema(sql:Sql){
 assert.ok(await privacySchema(sql),'Current privacy schema required.');
 const rows=(await sql.query(`SELECT c.relname AS table_name,a.attname AS column_name,t.typname AS udt_name,
 CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped JOIN pg_type t ON t.oid=a.atttypid
 WHERE n.nspname=current_schema() AND c.relkind IN ('r','p','m','f') ORDER BY c.relname,a.attnum`)).rows;
 const actual:Record<string,string[]>={};for(const r of rows)(actual[r.table_name]??=[]).push([r.column_name,r.udt_name,r.is_nullable].join(':'));
 assert.deepEqual(Object.fromEntries(Object.entries(actual).map(([k,v])=>[k,v.join('|')])),privacyColumns,'Unreviewed privacy schema; no erasure authorized.');
}
// Every full row is covered. Expected projection models ONLY approved personal
// removals. PostgreSQL hashes rows; Node receives 500 fixed-size digests at once,
// never whole historical battle payloads. Unchanged financial records must match.
async function witness(sql:Sql,params:unknown[],expected:boolean){
 const saved:Record<string,string>={};
 saved.credentials=(await sql.query('SELECT account_erasure_credentials_witness($1) AS witness',[params[1]])).rows[0]!.witness;
 for(const table of Object.keys(privacyColumns)){
  if(['account_erasures','account_erasure_checkpoints'].includes(table))continue;
  const {value,where}=expressions(table);
  const columns=(await sql.query(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid
   AND a.attnum=ANY(i.indkey) WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY array_position(i.indkey,a.attnum)`,[table])).rows.map(r=>q(r.attname));
  const digest=createHash('sha256');let count=0;
  await sql.query(`DECLARE erasure_rows NO SCROLL CURSOR FOR WITH erasure_types AS (SELECT $1::uuid AS character,$2::uuid AS account,$3::uuid AS request,$4::text AS tombstone,$5::timestamptz AS completed) SELECT sha256(convert_to((${expected?value:'to_jsonb(t)'})::text,'UTF8')) AS digest FROM ${table==='accounts'?"(SELECT id,username,created_at,login_disabled FROM accounts)":q(table)} t WHERE ${expected?where:'true'} ORDER BY ${columns.length?columns.join(','):'digest'}`,
   // PostgreSQL needs all parameter types even when this table uses a subset.
   // A CTE below supplies them without making any data available to Node.
   params);
  try{for(;;){const rows=(await sql.query('FETCH FORWARD 500 FROM erasure_rows')).rows;if(!rows.length)break;for(const row of rows){digest.update(row.digest);count++;}}}
  finally{await sql.query('CLOSE erasure_rows');}
  saved[table]=count+':'+digest.digest('hex');
 }
 return saved;
}
async function identity(sql:Sql){return (await sql.query(`SELECT current_database() AS name,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
 encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex') AS cluster`)).rows[0]!;}
async function preconditions(sql:Sql,intent:ErasureIntent,restore:boolean){
 const account=(await sql.query('SELECT a.id,c.id AS character_id,a.username FROM accounts a LEFT JOIN characters c ON c.account_id=a.id WHERE a.id=$1 FOR UPDATE OF a',[intent.accountId])).rows[0];
 if(!account){assert.ok(restore);assert.equal((await sql.query('SELECT 1 FROM characters WHERE id=$1',[intent.characterId])).rowCount,0);return false;}
 assert.ok(account.character_id===intent.characterId,'Stale account/character identity.');
 assert.equal((await sql.query('SELECT 1 FROM accounts WHERE username=$1 AND id<>$2',[tombstone(intent.accountId),intent.accountId])).rowCount,0,'Reserved erasure identity conflict.');
 const held=(await sql.query(`SELECT
 EXISTS(SELECT 1 FROM bounties WHERE (sponsor_id=$1 OR target_id=$1 OR claimant_id=$1) AND status='active') OR
 EXISTS(SELECT 1 FROM authorized_gold_grants WHERE account_id=$2) OR
 EXISTS(SELECT 1 FROM development_accounts WHERE account_id=$2) OR
 EXISTS(SELECT 1 FROM development_bots WHERE character_id=$1) OR
 EXISTS(SELECT 1 FROM hudson_equipment_grants WHERE account_id=$2) OR
 EXISTS(SELECT 1 FROM private_alpha_initializations WHERE dev_account_id=$2) AS held`,[intent.characterId,intent.accountId])).rows[0]!.held;
 assert.equal(held,false,'Escrow or immutable identifying-record hold; manual policy review required.');
 if(!restore)assert.equal((await sql.query("SELECT 1 FROM account_deletion_requests WHERE id=$1 AND account_id=$2 AND status='pending' FOR UPDATE",[intent.requestId,intent.accountId])).rowCount,1,'Authenticated pending deletion request required.');
 return true;
}
async function erase(sql:Sql,intent:ErasureIntent,policyId:string,intentDigest:string,sourceDigest:string,restore:boolean,execution:SignedRecord){
 const old=(await sql.query('SELECT * FROM account_erasures WHERE operation_id=$1 OR account_id=$2',[intent.operationId,intent.accountId])).rows;
 if(old.length){assert.equal(old.length,1);assert.equal(old[0]!.intent_sha256,intentDigest);assert.equal(old[0]!.operation_id,intent.operationId);await verifyErased(sql,intent,old[0]!.outcome);return old[0]!.outcome as string;}
 const exists=await preconditions(sql,intent,restore),now=new Date();
 if(exists){
  const params=[intent.characterId,intent.accountId,intent.requestId,tombstone(intent.accountId),now.toISOString()];
  const before=await witness(sql,params,true);
  await sql.query(`UPDATE command_receipts SET result=${receiptRedaction()} WHERE account_id<>$2 AND result IS DISTINCT FROM ${receiptRedaction()}`,params.slice(0,2));
  await sql.query(`UPDATE battles SET snapshot=erase_account_identity_labels(snapshot,$1,$2,attacker_id=$1,defender_id=$1),result=erase_account_identity_labels(result,$1,$2,attacker_id=$1,defender_id=$1) WHERE snapshot IS DISTINCT FROM erase_account_identity_labels(snapshot,$1,$2,attacker_id=$1,defender_id=$1) OR result IS DISTINCT FROM erase_account_identity_labels(result,$1,$2,attacker_id=$1,defender_id=$1)`,params.slice(0,2));
  for(const [table,predicate] of Object.entries(deletes)){
   // Keep dependent social/attention rows ahead of their parents. Accounts still
   // contain the original username here, so its rate-limit keys can be erased.
   await typedQuery(sql,`DELETE FROM ${q(table)} WHERE ${predicate}`,params);
  }
  await sql.query("UPDATE accounts SET username=$2,password_hash='!erased',login_disabled=true WHERE id=$1",[intent.accountId,tombstone(intent.accountId)]);
  await sql.query('UPDATE characters SET name=$2 WHERE id=$1',[intent.characterId,deletedName]);
  await sql.query("UPDATE account_deletion_requests SET status='completed',resolved_at=$2 WHERE id=$1 AND account_id=$3",[intent.requestId,now,intent.accountId]);
  const after=await witness(sql,params,false);for(const table of Object.keys(before))assert.ok(after[table]===before[table],'Erasure preservation mismatch: '+table);
 }
 const outcome=exists?'erased':'absent_in_restore';
 await sql.query(`INSERT INTO account_erasures(operation_id,account_id,character_id,request_id,intent_sha256,policy_id,source_scope_sha256,outcome,execution_proof) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[intent.operationId,intent.accountId,intent.characterId,intent.requestId,intentDigest,policyId,sourceDigest,outcome,execution]);
 await verifyErased(sql,intent,outcome);return outcome;
}
async function typedQuery(sql:Sql,statement:string,params:unknown[]){return sql.query(`WITH erasure_types AS (SELECT $1::uuid AS character,$2::uuid AS account,$3::uuid AS request,$4::text AS tombstone,$5::timestamptz AS completed) ${statement}`,params);}
export async function verifyErased(sql:Sql,intent:ErasureIntent,outcome:string){
 if(outcome==='absent_in_restore'){assert.equal((await sql.query('SELECT 1 FROM accounts WHERE id=$1 UNION ALL SELECT 1 FROM characters WHERE id=$2',[intent.accountId,intent.characterId])).rowCount,0);return;}
 const row=(await sql.query(`SELECT a.username,a.login_disabled,c.name,account_erasure_credentials_removed(a.id) AS credentials_removed FROM accounts a JOIN characters c ON c.account_id=a.id WHERE a.id=$1 AND c.id=$2`,[intent.accountId,intent.characterId])).rows[0];
 assert.ok(row);assert.equal(row.username,tombstone(intent.accountId));assert.equal(row.name,deletedName);assert.equal(row.login_disabled,true);assert.equal(row.credentials_removed,true);
 const params=[intent.characterId,intent.accountId,intent.requestId,tombstone(intent.accountId),new Date().toISOString()];
 for(const [table,predicate] of Object.entries(deletes))assert.equal((await typedQuery(sql,`SELECT 1 FROM ${q(table)} WHERE ${predicate} LIMIT 1`,params)).rowCount,0,'Personal data remains: '+table);
 assert.equal((await sql.query(`SELECT 1 FROM battles WHERE snapshot IS DISTINCT FROM erase_account_identity_labels(snapshot,$1,$2,attacker_id=$1,defender_id=$1)
 OR result IS DISTINCT FROM erase_account_identity_labels(result,$1,$2,attacker_id=$1,defender_id=$1) LIMIT 1`,[intent.characterId,intent.accountId])).rowCount,0,'Unreconciled battle labels.');
 assert.equal((await sql.query(`SELECT 1 FROM command_receipts WHERE result IS DISTINCT FROM ${receiptRedaction()} LIMIT 1`,[intent.characterId,intent.accountId])).rowCount,0,'Unreconciled receipt labels.');
}
export interface ErasureOptions {enabled:boolean;publicKey:string;policy:SignedRecord;intent:SignedRecord;permit:SignedRecord;journalPath:string;codeSha:string;candidateDigest:string;}
export async function fulfillErasure(db:Database,options:ErasureOptions){
 assert.equal(options.enabled,true,'Erasure execution is disabled.');
 const auth=authorize(options.policy,options.intent,options.permit,options.publicKey);assert.equal(auth.permit.codeSha,options.codeSha);assert.equal(auth.permit.candidateDigest,options.candidateDigest);
 return transaction(db,async sql=>{
  await sql.query("SET LOCAL statement_timeout='120s'; SET LOCAL transaction_timeout='300s'");await pinRelations(sql);await assertReviewedSchema(sql);
  const live=await identity(sql);assert.equal(live.name,auth.permit.targetDatabase);assert.equal(live.oid,auth.permit.targetOid);assert.equal(live.cluster,auth.permit.targetClusterDigest);
  const state=await readJournal(options.journalPath,options.publicKey);
  assert.equal(state.sequence,auth.permit.journalSequence);assert.equal(state.root,auth.permit.journalRoot);
  const already=state.entries.find(e=>e.intent.operationId===auth.intent.operationId);
  if(!already)await preconditions(sql,auth.intent,auth.permit.mode==='restore');
  authorize(options.policy,options.intent,options.permit,options.publicKey);
  const next=auth.permit.mode==='fulfill'?await appendIntent(options.journalPath,options.publicKey,options.intent,options.policy,options.permit,state):state;
  assert.ok(next.entries.some(e=>e.entry.intent.payload===options.intent.payload&&e.entry.intent.signature===options.intent.signature),'Restore must use a previously recorded permanent erasure intent.');
  const result=await erase(sql,auth.intent,auth.policy.policyId,auth.intentDigest,sha256(JSON.stringify(auth.intent.sourceScope)),auth.permit.mode==='restore',options.permit);
  await checkpoint(sql,next,sha256(JSON.stringify(auth.intent.sourceScope)),options.publicKey);authorize(options.policy,options.intent,options.permit,options.publicKey);return {result,sequence:next.sequence,journalDurable:true};
 },{expansionLock:'exclusive'});
}
function verifyReceiptApproval(receipt:Record<string,any>,entry:JournalState['entries'][number],publicKey:string){
 const {intent}=entry,execution=authenticate(receipt.execution_proof,publicKey,permitContract);
 assert.ok(receipt.operation_id===intent.operationId&&receipt.intent_sha256===sha256(entry.entry.intent.payload)&&receipt.account_id===intent.accountId&&receipt.character_id===intent.characterId&&receipt.request_id===intent.requestId&&receipt.source_scope_sha256===sha256(JSON.stringify(intent.sourceScope)),'Erasure receipt binding mismatch.');
 assert.equal(receipt.policy_id,JSON.parse(Buffer.from(entry.entry.policy.payload,'base64url').toString('utf8')).policyId);
 assert.ok(execution.operationId===intent.operationId&&execution.intentDigest===sha256(entry.entry.intent.payload)&&execution.policyDigest===intent.policyDigest,'Execution approval binding mismatch.');
 const issued=Date.parse(execution.issuedAt),expires=Date.parse(execution.expiresAt);
 assert.ok(expires>issued&&expires-issued<=900000&&+receipt.completed_at>=issued-30000&&+receipt.completed_at<=expires,'Execution approval time mismatch.');
 assert.ok(Date.parse(execution.recoveryVerifiedAt)<=issued+30000&&issued-Date.parse(execution.recoveryVerifiedAt)<=7200000);
 if(execution.mode==='fulfill'){assert.equal(execution.targetDatabase,intent.sourceScope.database);assert.equal(execution.targetClusterDigest,intent.sourceScope.clusterDigest);assert.equal(receipt.outcome,'erased');}
}
async function checkpoint(sql:Sql,state:JournalState,scope:string,publicKey:string){
 // Only checkpoint a journal head after ALL its intents are verified here.
 for(const entry of state.entries){
  const receipt=(await sql.query('SELECT * FROM account_erasures WHERE operation_id=$1',[entry.intent.operationId])).rows[0];
  if(!receipt)return; // A multi-intent old restore remains fenced until complete.
  verifyReceiptApproval(receipt,entry,publicKey);await verifyErased(sql,entry.intent,receipt.outcome);
 }
 const old=(await sql.query('SELECT root_sha256 FROM account_erasure_checkpoints WHERE sequence=$1',[state.sequence])).rows[0];
 if(old)assert.equal(old.root_sha256,state.root);else await sql.query('INSERT INTO account_erasure_checkpoints(sequence,root_sha256,source_scope_sha256) VALUES($1,$2,$3)',[state.sequence,state.root,scope]);
}
export async function assertErasureFence(db:Database,options:{required:boolean;journalPath?:string;publicKey?:string}){
 try{
 const installed=await privacySchema(db);const hasRecords=installed&&!!(await db.query('SELECT 1 FROM account_erasures LIMIT 1')).rowCount;
 if(!options.required&&!hasRecords)return;
 assert.ok(installed&&options.required&&options.journalPath&&options.publicKey,'Erasure reconciliation is required before startup.');
 const state=await readJournal(options.journalPath,options.publicKey);
 await transaction(db,async sql=>{
  await sql.query("SET LOCAL statement_timeout='120s'; SET LOCAL transaction_timeout='300s'");await pinRelations(sql);
  const receipts=(await sql.query('SELECT * FROM account_erasures')).rows;
  assert.equal(receipts.length,state.entries.length,'Unreconciled restored account data.');
  for(const entry of state.entries){
   const receipt=receipts.find(r=>r.operation_id===entry.intent.operationId);assert.ok(receipt);
   verifyReceiptApproval(receipt,entry,options.publicKey!);await verifyErased(sql,entry.intent,receipt.outcome);
  }
  if(state.sequence){const mark=(await sql.query('SELECT root_sha256 FROM account_erasure_checkpoints WHERE sequence=$1',[state.sequence])).rows[0];assert.equal(mark?.root_sha256,state.root,'Journal checkpoint mismatch.');}
 },{expansionLock:'exclusive'});
 }catch{throw new Error('Account erasure reconciliation failed; startup/promotion is blocked.');}
}
