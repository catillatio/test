import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {type Database,type Sql,transaction} from './db.js';
import {rules} from './rules.js';
import {alpha} from './alpha-rules.js';
import {botArmy,cohortMembers} from './expansion-bot-rules.js';
import {realmPolicy} from './realm-policy.js';
import {contentCatalog} from './expansion-content.js';
import {readInventory,purchaseItems} from './inventory.js';
import {ledger} from './economy.js';
import {refreshMaintenance,fundMaintenance,maintenanceAccount,settleMaintenance} from './maintenance.js';
import {settleLand} from './land.js';
export const npcArmyPolicy=Object.freeze({id:'funded-npc-armies-1',weakPercent:20,matchedPercent:65,elitePercent:15,membershipUnitCost:rules.unit.goldCost,legacyMaximum:10,maximumPaidMilitia:alpha.limits.mercenaries,upkeepIncomePercent:70});
export function proposedNpcArmy(level:number,id:string,expanded=false){
 assert.ok(Number.isSafeInteger(level)&&level>=1&&level<=100);
 const n=createHash('sha256').update(npcArmyPolicy.id+':'+id).digest().readUInt32BE(0)%100;
 const band:'weak'|'matched'|'elite'=n<20?'weak':n<85?'matched':'elite';
 const target=expanded?Math.floor(level*(band==='weak'?.15:band==='matched'?.75:1))+1:band==='weak'?Math.max(2,Math.floor(level/12)+1):Math.floor(level/5)+(band==='elite'?4:2);
 return {band,participants:Math.min(expanded?5*level:botArmy(level,9,0,1).capacity,Math.max(1,target))};
}
async function plan(sql:Sql,id:string){
 const row=(await sql.query('SELECT c.*,b.active,b.population_version FROM characters c JOIN development_bots b ON b.character_id=c.id JOIN accounts a ON a.id=c.account_id WHERE c.id=$1 AND a.login_disabled',[id])).rows[0];assert.ok(row?.active,'An active registered NPC is required');
 const world=await realmPolicy(sql),base=(await cohortMembers(sql,[id])).get(id);
 const units=Number((await sql.query('SELECT coalesce(sum(quantity),0)::int AS n FROM army_stacks WHERE character_id=$1',[id])).rows[0]!.n);
 const current=botArmy(row.attained_level,units,0,row.legacy_army_floor,base).participants,goal=proposedNpcArmy(row.attained_level,id,base!==undefined);
 const participants=Math.max(current,Math.min(goal.participants,current+Math.max(0,alpha.limits.mercenaries-units)));
 const additionalMembers=participants-current,memberCost=additionalMembers*npcArmyPolicy.membershipUnitCost;
 const wallet=Number((await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[id])).rows[0]!.balance),maintenance=await maintenanceAccount(sql,id,new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now));
 const income=Number((await sql.query('SELECT coalesce(sum(quantity*(hourly_income-hourly_upkeep)),0)::bigint AS n FROM land_holdings WHERE character_id=$1 AND quantity>0',[id])).rows[0]!.n);
 const inventory=await readInventory(sql,id),gear:Record<string,number>={};let equipmentCost=0,newRate=maintenance.hourly_rate;
 for(const category of ['weapon','armor','spell']){
  const candidates=contentCatalog(world.catalogId).items.filter(i=>i.category===category&&i.acquisition!=='quest-exclusive'&&i.level<=row.attained_level).sort((a,b)=>(b.attack+b.defense)-(a.attack+a.defense)||a.price-b.price||a.id.localeCompare(b.id));
  for(const i of candidates){const quantity=Math.max(0,participants-(inventory.find(x=>x.id===i.id)?.quantity??0));if(!quantity)break;
   const rate=newRate+quantity*i.upkeep,cost=quantity*i.price,reserve=Math.max(0,rate-Number(maintenance.reserve_gold))+Number(maintenance.arrears_gold);
   if(quantity>100||rate>Math.floor(income*.7)||memberCost+equipmentCost+cost+reserve>wallet)continue;
   gear[i.id]=quantity;equipmentCost+=cost;newRate=rate;break;
  }
 }
 const hasChanges=additionalMembers>0||Object.keys(gear).length>0;
 const reserveTopup=hasChanges?Math.max(0,newRate-Number(maintenance.reserve_gold))+Number(maintenance.arrears_gold):0;
 const reserveReturned=hasChanges?Math.max(0,Number(maintenance.reserve_gold)-newRate):0;
 return {policyId:npcArmyPolicy.id,characterId:id,populationVersion:row.population_version,level:row.attained_level,band:goal.band,currentParticipants:current,desiredParticipants:goal.participants,targetParticipants:participants,additionalMembers,memberCost,gear,equipmentCost,reserveTopup,reserveReturned,currentGold:wallet,totalCost:memberCost+equipmentCost+reserveTopup,fundingShortfall:Math.max(0,memberCost+equipmentCost+reserveTopup-wallet)};
}
export type NpcArmyPlan=Awaited<ReturnType<typeof plan>>;
export async function planNpcArmy(db:Database,id:string){return transaction(db,sql=>plan(sql,id));}
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
 if(fresh.additionalMembers>0||Object.keys(fresh.gear).length){await refreshMaintenance(sql,fresh.characterId,commandId,now);await fundMaintenance(sql,fresh.characterId,commandId,now);}
 await sql.query('UPDATE characters SET state_version=state_version+1 WHERE id=$1',[fresh.characterId]);return fresh;
});}
