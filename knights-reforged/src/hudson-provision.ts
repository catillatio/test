import {transaction,type Database,type Sql} from './db.js';import {realmPolicy} from './realm-policy.js';
import {hudsonGrant,definitionDigest} from './expansion-content.js';import {expansionTarget} from './expansion-activation.js';
import {acquireQuestEquipment} from './equipment-acquisition.js';import {clock,materialize,type CharacterRow} from './game.js';import {refreshMaintenance} from './maintenance.js';
import type {RecoveryReference} from './rarity-activation.js';
export interface HudsonPlan {kind:'hudson-equipment-grant';operationId:string;characterId:string;accountId:string;username:string;name:string;target:Awaited<ReturnType<typeof expansionTarget>>;manifestDigest:string;createdAt:string;expiresAt:string;recovery?:RecoveryReference;}
async function target(sql:Sql){const c=(await sql.query<CharacterRow&{username:string;login_disabled:boolean;bot:boolean}>(`SELECT c.*,a.username,a.login_disabled,EXISTS(SELECT 1 FROM development_bots b WHERE b.character_id=c.id) AS bot FROM characters c JOIN accounts a ON a.id=c.account_id WHERE c.id=$1 FOR UPDATE OF c`,[hudsonGrant.characterId])).rows[0];if(!c||c.bot||c.login_disabled)throw new Error('Exact human grant target unavailable.');return c;}
export async function inspectHudson(db:Database):Promise<HudsonPlan>{return transaction(db,async sql=>{const c=await target(sql),now=await clock(sql);return {kind:'hudson-equipment-grant',operationId:hudsonGrant.operationId,characterId:c.id,accountId:c.account_id,username:c.username,name:c.name,target:await expansionTarget(sql),manifestDigest:definitionDigest(hudsonGrant),createdAt:now.toISOString(),expiresAt:new Date(+now+3600000).toISOString()};});}
export async function provisionHudson(db:Database,plan:HudsonPlan,approvedDigest:string){
 if(approvedDigest!==definitionDigest(plan)||plan.kind!=='hudson-equipment-grant'||plan.characterId!==hudsonGrant.characterId||plan.operationId!==hudsonGrant.operationId||plan.manifestDigest!==definitionDigest(hudsonGrant))throw new Error('Exact approved Hudson manifest required.');
 return transaction(db,async sql=>{
  const c=await target(sql),now=await clock(sql);
  if(c.account_id!==plan.accountId||c.username!==plan.username||c.name!==plan.name||definitionDigest(await expansionTarget(sql))!==definitionDigest(plan.target))throw new Error('Hudson account binding changed.');
  const old=(await sql.query('SELECT * FROM hudson_equipment_grants WHERE id=$1 OR manifest_id=$2',[hudsonGrant.operationId,hudsonGrant.id])).rows[0];
  if(old){
   if(old.id!==hudsonGrant.operationId||old.account_id!==plan.accountId||old.manifest_digest!==plan.manifestDigest||old.approval_digest!==approvedDigest)throw new Error('Conflicting grant receipt.');
   const lots=(await sql.query(`SELECT e.item_id,e.quantity,e.unit_cost,l.acquired_quantity,l.unit_cost AS paid FROM inventory_acquisition_events e JOIN inventory_lots l ON l.id=e.lot_id WHERE e.character_id=$1 AND e.source_kind='hudson_grant' AND e.source_id=$2`,[c.id,hudsonGrant.operationId])).rows;
   const ent=(await sql.query('SELECT item_id,grant_id FROM equipment_upkeep_entitlements WHERE character_id=$1',[c.id])).rows;
   if(lots.length!==3||ent.length!==3||hudsonGrant.items.some(i=>!lots.some(l=>l.item_id===i.itemId&&l.quantity===i.quantity&&l.acquired_quantity===i.quantity&&l.unit_cost===0&&l.paid===0)||!ent.some(e=>e.item_id===i.itemId&&e.grant_id===hudsonGrant.operationId)))throw new Error('Partial or inconsistent grant evidence.');
   return {...old.result,replayed:true};
  }
  if(!Number.isFinite(Date.parse(plan.createdAt))||!Number.isFinite(Date.parse(plan.expiresAt))||Date.parse(plan.createdAt)>+now||Date.parse(plan.expiresAt)<=+now||Date.parse(plan.expiresAt)-Date.parse(plan.createdAt)!==3600000)throw new Error('Hudson approval expired.');
  if(!(await realmPolicy(sql)).expanded)throw new Error('Expansion must be independently authorized first.');
  if((await sql.query(`SELECT 1 FROM inventory_acquisition_events WHERE source_kind='hudson_grant' OR EXISTS(SELECT 1 FROM equipment_upkeep_entitlements WHERE character_id=$1) LIMIT 1`,[c.id])).rows.length)throw new Error('Unexpected partial Hudson grant.');
  // Settle old liabilities at the old rate before the entitlement takes effect.
  await materialize(sql,c,now);
  const result={operationId:hudsonGrant.operationId,characterId:c.id,items:hudsonGrant.items,effectiveAt:now.toISOString()};
  await sql.query('INSERT INTO hudson_equipment_grants(id,manifest_id,manifest_digest,approval_digest,character_id,account_id,result) VALUES($1,$2,$3,$4,$5,$6,$7)',[hudsonGrant.operationId,hudsonGrant.id,plan.manifestDigest,approvedDigest,c.id,c.account_id,result]);
  for(const i of hudsonGrant.items){if(!await acquireQuestEquipment(sql,c.id,i.itemId,i.quantity,'hudson_grant',hudsonGrant.operationId,hudsonGrant.operationId,now))throw new Error('Hudson inventory capacity exceeded.');await sql.query('INSERT INTO equipment_upkeep_entitlements(character_id,item_id,grant_id,effective_at) VALUES($1,$2,$3,$4)',[c.id,i.itemId,hudsonGrant.operationId,now]);}
  await refreshMaintenance(sql,c.id,hudsonGrant.operationId,now);
  await sql.query('INSERT INTO realm_expansion_events(id,kind,manifest_id,approval_digest,details) VALUES($1,\'hudson_grant\',$2,$3,$4)',[hudsonGrant.operationId,hudsonGrant.id,approvedDigest,result]);
  return {...result,replayed:false};
 });
}
