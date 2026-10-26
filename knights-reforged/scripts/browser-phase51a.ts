// Deterministic screenshots of real local routes and committed purchases.
// Historical owner screenshots are reference-only and never loaded by this app.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';

if(!testDatabaseUrl)throw new Error('Use a disposable local *_test database.');
const baseline=process.argv.includes('--before'),verifyOnly=process.argv.includes('--verify-only'),stage=baseline?'before':'after';
const out='docs/phase51a/screenshots/'+stage;if(!verifyOnly)await mkdir(out,{recursive:true});
const prior=baseline?null:JSON.parse(await readFile('docs/phase51a/before-browser.json','utf8'));
const now=new Date('2026-10-23T16:00:00Z'),r=await realm({isolated:true,clock:()=>now});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'});
const app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/New_York',reducedMotion:'reduce'});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const page=await context.newPage(),errors:string[]=[],evidence:unknown[]=[];
page.on('pageerror',e=>errors.push(e.message));
async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200,path);await page.evaluate(async()=>{await document.fonts.ready;document.documentElement.style.scrollBehavior='auto';});}
async function shot(width:number,name:string,selector?:string){
 if(selector)await page.locator(selector).first().scrollIntoViewIfNeeded();
 assert.equal(await page.locator('.primary-nav a').count(),5);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');
 if(!verifyOnly)await page.screenshot({path:out+'/'+width+'-'+name+'.png',animations:'disabled'});
 const styles=await page.locator('.guide-lesson,.guide-done,.tutorial-complete,.quest-result,.achievement-row,.achievement-toast,.resource-lower').evaluateAll(nodes=>nodes.slice(0,8).map(n=>({class:n.className,background:getComputedStyle(n).background,color:getComputedStyle(n).color})));
 if(!baseline){
  const reference=prior.views.find((v:any)=>v.width===width&&v.name===name);
  assert.equal(styles.find(s=>s.class==='resource-lower')?.background,reference.styles.find((s:any)=>s.class==='resource-lower')?.background,'Teal header must remain unchanged');
  for(const s of styles.filter(s=>s.class!=='resource-lower'))for(const match of s.background.matchAll(/rgba?\((\d+), (\d+), (\d+)/g))assert.ok(!(Number(match[2])>Number(match[1])+5&&Number(match[2])>Number(match[3])+5),'No remaining green panel fill: '+s.class);
 }
 evidence.push({width,name,styles});
}
try{
 await page.clock.install({time:new Date(+now-60000)});await page.clock.pauseAt(now);
 const actor=await r.player('Lady Evelyn Ashcroft'),other=await r.player('Garrick Stonevale');
 for(const p of [actor,other]){await r.prepare(p,200000,2500);await r.ok(p,'/api/v1/tutorial',{action:'skip'});}
 // Quantity differences deliberately make income order differ from unlock order.
 for(const [propertyId,quantity] of [['smallholding',20],['woodland',3],['copper-workshop',1],['watchtower',1]] as const)await r.ok(actor,'/api/v1/land/purchases',{propertyId,quantity});
 await r.ok(actor,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});
 const quest=await r.ok(actor,'/api/v1/quests/border-patrol/runs');
 for(let i=0;i<6;i++){const p=await r.player(['Elowen Fairwind','Cedric Ashbourne','Isolde Thornfield','Thrain Stonehand','Morwen Hawthorn','Vaelor Blackwood'][i]!);await r.prepare(p,0,20+i*90);await r.me(p);}
 await r.ok(actor,'/api/v1/tutorial',{action:'replay'});
 await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 const stable=async()=>({wallet:(await r.me(actor)).gold,inventory:(await r.me(actor)).inventory.map(i=>[i.id,i.quantity]),holdings:(await r.me(actor)).land.holdings});
 for(const width of [320,390,430,1024]){
  await page.setViewportSize({width,height:width===1024?1000:844});
  await visit('/game/tutorial');await shot(width,'tutorial');
  await visit('/game/quests?area=all&command='+quest.commandId);await shot(width,'quest-completion','.quest-result');
  await r.ok(actor,'/api/v1/tutorial',{action:'skip'});
  await visit('/game/achievements');await shot(width,'achievements','.achievement-row');
  await visit('/game/champions?category=level');await shot(width,'champions');
  if(!baseline){
   assert.equal(await page.locator('.champion-level').count(),8);
   for(const link of await page.locator('.champion-row .player-link').all()){
    const box=await link.boundingBox();assert.ok(box&&box.height>=44&&box.width>=44);
   }
   await page.locator('.champion-row .player-link').first().focus();assert.ok(await page.locator('.champion-row .player-link').first().evaluate(n=>n===document.activeElement));
  }
  await visit('/game/profile');await shot(width,'profile-holdings','.profile-estate');
  await context.addCookies([{name:'kr_session',value:other.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
  await visit('/game/players/'+actor.id);await shot(width,'public-holdings','.profile-estate');
  await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
  // Replay is not allowed to force or repeat a purchase; stop it before trading.
  await r.ok(actor,'/api/v1/tutorial',{action:'skip'});
  for(const [market,entry] of [['armory?category=armor','padded-coat'],['land','woodland']] as const){
   await visit('/game/'+market);
   const prefix=market.startsWith('armory')?'item-':'property-';
   await page.locator('#'+prefix+entry+' .single-trades button[type=submit]').first().click();
   await page.waitForURL(baseline?'**/game/purchases/*':url=>url.pathname==='/game/'+(market.startsWith('armory')?'armory':'land')&&url.searchParams.has('command'));
   if(!baseline){assert.equal(await page.locator('.market-purchase-feedback').count(),1);assert.equal(await page.locator('#'+prefix+entry).count(),1);}
   await shot(width,market.startsWith('armory')?'armory-purchase':'land-purchase');
   const saved=await stable();await page.reload();assert.deepEqual(await stable(),saved,'Refreshing confirmation must not repeat a trade');
   if(!baseline){
    const receipt=page.locator('.market-purchase-feedback a'),box=await receipt.boundingBox();assert.ok(box&&box.height>=44&&box.width>=44);
    await receipt.focus();assert.ok(await receipt.evaluate(n=>n===document.activeElement));
    await page.goBack();await page.goForward();assert.deepEqual(await stable(),saved,'Back/forward must not repeat a trade');
   }
  }
  await r.ok(actor,'/api/v1/tutorial',{action:'replay'});
 }
 // Completion is a synthetic presentation fixture, never a completion reward.
 await r.db.query("UPDATE player_preferences SET tutorial_status='completed' WHERE character_id=$1",[actor.id]);
 await r.db.query("UPDATE tutorial_guides SET replaying=false,completed_at=$2 WHERE character_id=$1",[actor.id,now]);
 for(const width of [320,390,430,1024]){await page.setViewportSize({width,height:width===1024?1000:844});await visit('/game/tutorial');await shot(width,'tutorial-complete');}
 // Native forms must work with JavaScript completely disabled.
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
 await nojs.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await nojs.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 const plain=await nojs.newPage();await plain.goto(origin+'/game/armory?category=spell');
 await plain.locator('#item-ember-word .single-trades button[type=submit]').first().click();await plain.waitForURL(baseline?'**/game/purchases/*':'**/game/armory?category=spell&command=*');
 if(!baseline)assert.equal(await plain.locator('.market-purchase-feedback').count(),1);
 await nojs.close();assert.deepEqual(errors,[]);
 await mkdir('test-results',{recursive:true});
 await writeFile(verifyOnly?'test-results/phase51a-browser.json':'docs/phase51a/'+stage+'-browser.json',JSON.stringify({passed:true,stage,views:evidence,noJavaScriptPurchase:true,productionContacted:false,errors},null,2)+'\n');
 console.log('PASS '+evidence.length+' responsive captures; no-JS purchase and refresh preservation.');
}finally{await context.close();await browser.close();await app.close();await r.close();}
