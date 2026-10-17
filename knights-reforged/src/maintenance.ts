import { randomUUID } from 'node:crypto';
import { type Sql } from './db.js';
import { alpha,maintenanceBill } from './alpha-rules.js';
import { ledger,creditGold } from './economy.js';
import { GameError } from './errors.js';
import { readInventory } from './inventory.js';

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
  if (bill.due) await sql.query(`INSERT INTO maintenance_events(id,character_id,reason,period_start_at,period_end_at,charged_gold,waived_gold,reserve_after,arrears_after)
    VALUES($1,$2,'accrual',$3,$4,$5,$6,$7,$8)`,[randomUUID(),characterId,row.settled_at,bill.throughAt,bill.paid.toString(),(bill.due-bill.paid-bill.arrears).toString(),bill.credit.toString(),bill.arrears.toString()]);
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
  if (cost) await sql.query(`INSERT INTO maintenance_events(id,character_id,reason,period_start_at,period_end_at,charged_gold,reserve_after,arrears_after,command_id)
    VALUES($1,$2,'fund',$3,$3,$4,$5,0,$6)`,[randomUUID(),characterId,now,arrears.toString(),(credit+topup).toString(),commandId]);
  return true;
}

// Called only after the old rate has accrued, then inventory changes atomically.
// Buying equipment is never conditioned on income or maintenance affordability.
export async function refreshMaintenance(sql:Sql,characterId:string,commandId:string,now:Date) {
  const rate=(await readInventory(sql,characterId)).reduce((n,item)=>n+item.quantity*item.upkeep,0);
  const old=await maintenanceAccount(sql,characterId,now);
  await sql.query('UPDATE maintenance_accounts SET hourly_rate=$2 WHERE character_id=$1',[characterId,rate]);
  if (!rate) {
    if (BigInt(old.reserve_gold)) {
      await sql.query('UPDATE maintenance_accounts SET reserve_gold=0 WHERE character_id=$1',[characterId]);
      await creditGold(sql,characterId,BigInt(old.reserve_gold),commandId,'maintenance_reserve_return',alpha.id);
    }
    await sql.query('UPDATE maintenance_accounts SET paused=(arrears_gold>0),settled_at=$2 WHERE character_id=$1',[characterId,now]);
  } else if (!old.paused) {
    await fundMaintenance(sql,characterId,commandId,now,true);
  }
}
