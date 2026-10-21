// Frozen pre-optimization settlement reference (42844af). Nonproduction differential tests only.
import type {Sql} from '../../src/db.js';
import type {HoldingRow} from '../../src/land.js';
import {progressionEconomy} from '../../src/progression-economy-rules.js';
import {ledger,recordRetained} from '../../src/economy.js';
import {landCreditAmount} from '../../src/land-rules.js';

async function holdings(sql: Sql, characterId: string, lock = false) {
  return (await sql.query<HoldingRow>(`SELECT * FROM land_holdings WHERE character_id=$1 AND quantity>0
    ORDER BY acquired_at,id${lock ? ' FOR UPDATE' : ''}`, [characterId])).rows;
}

// Must be called after locking the character row. Both state reads and every
// gameplay command use this path, including settlement of an offline defender.
export async function legacyAccrueHolding(sql:Sql,batch:HoldingRow,through:Date,reason:'shared_cycle'|'sale'){
 const elapsed=+through-+new Date(batch.accrued_through);
 if(elapsed<=0)return 0n;
 const ms=BigInt(elapsed),denominator=3600000n;
 // income_remainder is the NET numerator; upkeep has its own numerator.
 // Gross = paid net + paid upkeep, so a partial interval can never pay negative net.
 const netNumerator=BigInt(batch.hourly_income-batch.hourly_upkeep)*BigInt(batch.quantity)*ms+BigInt(batch.income_remainder??0);
 const upkeepNumerator=BigInt(batch.hourly_upkeep)*BigInt(batch.quantity)*ms+BigInt(batch.upkeep_remainder??0);
 const net=netNumerator/denominator,upkeep=upkeepNumerator/denominator,gross=net+upkeep;
 const netRemainder=netNumerator%denominator,upkeepRemainder=upkeepNumerator%denominator;
 if(elapsed%3600000===0&&!BigInt(batch.income_remainder??0)&&!BigInt(batch.upkeep_remainder??0)&&reason==='shared_cycle'){
  await sql.query(`INSERT INTO land_income_settlements(holding_id,period_start_at,period_end_at,interval_count,gross_gold,upkeep_gold,net_gold)
   VALUES($1,$2,$3,$4,$5,$6,$7)`,[batch.id,batch.accrued_through,through,elapsed/3600000,gross.toString(),upkeep.toString(),net.toString()]);
 }else{
  await sql.query(`INSERT INTO land_partial_settlements(holding_id,period_start_at,period_end_at,quantity,gross_gold,upkeep_gold,net_gold,income_remainder,upkeep_remainder,reason,ruleset_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[batch.id,batch.accrued_through,through,batch.quantity,gross.toString(),upkeep.toString(),net.toString(),netRemainder.toString(),upkeepRemainder.toString(),reason,progressionEconomy.id]);
 }
 await sql.query('UPDATE land_holdings SET accrued_through=$2,income_remainder=$3,upkeep_remainder=$4 WHERE id=$1',[batch.id,through,netRemainder.toString(),upkeepRemainder.toString()]);
 return net;
}

export async function legacySettleLand(sql: Sql, characterId: string, now: Date, rulesetId = progressionEconomy.id): Promise<boolean> {
  const batches = await holdings(sql, characterId, true);
  await sql.query('INSERT INTO land_accounts(character_id) VALUES($1) ON CONFLICT DO NOTHING', [characterId]);
  // Adopt the earliest existing unpaid boundary without rewriting old cursors.
  // Later purchases join this clock; their first payment is explicitly prorated.
  if(batches.length)await sql.query(`INSERT INTO income_cycles(character_id,next_payment_at)
    VALUES($1,$2) ON CONFLICT DO NOTHING`,[characterId,new Date(Math.min(...batches.map(b=>+new Date(b.accrued_through)))+3600000)]);
  const cycle=(await sql.query('SELECT next_payment_at FROM income_cycles WHERE character_id=$1 FOR UPDATE',[characterId])).rows[0];
  let generated=0n,settled=false;
  if(cycle&&+new Date(cycle.next_payment_at)<=+now){
    const due=+new Date(cycle.next_payment_at);
    const through=new Date(due+Math.floor((+now-due)/3600000)*3600000);
    for(const batch of batches){
      const accrual=await legacyAccrueHolding(sql,batch,through,'shared_cycle');
      generated+=accrual;settled ||= +through>+new Date(batch.accrued_through);
    }
    await sql.query('UPDATE income_cycles SET next_payment_at=$2 WHERE character_id=$1',[characterId,new Date(+through+3600000)]);
  }
  const account = (await sql.query(`UPDATE land_accounts SET pending_gold=pending_gold+$2::numeric
    WHERE character_id=$1 RETURNING pending_gold`, [characterId, generated.toString()])).rows[0]!;
  if (generated) await recordRetained(sql,characterId,generated,'land_income');
  const wallet = (await sql.query('SELECT balance FROM wallets WHERE character_id=$1', [characterId])).rows[0]!;
  const credited = landCreditAmount(wallet.balance, BigInt(account.pending_gold));
  if (credited) {
    await ledger(sql, null, 'land_income', [{ characterId, amount: credited }], rulesetId);
    await sql.query('UPDATE land_accounts SET pending_gold=pending_gold-$2::numeric WHERE character_id=$1', [characterId, credited]);
    await recordRetained(sql,characterId,-BigInt(credited),'treasury_release');
  }
  return settled || credited > 0;
}

