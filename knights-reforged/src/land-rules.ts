import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LandProperty {
  id: string; name: string; description: string; price: number;
  hourlyIncome: number; hourlyUpkeep: number;
}
export interface LandRules {
  id: string; provenance: string; intervalProvenance: string;
  paymentIntervalSeconds: number; maxPurchaseQuantity: number; maxOwnedPerProperty: number;
  properties: LandProperty[];
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

// Fail at startup rather than accepting corrupt or unsafe server configuration.
// This version permits nonnegative property net income; troop/item upkeep is unchanged.
export function validateLandRules(input: unknown): LandRules {
  if (!input || typeof input !== 'object') throw new Error('Land rules must be an object.');
  const value = input as LandRules;
  if (typeof value.id !== 'string' || !/^[a-z0-9.-]{1,80}$/.test(value.id) ||
      typeof value.provenance !== 'string' || !value.provenance.trim() ||
      typeof value.intervalProvenance !== 'string' || !value.intervalProvenance.trim() ||
      value.paymentIntervalSeconds !== 3600 ||
      !integer(value.maxOwnedPerProperty, 1, 1000000) ||
      !integer(value.maxPurchaseQuantity, 1, value.maxOwnedPerProperty) ||
      !Array.isArray(value.properties) || !value.properties.length || value.properties.length > 100) {
    throw new Error('Invalid Land rules configuration.');
  }
  const ids = new Set<string>();
  for (const property of value.properties) {
    if (!property || typeof property.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(property.id) ||
        ids.has(property.id) || typeof property.name !== 'string' || !property.name.trim() || property.name.length > 80 ||
        typeof property.description !== 'string' || property.description.length > 500 ||
        !integer(property.price, 1, 2147483647) || !integer(property.hourlyIncome, 0, 1000000) ||
        !integer(property.hourlyUpkeep, 0, property.hourlyIncome) ||
        !Number.isSafeInteger(property.price * value.maxPurchaseQuantity)) {
      throw new Error('Invalid or duplicate provisional Land property.');
    }
    ids.add(property.id);
  }
  return value;
}

export const landRules = validateLandRules(JSON.parse(readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)), '../rulesets/land-provisional-0.1/rules.json'), 'utf8')));

export interface LandAccrual {
  intervals: number; throughAt: Date; grossGold: bigint; upkeepGold: bigint; netGold: bigint;
}

// Use integer arithmetic for arbitrarily long absences. Return full intervals
// only, retaining the original phase; reads/restarts cannot reset the clock.
export function calculateLandAccrual(throughAt: Date, now: Date, intervalSeconds: number,
  quantity: number, hourlyIncome: number, hourlyUpkeep: number): LandAccrual {
  if (!Number.isFinite(throughAt.getTime()) || !Number.isFinite(now.getTime()) ||
      !integer(intervalSeconds, 1, 86400) || !integer(quantity, 1, 1000000) ||
      !integer(hourlyIncome, 0, 1000000) || !integer(hourlyUpkeep, 0, hourlyIncome)) {
    throw new RangeError('Invalid Land accrual input.');
  }
  const from = BigInt(throughAt.getTime());
  const elapsed = BigInt(now.getTime()) - from;
  const duration = BigInt(intervalSeconds) * 1000n;
  const intervals = elapsed > 0n ? elapsed / duration : 0n;
  const grossGold = intervals * BigInt(quantity) * BigInt(hourlyIncome);
  const upkeepGold = intervals * BigInt(quantity) * BigInt(hourlyUpkeep);
  return { intervals: Number(intervals), throughAt: new Date(Number(from + intervals * duration)),
    grossGold, upkeepGold, netGold: grossGold - upkeepGold };
}

// The existing game uses integer wallets. Keep excess earned gold durable,
// rather than overflowing that schema, dropping income, or blocking spending.
export function landCreditAmount(balance: number, pendingGold: bigint): number {
  if (!integer(balance, 0, 2147483647) || pendingGold < 0n) throw new RangeError('Invalid Land credit input.');
  const available = BigInt(2147483647 - balance);
  return Number(pendingGold < available ? pendingGold : available);
}
