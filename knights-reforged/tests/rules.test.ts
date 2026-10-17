import test from 'node:test';
import assert from 'node:assert/strict';
import { rules, levelFor, powerFor, regenerate, resolveCombat } from '../src/rules.js';
import { loadConfig } from '../src/config.js';

test('provisional progression unlocks a level at the defined threshold', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(rules.xpPerLevel - 1), 1);
  assert.equal(levelFor(rules.xpPerLevel), 2);
  assert.ok(powerFor(rules.xpPerLevel, 0, false).attack > powerFor(0, 0, false).attack);
});

test('regeneration preserves a fractional tick and caps resources', () => {
  const start = new Date('2026-10-17T12:00:00Z');
  const partial = regenerate(1, 10, start, new Date(start.getTime() + 45000), 30);
  assert.equal(partial.value, 2);
  assert.equal(partial.updated.toISOString(), '2026-10-17T12:00:30.000Z');
  const remaining = regenerate(partial.value, 10, partial.updated, new Date(start.getTime() + 60000), 30);
  assert.equal(remaining.value, 3);
  const capped = regenerate(9, 10, start, new Date(start.getTime() + 300000), 30);
  assert.equal(capped.value, 10);
  assert.equal(capped.updated.toISOString(), '2026-10-17T12:05:00.000Z');
});

test('a negative elapsed interval never creates extra resources', () => {
  const start = new Date('2026-10-17T12:00:00Z');
  assert.equal(regenerate(2, 10, start, new Date(start.getTime() - 1000), 30).value, 2);
});

test('ties favor the defender; loot is limited by the loser balance', () => {
  const result = resolveCombat({ health: 100, attack: 5, defense: 5, gold: 3 },
    { health: 100, attack: 5, defense: 5, gold: 60 }, 0, 0);
  assert.equal(result.outcome, 'defender_win');
  assert.equal(result.loot, 3);
  assert.equal(result.attackerDamage, rules.combat.loserDamageMin);
});

test('combat health is bounded, and a fixed snapshot/roll is reproducible', () => {
  const attacker = { health: 1, attack: 1000, defense: 5, gold: 60 };
  const defender = { health: 2, attack: 5, defense: 5, gold: 1 };
  const result = resolveCombat(attacker, defender, 0, 0);
  assert.equal(result.outcome, 'attacker_win');
  assert.equal(result.attackerHealthAfter, 0);
  assert.equal(result.defenderHealthAfter, 0);
  assert.equal(result.defenderDamage, rules.combat.loserDamageMax);
  assert.equal(result.loot, 1);
  assert.deepEqual(resolveCombat(attacker, defender, 0, 0), result);
  assert.throws(() => resolveCombat(attacker, defender, 99, 0), /Invalid combat roll/);
});

test('a local development origin uses insecure cookies; HTTPS requires secure cookies', () => {
  assert.equal(loadConfig({ APP_ORIGIN: 'http://localhost:3000' }).secureCookies, false);
  assert.equal(loadConfig({ APP_ORIGIN: 'https://realm.example' }).secureCookies, true);
  assert.throws(() => loadConfig({ APP_ORIGIN: 'http://localhost:3000', NODE_ENV: 'production' }), /HTTPS/);
  assert.throws(() => loadConfig({ APP_ORIGIN: 'http://bluepawgames.com' }), /historical host/);
  assert.throws(() => loadConfig({ APP_ORIGIN: 'http://sub.bluepawgames.com' }), /historical host/);
});
