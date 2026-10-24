// Focused 5.1D integrations only: real local pages and persisted events/funding.
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';import {loadConfig} from '../src/config.js';import {transaction} from '../src/db.js';
import {ledger} from '../src/economy.js';import {lockCharacters} from '../src/game.js';import {alpha} from '../src/alpha-rules.js';
if(!testDatabaseUrl)throw new Error('Use a designated disposable *_test fixture.');
const verify=process.argv.includes('--verify-only'),out=verify?'test-results/phase47-browser/phase51d':'docs/phase51d/screenshots';await mkdir(out,{recursive:true});
const start=new Date('2038-04-01T12:00:00Z');let now=start;
const r=await realm({isolated:true,clock:()=>now}),config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config});
const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox']});
const errors:string[]=[],views:{width:number;screen:string}[]=[];
async function context(cookie:string,javaScriptEnabled=true){const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',javaScriptEnabled});await c.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await c.addCookies([{name:'kr_session',value:cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);return c;}
try{
 const owner=await r.player('Éowyn ⚔️'),ally=await r.player('勇者 🐉'),pending=await r.player('Марина');
 await r.prepare(owner,20000,2500);await r.ok(owner,'/api/v1/tutorial',{action:'skip'});
 await r.ok(owner,'/api/v1/inventory/purchases',{itemId:'ransackers-axe',quantity:1});await r.ok(owner,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:4});
 await r.ok(owner,'/api/v1/army/invitations',{targetCharacterId:ally.id});await r.ok(ally,'/api/v1/army/acceptances',{targetCharacterId:owner.id});await r.ok(pending,'/api/v1/army/invitations',{targetCharacterId:owner.id});
 await transaction(r.db,async sql=>{await lockCharacters(sql,[owner.id]);const cash=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[owner.id])).rows[0]!.balance;await ledger(sql,null,'test_fixture',[{characterId:owner.id,amount:-cash}],alpha.id);await sql.query('UPDATE maintenance_accounts SET paused=true,reserve_gold=0,arrears_gold=1,settled_at=$2 WHERE character_id=$1',[owner.id,start]);});
 const captures=await context(owner.cookie,false),page=await captures.newPage();page.on('pageerror',e=>errors.push(e.message));
 async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200,path);}
 async function capture(width:number,screen:string){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),screen+' overflow at '+width);assert.equal(await page.locator('.primary-nav a').count(),5);const targets=await page.locator('.primary-nav a').evaluateAll(es=>es.map(e=>e.getBoundingClientRect()));assert.ok(targets.every(b=>b.height>=44&&b.width>=44));if(!verify)await page.screenshot({path:out+'/'+width+'-'+screen+'.png',animations:'disabled'});views.push({width,screen});}
 for(const width of[320,390,430,1024]){
  await page.setViewportSize({width,height:width===1024?900:844});await visit('/game/home');await page.locator('.activity-entry').filter({hasText:'accepted your army invitation'}).evaluate(e=>e.scrollIntoView({block:'center'}));await capture(width,'acceptance-home');
  assert.match(await page.locator('.activity-feed').innerText(),/勇者 🐉 accepted your army invitation/);
  const recruit=page.locator('.primary-nav a[data-notification-tab="army"]');assert.equal(await recruit.getAttribute('href'),'/game/army?tab=dashboard');await recruit.click();
  assert.equal(new URL(page.url()).searchParams.get('tab'),'dashboard');assert.equal(await page.locator('.army-tabs a[aria-current=page]').innerText(),'Dashboard');
  assert.match(await page.locator('main').innerText(),/1 accepted allies/);assert.match(await page.locator('main').innerText(),/1 incoming invitations/);assert.match(await page.locator('main').innerText(),/Recent Army Activity/);await capture(width,'army-dashboard');
  for(const tab of['recruit','army','dashboard']){await page.locator('.army-tabs a[href="/game/army?tab='+tab+'"]').click();assert.equal(await page.locator('.army-tabs a[aria-current=page]').count(),1);}
 }
 // Native viewing does not silently acknowledge. The explicit form is usable
 // without JS, and the read state survives a later browser context/session.
 assert.equal((await r.app.inject({url:'/api/v1/notifications',headers:{cookie:owner.cookie}})).json().home,1);
 await page.setViewportSize({width:390,height:844});await visit('/game/armory');await page.locator('.maintenance-panel').scrollIntoViewIfNeeded();await capture(390,'upkeep-before-payment');assert.match(await page.locator('.maintenance-panel').innerText(),/Upkeep paused/);
 await page.locator('.income-disclosure>summary').click();assert.equal(await page.locator('[data-payment-reserve]').innerText(),'1');assert.equal(await page.locator('[data-payment-arrears]').innerText(),'1');await capture(390,'upkeep-payment-breakdown');
 now=new Date(+start+3600000);await visit('/game/armory');await page.locator('.maintenance-panel').scrollIntoViewIfNeeded();await capture(390,'upkeep-after-payment');assert.doesNotMatch(await page.locator('.maintenance-panel').innerText(),/Upkeep paused/);assert.equal((await r.me(owner)).maintenance.reserveGold,'1');
 await captures.close();
 const interactive=await context(owner.cookie),live=await interactive.newPage();live.on('pageerror',e=>errors.push(e.message));
 const homeAck=live.waitForResponse(response=>response.url().endsWith('/api/v1/notifications/read')&&response.request().method()==='POST'&&response.status()===200);await live.goto(origin+'/game/home');const entry=live.locator('[data-notification-event]').filter({hasText:'accepted your army invitation'});await entry.scrollIntoViewIfNeeded();await homeAck;
 const seen=(await r.app.inject({url:'/api/v1/notifications',headers:{cookie:owner.cookie}})).json();assert.equal(seen.home,0);assert.equal(seen.army,1);
 await live.reload();assert.equal(await live.locator('[data-notification-badge=home]').isVisible(),false);assert.equal(await live.locator('[data-notification-badge=army]').isVisible(),true);
 await live.locator('.primary-nav a[data-notification-tab="army"]').focus();await Promise.all([live.waitForURL(origin+'/game/army?tab=dashboard'),live.keyboard.press('Enter')]);assert.ok(live.url().endsWith('/game/army?tab=dashboard'));
 // A second acceptance can also be acknowledged where it is actually viewed
 // on Dashboard. Unresolved incoming invitations retain their own badge.
 const next=await r.player('Another Ally');await r.ok(owner,'/api/v1/army/invitations',{targetCharacterId:next.id});await r.ok(next,'/api/v1/army/acceptances',{targetCharacterId:owner.id});
 await live.reload();const dashboardEvent=live.locator('[data-notification-event]').filter({hasText:'Another Ally'});const acknowledged=live.waitForResponse(response=>response.url().endsWith('/api/v1/notifications/read')&&response.status()===200);await dashboardEvent.scrollIntoViewIfNeeded();await acknowledged;
 assert.equal((await r.app.inject({url:'/api/v1/notifications',headers:{cookie:owner.cookie}})).json().home,0);await interactive.close();
 now=new Date(+now+31000);const native=await context(owner.cookie,false),simple=await native.newPage(),last=await r.player('Final Ally');await r.ok(owner,'/api/v1/army/invitations',{targetCharacterId:last.id});await r.ok(last,'/api/v1/army/acceptances',{targetCharacterId:owner.id});await simple.goto(origin+'/game/army?tab=dashboard');await Promise.all([simple.waitForURL(origin+'/game/army?tab=dashboard'),simple.getByRole('button',{name:'Mark shown events read',exact:true}).click()]);assert.equal((await r.app.inject({url:'/api/v1/notifications',headers:{cookie:owner.cookie}})).json().home,0);await native.close();
 assert.deepEqual(errors,[]);const evidence={passed:true,views,errors,productionContacted:false,realHumanAcceptance:true,realViewedAndNativeAcknowledgements:true,pendingRecruitBadgePreserved:true,actualHourlyUpkeepRecovery:true,keyboardAndReducedMotion:true};
 await writeFile(verify?'test-results/phase47-phase51d-browser.json':'docs/phase51d/browser.json',JSON.stringify(evidence,null,2)+'\n');console.log('PASS Phase 5.1D: '+views.length+' responsive views; actual hourly funding, Dashboard, Unicode names and JS/native persistent acceptance acknowledgements.');
}finally{await browser.close();await app.close();await r.close();}
