// Disposable synthetic realm only. All browser requests are confined to localhost.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
if(!testDatabaseUrl)throw new Error('A disposable local *_test PostgreSQL database is required.');
const r=await realm({isolated:true}),config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'});
const app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const out='test-results/phase48-mockup-browser';await mkdir(out,{recursive:true});
const page=await context.newPage(),errors:string[]=[],checks:string[]=[],assets:string[]=[];let posts=0;
page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>{if(request.method()==='POST')posts++;if(new URL(request.url()).pathname.startsWith('/assets/'))assets.push(new URL(request.url()).pathname);});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
async function shot(name:string){await page.screenshot({path:out+'/'+name+'.png',fullPage:false});}
async function me(){return(await(await page.request.get(origin+'/api/v1/me')).json()).state;}
async function visit(path:string){const response=await page.goto(origin+path);assert.equal(response?.status(),200,path);await page.locator('.realm-resources').waitFor();if(!new URL(page.url()).hash)await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0);});}
try{
 const actor=await r.player('Ser Rowan Ashford');await r.prepare(actor,250000,2500);
 await r.ok(actor,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:3});
 await r.ok(actor,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:2});
 await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 await visit('/game/home');await shot('390-home-new');await r.ok(actor,'/api/v1/tutorial',{action:'skip'});
 await visit('/game/home');await shot('390-home');assert.equal(await page.locator('.home-menu a').count(),8);assert.equal(await page.locator('.calling-menu-link').count(),1);assert.equal(await page.locator('.primary-nav a').count(),5);
 await visit('/game/armory');assert.equal(await page.locator('.market-catalog [data-quantity-control]').count(),0);
 assert.equal(await page.locator('.market-catalog form[data-market-form] [name=quantity][value="1"]').count(),40);
 await shot('390-armory');const before=await me(),beforePosts=posts;
 await page.evaluate(()=>{const f=document.querySelector<HTMLFormElement>('#item-squires-blade form');f!.requestSubmit();f!.requestSubmit();});
 await page.waitForURL('**/game/purchases/**');const after=await me();assert.equal(after.gold,before.gold-5);assert.equal(posts-beforePosts,1);
 await page.reload();assert.equal((await me()).gold,after.gold);await shot('390-equipment-receipt');
 checks.push('Single-item purchase submits once, spends the catalog price, and receipt refresh awards nothing.');
 await visit('/game/armory?category=weapon&bulk=squires-blade#bulk-trade');const bulk=page.locator('.bulk-trades form').first();
 await bulk.getByRole('button',{name:"Select 5 Squire's Blade",exact:true}).click();assert.equal(await bulk.locator('[name=quantity]').inputValue(),'5');
 await shot('390-armory-bulk');await page.clock.install();await page.clock.fastForward('03:00:00');
 await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'));});
 await page.reload();assert.equal(await bulk.locator('[name=quantity]').inputValue(),'5');assert.equal(new URL(page.url()).searchParams.get('bulk'),'squires-blade');
 let lost=false;await page.route('**/game/armory/buy',async route=>{if(!lost){lost=true;await route.fetch();await route.abort();}else await route.continue();});
 const beforeLost=await me();await bulk.getByRole('button',{name:"Buy selected Squire's Blade",exact:true}).click();await bulk.locator('.market-retry:not([hidden])').waitFor();
 const charged=await me();assert.equal(charged.gold,beforeLost.gold-25);assert.equal(await page.locator('#item-squires-blade form').first().getByRole('button',{name:"Buy Squire's Blade",exact:true}).isDisabled(),true);
 await bulk.locator('.market-retry').click();await page.waitForURL('**/game/purchases/**');assert.equal((await me()).gold,charged.gold);await page.unroute('**/game/armory/buy');
 checks.push('Bulk intent survives simulated three-hour idle, online/visibility events and reload; lost committed response retries one receipt without another charge.');
 await visit('/game/land');await shot('390-land');
 const flow=page.locator('.gold-flow'),flowToggle=page.locator('.land-flow-head');
 await flowToggle.focus();await page.keyboard.press('Enter');assert.equal(await flow.getAttribute('open'),null);
 const compactRows=await page.locator('.land-property').evaluateAll(rows=>rows.filter(row=>{const r=row.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight-58;}).length);
 assert.ok(compactRows>=4,'Closing the accounting disclosure leaves at least four complete property rows.');
 await flowToggle.blur();await shot('390-land-compact');await flowToggle.focus();await page.keyboard.press('Enter');assert.notEqual(await flow.getAttribute('open'),null);await flowToggle.blur();
 checks.push('Gold Flow can be opened and closed with the keyboard; its compact state shows at least four complete property rows at 390px.');
 const landBefore=await me();
 await page.getByRole('button',{name:'Buy Smallholding',exact:true}).click();await page.waitForURL('**/game/purchases/**');
 assert.equal((await me()).land.properties.find((p:any)=>p.id==='smallholding').owned,4);assert.ok((await me()).gold<landBefore.gold);
 await shot('390-land-receipt');await page.getByRole('link',{name:'Return to Land',exact:true}).click();await page.waitForURL('**/game/land');
 await page.getByRole('link',{name:'Bulk buy or sell Smallholding',exact:true}).click();await page.locator('#bulk-trade').waitFor();await shot('390-land-bulk');
 const sale=page.locator('.bulk-trades form').last();await sale.getByRole('button',{name:'Select 1 Smallholding',exact:true}).click();
 const quoted=await me(),refund=quoted.land.properties.find((p:any)=>p.id==='smallholding').saleRefundSteps[0];
 await sale.getByRole('button',{name:'Sell selected Smallholding',exact:true}).click();await page.waitForURL('**/game/land?command=*');assert.equal((await me()).gold,quoted.gold+refund);
 await page.locator('.income-explanation>summary').click();await shot('390-income-details');
 checks.push('Land buy, Return to Land, bulk sale, exact authoritative refund and expandable income accounting work.');
 const widths=[320,360,390,412,430,768,1024,1366],paths=['/game/home','/game/armory','/game/armory?category=armor','/game/armory?category=spell','/game/land','/game/land?bulk=smallholding#bulk-trade','/game/armory?bulk=squires-blade#bulk-trade'];
 const measurements:unknown[]=[];
 for(const width of widths){await page.setViewportSize({width,height:width===1366?900:844});for(const path of paths){
  await visit(path);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' '+path+' overflows');
  assert.equal(await page.locator('.primary-nav a').count(),5);
  const sizes=await page.locator('.market-catalog .single-trades button[type=submit]').evaluateAll(buttons=>buttons.map(b=>({height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width})));assert.ok(sizes.every(s=>s.height>=44&&s.width>=44),width+' '+path+' trade target heights: '+JSON.stringify(sizes));
  if(width===390&&(path==='/game/armory'||path==='/game/land'))measurements.push({path,...await page.evaluate(()=>{const rows=[...document.querySelectorAll('.catalog-row')].map(e=>e.getBoundingClientRect());return {rowHeight:rows[0]?.height,fullyVisible:rows.filter(r=>r.top>=0&&r.bottom<=innerHeight-56).length,headerHeight:document.querySelector('.realm-resources')?.getBoundingClientRect().height};})});
  if(width===320&&(path==='/game/armory'||path==='/game/land'))await shot(path==='/game/land'?'320-land':'320-armory');
 }}
 await page.setViewportSize({width:1366,height:900});await visit('/game/home');await shot('1366-home');await visit('/game/land');await shot('1366-land');
 await page.setViewportSize({width:1024,height:1536});await visit('/game/land');await shot('1024-land');
 await page.setViewportSize({width:390,height:844});await visit('/game/land?bulk=smallholding#bulk-trade');
 const quantity=page.locator('.bulk-trades form').first().locator('[name=quantity]');const selected=await quantity.inputValue();await r.db.query("UPDATE sessions SET expires_at=clock_timestamp()-interval '1 minute' WHERE account_id=$1",[actor.accountId]);
 const prior=posts;await page.locator('.bulk-trades form').first().getByRole('button',{name:'Buy selected Smallholding',exact:true}).click();
 await page.locator('.bulk-trades form').first().getByRole('link',{name:'Sign in and return',exact:true}).waitFor();assert.equal(posts,prior);assert.equal(await quantity.inputValue(),selected);await shot('390-session-recovery');
 checks.push('Expired session preserves the focused bulk screen and quantity; no purchase POST is sent.');
 assert.ok(!assets.some(p=>p.includes('/art/kingdoms-live/')||/^\/assets\/art\/(home|quests|battle|armory|army|crest|tab-).*\.png$/.test(p)),'No APK-derived runtime art requests.');
 assert.deepEqual(errors,[]);checks.push('56 responsive visits, 44px trade buttons, five tabs, no horizontal overflow, no JavaScript errors, and no APK-derived asset requests.');
 await writeFile(out+'/summary.json',JSON.stringify({passed:true,checks,measurements,widths,responsiveVisits:widths.length*paths.length,browserErrors:errors,productionContacted:false,limitations:['Chromium touch emulation; physical Android/iPhone and WebKit review remain.','Three-hour idle uses a simulated browser clock.','Approved shared UI and orchestral audio are the alpha baseline; professional refinement remains future work.']},null,2)+'\n');
 console.log(JSON.stringify({passed:true,checks,measurements},null,2));
}catch(error){await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});await writeFile(out+'/failure.json',JSON.stringify({error:String(error),url:page.url(),errors,checks,text:await page.locator('main').innerText().catch(()=> '')},null,2));throw error;}
finally{await context.close();await browser.close();await app.close();await r.close();}
