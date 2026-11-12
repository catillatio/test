import {execFileSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {uiThemeFixture} from './home-theme-fixture.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {transaction} from '../src/db.js';
import {notificationSummary,prepareReadBatch,applyReadBatch} from '../src/notifications.js';
import {moderateMessage} from '../src/community.js';
import type {Player} from './helpers.js';

async function eventually<T>(read:()=>Promise<T>,accept:(value:T)=>boolean){
 const deadline=Date.now()+15000;let value:T;
 do{value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);
 assert.fail('Timed out waiting for authoritative browser state: '+JSON.stringify(value));
}
test('real Chromium: shared coin, resource controls, class portraits, unread 5→0 and native/async Land',{timeout:240000},async()=>{
 const r=await uiThemeFixture(),config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config});
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const errors:string[]=[],checks:unknown[]=[];
 try{
  const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  async function identity(p:Player){await context.clearCookies();await context.addCookies([{name:'kr_session',value:p.cookie.slice('kr_session='.length),url:origin,httpOnly:true,sameSite:'Lax'}]);}
  async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200,path);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode();}));});}
  await identity(r.owner);
  for(const width of [320,390,412,768,1280]){
   await page.setViewportSize({width,height:width>=768?900:844});
   for(const path of ['/game/home','/game/quests','/game/battle','/game/armory','/game/army?tab=dashboard','/game/profile','/game/land','/game/crowns','/game/settings','/game/bounties']){
    await visit(path);const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,coins:[...document.querySelectorAll('use')].filter(e=>/#coins?$/.test(e.getAttribute('href')??'')).map(e=>{const svg=e.closest('svg')!;const style=getComputedStyle(svg);return {visible:svg.getBoundingClientRect().width>0&&style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>0,originalGraphic:style.backgroundImage.includes('/resources.webp'),inHud:!!svg.closest('.gold-resource')};}),nav:document.querySelectorAll('.primary-nav>a').length,broken:[...document.images].filter(i=>!i.naturalWidth).length}));
    assert.equal(result.overflow,false,width+' '+path);assert.equal(result.coins.length,1);const coin=await page.locator('.gold-resource .coin-icon').boundingBox();assert.ok(coin&&coin.width===coin.height&&coin.width<=16,'Compact, undistorted HUD coin');assert.ok(result.coins[0]!.visible&&result.coins[0]!.inHud&&result.coins[0]!.originalGraphic);assert.equal(result.nav,5);assert.equal(result.broken,0);checks.push({width,path,...result});
    for(const e of await page.locator('.upkeep-cost').all()){const color=await e.evaluate(e=>getComputedStyle(e).color);assert.equal(color,'rgb(231, 154, 148)',path+' expense');}
   }
   await visit('/game/home');
   for(const kind of ['health','mana','spirit']){const summary=page.locator('.resource-disclosure.'+kind+'>summary');await summary.focus();await page.keyboard.press('Enter');assert.equal(await summary.evaluate(e=>(e.parentElement as HTMLDetailsElement).open),true);assert.ok(await page.locator('.resource-disclosure.'+kind+' .resource-recovery-line').isVisible());if(kind!=='health')assert.equal(await page.locator('.resource-disclosure.'+kind+' form').count(),0);await page.keyboard.press('Escape');assert.equal(await summary.evaluate(e=>(e.parentElement as HTMLDetailsElement).open),false);}
  }
  await page.setViewportSize({width:390,height:844});
  // A real lost acknowledgment is retried with the original healing command.
  await transaction(r.db,sql=>sql.query('UPDATE characters SET health=40,health_updated_at=$2 WHERE id=$1',[r.owner.id,r.now()]));await visit('/game/home');await page.locator('.resource-disclosure.health>summary').click();
  const beforeHeal=await r.me(r.owner);let interrupted=false;
  await page.route('**/api/v1/health/restorations',async route=>{if(!interrupted){interrupted=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await page.locator('[data-heal-form] button').click();await eventually(()=>page.locator('[data-heal-message]').textContent(),v=>!!v?.includes('Connection interrupted'));
  await page.locator('.healing-retry').click();await eventually(()=>page.locator('[data-heal-current]').textContent(),v=>v===String(beforeHeal.maxHealth));assert.equal((await r.me(r.owner)).gold,beforeHeal.gold-beforeHeal.healing.cost);assert.ok(await page.locator('[data-heal-form] button').isDisabled());await page.unroute('**/api/v1/health/restorations');
  await identity(r.coverage.poor);await transaction(r.db,sql=>sql.query('UPDATE characters SET health=40,health_updated_at=$2 WHERE id=$1',[r.coverage.poor.id,r.now()]));await visit('/game/home');await page.locator('.resource-disclosure.health>summary').click();assert.ok(await page.locator('[data-heal-form] button').isDisabled());assert.match(await page.locator('[data-heal-message]').innerText(),/more gold/);
  await identity(r.owner);
  // The portrait follows the viewed class; the viewer stays Freeblade.
  for(const [p,calling,file] of [[r.owner,'Freeblade','freeblade'],[r.rival,'Warden','warden'],[r.patron,'Spellward','spellward']] as const){await transaction(r.db,sql=>sql.query('UPDATE characters SET profile_class=$2 WHERE id=$1',[p.id,calling]));await visit('/game/players/'+p.id);const portrait=page.locator('.profile-identity>img');assert.match((await portrait.getAttribute('src'))!,new RegExp('/class-silhouettes-1/'+file+'\\.svg$'));assert.deepEqual(await portrait.evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),{width:60,height:60});}
  // Calling review and the actual native confirmation use the same server quote.
  await visit('/game/home?calling=1');assert.match(await page.locator('.calling-quote').innerText(),/1,000,000 Gold/);await page.locator('#calling-choice').selectOption('Warden');const beforeCalling=await r.me(r.owner);await Promise.all([page.waitForURL('**/game/home?calling=1&command=*#calling'),page.locator('.calling-panel button[type=submit]').click()]);assert.equal((await r.me(r.owner)).gold,beforeCalling.gold-1000000);await visit('/game/profile');assert.match((await page.locator('.profile-identity>img').getAttribute('src'))!,/warden/);
  // Same-context old comments are viewed through real pagination, not mark-all.
  await applyReadBatch(r.db,r.owner.id,await prepareReadBatch(r.db,r.owner.id));
  const oldIds:string[]=[];for(let i=0;i<5;i++){const id=randomUUID();oldIds.push(id);await r.db.query("INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$3,'comment',$4,'community-0.1',$5,$6)",[id,r.rival.id,r.owner.id,'Older incoming letter '+i,randomUUID(),new Date(+r.now()+1)]);}
  for(let i=0;i<25;i++)await r.db.query("INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$2,'comment',$3,'community-0.1',$4,$5)",[randomUUID(),r.owner.id,'Recent own journal '+i,randomUUID(),new Date(+r.now()+100)]);
  const pendingBefore=(await notificationSummary(r.db,r.owner.id)).army;r.advance(3600);await r.ok(r.coverage.poor,'/api/v1/army/invitations',{targetCharacterId:r.owner.id});assert.equal((await notificationSummary(r.db,r.owner.id)).home,5);
  await visit('/game/home');assert.equal(await page.locator('[data-notification-badge=home] [data-notification-number]').textContent(),'5');assert.equal(await page.locator('[data-notification-event]').count(),0);
  await visit('/game/profile?tab=comments');await page.locator('.older-activity').click();
  for(const id of oldIds)await page.locator('#activity-'+id+' h3').scrollIntoViewIfNeeded();
  await eventually(()=>notificationSummary(r.db,r.owner.id),v=>v.home===0);assert.equal((await notificationSummary(r.db,r.owner.id)).army,pendingBefore+1);await page.reload();assert.ok(await page.locator('[data-notification-badge=home]').isHidden());checks.push({normalViewedNotifications:'5→0',pendingInvitationPreserved:true,markAllUsed:false});
  // Native form submission still wakes an already-open Home tab. An enhanced
  // purchase and a sale also render the new rate immediately, with one clock.
  const watch=await context.newPage();await watch.goto(origin+'/game/home');await visit('/game/land');const start=await r.me(r.owner),clock=start.land.nextPaymentAt;
  const buy=page.locator('#property-smallholding form').first();await Promise.all([page.waitForURL('**/game/land?command=*#property-smallholding'),buy.evaluate(e=>(e as HTMLFormElement).submit())]);
  const bought=await r.me(r.owner);assert.ok(bought.economy.netHourlyIncome>start.economy.netHourlyIncome);await watch.bringToFront();await eventually(()=>watch.locator('[data-hourly-income]').innerText(),v=>Number(v.replaceAll(',',''))===bought.economy.netHourlyIncome);assert.equal(bought.land.nextPaymentAt,clock);
  await visit('/game/land?bulk=smallholding');const bulk=page.locator('[data-bulk-mode=buy]');await Promise.all([page.waitForURL(u=>u.pathname==='/game/land'&&u.searchParams.has('command')),bulk.locator('button[type=submit]').click()]);await eventually(()=>r.me(r.owner),v=>v.land.properties.find(p=>p.id==='smallholding')!.owned===bought.land.properties.find(p=>p.id==='smallholding')!.owned+1);
  await visit('/game/land?bulk=smallholding');await page.locator('[data-bulk-mode-tab=sell]').click();await page.locator('[data-bulk-mode=sell] button[type=submit]').click();await eventually(()=>r.me(r.owner),v=>v.economy.netHourlyIncome===bought.economy.netHourlyIncome);assert.equal((await r.me(r.owner)).land.nextPaymentAt,clock);await watch.close();
  await visit('/game/home');await page.getByRole('link',{name:/Crowns Market/}).click();assert.match(await page.locator('main').innerText(),/Purchases.*unavailable|not.*available|not.*open/i);assert.equal(await page.locator('.crown-offer button:enabled').count(),0);await visit('/game/settings');assert.equal(await page.getByRole('link',{name:/Rules.*Help/}).getAttribute('href'),'/rules');
  await moderateMessage(r.db,{action:'mute',characterId:r.owner.id,operator:'local-review',reason:'Private note never displayed',hours:2});await visit('/game/home?feed=broadcasts');assert.match(await page.locator('.posting-restriction').innerText(),/MUTED — 2 HOURS REMAINING/);assert.ok(await page.locator('#social-body').isDisabled());assert.doesNotMatch(await page.content(),/Private note never displayed/);r.advance(7200);await page.reload();assert.equal(await page.locator('.posting-restriction').count(),0);assert.ok(await page.locator('#social-body').isEnabled());
  const wallet=(await r.me(r.owner)).gold;await r.prepare(r.owner,2147483647-wallet);await page.setViewportSize({width:320,height:844});await visit('/game/home');assert.equal(await page.locator('[data-wallet-gold]').first().innerText(),'2,147,483,647');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);await mkdir('test-results/complete-rebuild',{recursive:true});await writeFile('test-results/complete-rebuild/browser-checks.json',JSON.stringify({sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks},null,2)+'\n');await context.close();
 }finally{await browser.close();await app.close();await r.close();}
});
