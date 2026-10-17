import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLandAccrual, landCreditAmount, landRules, validateLandRules } from '../src/land-rules.js';

const start = new Date('2026-10-17T12:00:00.000Z');
const at = (milliseconds: number) => new Date(start.getTime() + milliseconds);

test('Land is explicitly provisional with a 60-minute payment interval', () => {
  assert.match(landRules.provenance, /provisional/i);
  assert.match(landRules.intervalProvenance, /recollection/i);
  assert.equal(landRules.paymentIntervalSeconds, 3600);
  assert.ok(landRules.properties.some(property => property.price <= 60), 'A starting character can buy property.');
});

test('a property earns nothing until one entire hour has passed', () => {
  for (const elapsed of [0, 1, 1800000, 3599999]) {
    const payment = calculateLandAccrual(start, at(elapsed), 3600, 2, 8, 1);
    assert.equal(payment.intervals, 0);
    assert.equal(payment.netGold, 0n);
    assert.equal(payment.throughAt.toISOString(), start.toISOString());
  }
});

test('the exact one-hour boundary pays gross income less property upkeep', () => {
  const payment = calculateLandAccrual(start, at(3600000), 3600, 2, 8, 1);
  assert.equal(payment.intervals, 1);
  assert.equal(payment.grossGold, 16n);
  assert.equal(payment.upkeepGold, 2n);
  assert.equal(payment.netGold, 14n);
  assert.equal(payment.throughAt.toISOString(), '2026-10-17T13:00:00.000Z');
});

test('offline catch-up pays every full hour and retains the fractional hour', () => {
  const now = at(25 * 3600000 + 123456);
  const payment = calculateLandAccrual(start, now, 3600, 3, 18, 3);
  assert.equal(payment.intervals, 25);
  assert.equal(payment.netGold, 1125n);
  assert.equal(now.getTime() - payment.throughAt.getTime(), 123456);
  const retry = calculateLandAccrual(payment.throughAt, now, 3600, 3, 18, 3);
  assert.equal(retry.intervals, 0);
  assert.equal(retry.netGold, 0n);
  const next = calculateLandAccrual(payment.throughAt, at(26 * 3600000), 3600, 3, 18, 3);
  assert.equal(next.netGold, 45n);
});

test('new purchases do not receive an old holding’s accrued income', () => {
  const now = at(3 * 3600000 + 1000);
  const old = calculateLandAccrual(start, now, 3600, 1, 8, 1);
  const boughtNow = calculateLandAccrual(now, now, 3600, 1, 38, 8);
  assert.equal(old.netGold, 21n);
  assert.equal(boughtNow.netGold, 0n);
});

test('the cursor phase is not reset by a late settlement or process restart', () => {
  const first = calculateLandAccrual(start, at(3600000 + 2700000), 3600, 1, 8, 1);
  const persisted = new Date(first.throughAt.toISOString());
  const second = calculateLandAccrual(persisted, at(2 * 3600000), 3600, 1, 8, 1);
  assert.equal(first.netGold + second.netGold, 14n);
  assert.equal(second.throughAt.toISOString(), '2026-10-17T14:00:00.000Z');
});

test('a clock earlier than the persisted cursor cannot generate money or regress it', () => {
  const payment = calculateLandAccrual(start, at(-3600000), 3600, 1, 8, 1);
  assert.equal(payment.netGold, 0n);
  assert.equal(payment.throughAt.toISOString(), start.toISOString());
});

test('large offline balances use exact integers rather than floating point currency', () => {
  const payment = calculateLandAccrual(start, at(100000 * 3600000), 3600, 1000000, 1000000, 1);
  assert.equal(payment.grossGold, 100000000000000000n);
  assert.equal(payment.netGold, 99999900000000000n);
  assert.ok(payment.netGold > BigInt(Number.MAX_SAFE_INTEGER));
});

test('invalid quantities, rates, dates and intervals are rejected', () => {
  for (const quantity of [0, -1, 1.5, Infinity, NaN]) {
    assert.throws(() => calculateLandAccrual(start, at(3600000), 3600, quantity, 8, 1), RangeError);
  }
  assert.throws(() => calculateLandAccrual(start, at(3600000), 0, 1, 8, 1), RangeError);
  assert.throws(() => calculateLandAccrual(start, at(3600000), 3600, 1, 8, 9), RangeError);
  assert.throws(() => calculateLandAccrual(new Date('invalid'), start, 3600, 1, 8, 1), RangeError);
});

test('server configuration rejects duplicate IDs, invalid prices and unsupported negative net income', () => {
  const duplicate = structuredClone(landRules);
  duplicate.properties.push({ ...duplicate.properties[0]! });
  assert.throws(() => validateLandRules(duplicate), /duplicate/);
  for (const invalidPrice of [-1, 0, 1.2, NaN, Infinity, 2147483648]) {
    const invalid = structuredClone(landRules);
    invalid.properties[0]!.price = invalidPrice;
    assert.throws(() => validateLandRules(invalid), /Invalid/);
  }
  const insolvent = structuredClone(landRules);
  insolvent.properties[0]!.hourlyUpkeep = insolvent.properties[0]!.hourlyIncome + 1;
  assert.throws(() => validateLandRules(insolvent), /Invalid/);
  const wrongInterval = structuredClone(landRules);
  wrongInterval.paymentIntervalSeconds = 1800;
  assert.throws(() => validateLandRules(wrongInterval), /Invalid/);
});

test('existing integer wallets retain excess passive income instead of overflowing', () => {
  const pending = 99999900000000000n;
  const credit = landCreditAmount(2147483640, pending);
  assert.equal(credit, 7);
  assert.equal(pending - BigInt(credit), 99999899999999993n);
  assert.equal(landCreditAmount(2147483647, pending), 0);
  assert.equal(landCreditAmount(15, 21n), 21);
  assert.equal(landCreditAmount(0, 0n), 0);
});

test('upkeep equal to income settles without debt or an invented insolvency rule', () => {
  const payment = calculateLandAccrual(start, at(3600000), 3600, 4, 5, 5);
  assert.equal(payment.grossGold, 20n);
  assert.equal(payment.upkeepGold, 20n);
  assert.equal(payment.netGold, 0n);
});
