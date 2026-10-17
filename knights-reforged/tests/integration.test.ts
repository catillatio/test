import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createDatabase, type Database } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/migrate.js';
import { rules } from '../src/rules.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.TEST_ENGINE === 'postgres' && !databaseUrl) throw new Error('test:postgres requires an explicit TEST_DATABASE_URL pointing at a disposable *_test database.');
if (databaseUrl) {
  const url = new URL(databaseUrl);
  const allowed = ['localhost', '127.0.0.1', '[::1]', process.env.ALLOWED_TEST_DATABASE_HOST].filter(Boolean);
  if (!allowed.includes(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error('Tests require a local/designated host and a database name ending in _test.');
  }
}

describe('PostgreSQL + Fastify integration', { skip: !databaseUrl ? 'Set TEST_DATABASE_URL to run real database/HTTP tests.' : false }, () => {
  let db: Database;
  let app: Awaited<ReturnType<typeof createApp>>;
  const config = loadConfig({ NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000', DATABASE_URL: databaseUrl });
  const prefix = 't_' + randomUUID().replaceAll('-', '').slice(0, 10);
  let counter = 0;
  interface Player { cookie: string; csrf: string; id: string; username: string; }
  const sessionCookie = (response: { headers: Record<string, unknown> }) => {
    const headers = response.headers['set-cookie'];
    const line = (Array.isArray(headers) ? headers.map(String) : [String(headers ?? '')]).find(value => value.startsWith('kr_session='));
    assert.ok(line, 'Session cookie must be issued.');
    return line.split(';')[0]!;
  };
  async function player(): Promise<Player> {
    const username = `${prefix}_${counter++}`;
    const form = await app.inject({ method: 'GET', url: '/register' });
    assert.equal(form.statusCode, 200);
    const csrf = /name="csrf" value="([a-f0-9]{64})"/.exec(form.body)?.[1];
    assert.ok(csrf);
    const response = await app.inject({ method: 'POST', url: '/register', headers: {
      cookie: sessionCookie(form), origin: config.origin, 'content-type': 'application/x-www-form-urlencoded',
    }, payload: new URLSearchParams({ csrf, username, name: 'Test Warrior ' + counter, password: 'IntegrationPass!2026' }).toString() });
    assert.equal(response.statusCode, 303, response.body);
    const cookie = sessionCookie(response);
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    assert.equal(me.statusCode, 200, me.body);
    return { cookie, csrf: me.json().csrfToken, id: me.json().state.id, username };
  }
  async function me(actor: Player) {
    const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: actor.cookie } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().state;
  }
  async function command(actor: Player, url: string, payload: Record<string, unknown>, id = randomUUID()) {
    return app.inject({ method: 'POST', url, headers: { cookie: actor.cookie, origin: config.origin,
      'x-csrf-token': actor.csrf, 'idempotency-key': id, accept: 'application/json' }, payload });
  }

  before(async () => {
    db = createDatabase(databaseUrl!);
    await migrate(db);
    app = await createApp({ db, config });
  });
  after(async () => { if (app) await app.close(); if (db) await db.end(); });

  test('registration creates persistent state, hashes passwords/tokens, and renders all five screens', async () => {
    const actor = await player();
    const state = await me(actor);
    assert.equal(state.gold, rules.startingGold);
    for (const screen of ['home', 'quests', 'battle', 'armory', 'army']) {
      const response = await app.inject({ method: 'GET', url: '/game/' + screen, headers: { cookie: actor.cookie } });
      assert.equal(response.statusCode, 200, response.body);
      assert.match(String(response.headers['content-type'] ?? ''), /text\/html/);
      assert.match(response.body, /aria-label="Primary navigation"/);
      assert.ok(!response.body.includes('<%'));
    }
    const stored = (await db.query(`SELECT a.password_hash,s.token_hash FROM accounts a JOIN sessions s ON s.account_id=a.id
      WHERE a.username=$1`, [actor.username])).rows[0]!;
    assert.match(stored.password_hash, /^\$argon2id\$/);
    assert.notEqual(stored.token_hash, actor.cookie.split('=')[1]);
  });

  test('login rotates the session; logout revokes it; CSRF and foreign Origin are rejected', async () => {
    const actor = await player();
    const rejected = await app.inject({ method: 'POST', url: '/game/army/recruit', headers: { cookie: actor.cookie }, payload: { quantity: 1, unitId: rules.unit.id } });
    assert.equal(rejected.statusCode, 403);
    const badOrigin = await app.inject({ method: 'POST', url: '/api/v1/army/recruitments', headers: {
      cookie: actor.cookie, 'x-csrf-token': actor.csrf, origin: 'https://unrelated.invalid', 'idempotency-key': randomUUID(),
    }, payload: { quantity: 1, unitId: rules.unit.id } });
    assert.equal(badOrigin.statusCode, 403);
    const logout = await app.inject({ method: 'POST', url: '/logout', headers: { cookie: actor.cookie }, payload: { csrf: actor.csrf } });
    assert.equal(logout.statusCode, 303);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: actor.cookie } })).statusCode, 401);
    const form = await app.inject({ method: 'GET', url: '/login' });
    const csrf = /name="csrf" value="([a-f0-9]{64})"/.exec(form.body)![1]!;
    const anonymousCookie = sessionCookie(form);
    const login = await app.inject({ method: 'POST', url: '/login', headers: { cookie: anonymousCookie },
      payload: { csrf, username: actor.username, password: 'IntegrationPass!2026' } });
    assert.equal(login.statusCode, 303);
    assert.notEqual(sessionCookie(login), actor.cookie);
    assert.notEqual(sessionCookie(login), anonymousCookie);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: sessionCookie(login) } })).json().state.id, actor.id);
  });

  test('the quest/recruit/buy/equip/PvP loop changes both players and stores one shared private report', async () => {
    const actor = await player(); const target = await player(); const outsider = await player();
    const quest = await command(actor, `/api/v1/quests/${rules.quest.id}/runs`, { goldReward: 9999999, xp: 9999999 });
    assert.equal(quest.statusCode, 200, quest.body);
    assert.equal(quest.json().state.gold, rules.startingGold + rules.quest.goldReward);
    assert.equal(quest.json().state.xp, rules.quest.xpReward);
    assert.equal((await command(actor, '/api/v1/army/recruitments', { unitId: rules.unit.id, quantity: 2, price: 0 })).statusCode, 200);
    const buy = await command(actor, '/api/v1/inventory/purchases', { itemId: rules.weapon.id, price: 0 });
    assert.equal(buy.statusCode, 200, buy.body);
    assert.equal((await command(actor, '/api/v1/equipment', { inventoryEntryId: buy.json().inventoryEntryId })).statusCode, 200);
    assert.equal((await command(target, '/api/v1/equipment', { inventoryEntryId: buy.json().inventoryEntryId })).statusCode, 403);
    const before = await me(actor);
    const attack = await command(actor, '/api/v1/battles', { targetCharacterId: target.id, damage: 9999999, actorId: target.id });
    assert.equal(attack.statusCode, 200, attack.body);
    const id = attack.json().battleId;
    const aReport = await app.inject({ method: 'GET', url: '/api/v1/battles/' + id, headers: { cookie: actor.cookie } });
    const bReport = await app.inject({ method: 'GET', url: '/api/v1/battles/' + id, headers: { cookie: target.cookie } });
    assert.deepEqual(aReport.json(), bReport.json());
    const battle = aReport.json().battle;
    assert.equal(battle.attackerId, actor.id);
    assert.ok(battle.defenderDamage <= rules.combat.loserDamageMax);
    assert.equal((await me(actor)).health, battle.attackerHealthAfter);
    assert.equal((await me(target)).health, battle.defenderHealthAfter);
    assert.equal((await me(actor)).gold + (await me(target)).gold, before.gold + rules.startingGold);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/battles/' + id, headers: { cookie: outsider.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'GET', url: '/game/battles/' + id, headers: { cookie: actor.cookie } })).statusCode, 200);
  });

  test('simultaneous retries resolve once, and reusing the key for another intent is rejected', async () => {
    const actor = await player(); const id = randomUUID();
    const responses = await Promise.all([command(actor, `/api/v1/quests/${rules.quest.id}/runs`, {}, id), command(actor, `/api/v1/quests/${rules.quest.id}/runs`, {}, id)]);
    for (const response of responses) assert.equal(response.statusCode, 200, response.body);
    assert.equal(responses[0]!.json().commandId, responses[1]!.json().commandId);
    assert.equal((await me(actor)).gold, rules.startingGold + rules.quest.goldReward);
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM quest_runs WHERE character_id=$1', [actor.id])).rows[0]!.n, 1);
    const conflict = await command(actor, '/api/v1/army/recruitments', { unitId: rules.unit.id, quantity: 1 }, id);
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().error.code, 'COMMAND_CONFLICT');
  });

  test('concurrent spending cannot overdraw the wallet and remains ledger-consistent', async () => {
    const actor = await player();
    const responses = await Promise.all([command(actor, '/api/v1/army/recruitments', { unitId: rules.unit.id, quantity: 3 }),
      command(actor, '/api/v1/army/recruitments', { unitId: rules.unit.id, quantity: 3 })]);
    assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 409]);
    const state = await me(actor);
    assert.equal(state.units, 3);
    assert.equal(state.gold, rules.startingGold - 3 * rules.unit.goldCost);
    const total = (await db.query('SELECT sum(amount)::integer AS n FROM economy_entries WHERE character_id=$1', [actor.id])).rows[0]!.n;
    assert.equal(total, state.gold);
  });

  test('concurrent attacks obey the actor cooldown and self-attacks are rejected', async () => {
    const actor = await player(); const target1 = await player(); const target2 = await player();
    assert.equal((await command(actor, '/api/v1/battles', { targetCharacterId: actor.id })).statusCode, 422);
    const results = await Promise.all([command(actor, '/api/v1/battles', { targetCharacterId: target1.id }), command(actor, '/api/v1/battles', { targetCharacterId: target2.id })]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM battles WHERE attacker_id=$1', [actor.id])).rows[0]!.n, 1);
  });

  test('recreating the application preserves sessions, character progress, and inventory', async () => {
    const actor = await player();
    await command(actor, `/api/v1/quests/${rules.quest.id}/runs`, {});
    await command(actor, '/api/v1/inventory/purchases', { itemId: rules.weapon.id });
    const before = await me(actor);
    await app.close();
    app = await createApp({ db, config });
    const restored = await me(actor);
    assert.equal(restored.id, before.id);
    assert.equal(restored.gold, before.gold);
    assert.equal(restored.xp, before.xp);
    assert.equal(restored.inventoryId, before.inventoryId);
    assert.equal(restored.questsCompleted, before.questsCompleted);
  });
});
