import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/land.js', import.meta.url), 'utf8');
const response = (land = {}) => ({ ok: true, json: async () => ({ gold: 22,
  serverTime: '2026-10-17T13:00:00.000Z', land: { hourlyIncome: 8, hourlyUpkeep: 1,
    netHourlyIncome: 7, nextPaymentAt: '2026-10-17T14:00:00.000Z', pendingGold: '0',
    properties: [{ id: 'smallholding', owned: 1, remaining: 99, maxAffordable: 0 }],
    holdings: [{ id: 'holding-1', nextPaymentAt: '2026-10-17T14:00:00.000Z' }], ...land } }) });
const flush = () => new Promise(resolve => setImmediate(resolve));

function element(extra = {}) {
  return { textContent: '', hidden: false, dataset: {}, setAttribute(key, value) { this[key] = value; }, ...extra };
}
function browser(fetch, nextPayment = '2026-10-17T13:00:00.000Z') {
  let elapsed = 0;
  const intervals = [];
  const listeners = new Map();
  const selectors = new Map(['countdown', 'status', 'gross', 'upkeep', 'net', 'payment-time', 'pending', 'pending-gold']
    .map(name => ['[data-land-' + name + ']', element()]));
  const owned = element();
  const input = element({ value: '1', disabled: true });
  const button = element({ disabled: true });
  const hint = element();
  const card = element({ dataset: { landProperty: 'smallholding' }, querySelector(selector) {
    return { '[data-land-owned]': owned, 'input[name="quantity"]': input,
      'button[type="submit"]': button, '[data-land-buy-hint]': hint }[selector];
  } });
  const holding = element({ dataset: { holdingPayment: 'holding-1' } });
  const root = element({ dataset: { serverTime: '2026-10-17T12:00:00.000Z', nextPayment },
    querySelector: selector => selectors.get(selector) ?? null,
    querySelectorAll: selector => selector === '[data-land-property]' ? [card] : selector === '[data-holding-payment]' ? [holding] : [] });
  const wallet = element({ textContent: '15' });
  const document = { hidden: false, querySelector: selector => selector === '[data-land-screen]' ? root : null,
    querySelectorAll: selector => selector === '[data-wallet-gold]' ? [wallet] : [],
    addEventListener: (name, callback) => listeners.set(name, callback) };
  const requests = [];
  runInNewContext(source, { document, performance: { now: () => elapsed }, AbortController,
    fetch: async (url, options) => { requests.push({ url, options }); return fetch(url, options); },
    setInterval: (callback, delay) => intervals.push({ callback, delay }),
    setTimeout: () => 1, clearTimeout: () => {} });
  return { selectors, document, listeners, requests, wallet, input, button, holding,
    tick(milliseconds) { elapsed += milliseconds; intervals.find(timer => timer.delay === 1000).callback(); },
    poll() { intervals.find(timer => timer.delay === 30000).callback(); } };
}

test('countdown uses the server timestamp and monotonic elapsed time, not the device wall clock', () => {
  const page = browser(async () => response());
  assert.equal(page.selectors.get('[data-land-countdown]').textContent, '01:00:00');
  page.tick(61000);
  assert.equal(page.selectors.get('[data-land-countdown]').textContent, '00:58:59');
  assert.equal(page.requests.length, 0);
  assert.equal(page.wallet.textContent, '15');
});

test('a due countdown cannot mint gold; overlapping ticks issue one server request', async () => {
  let finish;
  const page = browser(() => new Promise(resolve => { finish = resolve; }));
  page.tick(3600000);
  page.tick(1000);
  assert.equal(page.requests.length, 1);
  assert.equal(page.wallet.textContent, '15');
  assert.match(page.selectors.get('[data-land-countdown]').textContent, /Payment due/);
  finish(response());
  await flush();
  assert.equal(page.wallet.textContent, '22');
  assert.equal(page.selectors.get('[data-land-countdown]').textContent, '01:00:00');
  assert.equal(page.requests[0].url, '/api/v1/land');
  assert.notEqual(page.requests[0].options.method, 'POST');
});

test('API refresh displays server rates, availability and the next persisted holding payment', async () => {
  const page = browser(async () => response({ hourlyIncome: 38, hourlyUpkeep: 8, netHourlyIncome: 30,
    properties: [{ id: 'smallholding', owned: 3, remaining: 97, maxAffordable: 2 }] }));
  page.poll();
  await flush();
  assert.equal(page.selectors.get('[data-land-gross]').textContent, '38');
  assert.equal(page.selectors.get('[data-land-upkeep]').textContent, '8');
  assert.equal(page.selectors.get('[data-land-net]').textContent, '30');
  assert.equal(page.input.max, '2');
  assert.equal(page.input.disabled, false);
  assert.equal(page.button.disabled, false);
  assert.equal(page.holding.datetime, '2026-10-17T14:00:00.000Z');
});

test('offline fetch failures preserve displayed gold and retry on reconnect', async () => {
  let online = false;
  const page = browser(async () => { if (!online) throw new Error('offline'); return response(); });
  page.poll();
  await flush();
  assert.equal(page.wallet.textContent, '15');
  assert.match(page.selectors.get('[data-land-status]').textContent, /unavailable/);
  online = true;
  page.tick(16000);
  page.listeners.get('visibilitychange')();
  await flush();
  assert.equal(page.wallet.textContent, '22');
});

test('a player without holdings sees no timer or synthetic income payment', () => {
  const page = browser(async () => response(), '');
  page.tick(7200000);
  assert.equal(page.selectors.get('[data-land-countdown]').textContent, 'No property owned');
  assert.equal(page.requests.length, 0);
  assert.equal(page.wallet.textContent, '15');
});

test('unclaimed amounts are displayed exactly even beyond safe JavaScript number precision', async () => {
  const page = browser(async () => response({ pendingGold: '99999900000000000' }));
  page.poll();
  await flush();
  assert.equal(page.selectors.get('[data-land-pending]').hidden, false);
  assert.equal(page.selectors.get('[data-land-pending-gold]').textContent, '99,999,900,000,000,000');
});

test('a wealthy character cannot enable a level-locked Land purchase through polling', async () => {
  const page = browser(async () => response({ properties: [{ id:'smallholding', owned:0, remaining:100, maxAffordable:10, unlocked:false, level:7 }] }));
  page.poll();await flush();
  assert.equal(page.button.disabled,true);assert.equal(page.input.disabled,true);
});
