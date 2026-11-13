import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {type Database,type Sql,transaction} from './db.js';
import {rules} from './rules.js';
import {alpha,selectEquipment,type OwnedItem} from './alpha-rules.js';
import {botArmy,cohortMembers} from './expansion-bot-rules.js';
import {realmPolicy} from './realm-policy.js';
import {equipmentCatalogFor,contentCatalog} from './expansion-content.js';
import {readInventory,purchaseItems} from './inventory.js';
import {ledger} from './economy.js';
import {refreshMaintenance,fundMaintenance,maintenanceAccount,settleMaintenance} from './maintenance.js';
import {settleLand} from './land.js';

// Retain the exact installed definition and all its immutable receipts.
export const previousNpcArmyPolicy=Object.freeze({id:'funded-npc-armies-1',weakPercent:20,matchedPercent:65,elitePercent:15,membershipUnitCost:rules.unit.goldCost,legacyMaximum:10,maximumPaidMilitia:alpha.limits.mercenaries,upkeepIncomePercent:70});
export const npcArmyPolicy=Object.freeze({id:'funded-npc-armies-2',previousPolicy:previousNpcArmyPolicy.id,membershipUnitCost:rules.unit.goldCost,legacyMaximum:10,maximumPaidMilitia:alpha.limits.mercenaries,upkeepIncomePercent:70,profileSource:'saved NPC tier; deterministic variation within tier',legacyTargets:'weak 45–75%, matched 75–100%, elite 100% of existing legal capacity',expandedTargets:'weak 0.45×level+1, matched level+1, elite 1.5×level+1; existing paid militia and capacity limits still apply',equipment:'balanced uncovered categories, then useful marginal upgrades; actual shop costs and all held upkeep'});
type Band='weak'|'matched'|'elite';
export function proposedNpcArmy(level:number,id:string,expanded=false,tier?:string){
 assert.ok(Number.isSafeInteger(level)&&level>=1&&level<=100);
 const seed=createHash('sha256').update(npcArmyPolicy.id+':'+id).digest().readUInt32BE(0),n=seed%100;
 const band:Band=tier==='green'?'weak':tier==='seasoned'?'matched':tier==='elite'?'elite':n<20?'weak':n<85?'matched':'elite';
 const capacity=expanded?5*level:botArmy(level,9,0,1).capacity;
 const fraction=band==='weak'?.45+Math.min(level,30)/150+(seed%11)/100:band==='matched'?.75+Math.min(level,30)/150+(seed%6)/100:1;
 const desired=expanded?Math.ceil(level*(band==='weak'?.45:band==='matched'?1:1.5))+1:Math.ceil(capacity*fraction);
 return {band,participants:Math.min(capacity,Math.max(2,desired)),levelComparableTarget:Math.ceil(level*(band==='weak'?.45:band==='matched'?1:1.5))+1};
}
function finiteMoney(value:unknown){const n=Number(value);assert.ok(Number.isSafeInteger(n)&&n>=0,'NPC funds/rate exceed safe planning bounds');return n;}
async function plan(sql:Sql,id:string){
 const row=(await sql.query('SELECT c.*,b.active,b.tier,b.population_version FROM characters c JOIN development_bots b ON b.character_id=c.id JOIN accounts a ON a.id=c.account_id WHERE c.id=$1 AND a.login_disabled',[id])).rows[0];
 assert.ok(row?.active,'An active registered NPC is required');
 const world=await realmPolicy(sql),base=(await cohortMembers(sql,[id])).get(id),expanded=base!==undefined;
 const units=Number((await sql.query('SELECT coalesce(sum(quantity),0)::int AS n FROM army_stacks WHERE character_id=$1',[id])).rows[0]!.n);
 const project=(extra:number)=>botArmy(row.attained_level,units+extra,0,row.legacy_army_floor,base);
 const current=project(0),goal=proposedNpcArmy(row.attained_level,id,expanded,String(row.tier));
 const wallet=finiteMoney((await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[id])).rows[0]!.balance);
 const maintenance=await maintenanceAccount(sql,id,new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now));
 const reserve=finiteMoney(maintenance.reserve_gold),arrears=finiteMoney(maintenance.arrears_gold),oldRate=finiteMoney(maintenance.hourly_rate);
 const income=finiteMoney((await sql.query('SELECT coalesce(sum(quantity*(hourly_income-hourly_upkeep)),0)::bigint AS n FROM land_holdings WHERE character_id=$1 AND quantity>0',[id])).rows[0]!.n);
 const limits:string[]=[];
 if(!expanded)limits.push('LEGACY_TEN_PARTICIPANT_CAP','NPC_RECRUITMENT_IS_NON_RECIPROCAL');
 const availableMembers=Math.max(0,Math.min(alpha.limits.mercenaries-units,expanded?alpha.limits.mercenaries:9-units));
 const legalMaximum=project(availableMembers).participants;
 const desired=Math.max(current.participants,goal.participants),wanted=Math.min(desired,legalMaximum);
 if(desired>legalMaximum)limits.push('PAID_MILITIA_LIMIT');
 if(oldRate>income)limits.push('EXISTING_UPKEEP_EXCEEDS_PROPERTY_INCOME');
 const funding=(rate:number)=>Math.max(0,rate-reserve)+arrears;
 let additionalMembers=0,participants=current.participants;
 // A preserved floor can exceed stored militia: pay for actual units needed,
 // never infer membership cost merely from the change in visible participants.
 if(oldRate<=income)for(let extra=1;extra<=availableMembers;extra++){
  const projected=project(extra).participants;
  if(projected>wanted)break;
  if(projected>participants&&extra*rules.unit.goldCost+funding(oldRate)<=wallet){additionalMembers=extra;participants=projected;}
 }
 if(participants<wanted)limits.push('MEMBERSHIP_OR_MAINTENANCE_FUNDS');
 const memberCost=additionalMembers*rules.unit.goldCost,inventory=await readInventory(sql,id),virtual:OwnedItem[]=inventory.map(i=>({...i})),gear:Record<string,number>={};
 const catalog=equipmentCatalogFor(world.catalogId),selectionPolicy=expanded?world.armyPolicy:'army-legacy-1';
 const levelLag=goal.band==='weak'?Math.floor(row.attained_level*.3):goal.band==='matched'?2:0;
 const candidates=contentCatalog(world.catalogId).items.filter(i=>i.acquisition!=='quest-exclusive'&&catalog.canPurchase(i.id,row.attained_level)&&i.level<=Math.max(1,row.attained_level-levelLag)).sort((a,b)=>a.id.localeCompare(b.id));
 let equipmentCost=0,newRate=oldRate;
 if(oldRate<=income)for(let step=0;step<3*participants;step++){
  const attack=selectEquipment(virtual,participants,'attack',true,selectionPolicy),defense=selectEquipment(virtual,participants,'defense',true,selectionPolicy);
  const coverage=new Map(['weapon','armor','spell'].map(category=>[category,attack.selected.filter(i=>i.category===category).reduce((n,i)=>n+i.quantity,0)]));
  const uncovered=[...coverage.values()].filter(n=>n<participants).length;
  let best:{item:typeof candidates[number];gain:number;value:number;coverage:number}|undefined;
  for(const item of candidates){
   const owned=virtual.find(i=>i.id===item.id),quantity=owned?.quantity??0;
   if((gear[item.id]??0)>=alpha.limits.transaction||quantity>=alpha.limits.inventory)continue;
   const rate=newRate+item.upkeep,cost=memberCost+equipmentCost+item.price+funding(rate);
   if(rate>Math.floor(income*npcArmyPolicy.upkeepIncomePercent/100)||cost>wallet)continue;
   const filled=coverage.get(item.category)!;
   if(uncovered&&filled>=participants)continue;
   const remaining=wallet-memberCost-equipmentCost-funding(newRate);
   if(uncovered>1&&item.price+item.upkeep>Math.floor(remaining/uncovered))continue;
   const after=virtual.filter(i=>i.id!==item.id).concat({...item,inventoryId:owned?.inventoryId??'quoted:'+item.id,quantity:quantity+1});
   const gain=selectEquipment(after,participants,'attack',true,selectionPolicy).attack+selectEquipment(after,participants,'defense',true,selectionPolicy).defense-attack.attack-defense.defense;
   if(gain<=0)continue;
   const effectiveCost=Math.max(1,item.price+24*item.upkeep),value=goal.band==='elite'?gain:goal.band==='matched'?gain/Math.sqrt(effectiveCost):gain/effectiveCost;
   const candidate={item,gain,value,coverage:Math.min(filled,participants)};
   if(!best||candidate.coverage<best.coverage||candidate.coverage===best.coverage&&(candidate.value>best.value||candidate.value===best.value&&candidate.item.id<best.item.id))best=candidate;
  }
  if(!best)break;
  const item=best.item,owned=virtual.find(i=>i.id===item.id);
  if(owned)owned.quantity++;else virtual.push({...item,inventoryId:'quoted:'+item.id,quantity:1});
  gear[item.id]=(gear[item.id]??0)+1;equipmentCost+=item.price;newRate+=item.upkeep;
 }
 const hasChanges=additionalMembers>0||Object.keys(gear).length>0;
 const reserveTopup=hasChanges?funding(newRate):0,reserveReturned=hasChanges?Math.max(0,reserve-newRate):0;
 if(newRate>=Math.floor(income*npcArmyPolicy.upkeepIncomePercent/100))limits.push('EQUIPMENT_UPKEEP_BUDGET');
 return {policyId:npcArmyPolicy.id,characterId:id,populationVersion:row.population_version,level:row.attained_level,savedTier:String(row.tier),band:goal.band,legacyCap:!expanded,currentParticipants:current.participants,desiredParticipants:goal.participants,levelComparableTarget:goal.levelComparableTarget,legalMaximumParticipants:legalMaximum,targetParticipants:participants,currentPaidMilitia:units,additionalMembers,participantIncrease:participants-current.participants,memberCost,gear,equipmentCost,propertyNetHourly:income,previousUpkeepHourly:oldRate,projectedUpkeepHourly:newRate,upkeepBudgetHourly:Math.floor(income*npcArmyPolicy.upkeepIncomePercent/100),reserveBefore:reserve,arrearsBefore:arrears,reserveTopup,reserveReturned,currentGold:wallet,totalCost:memberCost+equipmentCost+reserveTopup,fundingShortfall:Math.max(0,memberCost+equipmentCost+reserveTopup-wallet),constraints:limits};
}
export type NpcArmyPlan=Awaited<ReturnType<typeof plan>>;
export async function planNpcArmy(db:Database,id:string){return transaction(db,async sql=>{
 await assertLocalNpcTarget(sql);
 await sql.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[id]);
 const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
 await settleLand(sql,id,now);await settleMaintenance(sql,id,now);
 return plan(sql,id);
});}
export async function assertLocalNpcTarget(sql:Sql){
 const target=(await sql.query('SELECT current_database() AS db,current_schema() AS schema,host(inet_server_addr()) AS address')).rows[0]!;
 assert.ok(target.db.endsWith('_test')&&target.schema.startsWith('fixture_')&&['127.0.0.1','::1'].includes(target.address),'Only an isolated loopback synthetic fixture is supported');
}
/** Deliberately local-only. Production needs a separately reviewed exact manifest. */
export async function applyLocalNpcArmy(db:Database,reviewed:NpcArmyPlan,commandId:string){return transaction(db,async sql=>{
 await assertLocalNpcTarget(sql);
 const digest=createHash('sha256').update(JSON.stringify(reviewed)).digest('hex');
 const prior=(await sql.query('SELECT plan_digest,details FROM npc_army_adjustments WHERE command_id=$1',[commandId])).rows[0];if(prior){assert.equal(prior.plan_digest,digest);return prior.details;}
 await sql.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[reviewed.characterId]);
 const concurrent=(await sql.query('SELECT plan_digest,details FROM npc_army_adjustments WHERE command_id=$1',[commandId])).rows[0];if(concurrent){assert.equal(concurrent.plan_digest,digest);return concurrent.details;}
 const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
 await settleLand(sql,reviewed.characterId,now);await settleMaintenance(sql,reviewed.characterId,now);
 const fresh=await plan(sql,reviewed.characterId);assert.deepEqual(fresh,reviewed,'NPC state changed; make a fresh reviewed plan');assert.equal(fresh.fundingShortfall,0,'Existing NPC funds do not cover this plan');
 await sql.query('INSERT INTO npc_army_adjustments(command_id,character_id,policy_id,plan_digest,details,created_at) VALUES($1,$2,$3,$4,$5,$6)',[commandId,fresh.characterId,npcArmyPolicy.id,digest,fresh,now]);
 if(fresh.memberCost){const membership=(await sql.query('UPDATE army_stacks SET quantity=quantity+$2 WHERE character_id=$1 RETURNING character_id',[fresh.characterId,fresh.additionalMembers])).rows;assert.equal(membership.length,1);await ledger(sql,commandId,'npc_paid_membership',[{characterId:fresh.characterId,amount:-fresh.memberCost}],npcArmyPolicy.id);await sql.query('INSERT INTO npc_army_memberships(id,character_id,command_id,quantity,unit_cost,gold_cost,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),fresh.characterId,commandId,fresh.additionalMembers,npcArmyPolicy.membershipUnitCost,fresh.memberCost,now]);}
 if(Object.keys(fresh.gear).length)await purchaseItems(sql,fresh.characterId,fresh.level,fresh.gear,commandId,now);
 if(fresh.additionalMembers>0||Object.keys(fresh.gear).length){await refreshMaintenance(sql,fresh.characterId,commandId,now);await fundMaintenance(sql,fresh.characterId,commandId,now);const account=await maintenanceAccount(sql,fresh.characterId,now);assert.equal(account.hourly_rate,fresh.projectedUpkeepHourly);assert.equal(account.paused,false);assert.equal(BigInt(account.arrears_gold),0n);assert.ok(BigInt(account.reserve_gold)>=BigInt(account.hourly_rate));}
 const savedUnits=Number((await sql.query('SELECT coalesce(sum(quantity),0)::int AS n FROM army_stacks WHERE character_id=$1',[fresh.characterId])).rows[0]!.n),base=(await cohortMembers(sql,[fresh.characterId])).get(fresh.characterId);
 const floor=(await sql.query('SELECT legacy_army_floor FROM characters WHERE id=$1',[fresh.characterId])).rows[0]!.legacy_army_floor;
 assert.equal(botArmy(fresh.level,savedUnits,0,floor,base).participants,fresh.targetParticipants,'Paid roster must match the real combat projection');
 await sql.query('UPDATE characters SET state_version=state_version+1 WHERE id=$1',[fresh.characterId]);return fresh;
});}
