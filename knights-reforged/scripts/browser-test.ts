// Requires an already running disposable development realm and a local Chromium.
// It creates two normal accounts; it does not install a browser or contact production.
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig, projectRoot } from '../src/config.js';

const config = loadConfig();
if (config.nodeEnv === 'production') throw new Error('Browser smoke tests must not run against a production realm.');
const origin = new URL(config.origin);
if (!['localhost', '127.0.0.1', '[::1]', process.env.ALLOWED_BROWSER_TEST_HOST].includes(origin.hostname)) {
  throw new Error('Use a local or explicitly designated browser-test host.');
}
const out = join(projectRoot, 'test-results/browser');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/chromium',
  headless: true, args: process.env.CHROMIUM_NO_SANDBOX === '1' ? ['--no-sandbox'] : [] });
const prefix = 'b_' + randomUUID().replaceAll('-', '').slice(0, 10);
const errors: string[] = [];

async function register(context: BrowserContext, suffix: string) {
  // Every browser request, including subresources, is restricted to this realm.
  await context.route('**/*', route => new URL(route.request().url()).origin === origin.origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const name = 'Knight ' + prefix.slice(2) + ' ' + suffix.replaceAll('_', '');
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(config.origin + '/register');
  await page.getByLabel('Account name', { exact: true }).fill(prefix + suffix);
  await page.getByLabel('Warrior name', { exact: true }).fill(name);
  await page.getByLabel('Password', { exact: true }).fill('BrowserPass!2026');
  await Promise.all([page.waitForURL('**/game/home'), page.getByRole('button', { name: 'Create your warrior' }).click()]);
  return { page, name };
}
async function screens(page: Page, label: string) {
  const labels = ['Home', 'Quests', 'Battle', 'Armory', 'Recruit'];
  const primary = () => page.getByRole('navigation', { name: 'Primary navigation' });
  assert.deepEqual((await primary().getByRole('link').allTextContents()).map(text => text.trim()), labels);
  for (const screen of [...labels, 'Land']) {
    const navigation = page.getByRole('navigation', { name: screen === 'Land' ? 'Secondary navigation' : 'Primary navigation' });
    await navigation.getByRole('link', { name: screen, exact: true }).click();
    await page.getByRole('heading', { name: screen, exact: true }).waitFor();
    await page.waitForLoadState('load');
    assert.equal(await primary().getByRole('link').count(), 5);
    await page.getByRole('navigation', { name: 'Secondary navigation' }).getByRole('link', { name: 'Land', exact: true }).waitFor({ state: 'visible' });
    const current = primary().locator('[aria-current="page"]');
    assert.equal(await current.count(), screen === 'Land' ? 0 : 1);
    if (screen !== 'Land') assert.equal((await current.textContent())?.trim(), screen);
    const tabHeight = await primary().getByRole('link').first().evaluate(element => element.getBoundingClientRect().height);
    assert.equal(tabHeight, 50, label + ': 50 px tab content plus a separate safe-area inset');
    const imageName = screen === 'Quests' ? 'missions' : screen === 'Battle' ? 'attack' : screen === 'Armory' ? 'equipment' : 'default';
    assert.ok((await page.locator('.page-backdrop').evaluate(element => getComputedStyle(element).backgroundImage)).includes('bg_' + imageName + '.jpg'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, label + ': horizontal overflow on ' + screen);
    const broken = await page.locator('img').evaluateAll(images => images.filter(img => img instanceof HTMLImageElement && (!img.complete || img.naturalWidth === 0)).length);
    assert.equal(broken, 0, label + ': missing image');
    await page.screenshot({ path: join(out, label + '-' + screen.toLowerCase() + '.png'), fullPage: true });
  }
}
try {
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const { page: a } = await register(desktop, '_a');
  const { page: b, name: defenderName } = await register(phone, '_b');
  await screens(a, 'desktop');
  await screens(b, 'phone');
  // The phone character buys Land; the desktop character keeps the existing
  // quest/recruit/equip/PvP flow with its original starting balance.
  await b.goto(config.origin + '/game/land');
  await Promise.all([b.waitForURL('**/game/land?command=*'), b.getByRole('button', { name: 'Buy smallholding', exact: true }).click()]);
  await b.getByRole('status').filter({ hasText: 'property purchased' }).waitFor();
  await b.waitForFunction(() => /^\d{2}:\d{2}:\d{2}$/.test(document.querySelector('[data-land-countdown]')?.textContent ?? ''));
  const incomeBefore = await b.locator('[data-land-countdown]').textContent();
  await b.waitForTimeout(1100);
  assert.notEqual(await b.locator('[data-land-countdown]').textContent(), incomeBefore, 'Countdown must tick without a reload.');
  await a.goto(config.origin + '/game/quests');
  await Promise.all([a.waitForURL('**/game/quests?command=*'), a.getByRole('button', { name: 'Begin patrol' }).click()]);
  await a.getByRole('status').filter({ hasText: 'Patrol complete' }).waitFor();
  await a.goto(config.origin + '/game/army');
  await a.getByLabel('Number of recruits').fill('2');
  await Promise.all([a.waitForURL('**/game/army?command=*'), a.getByRole('button', { name: 'Recruit militia' }).click()]);
  await a.goto(config.origin + '/game/armory');
  await Promise.all([a.waitForURL('**/game/armory?command=*'), a.getByRole('button', { name: 'Purchase iron sword' }).click()]);
  const beforeEquip = a.url();
  await Promise.all([a.waitForURL(url => url.pathname === '/game/armory' && url.href !== beforeEquip), a.getByRole('button', { name: 'Equip iron sword' }).click()]);
  await a.goto(config.origin + '/game/battle');
  await Promise.all([a.waitForURL(/\/game\/battles\/[a-f0-9-]+$/), a.getByRole('button', { name: 'Challenge ' + defenderName, exact: true }).click()]);
  const reportId = a.url().split('/').pop()!;
  const attackerReport = await a.request.get(config.origin + '/api/v1/battles/' + reportId);
  const defenderReport = await b.request.get(config.origin + '/api/v1/battles/' + reportId);
  assert.equal(attackerReport.status(), 200);
  assert.equal(defenderReport.status(), 200);
  assert.deepEqual(await attackerReport.json(), await defenderReport.json());
  await b.goto(config.origin + '/game/battles/' + reportId);
  await a.screenshot({ path: join(out, 'desktop-battle-report.png'), fullPage: true });
  await b.screenshot({ path: join(out, 'phone-battle-report.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Five original tabs plus secondary Land on PC/phone, original backgrounds, 50 px tab content, Land purchase/countdown and the two-player gameplay loop passed. Screenshots: test-results/browser/');
  console.log('Phone viewport checks are not an Android WebView/device test.');
} finally { await browser.close(); }
