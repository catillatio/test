import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createDatabase, transaction, type Database } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/migrate.js';
import { rules } from '../src/rules.js';
import { alpha, propertyPrice } from '../src/alpha-rules.js';
import { landRules } from '../src/land-rules.js';
import { settleLand } from '../src/land.js';
import { lockCharacters, clock } from '../src/game.js';

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
    assert.equal(form.headers['referrer-policy'],'same-origin');
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

  test('registration creates persistent state, hashes passwords/tokens, and renders all six screens', async () => {
    const actor = await player();
    const state = await me(actor);
    assert.equal(state.gold, rules.startingGold);
    for (const screen of ['home', 'quests', 'battle', 'armory', 'army', 'land']) {
      const response = await app.inject({ method: 'GET', url: '/game/' + screen, headers: { cookie: actor.cookie } });
      assert.equal(response.statusCode, 200, response.body);
      assert.match(String(response.headers['content-type'] ?? ''), /text\/html/);
      assert.match(response.body, /aria-label="Primary navigation"/);
      const primary = /<nav\b[^>]*aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/.exec(response.body)?.[1];
      assert.ok(primary);
      assert.deepEqual([...primary.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]),
        ['/game/home', '/game/quests', '/game/battle', '/game/armory', '/game/army']);
      assert.match(primary, /<span>Recruit<\/span>/);
      assert.ok(!primary.includes('/game/land'));
      const secondary = /<nav\b[^>]*aria-label="Secondary navigation"[^>]*>([\s\S]*?)<\/nav>/.exec(response.body)?.[1];
      assert.ok(secondary);
      assert.ok(!secondary?.includes('href="/game/land"'), 'Land is not a secondary shortcut');
      assert.equal(response.body.includes('href="/game/land"'),screen==='home');
      const activeCount = [...primary.matchAll(/aria-current="page"/g)].length;
      assert.equal(activeCount, screen === 'land' ? 0 : 1);
      if (screen === 'army') assert.match(response.body, /<h1>Recruit<\/h1>/);
      if (screen === 'land') {
        assert.match(secondary, /Home menu/);
        assert.match(response.body, /data-land-countdown/);
        assert.match(response.body, /data-wallet-gold/);
      }
      assert.ok(!response.body.includes('<%'));
    }
    const stored = (await db.query(`SELECT a.password_hash,s.token_hash FROM accounts a JOIN sessions s ON s.account_id=a.id
      WHERE a.username=$1`, [actor.username])).rows[0]!;
    assert.match(stored.password_hash, /^\$argon2id\$/);
    assert.notEqual(stored.token_hash, actor.cookie.split('=')[1]);
  });

  test('login rotates the session; logout revokes it; CSRF and foreign Origin are rejected', async () => {
    const actor = await player();
    const rejected = await app.inject({ method: 'POST', url: '/game/armory/buy', headers: { cookie: actor.cookie }, payload: { quantity: 1, unitId: rules.unit.id } });
    assert.equal(rejected.statusCode, 403);
    const badOrigin = await app.inject({ method: 'POST', url: '/api/v1/inventory/purchases', headers: {
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
    const reward = quest.json().data.gold;
    assert.ok(reward >= 8 && reward <= 12);
    assert.equal(quest.json().state.gold, rules.startingGold + reward);
    assert.equal(quest.json().state.xp, 4);
    // Historical army fixture: existing members survive the removal of paid recruitment.
    await db.query('UPDATE army_stacks SET quantity=2 WHERE character_id=$1',[actor.id]);
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
    assert.equal((await me(actor)).gold, rules.startingGold + responses[0]!.json().data.gold);
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM quest_runs WHERE character_id=$1', [actor.id])).rows[0]!.n, 1);
    const conflict = await command(actor, '/api/v1/inventory/purchases', { itemId: 'squires-blade', quantity: 1 }, id);
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().error.code, 'COMMAND_CONFLICT');
  });

  test('concurrent spending cannot overdraw the wallet and remains ledger-consistent', async () => {
    const actor = await player();
    const responses = await Promise.all([command(actor, '/api/v1/inventory/purchases', { itemId: 'squires-blade', quantity: 8 }),
      command(actor, '/api/v1/inventory/purchases', { itemId: 'squires-blade', quantity: 8 })]);
    assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 409]);
    const state = await me(actor);
    assert.equal(state.inventory.find((item:{id:string})=>item.id==='squires-blade').quantity,8);
    assert.equal(state.gold, rules.startingGold - 40);
    const total = (await db.query('SELECT sum(amount)::integer AS n FROM economy_entries WHERE character_id=$1', [actor.id])).rows[0]!.n;
    assert.equal(total, state.gold);
  });

  test('concurrent attacks serialize Spirit costs without a cooldown and self-attacks are rejected', async () => {
    const actor = await player(); const target1 = await player(); const target2 = await player();
    assert.equal((await command(actor, '/api/v1/battles', { targetCharacterId: actor.id })).statusCode, 422);
    const results = await Promise.all([command(actor, '/api/v1/battles', { targetCharacterId: target1.id }), command(actor, '/api/v1/battles', { targetCharacterId: target2.id })]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 200]);
    assert.equal((await me(actor)).spirit,1);
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM battles WHERE attacker_id=$1', [actor.id])).rows[0]!.n, 2);
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

  const property = landRules.properties[0]!;
  const netPerProperty = property.hourlyIncome - property.hourlyUpkeep;
  async function buyLand(actor: Player, quantity = 1, commandId = randomUUID()) {
    return command(actor, '/api/v1/land/purchases', { propertyId: property.id, quantity }, commandId);
  }
  async function ageHoldings(actor: Player, seconds: number) {
    // The single volatile CTE gives both timestamp columns the same DB clock.
    await db.query(`WITH stamp AS (SELECT clock_timestamp()-($2::integer * interval '1 second') AS at)
      UPDATE land_holdings SET acquired_at=stamp.at,accrued_through=stamp.at
      FROM stamp WHERE character_id=$1`, [actor.id, seconds]);
    await db.query('DELETE FROM income_cycles WHERE character_id=$1',[actor.id]); // Explicit fixture: re-adopt the moved historical clock.
  }
  async function ledgerBalance(actor: Player) {
    return (await db.query('SELECT sum(amount)::integer AS balance FROM economy_entries WHERE character_id=$1', [actor.id])).rows[0]!.balance;
  }

  test('Land migration is repeatable and preserves existing progress, balances and ownership', async () => {
    const actor = await player();
    await command(actor, `/api/v1/quests/${rules.quest.id}/runs`, {});
    assert.equal((await buyLand(actor)).statusCode, 200);
    const before = await me(actor);
    await migrate(db);
    await migrate(db);
    const after = await me(actor);
    assert.equal(after.gold, before.gold);
    assert.equal(after.xp, before.xp);
    assert.deepEqual(after.land.holdings, before.land.holdings);
    assert.equal((await db.query("SELECT count(*)::integer AS n FROM schema_migrations WHERE name='002_land.sql'")).rows[0]!.n, 1);
    assert.equal((await db.query('SELECT definition FROM rulesets WHERE id=$1', [rules.id])).rows[0]!.definition.startingGold, rules.startingGold);
  });

  test('Land screen and API require authentication and expose only the authenticated owner', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/game/land' })).statusCode, 302);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/land' })).statusCode, 401);
    const owner = await player(); const other = await player();
    assert.equal((await buyLand(owner)).statusCode, 200);
    const response = await app.inject({ method: 'GET', url: '/game/land', headers: { cookie: owner.cookie } });
    assert.equal(response.statusCode, 200, response.body);
    assert.match(response.body, /Reconstructed alpha economy/);
    assert.match(response.body, /data-land-countdown/);
    assert.ok(!response.body.includes('Refresh income'));
    assert.equal((await me(other)).land.holdings.length, 0);
    const api = await app.inject({ method: 'GET', url: '/api/v1/land?characterId=' + owner.id, headers: { cookie: other.cookie } });
    assert.equal(api.statusCode, 200);
    assert.equal(api.json().land.holdings.length, 0);
    const rejected = await app.inject({ method: 'POST', url: '/api/v1/land/purchases', headers: { cookie: owner.cookie }, payload: { propertyId: property.id, quantity: 1 } });
    assert.equal(rejected.statusCode, 403);
  });

  test('Land purchase ignores forged prices, ownership, rates and timestamps', async () => {
    const actor = await player(); const other = await player();
    const response = await command(actor, '/api/v1/land/purchases', { propertyId: property.id, quantity: 1,
      price: 0, characterId: other.id, hourlyIncome: 999999999, hourlyUpkeep: 0, acquiredAt: '2000-01-01T00:00:00Z' });
    assert.equal(response.statusCode, 200, response.body);
    const state = response.json().state;
    assert.equal(state.gold, rules.startingGold - property.price);
    assert.equal(state.land.hourlyIncome, property.hourlyIncome);
    assert.equal(state.land.hourlyUpkeep, property.hourlyUpkeep);
    assert.equal(state.land.netHourlyIncome, netPerProperty);
    assert.equal(state.land.pendingGold, '0');
    const batch = (await db.query('SELECT * FROM land_holdings WHERE id=$1', [response.json().holdingId])).rows[0]!;
    assert.equal(batch.character_id, actor.id);
    assert.equal(batch.unit_price, property.price);
    assert.equal(batch.hourly_income, property.hourlyIncome);
    assert.equal(batch.ruleset_id, alpha.id);
    assert.equal(new Date(state.land.nextPaymentAt).getTime() - new Date(batch.acquired_at).getTime(), 3600000);
    assert.equal(state.gold, await ledgerBalance(actor));
  });

  test('unknown properties and malformed or excessive quantities cannot mutate ownership or money', async () => {
    const actor = await player();
    assert.equal((await command(actor, '/api/v1/land/purchases', { propertyId: 'not-a-property', quantity: 1 })).statusCode, 404);
    for (const quantity of [0, -1, 1.5, true, null, '', '1.5', '01', '1e2', landRules.maxPurchaseQuantity + 1]) {
      const response = await command(actor, '/api/v1/land/purchases', { propertyId: property.id, quantity });
      assert.equal(response.statusCode, 422, JSON.stringify({ quantity, body: response.body }));
    }
    assert.equal((await me(actor)).gold, rules.startingGold);
    assert.equal((await me(actor)).land.holdings.length, 0);
  });

  test('Land HTML form accepts a whole-number string and uses the shared command receipt', async () => {
    const actor = await player();
    const response = await app.inject({ method: 'POST', url: '/game/land/buy', headers: { cookie: actor.cookie, origin: config.origin,
      'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ csrf: actor.csrf,
      commandId: randomUUID(), propertyId: property.id, quantity: '1' }).toString() });
    assert.equal(response.statusCode, 303, response.body);
    assert.match(String(response.headers.location), /^\/game\/purchases\//);
    assert.equal((await me(actor)).land.properties[0].owned, 1);
  });

  test('simultaneous Land retries buy once; a changed intent cannot reuse the receipt', async () => {
    const actor = await player(); const id = randomUUID();
    const responses = await Promise.all([buyLand(actor, 1, id), buyLand(actor, 1, id)]);
    for (const response of responses) assert.equal(response.statusCode, 200, response.body);
    assert.equal(responses[0]!.json().holdingId, responses[1]!.json().holdingId);
    assert.equal((await me(actor)).gold, rules.startingGold - property.price);
    assert.equal((await me(actor)).land.properties[0].owned, 1);
    const conflict = await buyLand(actor, 2, id);
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().error.code, 'COMMAND_CONFLICT');
  });

  test('concurrent distinct purchases cannot overspend a wallet', async () => {
    const actor = await player();
    const responses = await Promise.all([buyLand(actor), buyLand(actor)]);
    assert.deepEqual(responses.map(response => response.statusCode).sort(), [200, 409]);
    const state = await me(actor);
    assert.equal(state.gold, rules.startingGold - property.price);
    assert.equal(state.land.properties[0].owned, 1);
    assert.equal(state.gold, await ledgerBalance(actor));
  });

  test('ownership limits include older batches and cannot be bypassed by a new command', async () => {
    const actor = await player();
    const bought = await buyLand(actor);
    assert.equal(bought.statusCode, 200);
    await db.query('UPDATE land_holdings SET quantity=$2 WHERE id=$1', [bought.json().holdingId, landRules.maxOwnedPerProperty]);
    const response = await buyLand(actor);
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, 'LAND_LIMIT');
    assert.equal((await me(actor)).land.properties[0].owned, landRules.maxOwnedPerProperty);
  });

  test('offline income and upkeep settle all complete hours and concurrent reads never pay twice', async () => {
    const actor = await player();
    assert.equal((await buyLand(actor)).statusCode, 200);
    await ageHoldings(actor, 3 * 3600 + 20);
    const states = await Promise.all([me(actor), me(actor), me(actor)]);
    const expected = rules.startingGold - property.price + 3 * netPerProperty;
    for (const state of states) assert.equal(state.gold, expected);
    const history = (await db.query(`SELECT s.* FROM land_income_settlements s JOIN land_holdings h ON h.id=s.holding_id
      WHERE h.character_id=$1`, [actor.id])).rows;
    assert.equal(history.length, 1);
    assert.equal(Number(history[0]!.interval_count), 3);
    assert.equal(BigInt(history[0]!.gross_gold), BigInt(3 * property.hourlyIncome));
    assert.equal(BigInt(history[0]!.upkeep_gold), BigInt(3 * property.hourlyUpkeep));
    assert.equal((await me(actor)).gold, expected);
    assert.equal(await ledgerBalance(actor), expected);
    const remaining = Date.parse(states[0].land.nextPaymentAt) - Date.parse(states[0].serverTime);
    assert.ok(remaining > 3000000 && remaining <= 3600000, 'Fractional hour must not be reset or paid early.');
  });

  test('a later purchase does not receive retroactive income from an older property', async () => {
    const actor = await player();
    let rewards = 0;
    for (let i=0;i<3;i++) rewards += (await command(actor, `/api/v1/quests/${rules.quest.id}/runs`, {})).json().data.gold;
    assert.equal((await buyLand(actor)).statusCode, 200);
    await ageHoldings(actor, 3 * 3600 + 20);
    const second = await buyLand(actor);
    assert.equal(second.statusCode, 200, second.body);
    const state = second.json().state;
    assert.equal(state.gold, rules.startingGold + rewards - property.price - propertyPrice(property.price,1) + 3 * netPerProperty);
    assert.equal(state.land.holdings.length, 2);
    assert.equal(state.land.properties[0].owned, 2);
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM land_income_settlements WHERE holding_id=$1', [second.json().holdingId])).rows[0]!.n, 0);
  });

  test('half an hour and a clock moved into the future cannot pay income', async () => {
    const actor = await player();
    assert.equal((await buyLand(actor)).statusCode, 200);
    await ageHoldings(actor, 1800);
    assert.equal((await me(actor)).gold, rules.startingGold - property.price);
    await ageHoldings(actor, -3600);
    assert.equal((await me(actor)).gold, rules.startingGold - property.price);
  });

  test('an aborted settlement rolls back the cursor, history, pending income and wallet together', async () => {
    const actor = await player();
    assert.equal((await buyLand(actor)).statusCode, 200);
    await ageHoldings(actor, 3600 + 20);
    const before = (await db.query('SELECT accrued_through FROM land_holdings WHERE character_id=$1', [actor.id])).rows[0]!.accrued_through;
    await assert.rejects(transaction(db, async client => {
      await lockCharacters(client, [actor.id]);
      await settleLand(client, actor.id, await clock(client));
      throw new Error('Simulated transaction failure');
    }), /Simulated transaction failure/);
    const cursor = (await db.query('SELECT accrued_through FROM land_holdings WHERE character_id=$1', [actor.id])).rows[0]!.accrued_through;
    assert.equal(new Date(cursor).toISOString(), new Date(before).toISOString());
    assert.equal((await db.query('SELECT balance FROM wallets WHERE character_id=$1', [actor.id])).rows[0]!.balance, rules.startingGold - property.price);
    assert.equal((await me(actor)).gold, rules.startingGold - property.price + netPerProperty);
    assert.equal(await ledgerBalance(actor), rules.startingGold - property.price + netPerProperty);
  });

  test('offline defender income is materialized before the existing PvP snapshot and loot calculation', async () => {
    const attacker = await player(); const defender = await player();
    assert.equal((await buyLand(defender)).statusCode, 200);
    await ageHoldings(defender, 3 * 3600 + 20);
    const response = await command(attacker, '/api/v1/battles', { targetCharacterId: defender.id });
    assert.equal(response.statusCode, 200, response.body);
    const snapshot = (await db.query('SELECT snapshot FROM battles WHERE id=$1', [response.json().battleId])).rows[0]!.snapshot;
    assert.equal(snapshot.defender.gold, rules.startingGold - property.price + 3 * netPerProperty);
    assert.equal((await me(attacker)).gold + (await me(defender)).gold, 2 * rules.startingGold - property.price + 3 * netPerProperty);
  });

  test('ownership, accrued phase and unpaid offline income survive application recreation', async () => {
    const actor = await player();
    assert.equal((await buyLand(actor)).statusCode, 200);
    await ageHoldings(actor, 2 * 3600 + 20);
    await app.close();
    app = await createApp({ db, config });
    const state = await me(actor);
    assert.equal(state.land.properties[0].owned, 1);
    assert.equal(state.gold, rules.startingGold - property.price + 2 * netPerProperty);
    assert.equal((await me(actor)).gold, state.gold);
  });

  test('a full existing treasury retains income durably and collects it after spending', async () => {
    const actor = await player();
    assert.equal((await buyLand(actor)).statusCode, 200);
    // Administrative fixture, deliberately independent of normal gameplay grants.
    await db.query('UPDATE wallets SET balance=2147483647 WHERE character_id=$1', [actor.id]);
    await ageHoldings(actor, 3 * 3600 + 20);
    const full = await me(actor);
    assert.equal(full.gold, 2147483647);
    assert.equal(full.land.pendingGold, String(3 * netPerProperty));
    const purchase = await buyLand(actor);
    assert.equal(purchase.statusCode, 200, purchase.body);
    assert.equal(purchase.json().state.land.pendingGold, '0');
    assert.equal(purchase.json().state.gold, 2147483647 - propertyPrice(property.price,1) + 3 * netPerProperty);
  });
});
