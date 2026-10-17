// Offline source/interface inspection. Uses Node built-ins only.
// The template renderer checks the EJS tag subset used here; it is not the
// production EJS engine and does not establish Fastify/PostgreSQL correctness.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');
const manifest = JSON.parse(read('package.json'));
const rules = JSON.parse(read('rulesets/recreation-0.1/rules.json'));
const landRules = JSON.parse(read('rulesets/land-provisional-0.1/rules.json'));
const contractSource = stripTypeScriptTypes(read('src/http-contracts.ts'), { mode: 'transform' });
const { navigation, templateScreens, commandRoutes } = await import('data:text/javascript;base64,' + Buffer.from(contractSource).toString('base64'));
const results = [];
function check(name, run) {
  try { run(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}
function filesIn(dir, suffix) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? filesIn(join(dir, entry.name), suffix) : entry.name.endsWith(suffix) ? [join(dir, entry.name)] : []);
}

const sourceFiles = [...filesIn('src', '.ts'), ...filesIn('scripts', '.ts'), ...filesIn('tests', '.ts')];
check('TypeScript syntax parses with Node; no modules are imported/executed', () => {
  for (const file of sourceFiles) {
    const result = spawnSync(process.execPath, ['--experimental-transform-types', '--check', join(root, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, file + ': ' + result.stderr);
  }
});
check('Land browser script and offline test helper parse as JavaScript', () => {
  for (const file of ['public/land.js', 'scripts/register-typescript.mjs', 'tests/land-client.test.mjs']) {
    const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, file + ': ' + result.stderr);
  }
});
check('Local imports resolve and imported names exist; external packages are declared', () => {
  for (const file of sourceFiles) {
    const source = read(file);
    for (const match of source.matchAll(/\b(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier.startsWith('node:')) continue;
      if (!specifier.startsWith('.')) {
        const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
        assert.ok(manifest.dependencies?.[name] || manifest.devDependencies?.[name], `${file}: undeclared ${name}`);
        continue;
      }
      const target = resolve(root, dirname(file), specifier.replace(/\.js$/, '.ts'));
      assert.ok(existsSync(target), `${file}: missing ${specifier}`);
    }
    for (const match of source.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
      if (!match[2].startsWith('.')) continue;
      const target = resolve(root, dirname(file), match[2].replace(/\.js$/, '.ts'));
      const exports = new Set([...readFileSync(target, 'utf8').matchAll(/\bexport\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/g)].map(m => m[1]));
      for (const item of match[1].split(',')) {
        const original = item.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        assert.ok(exports.has(original), `${file}: ${original} not exported by ${match[2]}`);
      }
    }
  }
});
check('Every package script has its referenced project entrypoint', () => {
  for (const [name, command] of Object.entries(manifest.scripts)) {
    for (const match of command.matchAll(/\b((?:src|scripts|tests)\/[\w./*\-]+\.(?:ts|mjs))\b/g)) {
      const path = match[1];
      if (path.includes('*')) assert.ok(filesIn('tests', '.test.ts').length, `${name}: no test files`);
      else assert.ok(existsSync(join(root, path)), `${name}: missing ${path}`);
    }
  }
});
check('All server-selected templates and required partials exist', () => {
  for (const screen of ['layout', ...templateScreens]) assert.ok(existsSync(join(root, 'views', screen + '.ejs')), screen);
  for (const file of filesIn('views', '.ejs')) {
    for (const match of read(file).matchAll(/include\(['"]([^'"]+)['"]\)/g)) {
      assert.ok(existsSync(resolve(root, dirname(file), match[1] + '.ejs')), `${file}: missing include ${match[1]}`);
    }
  }
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' })[c]);
}
const compiled = new Map();
function compile(template) {
  let source = 'let __html = "";\n';
  let cursor = 0;
  for (const tag of template.matchAll(/<%([=\-#]?)([\s\S]*?)%>/g)) {
    source += '__html += ' + JSON.stringify(template.slice(cursor, tag.index)) + ';\n';
    if (tag[1] === '=') source += '__html += __escape((' + tag[2].trim() + '));\n';
    else if (tag[1] === '-') source += '__html += (' + tag[2].trim() + ');\n';
    else if (tag[1] !== '#') source += tag[2] + '\n';
    cursor = tag.index + tag[0].length;
  }
  source += '__html += ' + JSON.stringify(template.slice(cursor)) + ';\nreturn __html;';
  return new Function('__locals', '__escape', 'with (__locals) {\n' + source + '\n}');
}
function renderTemplate(name, data) {
  const path = 'views/' + name + '.ejs';
  if (!compiled.has(path)) compiled.set(path, compile(read(path)));
  const locals = { ...data, include: child => renderTemplate(child, data) };
  return compiled.get(path)(locals, escapeHtml);
}
const playerId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const inventoryId = '33333333-3333-4333-8333-333333333333';
const battleId = '44444444-4444-4444-8444-444444444444';
const holdingId = '55555555-5555-4555-8555-555555555555';
const sampleLand = { rulesetId: landRules.id, provisional: true, paymentIntervalSeconds: 3600,
  hourlyIncome: landRules.properties[0].hourlyIncome, hourlyUpkeep: landRules.properties[0].hourlyUpkeep,
  netHourlyIncome: landRules.properties[0].hourlyIncome - landRules.properties[0].hourlyUpkeep,
  nextPaymentAt: '2026-10-17T13:00:00.000Z', pendingGold: '0',
  properties: landRules.properties.map((p, index) => ({ ...p, owned: index === 0 ? 1 : 0,
    remaining: landRules.maxOwnedPerProperty - (index === 0 ? 1 : 0),
    maxPurchase: landRules.maxPurchaseQuantity, maxAffordable: Math.min(landRules.maxPurchaseQuantity, Math.floor(85 / p.price)) })),
  holdings: [{ id: holdingId, propertyId: landRules.properties[0].id, name: landRules.properties[0].name,
    quantity: 1, hourlyIncome: landRules.properties[0].hourlyIncome, hourlyUpkeep: landRules.properties[0].hourlyUpkeep,
    nextPaymentAt: '2026-10-17T13:00:00.000Z', rulesetId: landRules.id }] };
const baseState = { id: playerId, name: 'Arthur of the Vale', xp: 10, level: 1, health: 97, energy: 9,
  gold: 85, units: 2, attack: 11, defense: 9, equipped: false, inventoryId: null,
  questsCompleted: 1, stateVersion: 4, attackReadyAt: '2026-10-17T12:00:00.000Z',
  serverTime: '2026-10-17T12:01:00.000Z', energyNextAt: null, healthNextAt: null, land: sampleLand };
const sampleBattle = { id: battleId, attackerId: playerId, defenderId: targetId,
  attackerName: 'Arthur of the Vale', defenderName: 'Morgan Ironwood', winnerName: 'Arthur of the Vale',
  winnerId: playerId, loot: 10, attackPower: 25, attackRoll: 6, defensePower: 12, defenseRoll: 3,
  attackerDamage: 3, defenderDamage: 18, attackerHealthAfter: 94, defenderHealthAfter: 82,
  attackerXp: 5, createdAt: '2026-10-17T12:00:00.000Z' };
const opponent = { id: targetId, name: 'Morgan Ironwood', level: 1, units: 2, health: 100 };
const fixture = (screen, extra = {}) => ({ screen, state: { ...baseState }, nav: navigation, rules, landRules,
  csrf: 'a'.repeat(64), accountName: 'arthur', commandId: randomUUID, notice: null, error: null,
  opponents: [opponent], battles: [], battle: sampleBattle, title: navigation.find(item => item.id === screen)?.label ?? 'The First Realm',
  authMode: 'login', formValues: { username: '', name: '' }, ...extra });
const cases = [
  ...navigation.map(item => ({ name: item.id, data: fixture(item.id) })),
  { name: 'land-empty', data: fixture('land', { state: { ...baseState, land: { ...sampleLand,
    hourlyIncome: 0, hourlyUpkeep: 0, netHourlyIncome: 0, nextPaymentAt: null, holdings: [],
    properties: sampleLand.properties.map(p => ({ ...p, owned: 0 })) } } }) },
  { name: 'land-no-gold', data: fixture('land', { state: { ...baseState, gold: 0, land: { ...sampleLand,
    properties: sampleLand.properties.map(p => ({ ...p, maxAffordable: 0 })) } } }) },
  { name: 'land-limit', data: fixture('land', { state: { ...baseState, land: { ...sampleLand,
    properties: sampleLand.properties.map(p => ({ ...p, owned: landRules.maxOwnedPerProperty, remaining: 0, maxPurchase: 0, maxAffordable: 0 })) } } }) },
  { name: 'land-unclaimed-income', data: fixture('land', { state: { ...baseState, land: { ...sampleLand, pendingGold: '99999900000000000' } } }) },
  { name: 'armory-owned', data: fixture('armory', { state: { ...baseState, inventoryId } }) },
  { name: 'armory-equipped', data: fixture('armory', { state: { ...baseState, inventoryId, equipped: true } }) },
  { name: 'army-full', data: fixture('army', { state: { ...baseState, units: rules.armyCapacity } }) },
  { name: 'army-no-gold', data: fixture('army', { state: { ...baseState, gold: 0 } }) },
  { name: 'quest-no-energy', data: fixture('quests', { state: { ...baseState, energy: 0 } }) },
  { name: 'quest-recovering', data: fixture('quests', { state: { ...baseState, health: 0 } }) },
  { name: 'battle-empty', data: fixture('battle', { opponents: [] }) },
  { name: 'battle-recovering', data: fixture('battle', { state: { ...baseState, health: 0 } }) },
  { name: 'battle-no-energy', data: fixture('battle', { state: { ...baseState, energy: 0 } }) },
  { name: 'battle-cooldown', data: fixture('battle', { state: { ...baseState, attackReadyAt: '2026-10-17T12:01:10.000Z' } }) },
  { name: 'battle-defeated-opponent', data: fixture('battle', { opponents: [{ ...opponent, health: 0 }] }) },
  { name: 'home-history', data: fixture('home', { battles: [{ id: battleId, result: sampleBattle, created_at: sampleBattle.createdAt }] }) },
  { name: 'report-victory', data: fixture('report') },
  { name: 'report-defeat', data: fixture('report', { battle: { ...sampleBattle, winnerId: targetId, winnerName: opponent.name } }) },
  { name: 'login', data: fixture('auth', { state: null }) },
  { name: 'register', data: fixture('auth', { state: null, authMode: 'register' }) },
  { name: 'auth-error', data: fixture('auth', { state: null, error: 'Please try again.', formValues: { username: 'a"<script>x</script>', name: '<img src=x onerror=1>' } }) },
  { name: 'rules-public', data: fixture('rules', { state: null }) },
  { name: 'rules-authenticated', data: fixture('rules') },
  { name: 'error-public', data: fixture('error', { state: null, error: 'Unavailable.' }) },
  { name: 'error-authenticated', data: fixture('error', { error: 'Unavailable.' }) },
  { name: 'escaped-warrior-name', data: fixture('home', { state: { ...baseState, name: '<img src=x onerror=1>' } }) },
];
const rendered = new Map();
for (const example of cases) {
  check('Template-subset render: ' + example.name, () => {
    const html = renderTemplate('layout', example.data);
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(!html.includes('<%'), 'unprocessed template tag');
    assert.ok(!html.includes('<script>') && !html.includes('<img src=x'), 'unescaped fixture input');
    rendered.set(example.name, html);
  });
}
const attributes = text => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const routeRegex = route => new RegExp('^' + route.split('/').map(s => s.startsWith(':') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/') + '$');
const getPatterns = ['/', '/login', '/register', '/rules', ...navigation.map(n => '/game/' + n.id), '/game/battles/:id'].map(routeRegex);
const postPatterns = ['/login', '/register', '/logout', ...commandRoutes.map(r => r.html)].map(routeRegex);
const covered = new Set();
check('Rendered links, image paths, IDs, labels, CSRF fields, and POST contracts', () => {
  for (const [name, html] of rendered) {
    const ids = [...html.matchAll(/\bid="([^"]*)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, name + ': duplicate ID');
    for (const match of html.matchAll(/<(?:a|link|img|script)\b([^>]+)>/g)) {
      const attrs = attributes(match[1]);
      const value = attrs.href ?? attrs.src;
      if (!value) continue;
      if (value.startsWith('#')) { assert.ok(ids.includes(value.slice(1)), name + ': missing fragment'); continue; }
      const url = new URL(value, 'http://local-check.invalid');
      assert.equal(url.origin, 'http://local-check.invalid', name + ': external URL');
      if (url.pathname.startsWith('/assets/')) assert.ok(existsSync(join(root, 'public', url.pathname.slice(8))), name + ': missing ' + url.pathname);
      else assert.ok(getPatterns.some(p => p.test(url.pathname)), name + ': unhandled GET ' + url.pathname);
    }
    for (const match of html.matchAll(/<label\b([^>]+)>/g)) {
      const attrs = attributes(match[1]);
      assert.ok(ids.includes(attrs.for), name + ': label points at missing input');
    }
    for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)) {
      const attrs = attributes(match[1]);
      assert.equal(attrs.method, 'post');
      assert.ok(postPatterns.some(p => p.test(attrs.action)), name + ': unhandled POST ' + attrs.action);
      assert.ok(/name="csrf" value="[a-f0-9]{64}"/.test(match[2]), name + ': missing CSRF field');
      if (attrs.action.startsWith('/game/')) {
        assert.ok(/name="commandId" value="[a-f0-9-]{36}"/.test(match[2]), name + ': missing command ID');
        assert.ok(!/name="(?:gold|price|damage|reward|xp|actorId)"/.test(match[2]), name + ': client-controlled gameplay result');
        for (const route of commandRoutes) if (routeRegex(route.html).test(attrs.action)) covered.add(route.kind);
      }
    }
  }
  assert.deepEqual([...covered].sort(), commandRoutes.map(r => r.kind).sort());
});
check('Recovered artwork files match their recorded source hashes', () => {
  const art = JSON.parse(read('public/art/provenance.json'));
  assert.equal(art.assets.length, 11);
  for (const item of art.assets) {
    assert.equal(createHash('sha256').update(readFileSync(join(root, 'public/art', item.asset))).digest('hex'), item.sha256, item.asset);
  }
});
check('Original Kingdoms Live Land artwork has separate provenance and correct hashes', () => {
  const art = JSON.parse(read('public/art/land-provenance.json'));
  assert.equal(art.assets.length, 2);
  for (const item of art.assets) {
    assert.equal(createHash('sha256').update(readFileSync(join(root, 'public/art', item.asset))).digest('hex'), item.sha256, item.asset);
  }
});
check('Responsive CSS has phone/tablet breakpoints and keyboard focus treatment', () => {
  const css = read('public/styles.css');
  assert.ok(css.includes('@media (max-width: 640px)') && css.includes('@media (max-width: 850px)'));
  assert.ok(css.includes(':focus-visible') && css.includes('safe-area-inset-bottom'));
  assert.ok(css.includes('.skip-link:focus'));
  assert.ok(!/url\(\s*['"]?https?:/i.test(css), 'external stylesheet asset');
});

mkdirSync(join(root, 'test-results'), { recursive: true });
const report = {
  scope: 'Offline syntax, source references, EJS-tag-subset fixture rendering, HTML contracts, and asset integrity.',
  notChecked: ['TypeScript type resolution', 'Production EJS rendering', 'Fastify startup', 'PostgreSQL migrations/transactions', 'Browser layout or interaction'],
  passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
  fixtureCount: cases.length, sourceFiles: sourceFiles.map(f => relative(root, join(root, f))), results,
};
writeFileSync(join(root, 'test-results/static-checks.json'), JSON.stringify(report, null, 2) + '\n');
for (const result of results) console.log((result.passed ? 'PASS ' : 'FAIL ') + result.name + (result.error ? ': ' + result.error : ''));
console.log(`\n${report.passed} passed; ${report.failed} failed. ${cases.length} template fixture cases.`);
console.log('Runtime, database, actual EJS, browser behavior, and TypeScript type resolution remain unverified.');
if (report.failed) process.exitCode = 1;
