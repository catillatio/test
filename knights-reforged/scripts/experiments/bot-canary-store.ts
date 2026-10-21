// Disposable-copy test implementation ONLY. No CLI, runtime imports, public
// endpoint, signing keys, Railway operations or production execution capability.
import {randomUUID} from 'node:crypto';
import {type Database,type Sql,transaction} from '../../src/db.js';
import {lockCharacters,clock} from '../../src/game.js';
import {purchaseItems,readInventory} from '../../src/inventory.js';
import {maintenanceAccount,fundMaintenance} from '../../src/maintenance.js';
import {alpha} from '../../src/alpha-rules.js';
import {readFixtureBot} from './bot-calibration-store.js';
import {fingerprint} from './bot-calibration-model.js';
import {canary,digest,verifyManifest,planCanary,slotKey,type CanaryManifest} from './bot-canary-model.js';

export interface CanaryTestConsent {mode:'test';allowLocalExperiment:true;databaseUrl:string;manifestDigest:string;}
const kind='bot_canary_disposable_test';
function localTarget(p:CanaryTestConsent){
  if(p?.mode!=='test'||p?.allowLocalExperiment!==true||process.env.NODE_ENV==='production')throw new Error('Explicit local test consent required');
  let url:URL;try{url=new URL(p.databaseUrl);}catch{throw new Error('Local disposable database required');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^\/[a-z0-9_]+_test$/.test(url.pathname))throw new Error('Local disposable database required');
  return url;
}
async function guard(sql:Sql,p:CanaryTestConsent){
  const url=localTarget(p),r=(await sql.query('SELECT current_database() AS db,current_schema() AS schema')).rows[0]!;
  if('/'+r.db!==url.pathname||!/^fixture_[a-f0-9]{32}$/.test(r.schema))throw new Error('Isolated disposable schema required');
}
export async function readCanaryState(sql:Sql,id:string){
  const s=await readFixtureBot(sql,id);
  const m=(await sql.query('SELECT hourly_rate,remainder FROM maintenance_accounts WHERE character_id=$1',[id])).rows[0]!;
  const lots=(await sql.query('SELECT * FROM inventory_lots WHERE character_id=$1 ORDER BY id',[id])).rows;
  const land=(await sql.query('SELECT * FROM land_holdings WHERE character_id=$1 ORDER BY id',[id])).rows;
  return {...s,maintenanceRate:m.hourly_rate,maintenanceRemainder:String(m.remainder),paidLotsDigest:digest(lots),landDigest:digest(land)};
}
export async function inspectCanary(db:Database,id:string,p:CanaryTestConsent){
  localTarget(p);return transaction(db,async sql=>{await sql.query('SET TRANSACTION READ ONLY');await guard(sql,p);return readCanaryState(sql,id);});
}
export async function applyTestCanary(db:Database,p:CanaryTestConsent,m:CanaryManifest,id:string,commandId:string){
  const permission={...p},packet=structuredClone(m);
  localTarget(permission);verifyManifest(packet,permission.manifestDigest);
  const entry=packet.entries.find(e=>e.botId===id);
  if(!entry||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(commandId))throw new Error('Exact selected target and command identity required');
  return transaction(db,async sql=>{
    await guard(sql,permission);await lockCharacters(sql,[id]);
    const before=await readCanaryState(sql,id),intentHash=digest(entry);
    if(before.accountId!==entry.accountId||slotKey(before)!==entry.slot)throw new Error('Selected immutable identity mismatch');
    const receipt=(await sql.query(`SELECT kind,intent_hash,result FROM command_receipts WHERE account_id=$1
      AND (command_id=$2 OR (kind=$3 AND result->>'policy'=$4))
      ORDER BY (command_id=$2) DESC,created_at,command_id LIMIT 1`,[before.accountId,commandId,kind,canary.id])).rows[0];
    if(receipt){if(receipt.kind!==kind||receipt.intent_hash!==intentHash||receipt.result?.policy!==canary.id)throw new Error('Conflicting canary intent');return receipt.result;}
    const now=await clock(sql);
    if(+now<+new Date(packet.createdAt)||+now>=+new Date(packet.expiresAt))throw new Error('Reviewed canary quote expired or premature');
    if(fingerprint(before)!==entry.plan.snapshotHash||digest(planCanary(before))!==digest(entry.plan))throw new Error('Stale or changed canary plan');
    const plan=entry.plan;
    if(plan.status==='control')return {policy:canary.id,status:'unchanged-control',botId:id};
    if(+new Date(before.settledAt)!==+now||+new Date(before.nextPaymentAt)<=+now||before.paused||before.arrears||before.maintenanceRate!==plan.oldRate)throw new Error('Ordinary finances require settlement and a new reviewed quote');
    const child=randomUUID(),buy=plan.purchases[0]!;
    const paid=await purchaseItems(sql,id,before.level,{[buy.itemId]:buy.quantity},child,now);
    if(plan.purchases.length!==1||paid.cost!==plan.cost)throw new Error('Purchase differs from reviewed scope');
    // Existing credit remains reserved. Never call the surplus-credit refund
    // helper, sell equipment, allocate points, or add members in this experiment.
    const oldMaintenance=await maintenanceAccount(sql,id,now);
    const rate=(await readInventory(sql,id)).reduce((n,i)=>n+i.quantity*i.upkeep,0);
    await sql.query('UPDATE maintenance_accounts SET hourly_rate=$2 WHERE character_id=$1',[id,rate]);
    await fundMaintenance(sql,id,commandId,now);
    const maintenance=await maintenanceAccount(sql,id,now);
    if(rate!==oldMaintenance.hourly_rate)await sql.query(`INSERT INTO maintenance_rate_events
      (id,character_id,previous_rate,hourly_rate,paused_after,reserve_after,ruleset_id,command_id,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),id,oldMaintenance.hourly_rate,rate,maintenance.paused,maintenance.reserve_gold,alpha.id,commandId,now]);
    await sql.query('UPDATE characters SET state_version=state_version+1 WHERE id=$1',[id]);
    const after=await readCanaryState(sql,id),expected=entry.after;
    for(const k of['gold','reserve','vault','militia','legacyFloor','attackTraining','defenseTraining','skillPoints','grossIncome','propertyUpkeep'] as const)if(after[k]!==expected[k])throw new Error('Post-purchase state mismatch');
    if(after.inventory.length!==expected.inventory.length||after.inventory.some(i=>i.quantity!==expected.inventory.find(e=>e.itemId===i.itemId)?.quantity)||after.maintenanceRate!==plan.newRate||after.maintenanceRemainder!==before.maintenanceRemainder||after.landDigest!==before.landDigest)throw new Error('Post-purchase holdings mismatch');
    const result={policy:canary.id,status:'applied-to-disposable-copy',botId:id,commandId,manifestDigest:permission.manifestDigest,before,after,plan,childCommandId:child};
    await sql.query('INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,$3,$4,$5)',[before.accountId,commandId,kind,intentHash,result]);
    return result;
  });
}
