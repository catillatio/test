// LOCAL DISPOSABLE-COPY PROTOTYPE ONLY. No CLI, endpoint, startup import or
// production activation. Existing game transactions are exercised unchanged.
import {createHash,randomUUID} from 'node:crypto';
import {type Database,type Sql,transaction} from '../../src/db.js';
import {alpha} from '../../src/alpha-rules.js';
import {lockCharacters,clock} from '../../src/game.js';
import {readInventory,purchaseItems,sellItem} from '../../src/inventory.js';
import {maintenanceAccount,fundMaintenance} from '../../src/maintenance.js';
import {allocateSkill} from '../../src/progression.js';
import {candidate,planCalibration,fingerprint,type BotSnapshot,type CalibrationPlan} from './bot-calibration-model.js';
export interface FixturePermission {mode:'test';allowLocalExperiment:true;databaseUrl:string;}
const kind='bot_calibration_candidate_test';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function permissionTarget(permission:FixturePermission){
 if(permission?.mode!=='test'||permission?.allowLocalExperiment!==true||process.env.NODE_ENV==='production')throw new Error('Local fixture authorization required');
 let u:URL;try{u=new URL(permission.databaseUrl);}catch{throw new Error('Local disposable database required');}if(!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!/^\/[a-z0-9_]+_test$/.test(u.pathname))throw new Error('Local disposable database required');
 return u;
}
async function guard(sql:Sql,permission:FixturePermission){
 const u=permissionTarget(permission);
 const row=(await sql.query('SELECT current_database() AS db,current_schema() AS schema')).rows[0]!;
 if('/'+row.db!==u.pathname||!/^fixture_[a-f0-9]{32}$/.test(row.schema))throw new Error('Isolated disposable schema required');
}
export async function readFixtureBot(sql:Sql,id:string):Promise<BotSnapshot&{settledAt:string;nextPaymentAt:string;stateVersion:number;health:number}>{
 const r=(await sql.query(`SELECT c.*,b.tier,b.variant,b.active,b.population_version,b.population_key,a.login_disabled,w.balance AS gold,v.balance AS vault,
  m.reserve_gold,m.arrears_gold,m.paused,m.settled_at,i.next_payment_at,
  COALESCE((SELECT sum(quantity*hourly_income)::int FROM land_holdings WHERE character_id=c.id),0) AS gross,
  COALESCE((SELECT sum(quantity*hourly_upkeep)::int FROM land_holdings WHERE character_id=c.id),0) AS property_upkeep,
  (SELECT COALESCE(sum(quantity),0)::int FROM army_stacks WHERE character_id=c.id) AS militia
 FROM characters c JOIN accounts a ON a.id=c.account_id JOIN development_bots b ON b.character_id=c.id
 JOIN wallets w ON w.character_id=c.id JOIN vault_accounts v ON v.character_id=c.id JOIN maintenance_accounts m ON m.character_id=c.id
 JOIN income_cycles i ON i.character_id=c.id WHERE c.id=$1`,[id])).rows[0];
 if(!r||!r.login_disabled||!r.active||r.population_version!=='passive-rivals-5'||r.population_key!==`passive-rivals-5:${r.attained_level}:${r.tier}${r.variant?':'+r.variant:':0'}`)throw new Error('Exact active passive-rival identity required');
 const entries=(await sql.query('SELECT id,item_definition_id,quantity FROM inventory_entries WHERE character_id=$1 AND quantity>0 ORDER BY item_definition_id',[id])).rows;
 const lots=(await sql.query('SELECT inventory_entry_id,remaining_quantity,unit_cost FROM inventory_lots WHERE character_id=$1 AND remaining_quantity>0 ORDER BY acquired_at,id',[id])).rows;
 return {id:r.id,accountId:r.account_id,name:r.name,level:r.attained_level,tier:r.tier,variant:r.variant,calling:r.profile_class,militia:r.militia,legacyFloor:r.legacy_army_floor,
  attackTraining:r.attack_training,defenseTraining:r.defense_training,skillPoints:r.skill_points,gold:r.gold,vault:r.vault,reserve:Number(r.reserve_gold),arrears:Number(r.arrears_gold),paused:r.paused,
  grossIncome:r.gross,propertyUpkeep:r.property_upkeep,stateVersion:r.state_version,health:r.health,settledAt:new Date(r.settled_at).toISOString(),nextPaymentAt:new Date(r.next_payment_at).toISOString(),
  inventory:entries.map(e=>({itemId:e.item_definition_id,quantity:e.quantity,lots:lots.filter(l=>l.inventory_entry_id===e.id).map(l=>({quantity:l.remaining_quantity,unitCost:l.unit_cost}))}))};
}
export async function inspectFixtureBot(db:Database,id:string,permission:FixturePermission){permissionTarget(permission);return transaction(db,async sql=>{await sql.query('SET TRANSACTION READ ONLY');await guard(sql,permission);return readFixtureBot(sql,id);});}
export async function applyFixtureCalibration(db:Database,permission:FixturePermission,reviewed:CalibrationPlan,commandId:string){
 permissionTarget(permission);
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(commandId))throw new Error('UUID command identity required');
 return transaction(db,async sql=>{
  await guard(sql,permission);await lockCharacters(sql,[reviewed.botId]);
  const before=await readFixtureBot(sql,reviewed.botId),intentHash=hash(reviewed);
  const old=(await sql.query('SELECT kind,intent_hash,result FROM command_receipts WHERE account_id=$1 AND (command_id=$2 OR (kind=$3 AND result->>\'policy\'=$4)) ORDER BY (command_id=$2) DESC,created_at,command_id LIMIT 1',[before.accountId,commandId,kind,candidate.id])).rows[0];
  if(old){if(old.kind!==kind||old.intent_hash!==intentHash||old.result?.policy!==candidate.id)throw new Error('Conflicting candidate or retry');return old.result;}
  if(fingerprint(before)!==reviewed.snapshotHash)throw new Error('Stale reviewed snapshot');
  const plan=planCalibration(before,reviewed.training);if(hash(plan)!==intentHash)throw new Error('Reviewed candidate differs from deterministic plan');
  if(plan.status!=='planned')return {policy:candidate.id,status:plan.status,reason:plan.reason,botId:before.id};
  const now=await clock(sql);
  // Read-only preview must follow ordinary settlement in the synthetic fixture.
  // Do not silently change a quote's finances or reprice a stale manifest here.
  if(+new Date(before.settledAt)!==+now||+new Date(before.nextPaymentAt)<=+now||before.paused||before.arrears)throw new Error('Settle ordinary finances before reviewing this fixture');
  const actions:{commandId:string;kind:string;itemId?:string;quantity?:number;gold?:number}[]=[];
  for(const sale of plan.sales){let left=sale.quantity;while(left){const quantity=Math.min(left,alpha.limits.transaction),id=randomUUID();const gold=await sellItem(sql,before.id,sale.itemId,quantity,id);actions.push({commandId:id,kind:'sell',itemId:sale.itemId,quantity,gold});left-=quantity;}}
  for(const buy of plan.purchases){let left=buy.quantity;while(left){const quantity=Math.min(left,alpha.limits.transaction),id=randomUUID();const paid=await purchaseItems(sql,before.id,before.level,{[buy.itemId]:quantity},id,now);actions.push({commandId:id,kind:'buy',itemId:buy.itemId,quantity,gold:paid.cost});left-=quantity;}}
  for(let n=0;n<plan.points;n++){const id=randomUUID();await allocateSkill(sql,before.id,'defense',id,now);actions.push({commandId:id,kind:'existing-skill-point'});}
  // Candidate-only repricing preserves stored credit (including legacy credit
  // whose original funding provenance cannot be established). It never pays
  // that credit into a wallet. Ordinary billing/funding helpers remain intact.
  const oldMaintenance=await maintenanceAccount(sql,before.id,now);
  const rate=(await readInventory(sql,before.id)).reduce((n,i)=>n+i.quantity*i.upkeep,0);
  await sql.query('UPDATE maintenance_accounts SET hourly_rate=$2 WHERE character_id=$1',[before.id,rate]);
  await fundMaintenance(sql,before.id,commandId,now);
  const maintenance=await maintenanceAccount(sql,before.id,now);
  if(rate!==oldMaintenance.hourly_rate)await sql.query(`INSERT INTO maintenance_rate_events(id,character_id,previous_rate,hourly_rate,paused_after,reserve_after,ruleset_id,command_id,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),before.id,oldMaintenance.hourly_rate,rate,maintenance.paused,maintenance.reserve_gold,alpha.id,commandId,now]);
  await sql.query('UPDATE characters SET state_version=state_version+1 WHERE id=$1',[before.id]);
  const after=await readFixtureBot(sql,before.id),expected=new Map(plan.desired.filter(i=>i.quantity).map(i=>[i.itemId,i.quantity]));
  if(after.gold!==plan.finalGold||after.reserve!==plan.finalReserve||after.vault!==before.vault||after.militia!==before.militia||after.defenseTraining!==before.defenseTraining+plan.points||after.skillPoints!==before.skillPoints-plan.points||after.inventory.length!==expected.size||after.inventory.some(i=>i.quantity!==expected.get(i.itemId)))throw new Error('Post-transaction candidate mismatch');
  const result={policy:candidate.id,status:'applied-to-disposable-copy',botId:before.id,commandId,before,after,plan,actions};
  await sql.query('INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,$3,$4,$5)',[before.accountId,commandId,kind,intentHash,result]);
  return result;
 });
}
