import { randomUUID } from 'node:crypto';
import { type Sql } from './db.js';
import { alpha,maintenanceBill } from './alpha-rules.js';
import { ledger,creditGold } from './economy.js';
import { GameError } from './errors.js';
import { readInventory } from './inventory.js';
import {automaticUpkeep} from './upkeep-policy.js';

export interface MaintenanceRow { hourly_rate:number;reserve_gold:string;arrears_gold:string;remainder:string;paused:boolean;settled_at:Date; }
export async function maintenanceAccount(sql:Sql,characterId:string,now:Date):Promise<MaintenanceRow> {
  await sql.query('INSERT INTO maintenance_accounts(character_id,settled_at) VALUES($1,$2) ON CONFLICT DO NOTHING',[characterId,now]);
  return (await sql.query('SELECT * FROM maintenance_accounts WHERE character_id=$1 FOR UPDATE',[characterId])).rows[0] as MaintenanceRow;
}
export async function settleMaintenance(sql:Sql,characterId:string,now:Date) {
  const row=await maintenanceAccount(sql,characterId,now);
  if (row.paused||!row.hourly_rate) {
    await sql.query('UPDATE maintenance_accounts SET settled_at=GREATEST(settled_at,$2) WHERE character_id=$1',[characterId,now]);return false;
  }
  const wallet=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[characterId])).rows[0]!;
  const bill=maintenanceBill(row.hourly_rate,new Date(row.settled_at),now,BigInt(row.remainder),BigInt(row.reserve_gold),wallet.balance);
  if (bill.fromWallet) await ledger(sql,null,'equipment_upkeep',[{characterId,amount:-bill.fromWallet}],alpha.id);
  await sql.query(`UPDATE maintenance_accounts SET reserve_gold=$2,arrears_gold=$3,remainder=$4,paused=$5,settled_at=$6 WHERE character_id=$1`,
    [characterId,bill.credit.toString(),bill.arrears.toString(),bill.remainder.toString(),bill.paused,bill.throughAt]);
  if (bill.due) await sql.query(`INSERT INTO maintenance_events(id,character_id,reason,period_start_at,period_end_at,charged_gold,waived_gold,reserve_after,arrears_after,hourly_rate,ruleset_id)
    VALUES($1,$2,'accrual',$3,$4,$5,$6,$7,$8,$9,$10)`,[randomUUID(),characterId,row.settled_at,bill.throughAt,bill.paid.toString(),(bill.due-bill.paid-bill.arrears).toString(),bill.credit.toString(),bill.arrears.toString(),row.hourly_rate,alpha.id]);
  return bill.due>0n;
}

export async function fundMaintenance(sql:Sql,characterId:string,commandId:string,now:Date,optional=false) {
  const row=await maintenanceAccount(sql,characterId,now);
  const arrears=BigInt(row.arrears_gold),credit=BigInt(row.reserve_gold),rate=BigInt(row.hourly_rate);
  const topup=rate>credit?rate-credit:0n;const cost=arrears+topup;
  const wallet=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[characterId])).rows[0]!;
  if (BigInt(wallet.balance)<cost) {
    if (!optional) throw new GameError('MAINTENANCE_FUNDS','You need enough carried gold to clear arrears and reserve one hour of upkeep.',409);
    await sql.query('UPDATE maintenance_accounts SET paused=true,settled_at=$2 WHERE character_id=$1',[characterId,now]);return false;
  }
  if (cost) await ledger(sql,commandId,'maintenance_funding',[{characterId,amount:-Number(cost)}],alpha.id);
  await sql.query('UPDATE maintenance_accounts SET reserve_gold=reserve_gold+$2,arrears_gold=0,paused=false,settled_at=$3 WHERE character_id=$1',[characterId,topup.toString(),now]);
  if (cost) await sql.query(`INSERT INTO maintenance_events(id,character_id,reason,period_start_at,period_end_at,charged_gold,reserve_after,arrears_after,command_id,hourly_rate,ruleset_id)
    VALUES($1,$2,'fund',$3,$3,$4,$5,0,$6,$7,$8)`,[randomUUID(),characterId,now,arrears.toString(),(credit+topup).toString(),commandId,row.hourly_rate,alpha.id]);
  return true;
}

// Existing reserves pay old liabilities first; only actual carried funds can
// clear the remainder and restore the same one-hour buffer used by Resume.
export function automaticFunding(rate:number,reserve:bigint,arrears:bigint,wallet:number){
  if(!Number.isSafeInteger(rate)||rate<0||reserve<0n||arrears<0n||!Number.isSafeInteger(wallet)||wallet<0)throw new RangeError('Invalid maintenance funding state.');
  const fromReserve=reserve<arrears?reserve:arrears,remainingReserve=reserve-fromReserve;
  const topup=BigInt(rate)>remainingReserve?BigInt(rate)-remainingReserve:0n;
  const cost=arrears-fromReserve+topup;
  return {affordable:cost<=BigInt(wallet),cost,reserveAfter:remainingReserve+topup,arrearsPaid:arrears,fromReserve,topup};
}
// Caller holds the character lock, after the ordinary Land and maintenance
// settlement. No timer, income, future payment, Vault debit or bot policy lives
// here. Active equipment tops up only when that shared settlement ran.
export async function automaticallyFundMaintenance(sql:Sql,characterId:string,now:Date,hourlySettlement=false){
  const row=await maintenanceAccount(sql,characterId,now);
  if(!row.paused&&!hourlySettlement)return false;
  const wallet=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[characterId])).rows[0]!;
  const plan=automaticFunding(row.hourly_rate,BigInt(row.reserve_gold),BigInt(row.arrears_gold),wallet.balance);
  if(!plan.affordable||(!row.paused&&!plan.cost&&!plan.arrearsPaid))return false;
  if(plan.cost)await ledger(sql,null,'maintenance_funding',[{characterId,amount:-Number(plan.cost)}],automaticUpkeep.id);
  await sql.query('UPDATE maintenance_accounts SET reserve_gold=$2,arrears_gold=0,paused=false,settled_at=GREATEST(settled_at,$3) WHERE character_id=$1',[characterId,plan.reserveAfter.toString(),now]);
  await sql.query(`INSERT INTO maintenance_events(id,character_id,reason,period_start_at,period_end_at,charged_gold,reserve_after,arrears_after,command_id,hourly_rate,ruleset_id)
    VALUES($1,$2,'fund',$3,$3,$4,$5,0,NULL,$6,$7)`,[randomUUID(),characterId,now,plan.arrearsPaid.toString(),plan.reserveAfter.toString(),row.hourly_rate,automaticUpkeep.id]);
  return true;
}

// Called only after the old rate has accrued, then inventory changes atomically.
// Buying equipment is never conditioned on income or maintenance affordability.
export async function refreshMaintenance(sql:Sql,characterId:string,commandId:string,now:Date) {
  const rate=(await readInventory(sql,characterId)).reduce((n,item)=>n+item.quantity*item.upkeep,0);
  const old=await maintenanceAccount(sql,characterId,now);
  await sql.query('UPDATE maintenance_accounts SET hourly_rate=$2 WHERE character_id=$1',[characterId,rate]);
  if(rate>0&&BigInt(old.reserve_gold)>BigInt(rate)) {
    const excess=BigInt(old.reserve_gold)-BigInt(rate);
    await sql.query('UPDATE maintenance_accounts SET reserve_gold=$2 WHERE character_id=$1',[characterId,rate]);
    await creditGold(sql,characterId,excess,commandId,'maintenance_reserve_return',alpha.id);
  }
  if (!rate) {
    if (BigInt(old.reserve_gold)) {
      await sql.query('UPDATE maintenance_accounts SET reserve_gold=0 WHERE character_id=$1',[characterId]);
      await creditGold(sql,characterId,BigInt(old.reserve_gold),commandId,'maintenance_reserve_return',alpha.id);
    }
    await sql.query('UPDATE maintenance_accounts SET paused=(arrears_gold>0),settled_at=$2 WHERE character_id=$1',[characterId,now]);
  } else if (!old.paused) {
    await fundMaintenance(sql,characterId,commandId,now,true);
  }
  if (rate!==old.hourly_rate) {
    const after=await maintenanceAccount(sql,characterId,now);
    await sql.query(`INSERT INTO maintenance_rate_events(id,character_id,previous_rate,hourly_rate,paused_after,reserve_after,ruleset_id,command_id,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),characterId,old.hourly_rate,rate,after.paused,after.reserve_gold,alpha.id,commandId,now]);
  }
}
