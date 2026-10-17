import { randomUUID } from 'node:crypto';
import { type Sql } from './db.js';
import { GameError } from './errors.js';
import { ledger } from './economy.js';
import { landRules, calculateLandAccrual, landCreditAmount, type LandProperty } from './land-rules.js';

export interface HoldingRow {
  id: string; character_id: string; property_id: string; property_name: string; ruleset_id: string;
  quantity: number; unit_price: number; hourly_income: number; hourly_upkeep: number;
  interval_seconds: number; acquired_at: Date; accrued_through: Date;
}
export interface LandState {
  rulesetId: string; provisional: true; paymentIntervalSeconds: number;
  hourlyIncome: number; hourlyUpkeep: number; netHourlyIncome: number;
  nextPaymentAt: string | null; pendingGold: string;
  properties: (LandProperty & { owned: number; remaining: number; maxPurchase: number; maxAffordable: number })[];
  holdings: { id: string; propertyId: string; name: string; quantity: number;
    hourlyIncome: number; hourlyUpkeep: number; nextPaymentAt: string; rulesetId: string }[];
}

async function holdings(sql: Sql, characterId: string, lock = false) {
  return (await sql.query<HoldingRow>(`SELECT * FROM land_holdings WHERE character_id=$1
    ORDER BY acquired_at,id${lock ? ' FOR UPDATE' : ''}`, [characterId])).rows;
}

// Must be called after locking the character row. Both state reads and every
// gameplay command use this path, including settlement of an offline defender.
export async function settleLand(sql: Sql, characterId: string, now: Date): Promise<boolean> {
  const batches = await holdings(sql, characterId, true);
  if (!batches.length) return false;
  await sql.query('INSERT INTO land_accounts(character_id) VALUES($1) ON CONFLICT DO NOTHING', [characterId]);
  let generated = 0n;
  let settled = false;
  for (const batch of batches) {
    const payment = calculateLandAccrual(new Date(batch.accrued_through), now, batch.interval_seconds,
      batch.quantity, batch.hourly_income, batch.hourly_upkeep);
    if (!payment.intervals) continue;
    // Deliberately do not ignore a conflict: a mismatched cursor must roll the
    // entire transaction back instead of creating a duplicate or losing income.
    await sql.query(`INSERT INTO land_income_settlements(holding_id,period_start_at,period_end_at,
      interval_count,gross_gold,upkeep_gold,net_gold) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [batch.id, batch.accrued_through, payment.throughAt, payment.intervals,
        payment.grossGold.toString(), payment.upkeepGold.toString(), payment.netGold.toString()]);
    await sql.query('UPDATE land_holdings SET accrued_through=$2 WHERE id=$1', [batch.id, payment.throughAt]);
    generated += payment.netGold;
    settled = true;
  }
  const account = (await sql.query(`UPDATE land_accounts SET pending_gold=pending_gold+$2::numeric
    WHERE character_id=$1 RETURNING pending_gold`, [characterId, generated.toString()])).rows[0]!;
  const wallet = (await sql.query('SELECT balance FROM wallets WHERE character_id=$1', [characterId])).rows[0]!;
  const credited = landCreditAmount(wallet.balance, BigInt(account.pending_gold));
  if (credited) {
    await ledger(sql, null, 'land_income', [{ characterId, amount: credited }], landRules.id);
    await sql.query('UPDATE land_accounts SET pending_gold=pending_gold-$2::numeric WHERE character_id=$1', [characterId, credited]);
  }
  return settled || credited > 0;
}

export async function getLandState(sql: Sql, characterId: string, gold: number): Promise<LandState> {
  const batches = await holdings(sql, characterId);
  const owned = new Map<string, number>();
  let hourlyIncome = 0; let hourlyUpkeep = 0;
  const rows = batches.map(batch => {
    owned.set(batch.property_id, (owned.get(batch.property_id) ?? 0) + batch.quantity);
    hourlyIncome += batch.quantity * batch.hourly_income;
    hourlyUpkeep += batch.quantity * batch.hourly_upkeep;
    return { id: batch.id, propertyId: batch.property_id, name: batch.property_name, quantity: batch.quantity,
      hourlyIncome: batch.quantity * batch.hourly_income, hourlyUpkeep: batch.quantity * batch.hourly_upkeep,
      nextPaymentAt: new Date(new Date(batch.accrued_through).getTime() + batch.interval_seconds * 1000).toISOString(),
      rulesetId: batch.ruleset_id };
  });
  const account = (await sql.query('SELECT pending_gold FROM land_accounts WHERE character_id=$1', [characterId])).rows[0];
  return { rulesetId: landRules.id, provisional: true, paymentIntervalSeconds: landRules.paymentIntervalSeconds,
    hourlyIncome, hourlyUpkeep, netHourlyIncome: hourlyIncome - hourlyUpkeep,
    nextPaymentAt: rows.length ? rows.map(row => row.nextPaymentAt).sort()[0]! : null,
    pendingGold: String(account?.pending_gold ?? '0'),
    properties: landRules.properties.map(property => {
      const quantity = owned.get(property.id) ?? 0;
      const remaining = Math.max(0, landRules.maxOwnedPerProperty - quantity);
      const maxPurchase = Math.min(remaining, landRules.maxPurchaseQuantity);
      return { ...property, owned: quantity, remaining, maxPurchase,
        maxAffordable: Math.min(maxPurchase, Math.floor(gold / property.price)) };
    }), holdings: rows };
}

// Caller already settled due income and holds the character lock. Prices,
// rates, owner, clock and ruleset are selected exclusively on the server.
export async function purchaseLand(sql: Sql, characterId: string, commandId: string,
  propertyId: string, quantity: number, now: Date): Promise<string> {
  const property = landRules.properties.find(entry => entry.id === propertyId);
  if (!property) throw new GameError('PROPERTY_NOT_FOUND', 'That property is not available.', 404);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > landRules.maxPurchaseQuantity) {
    throw new GameError('INVALID_QUANTITY', 'Choose a valid whole number of properties.');
  }
  const row = (await sql.query(`SELECT COALESCE(SUM(quantity),0)::integer AS owned FROM land_holdings
    WHERE character_id=$1 AND property_id=$2`, [characterId, propertyId])).rows[0]!;
  if (row.owned + quantity > landRules.maxOwnedPerProperty) {
    throw new GameError('LAND_LIMIT', `You can own at most ${landRules.maxOwnedPerProperty} of each property.`, 409);
  }
  const cost = property.price * quantity;
  const wallet = (await sql.query('SELECT balance FROM wallets WHERE character_id=$1', [characterId])).rows[0]!;
  if (cost > wallet.balance) throw new GameError('INSUFFICIENT_GOLD', 'You do not have enough gold for those properties.', 409);
  await ledger(sql, commandId, 'land_purchase', [{ characterId, amount: -cost }], landRules.id);
  const id = randomUUID();
  await sql.query(`INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,
    unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
    [id, characterId, property.id, property.name, landRules.id, quantity, property.price,
      property.hourlyIncome, property.hourlyUpkeep, landRules.paymentIntervalSeconds, now]);
  await sql.query('INSERT INTO land_accounts(character_id) VALUES($1) ON CONFLICT DO NOTHING', [characterId]);
  return id;
}
