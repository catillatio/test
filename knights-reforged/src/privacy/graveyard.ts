import assert from 'node:assert/strict';
import {type Database,type Sql,transaction} from '../db.js';
import {alpha} from '../alpha-rules.js';
import {expandedContent,contentCatalog} from '../expansion-content.js';
import {sha256,type SignedRecord} from './authorization.js';
import {graveyardWorld,graveyardRoster,graveyardDefinitionDigest} from './graveyard-roster.js';
import {authorizeConstruction,authenticateConstruction} from './graveyard-authorization.js';
import {assertReviewedColumns} from './reviewed-schema.js';
import type {ErasurePolicy} from './authorization.js';
const publicDefinitions={world:graveyardWorld,catalogs:{[alpha.id]:alpha,[expandedContent.id]:expandedContent}};
async function pin(sql:Sql){const schema=(await sql.query('SELECT current_schema() AS schema')).rows[0]!.schema;assert.match(schema,/^[a-z_][a-z0-9_]*$/);await sql.query("SELECT set_config('search_path',$1,true)",[schema+',pg_catalog,pg_temp']);}
async function liveIdentity(sql:Sql){return (await sql.query(`SELECT current_database() AS name,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
 encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex') AS cluster`)).rows[0]!;}
export async function graveyardCapacity(sql:Sql){return (await sql.query('SELECT graveyard_snapshot($1::jsonb) AS state',[JSON.stringify(publicDefinitions)])).rows[0]!.state as Record<string,any>;}
async function readBatch(sql:Sql,batch:string){return (await sql.query('SELECT read_graveyard_batch($1) AS state',[batch])).rows[0]!.state as {receipt:Record<string,any>;entities:Record<string,any>[]} | null;}
function verifyInitialRoster(state:NonNullable<Awaited<ReturnType<typeof readBatch>>>,catalogId:string){
 const roster=graveyardRoster(catalogId),catalog=contentCatalog(catalogId);assert.equal(state.entities.length,24);
 assert.equal(new Set(state.entities.map(e=>e.character.id)).size,24);
 for(let slot=0;slot<roster.length;slot++){
  const t=roster[slot]!,e=state.entities[slot]!,c=e.character,k=e.registry;
  assert.equal(k.slot,slot);assert.equal(k.template_id,t.id);assert.equal(k.garrison,t.garrison);assert.equal(k.batch_id,state.receipt.id);
  assert.equal(k.policy_version,graveyardWorld.id);assert.equal(c.id,state.receipt.members[slot]);assert.equal(c.account_id,null);assert.equal(c.name,'Abandoned Kingdom');
  assert.equal(c.attained_level,t.level);assert.equal(c.max_health,t.health);assert.equal(c.health,t.health);assert.equal(c.profile_class,t.calling);
  assert.equal(c.attack_training,t.attackTraining);assert.equal(c.defense_training,t.defenseTraining);
  for(const field of ['xp','level_xp','skill_points'])assert.equal(c[field],0);
  assert.equal(c.legacy_army_floor,1);assert.equal(c.calling_changed_at,null);assert.equal(c.state_version,1);
  assert.deepEqual(e.progression,t.progression??null);
  assert.equal(e.wallet,0);assert.equal(e.vault,0);assert.equal(e.pending,'0');assert.equal(e.personal_history_absent,true);
  for(const field of ['health_updated_at','energy_updated_at','mana_updated_at','spirit_updated_at','attack_ready_at'])assert.equal(Date.parse(c[field]),Date.parse(c.created_at));
  assert.equal(Date.parse(e.next_payment),Date.parse(c.created_at)+3600000);assert.equal(Date.parse(c.created_at),Date.parse(state.receipt.created_at));
  assert.deepEqual(e.inventory.map((i:any)=>[i.item_definition_id,i.quantity,i.ruleset_id]).sort(),t.equipment.map(i=>[i.itemId,i.quantity,catalogId]).sort());
  assert.equal(e.land.length,1);const p=catalog.properties.find(p=>p.id===t.property.id)!,h=e.land[0];
  assert.equal(h.property_id,p.id);assert.equal(h.quantity,t.property.quantity);assert.equal(h.original_quantity,t.property.quantity);
  assert.equal(h.unit_price,p.price);assert.equal(h.hourly_income,p.hourlyIncome);assert.equal(h.hourly_upkeep,p.hourlyUpkeep);
  assert.equal(Number(h.income_remainder),0);assert.equal(Number(h.upkeep_remainder),0);assert.equal(h.ruleset_id,catalogId);
  assert.equal(Date.parse(h.acquired_at),Date.parse(c.created_at));assert.equal(Date.parse(h.accrued_through),Date.parse(c.created_at));
 }
}
export interface ConstructionOptions {enabled:boolean;publicKey:string;policy:SignedRecord;permit:SignedRecord;codeSha:string;candidateDigest:string;}
export async function constructGraveyard(db:Database,options:ConstructionOptions){
 assert.equal(options.enabled,true,'Graveyard construction is disabled.');
 const approval=authorizeConstruction(options.policy,options.permit,options.publicKey),v=approval.permit;
 assert.equal(v.codeSha,options.codeSha);assert.equal(v.candidateDigest,options.candidateDigest);
 let entered=false;
 return transaction(db,async sql=>{
  assert.equal(entered,false,'No automatic construction retry.');entered=true;
  await sql.query("SET LOCAL statement_timeout='120s';SET LOCAL transaction_timeout='300s'");await pin(sql);await assertReviewedColumns(sql);
  const live=await liveIdentity(sql);assert.equal(live.name,v.targetDatabase);assert.equal(live.oid,v.targetOid);assert.equal(live.cluster,v.targetClusterDigest);
  await assertGraveyardReceipts(sql,options.publicKey,v.sourceScope);
  const old=await readBatch(sql,v.batchId);
  if(old){assert.deepEqual(old.receipt.approval_record,options.permit);assert.deepEqual(old.receipt.policy_record,options.policy);assert.equal(old.entities.length,24);return {result:'already_recorded',count:24};}
  const state=await graveyardCapacity(sql);
  assert.equal(state.installed,true);assert.equal(state.definitions_match,true);assert.equal(state.single_scope,true);
  if(state.receipt_count)assert.equal(state.scope_digest,sha256(JSON.stringify(v.sourceScope)));assert.equal(state.receipt_count,v.expectedErasureCount);
  assert.equal(state.checkpoint_complete,true);
  assert.equal(state.catalog_id,v.catalogId);assert.equal(state.mature_count,v.expectedMatureDeletions);assert.equal(state.batch_count,v.expectedBatchCount);
  assert.equal(Date.parse(state.credit_cutoff),Date.parse(v.creditCutoff));
  assert.ok(state.mature_count>=24,'Insufficient mature cohort; no singleton fallback.');
  authorizeConstruction(options.policy,options.permit,options.publicKey);
  await sql.query('SELECT construct_public_graveyard($1,$2,$3,$4,$5,$6,$7,$8,$9)',[v.batchId,JSON.stringify(publicDefinitions),state.mature_count,state.batch_count,v.expectedErasureCount,v.creditCutoff,graveyardDefinitionDigest(),options.policy,options.permit]);
  const created=await readBatch(sql,v.batchId);assert.ok(created);verifyInitialRoster(created,state.catalog_id);
  authorizeConstruction(options.policy,options.permit,options.publicKey);
  return {result:'constructed',count:24};
 },{expansionLock:'exclusive'});
}
// Permanent receipt verification is separate from fresh execution authorization.
// It runs alongside the original personal-data/restore fence, not instead of it.
export async function assertGraveyardReceipts(sql:Sql,key:string,scope?:ErasurePolicy['scope']){
 const summary=await graveyardCapacity(sql),batches=summary.batches as Record<string,any>[];let previousCutoff=-Infinity,previousCarry=0;
 assert.equal(summary.installed,true);assert.equal(summary.definitions_match,true);assert.equal(summary.batch_count,batches.length);
 for(let index=0;index<batches.length;index++){
  const b=batches[index]!,a=authenticateConstruction(b.policy_record,b.approval_record,key),v=a.permit;
  assert.equal(b.id,v.batchId);assert.equal(b.catalog_id,v.catalogId);assert.equal(b.definition_digest,v.definitionDigest);assert.equal(Number(b.previous_batches),index);
  assert.equal(Number(b.mature_count),v.expectedMatureDeletions);assert.equal(Number(b.previous_batches),v.expectedBatchCount);
  assert.equal(Number(b.erasure_count),v.expectedErasureCount);
  if(scope)assert.deepEqual(v.sourceScope,scope);
  assert.equal(Date.parse(b.credit_cutoff),Date.parse(v.creditCutoff));assert.ok(Date.parse(v.creditCutoff)>=previousCutoff);
  assert.equal(Number(b.carry_after),Number(b.mature_count)-24);assert.ok(Number(b.mature_count)>=Math.max(24,previousCarry));
  if(Date.parse(v.creditCutoff)===previousCutoff)assert.equal(Number(b.mature_count),previousCarry,'The same closed days cannot be credited twice');
  previousCutoff=Date.parse(v.creditCutoff);previousCarry=Number(b.carry_after);
  const created=Date.parse(b.created_at);assert.ok(created>=Date.parse(v.issuedAt)-30000&&created<=Date.parse(v.expiresAt));
  assert.ok(Date.parse(v.creditCutoff)<=Date.parse(new Date(created).toISOString().slice(0,10)+'T00:00:00.000Z')-7*86400000,'Admission used a recent completion');
  const record=await readBatch(sql,b.id);assert.ok(record);assert.equal(record.entities.length,24);
  const roster=graveyardRoster(b.catalog_id);
  for(let slot=0;slot<24;slot++){
   const e:Record<string,any>=record.entities[slot]!,t=roster[slot]!;
   assert.equal(e.registry.batch_id,b.id);assert.equal(e.registry.slot,slot);assert.equal(e.registry.policy_version,graveyardWorld.id);
   assert.equal(e.registry.template_id,t.id);assert.equal(e.registry.garrison,t.garrison);
   assert.equal(e.character.id,b.members[slot]);assert.equal(e.character.account_id,null);assert.equal(e.character.name,'Abandoned Kingdom');
   assert.deepEqual(e.progression,t.progression??null);
   assert.equal(e.character.attained_level,t.level);assert.equal(e.character.max_health,t.health);assert.equal(e.character.profile_class,t.calling);
   assert.equal(e.character.attack_training,t.attackTraining);assert.equal(e.character.defense_training,t.defenseTraining);
  }
 }
 assert.equal(summary.world_count,batches.length*24,'Incomplete or unreceipted graveyard roster.');
}
