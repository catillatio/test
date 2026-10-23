// Real local HTTP routes and saved transactions. Never contact production.
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';import {realm,testDatabaseUrl} from '../tests/helpers.js';import {createApp} from '../src/app.js';import {loadConfig} from '../src/config.js';import {levelRequirement,alpha} from '../src/alpha-rules.js';
if(!testDatabaseUrl)throw new Error('Use a designated disposable *_test fixture.');
const before=process.argv.includes('--before'),verify=process.argv.includes('--verify-only'),stage=before?'before':'after';
const out=verify?'test-results/phase47-browser/phase51c':'docs/phase51c/screenshots/'+stage;await mkdir(out,{recursive:true});
const r=await realm({isolated:true,clock:()=>new Date('2038-04-01T12:00:00Z')}),config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const page=await context.newPage(),errors:string[]=[],views:any[]=[],bulk:any[]=[];page.on('pageerror',error=>errors.push(error.message));
async function login(cookie:string){await context.addCookies([{name:'kr_session',value:cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);}
async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200,path);await page.evaluate(async()=>{await document.fonts.ready;document.documentElement.style.scrollBehavior='auto';});}
async function capture(width:number,name:string,selector?:string){if(selector)await page.locator(selector).first().evaluate(e=>e.scrollIntoView({block:'start'}));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow at '+width);assert.equal(await page.locator('.primary-nav a').count(),5);if(!verify)await page.screenshot({path:out+'/'+width+'-'+name+'.png',animations:'disabled'});views.push({width,name});}
try{
 const a=await r.player('Lady Evelyn Ashcroft'),b=await r.player('Garrick Stonevale'),c=await r.player('Éowyn of Dawn');const xp=Array.from({length:49},(_,i)=>levelRequirement(i+1)).reduce((n,x)=>n+x,0);
 for(const p of[a,b,c]){await r.prepare(p,3000000,xp);await r.ok(p,'/api/v1/tutorial',{action:'skip'});}
 for(const id of['oathbound-greatsword','crown-of-ash-blade','eclipse-greatsword','sovereigns-bastion','eclipse-citadel-plate','ember-word','hearth-ward','lantern-mote'])await r.ok(a,'/api/v1/inventory/purchases',{itemId:id,quantity:2});
 await r.ok(b,'/api/v1/inventory/purchases',{itemId:'astral-archon-robes',quantity:1});await r.ok(b,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});
 for(const propertyId of['smallholding','tempest-port','dawnspire-cathedral','wyrmcrest-keep','astral-observatory','throne-of-ash','eclipse-citadel'])await r.ok(a,'/api/v1/land/purchases',{propertyId,quantity:1});
 for(let i=0;i<3;i++)await r.ok(b,'/api/v1/quests/border-patrol/runs');await r.ok(b,'/api/v1/broadcasts',{body:'Realm announcement: this belongs only in Broadcasts.'});
 await r.ok(c,'/api/v1/comments',{profileId:a.id,body:'Well fought, Evelyn! See you at the gates.'});await r.ok(c,'/api/v1/army/invitations',{targetCharacterId:a.id});
 await r.ok(b,'/api/v1/battles',{targetCharacterId:a.id});let state=await r.me(a);await r.prepare(a,0,state.xpToNext-1);const hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});
 const saved=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;assert.equal(saved.winnerId,a.id);assert.ok(saved.levelGained>0);
 const receipts=(await r.db.query('SELECT account_id,command_id,result FROM command_receipts ORDER BY account_id,command_id')).rows;
 const wallet=(await r.db.query('SELECT * FROM wallets ORDER BY character_id')).rows;
 await login(a.cookie);
 for(const width of[320,390,430,1024]){
  await page.setViewportSize({width,height:width===1024?1536:844});
  await visit('/game/battle');await capture(width,'battle-rivals');
  await visit('/game/armory?category=weapon&bulk=oathbound-greatsword#bulk-trade');
  const panel=page.locator('#bulk-trade');await panel.scrollIntoViewIfNeeded();
  bulk.push({width,type:'equipment',height:await panel.evaluate(e=>e.getBoundingClientRect().height)});
  if(!before){assert.equal(await panel.locator('form:visible').count(),1);await panel.getByRole('button',{name:'Select 5 Oathbound Greatsword',exact:true}).click();assert.equal(await panel.locator('form:visible [name=quantity]').inputValue(),'5');const item=alpha.items.find(i=>i.id==='oathbound-greatsword')!;assert.equal(await panel.locator('form:visible [data-quantity-total]').textContent(),(item.price*5).toLocaleString('en'));await panel.getByRole('tab',{name:'Sell',exact:true}).click();assert.equal(await panel.locator('form:visible [name=quantity]').inputValue(),'1');await panel.getByRole('tab',{name:'Buy',exact:true}).click();assert.equal(await panel.locator('form:visible [name=quantity]').inputValue(),'5');
   const targets=await panel.locator('button:visible').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));assert.ok(targets.every(h=>h>=44),JSON.stringify({width,targets}));
  }
  await capture(width,'armory-bulk','#bulk-trade');
  await visit('/game/land?bulk=tempest-port#bulk-trade');bulk.push({width,type:'land',height:await page.locator('#bulk-trade').evaluate(e=>e.getBoundingClientRect().height)});await capture(width,'land-bulk','#bulk-trade');
  if(!before){const buy=page.locator('#bulk-panel-buy');await buy.locator('[data-quantity-preset="5"]').click();const property=(await r.me(a)).land.properties.find(p=>p.id==='tempest-port')!;assert.equal(await buy.locator('[data-quantity-total]').textContent(),property.priceSteps.slice(0,5).reduce((n,p)=>n+p,0).toLocaleString('en'));assert.equal(await buy.locator('[data-quantity-income]').textContent(),property.projectedBuyNetSteps[4]!.toLocaleString('en'));}
  await visit('/game/profile');
  if(!before){const first=page.locator('[data-equipment-preview]').first();await first.locator('summary').evaluate(e=>e.scrollIntoView({block:'center'}));await first.locator('summary').click();await page.waitForTimeout(50);assert.equal(await first.getAttribute('open'),'');assert.match(await first.textContent()??'',/Attack.*Defense.*Upkeep.*Unlock level/s);const box=await first.locator('.equipment-preview-content').boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width+1);const nav=await page.locator('.primary-nav').boundingBox();assert.ok(nav&&box.y+box.height<=nav.y+1);await capture(width,'profile-preview');await first.locator('[data-equipment-close]').click();assert.equal(await first.getAttribute('open'),null);
   await first.locator('summary').focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await page.waitForTimeout(20);assert.equal(await first.getAttribute('open'),'');await page.keyboard.press('Escape');assert.equal(await first.getAttribute('open'),null);
  }else await capture(width,'profile-preview','.profile-inventory');
  await visit('/game/battles/'+hit.battleId);if(!before){assert.equal(await page.locator('.level-celebration.is-compact').count(),1);assert.match(await page.locator('.battle-rewards').textContent()??'',new RegExp(saved.loot.toLocaleString('en')));assert.ok(!(await page.locator('body').innerText()).includes('Spirit'));}await capture(width,'battle-victory','.battle-result');
  await login(b.cookie);await visit('/game/battles/'+hit.battleId);assert.equal(await page.locator('.defeat-result').count(),1);await capture(width,'battle-defeat','.battle-result');await login(a.cookie);
  await visit('/game/home');await capture(width,'personal-feed','.feed-tabs');if(!before)assert.ok(!(await page.locator('.activity-feed').innerText()).includes('Realm announcement:'));
  await r.ok(a,'/api/v1/tutorial',{action:'replay'});await r.db.query('UPDATE tutorial_guides SET step_index=4 WHERE character_id=$1',[a.id]);await visit('/game/tutorial');if(!before)await page.locator('.guide-calling>summary').click();await capture(width,'tutorial-calling','.guide-lesson');await r.ok(a,'/api/v1/tutorial',{action:'skip'});
 }
 // A real read-only public Profile gets the same stats, without self-only settings.
 await login(c.cookie);await visit('/game/players/'+a.id);if(!before){assert.equal(await page.locator('[data-equipment-preview]').count(),8);assert.equal(await page.locator('#skills').count(),0);}
 assert.deepEqual((await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result,saved);
 assert.deepEqual((await r.db.query('SELECT * FROM wallets ORDER BY character_id')).rows,wallet);
 // Tutorial receipts are legitimate new guide commands, not marketplace/combat mutations.
 const afterReceipts=(await r.db.query("SELECT account_id,command_id,result FROM command_receipts WHERE kind<>'tutorial' ORDER BY account_id,command_id")).rows;assert.deepEqual(afterReceipts,receipts.filter(row=>row.result.kind!=='tutorial'));
 if(!before){
  // Scrolling acknowledges only genuinely visible incoming records. A later view
  // refreshes badges from persisted state; no timers fabricate notifications.
  await login(a.cookie);await visit('/game/home');for(const entry of await page.locator('[data-notification-event]').all()){await entry.evaluate(e=>e.scrollIntoView({block:'center'}));await page.waitForTimeout(550);}
  const attention=await r.app.inject({url:'/api/v1/notifications',headers:{cookie:a.cookie}});assert.equal(attention.json().home,0);assert.equal(attention.json().army,1);
  await visit('/game/armory?category=weapon');assert.equal(await page.locator('[data-notification-badge=home]').isVisible(),false);assert.equal(await page.locator('[data-notification-badge=army]').isVisible(),true);
  // New mode controls preserve real submission and progressive revalidation.
  await visit('/game/armory?category=weapon&bulk=squires-blade#bulk-trade');const buy=page.locator('#bulk-panel-buy');await buy.locator('[data-quantity-preset="5"]').click();const prior=await r.me(a);
  await Promise.all([page.waitForURL(/command=/),buy.evaluate((form:any)=>{form.requestSubmit();form.requestSubmit();})]);const bought=await r.me(a);assert.equal(prior.gold-bought.gold,alpha.items.find(i=>i.id==='squires-blade')!.price*5);assert.equal(bought.inventory.find(i=>i.id==='squires-blade')!.quantity,5);
  const desktop=await browser.newContext({viewport:{width:1024,height:900},reducedMotion:'reduce'});await desktop.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await desktop.addCookies([{name:'kr_session',value:a.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);const hover=await desktop.newPage();hover.on('pageerror',e=>errors.push(e.message));await hover.goto(origin+'/game/profile');const tile=hover.locator('[data-equipment-preview]').first();await tile.locator('summary').hover();assert.equal(await tile.getAttribute('open'),'');await hover.mouse.move(1000,0);await hover.waitForTimeout(20);assert.equal(await tile.getAttribute('open'),null);await desktop.close();
  const noScript=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:844}});await noScript.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await noScript.addCookies([{name:'kr_session',value:a.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);const simple=await noScript.newPage();await simple.goto(origin+'/game/armory?category=weapon');const ownedBefore=(await r.me(a)).inventory.find(i=>i.id==='squires-blade')!.quantity;await Promise.all([simple.waitForURL(/command=/),simple.locator('#item-squires-blade').getByRole('button',{name:"Buy Squire's Blade",exact:true}).click()]);assert.equal((await r.me(a)).inventory.find(i=>i.id==='squires-blade')!.quantity,ownedBefore+1);await r.ok(b,'/api/v1/comments',{profileId:a.id,body:'Native read controls stay available without JavaScript.'});await simple.goto(origin+'/game/home?feed=comments');await Promise.all([simple.waitForURL(origin+'/game/home'),simple.getByRole('button',{name:'Mark shown events read',exact:true}).click()]);assert.equal((await r.app.inject({url:'/api/v1/notifications',headers:{cookie:a.cookie}})).json().home,0);await noScript.close();
 }
 assert.deepEqual(errors,[]);
 const result={passed:true,stage,views,bulk,errors,readOnlyViewsPreserveSavedBattleAndFinancialRows:true,explicitPurchaseAndAcknowledgementChecks:!before,productionContacted:false};
 await writeFile(verify?'test-results/phase47-phase51c-browser.json':'docs/phase51c/'+stage+'-browser.json',JSON.stringify(result,null,2)+'\n');console.log('PASS Phase 5.1C '+stage+': '+views.length+' responsive captures; read-only views preserve records'+(!before?'; notification, quantity, hover/focus/touch, rapid-submit and no-script purchase/ack checks.':'.'));
}finally{await browser.close();await app.close();await r.close();}
