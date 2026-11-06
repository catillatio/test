import assert from 'node:assert/strict';
import {type Database,type Sql,transaction} from '../db.js';
import {alpha} from '../alpha-rules.js';
import {expandedContent,contentCatalog} from '../expansion-content.js';
import {type SignedRecord} from './authorization.js';
import {graveyardWorld,graveyardDefinitionDigest,graveyardTemplate,replenishmentSlots} from './graveyard-roster.js';
import {authorizeConstruction,authenticateConstruction} from './graveyard-authorization.js';
import {assertReviewedColumns} from './reviewed-schema.js';
import type {z} from 'zod';
import {scopeContract} from './authorization.js';
import {privacySchema} from './gate.js';
const publicDefinitions={world:graveyardWorld,catalogs:{[alpha.id]:alpha,[expandedContent.id]:expandedContent}};
async function pin(sql:Sql){const schema=(await sql.query('SELECT current_schema() AS schema')).rows[0]!.schema;assert.match(schema,/^[a-z_][a-z0-9_]*$/);await sql.query("SELECT set_config('search_path',$1,true)",[schema+',pg_catalog,pg_temp']);}
async function liveIdentity(sql:Sql){return (await sql.query(`SELECT current_database() AS name,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
 encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex') AS cluster`)).rows[0]!;}
export async function graveyardCapacity(sql:Sql){return (await sql.query('SELECT graveyard_snapshot($1::jsonb) AS state',[JSON.stringify(publicDefinitions)])).rows[0]!.state as Record<string,any>;}
async function readOperation(sql:Sql,operation:string){return (await sql.query('SELECT read_graveyard_operation($1) AS state',[operation])).rows[0]!.state as {receipt:Record<string,any>;entities:Record<string,any>[]} | null;}
function verifyInitialRoster(state:NonNullable<Awaited<ReturnType<typeof readOperation>>>,catalogId:string){
 const catalog=contentCatalog(catalogId);assert.equal(state.entities.length,state.receipt.slots.length);
 assert.equal(new Set(state.entities.map(e=>e.character.id)).size,state.receipt.slots.length);
 for(let index=0;index<state.receipt.slots.length;index++){
  const slot=state.receipt.slots[index],t=graveyardTemplate(catalogId,slot),e=state.entities[index]!,c=e.character,k=e.registry;
  assert.equal(k.slot,slot);assert.equal(k.template_id,t.id);assert.equal(k.garrison,t.garrison);assert.equal(k.operation_id,state.receipt.id);
  assert.equal(k.policy_version,graveyardWorld.id);assert.equal(c.id,state.receipt.members[index]);assert.equal(c.account_id,null);assert.equal(c.name,'Abandoned Kingdom');
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
  await assertGraveyardReceipts(sql,options.publicKey,v.scope);
  const old=await readOperation(sql,v.operationId);
  if(old){assert.deepEqual(old.receipt.approval_record,options.permit);assert.deepEqual(old.receipt.policy_record,options.policy);assert.equal(old.entities.length,v.slots.length);return {result:'already_recorded',count:v.slots.length};}
  const state=await graveyardCapacity(sql);
  assert.equal(state.installed,true);assert.equal(state.definitions_match,true);
  assert.equal(state.catalog_id,v.catalogId);assert.equal(state.world_count,v.expectedPopulation);assert.equal(state.operation_count,v.expectedOperationCount);
  assert.deepEqual(v.slots,replenishmentSlots(state.occupied_slots,approval.policy.targetPopulation,approval.policy.maximumNewPerOperation),'Exact vacant-slot plan required.');
  authorizeConstruction(options.policy,options.permit,options.publicKey);
  await sql.query('SELECT construct_public_graveyard($1,$2,$3,$4,$5,$6,$7,$8,$9)',[v.operationId,JSON.stringify(publicDefinitions),approval.policy,v.slots,state.world_count,state.operation_count,graveyardDefinitionDigest(),options.policy,options.permit]);
  const created=await readOperation(sql,v.operationId);assert.ok(created);verifyInitialRoster(created,state.catalog_id);
  authorizeConstruction(options.policy,options.permit,options.publicKey);
  return {result:'constructed',count:v.slots.length};
 },{expansionLock:'exclusive'});
}
// Permanent population evidence is verified without erasure history or a personal key.
export async function assertGraveyardReceipts(sql:Sql,key:string,scope?:z.infer<typeof scopeContract>){
 const summary=await graveyardCapacity(sql),operations=summary.operations as Record<string,any>[];let population=0;const occupied:number[]=[];
 assert.equal(summary.installed,true);assert.equal(summary.definitions_match,true);assert.equal(summary.operation_count,operations.length);
 for(let index=0;index<operations.length;index++){
  const b=operations[index]!,a=authenticateConstruction(b.policy_record,b.approval_record,key),v=a.permit;
  scope??=v.scope;assert.deepEqual(v.scope,scope);
  assert.equal(b.id,v.operationId);assert.equal(b.catalog_id,v.catalogId);assert.equal(b.definition_digest,v.definitionDigest);
  assert.equal(b.previous_operations,index);assert.equal(v.expectedOperationCount,index);
  assert.equal(b.population_before,population);assert.equal(v.expectedPopulation,population);assert.deepEqual(b.slots,v.slots);
  assert.deepEqual(v.slots,replenishmentSlots(occupied,a.policy.targetPopulation,a.policy.maximumNewPerOperation));
  const created=Date.parse(b.created_at);assert.ok(created>=Date.parse(v.issuedAt)-30000&&created<=Date.parse(v.expiresAt));
  const record=await readOperation(sql,b.id);assert.ok(record);assert.equal(record.entities.length,b.slots.length);assert.equal(b.members.length,b.slots.length);
  for(let i=0;i<b.slots.length;i++){
   const slot:number=b.slots[i]!;const e:Record<string,any>=record.entities[i]!,t=graveyardTemplate(b.catalog_id,slot);
   assert.equal(e.registry.operation_id,b.id);assert.equal(e.registry.slot,slot);assert.equal(e.registry.policy_version,graveyardWorld.id);
   assert.equal(e.registry.template_id,t.id);assert.equal(e.registry.garrison,t.garrison);
   assert.equal(e.character.id,b.members[i]);assert.equal(e.character.account_id,null);assert.equal(e.character.name,'Abandoned Kingdom');
   assert.deepEqual(e.progression,t.progression??null);assert.equal(e.character.attained_level,t.level);assert.equal(e.character.max_health,t.health);
   assert.equal(e.character.profile_class,t.calling);assert.equal(e.character.attack_training,t.attackTraining);assert.equal(e.character.defense_training,t.defenseTraining);
  }
  occupied.push(...b.slots);population+=b.slots.length;assert.equal(new Set(occupied).size,population);
 }
 assert.equal(summary.world_count,population,'Incomplete or unreceipted population.');assert.deepEqual(summary.occupied_slots,occupied.sort((a,b)=>a-b));
}
export async function assertGraveyardFence(db:Database,options:{publicKey?:string}){
 try{
  if(!await privacySchema(db))return;
  const state=await graveyardCapacity(db);if(!state.world_count&&!state.operation_count)return;
  assert.ok(options.publicKey,'Independent population verification key required.');
  await transaction(db,async sql=>{await sql.query("SET LOCAL statement_timeout='120s';SET LOCAL transaction_timeout='300s'");await pin(sql);await assertReviewedColumns(sql);await assertGraveyardReceipts(sql,options.publicKey!);},{expansionLock:'exclusive'});
 }catch{throw new Error('World population reconciliation failed; startup/promotion is blocked.');}
}
