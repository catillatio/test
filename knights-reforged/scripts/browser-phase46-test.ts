// Local, synthetic PostgreSQL realm only. No live provider, credentials or data.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,type Page,type Locator} from 'playwright-core';
import {realm,testDatabaseUrl,type Player} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
if(!testDatabaseUrl)throw new Error('Use the designated disposable local *_test database.');
const r=await realm({isolated:true}),config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'});
const app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',headless:true,args:process.env.CHROMIUM_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const out='test-results/phase46-browser';await mkdir(out,{recursive:true});const errors:string[]=[],checks:string[]=[];
async function playerPage(actor:Player,width=390){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width<800,hasTouch:width<800});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=500)errors.push('HTTP '+response.status()+' '+new URL(response.url()).pathname);});return page;
}
async function action(page:Page,button:Locator){const before=page.url();await Promise.all([page.waitForURL(url=>url.href!==before),button.click()]);assert.equal(await page.getByRole('alert').count(),0,await page.locator('body').innerText());}
async function state(page:Page){const response=await page.request.get(origin+'/api/v1/me');assert.equal(response.status(),200);return (await response.json()).state;}
async function capture(page:Page,name:string){await page.waitForLoadState('load');await page.screenshot({path:out+'/'+name+'.png',fullPage:true});}
async function layout(page:Page,label:string){
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': horizontal overflow');
 assert.equal(await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link').count(),5);
 assert.equal(await page.locator('img').evaluateAll(images=>images.filter(image=>image instanceof HTMLImageElement&&(!image.complete||image.naturalWidth===0)).length),0,label+': broken image');
 assert.ok(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);return new Set(ids).size===ids.length;}),label+': duplicate element ID');
 assert.equal(await page.getByRole('alert').count(),0,label);
}
try{
 const a=await r.player('Ser Aldren Vale'),b=await r.player('Lady Morwen Briar');const xp=Array.from({length:16},(_,i)=>levelRequirement(i+1)).reduce((n,v)=>n+v,0);
 for(const [actor,copies] of [[a,10],[b,4]] as const){
  await r.prepare(actor,10000000,xp);await r.legacyArmy(actor,9);
  for(const category of ['weapon','armor','spell']){const item=alpha.items.filter(item=>item.category===category&&item.level<=17).sort((a,b)=>(b.attack+b.defense)-(a.attack+a.defense))[0]!;await r.ok(actor,'/api/v1/inventory/purchases',{itemId:item.id,quantity:copies});}
  await r.ok(actor,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:3});
  await r.db.query('UPDATE characters SET health=1000,max_health=1000,spirit=50,max_spirit=50 WHERE id=$1',[actor.id]);
 }
 let lastBattle='';for(let i=0;i<6;i++){const hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});lastBattle=hit.battleId;}
 for(const [name,count] of [['Rowan Wolfhart',2],['Isolde Thornmere',1]] as const){
  const rival=await r.player(name);await r.prepare(rival,10000000,xp);await r.legacyArmy(rival,9);
  for(const category of ['weapon','armor','spell']){const item=alpha.items.filter(item=>item.category===category&&item.level<=17).sort((a,b)=>(b.attack+b.defense)-(a.attack+a.defense))[0]!;await r.ok(rival,'/api/v1/inventory/purchases',{itemId:item.id,quantity:10});}
  for(let i=0;i<count;i++)await r.ok(rival,'/api/v1/battles',{targetCharacterId:b.id});
 }
 const hero=await playerPage(a),defender=await playerPage(b);
 await hero.goto(origin+'/game/champions');await capture(hero,'390-hall-of-champions');
 await hero.goto(origin+'/game/players/'+b.id);await capture(hero,'390-rivalry-history');assert.equal(await hero.getByRole('heading',{name:'Your Rivalry',exact:true}).count(),1);assert.equal(await hero.locator('.rivalry-encounters>li').count(),5);
 await defender.goto(origin+'/game/battles/'+lastBattle);assert.equal(await defender.getByRole('button',{name:'Revenge',exact:true}).isEnabled(),true);await capture(defender,'390-incoming-revenge');
 const spirit=(await state(defender)).spirit;await action(defender,defender.getByRole('button',{name:'Revenge',exact:true}));assert.equal((await state(defender)).spirit,spirit-1);checks.push('Native Revenge consumes ordinary Spirit and creates a normal report.');
 await hero.goto(origin+'/game/battles/'+lastBattle);await hero.locator('.enemy-equipment>summary').click();assert.equal(await hero.locator('.enemy-equipment .inventory-figure').count(),3);await capture(hero,'390-victory-enemy-equipment');
 const reportText=await hero.locator('main').innerText();assert.ok(!/fixed 24-hour|% loot|full-XP|rolling day|ruleset|botCap|commandId|power modifier/.test(reportText));checks.push('Actual saved enemy loadout; no technical reward explanations.');
 const beginner=await r.player('Mira Greenfield'),easy=await r.player('Aldric Fieldwatch');const apprentice=await playerPage(beginner);
 await apprentice.goto(origin+'/game/home');await capture(apprentice,'390-tutorial-introduction');
 await action(apprentice,apprentice.getByRole('button',{name:'Start Tutorial',exact:true}));assert.match(await apprentice.locator('.guide-lesson').innerText(),/Step 1 of 8/);
 await apprentice.getByRole('link',{name:'Show Me',exact:true}).click();assert.equal(new URL(apprentice.url()).hash,'#quest-border-patrol');
 await action(apprentice,apprentice.getByRole('button',{name:'Do quest Patrol the border',exact:true}));for(let i=0;i<2;i++)await action(apprentice,apprentice.getByRole('button',{name:'Do Again',exact:true}));assert.equal((await state(apprentice)).level,2);
 await apprentice.locator('.contextual-guide').getByRole('link',{name:'Show Me',exact:true}).click();await action(apprentice,apprentice.getByRole('button',{name:"Buy Squire's Blade",exact:true}));
 await apprentice.locator('.contextual-guide').getByRole('link',{name:'Show Me',exact:true}).click();
 await action(apprentice,apprentice.locator('.rival-row').filter({has:apprentice.locator('input[value="'+easy.id+'"]')}).getByRole('button',{name:'Attack Aldric Fieldwatch',exact:true}));
 assert.equal((await r.db.query('SELECT outcome FROM battles WHERE id=$1',[new URL(apprentice.url()).pathname.split('/').at(-1)])).rows[0]!.outcome,'attacker_win');
 await apprentice.goto(origin+'/game/tutorial');assert.match(await apprentice.locator('.guide-lesson').innerText(),/Step 7 of 8/);await capture(apprentice,'390-tutorial-land-step');
 await apprentice.getByRole('link',{name:'Show Me',exact:true}).click();assert.equal(new URL(apprentice.url()).pathname,'/game/land');assert.equal(new URL(apprentice.url()).hash,'#property-smallholding');
 const outlined=await apprentice.locator('#property-smallholding').evaluate(el=>getComputedStyle(el).outlineStyle);assert.equal(outlined,'solid');
 await action(apprentice,apprentice.getByRole('button',{name:'Buy Smallholding',exact:true}));assert.equal(await apprentice.getByRole('button',{name:'Buy more Smallholding',exact:true}).isVisible(),true);await capture(apprentice,'390-land-purchase-completion');
 const receipt=apprentice.url();await apprentice.getByRole('link',{name:'Return to Land',exact:true}).click();assert.equal(new URL(apprentice.url()).pathname,'/game/land');assert.equal((await state(apprentice)).land.holdings[0].quantity,1);
 await apprentice.goto(origin+'/game/tutorial');assert.match(await apprentice.locator('.guide-lesson').innerText(),/Step 8 of 8/);await apprentice.getByRole('link',{name:'Show Me',exact:true}).click();await action(apprentice,apprentice.getByRole('button',{name:'Increase Mana',exact:true}));
 await apprentice.goto(origin+'/game/tutorial');assert.equal(await apprentice.getByRole('heading',{name:'TUTORIAL COMPLETE!',exact:true}).count(),1);await capture(apprentice,'390-tutorial-completion');await apprentice.reload();assert.equal(await apprentice.locator('.tutorial-complete.is-celebrating').count(),0);
 await apprentice.getByRole('link',{name:'Continue Playing',exact:true}).click();assert.equal(await apprentice.getByRole('button',{name:'Start Tutorial',exact:true}).count(),0);assert.equal(await apprentice.getByRole('button',{name:'Continue Tutorial',exact:true}).count(),0);checks.push('Entire eight-lesson tutorial through real native quest, purchase, battle, Land and skill actions; saved completion and non-replaying celebration.');
 const paths=['/game/champions','/game/champions?category=level','/game/players/'+b.id,'/game/battles/'+lastBattle,'/game/battle','/game/tutorial'];const widths=[320,360,375,390,393,412,430,1366];let visits=0;
 for(const width of widths){await hero.setViewportSize({width,height:width>800?900:844});for(const path of paths){await hero.goto(origin+path);await layout(hero,width+':'+path);visits++;}await apprentice.setViewportSize({width,height:844});await apprentice.goto(receipt);await layout(apprentice,width+':purchase');visits++;}
 checks.push('Eight Android/iPhone-sized/desktop widths, fixed five tabs, no overflow, missing images or duplicate IDs.');
 await hero.setViewportSize({width:390,height:844});await hero.goto(origin+'/game/champions?category=level');await hero.keyboard.press('Tab');assert.ok(await hero.evaluate(()=>document.activeElement?.tagName==='A'));await hero.getByRole('navigation',{name:'Champion categories'}).getByRole('link',{name:'Bounty Hunters',exact:true}).focus();await Promise.all([hero.waitForURL('**/game/champions?category=bounties'),hero.keyboard.press('Enter')]);assert.equal(await hero.getByRole('link',{name:'Bounty Hunters',exact:true}).getAttribute('aria-current'),'page');
 await hero.emulateMedia({reducedMotion:'reduce'});await hero.goto(origin+'/game/battles/'+lastBattle);assert.equal(await hero.locator('.is-celebrating').count(),0);await hero.locator('.enemy-equipment>summary').focus();await hero.keyboard.press('Enter');assert.equal(await hero.locator('.enemy-equipment').evaluate(el=>el.hasAttribute('open')),true);checks.push('Keyboard-operable category links and equipment disclosure; reduced motion.');
 assert.deepEqual(errors,[]);await writeFile(out+'/summary.json',JSON.stringify({passed:true,viewports:widths,responsiveVisits:visits,screenshots:8,checks,browserErrors:errors,liveProviderContacted:false,limitations:['Headless Chromium with Android/iPhone viewport sizes; not physical devices, Safari, WebView or APK validation.']},null,2)+'\n');console.log('PASS: Phase 4.6 native gameplay, eight interfaces and '+visits+' responsive visits; no browser errors.');
}finally{await browser.close();await app.close();await r.close();}
