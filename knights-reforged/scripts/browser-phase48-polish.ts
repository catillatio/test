// Visual review of real templates and real local combat records. No production
// endpoints, credentials, imported accounts, economy edits or realm seeding.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl,type Player} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {alpha} from '../src/alpha-rules.js';

if(!testDatabaseUrl)throw new Error('A disposable local *_test database is required.');
const baseline=process.argv.includes('--baseline'),stage=baseline?'before':'after';
const root='test-results/phase48-final-polish',out=root+'/'+stage;await mkdir(out,{recursive:true});
const now=new Date('2026-10-20T18:15:00Z'),r=await realm({isolated:true,clock:()=>now});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'});
const app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844},timezoneId:'America/New_York',deviceScaleFactor:1});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const page=await context.newPage(),errors:string[]=[],captures:string[]=[];let visits=0;
page.on('pageerror',e=>errors.push(e.message));page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).pathname.startsWith('/assets/'))errors.push('Missing local asset');});
async function signIn(actor:Player){await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);}
async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200,path);visits++;await page.locator('.realm-resources').waitFor();await page.evaluate(async()=>{await document.fonts.ready;document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0);});await page.waitForTimeout(100);}
async function shot(name:string){await page.screenshot({path:out+'/'+name+'.png',fullPage:false,animations:'disabled'});captures.push(name+'.png');}
type Rect={x:number;y:number;width:number;height:number};
async function shape(){return page.evaluate<{header:Rect[];menu:Rect[];rows:Rect[];art:Rect[];trades:Rect[];fullRows:number;overflow:boolean}>(`(()=>{
 const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
 const rows=[...document.querySelectorAll('.market-catalog>.catalog-row')].slice(0,6);
 return {header:['.topbar','.resource-upper','.resource-lower','.primary-nav'].map(s=>rect(document.querySelector(s))),
  menu:[...document.querySelectorAll('.home-menu>.button')].map(rect),rows:rows.map(rect),art:rows.map(row=>rect(row.querySelector('.property-art-frame,.catalog-art'))),
  trades:rows.flatMap(row=>[...row.querySelectorAll('.single-trades button[type=submit]')].map(rect)),
  fullRows:rows.filter(row=>{const r=row.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight-(document.querySelector('.primary-nav')?.getBoundingClientRect().height??0);}).length,
  overflow:document.documentElement.scrollWidth>innerWidth};
 })()`);}
try{
 // Pause at a time safely ahead of clock installation; pausing at the exact
 // install instant can race the advancing browser clock on a busy runner.
 await page.clock.install({time:new Date(now.getTime()-60_000)});await page.clock.pauseAt(now);
 const actor=await r.player('Captain Arlen Westridge'),rival=await r.player('Lady Elira Westridge');
 for(const p of [actor,rival]){await r.prepare(p,200000,2500);await r.ok(p,'/api/v1/settings/sound',{enabled:'0',volume:40});await r.ok(p,'/api/v1/tutorial',{action:'skip'});}
 await r.legacyArmy(actor,9);
 for(const itemId of ['iron-sword','padded-coat','hearth-ward'])await r.ok(actor,'/api/v1/inventory/purchases',{itemId,quantity:10});
 for(const [propertyId,quantity] of [['smallholding',4],['woodland',3],['copper-workshop',2],['watchtower',1],['river-mill',2],['hearthstead-hamlet',1]] as const)await r.ok(actor,'/api/v1/land/purchases',{propertyId,quantity});
 for(let i=0;i<3;i++)await r.ok(actor,'/api/v1/quests/border-patrol/runs');
 const victory=await r.ok(actor,'/api/v1/battles',{targetCharacterId:rival.id});
 await r.legacyArmy(rival,9);const rivalState=await r.me(rival);
 const weapon=alpha.items.filter(i=>i.category==='weapon'&&i.level<=rivalState.level&&i.price*10<50000).sort((a,b)=>b.attack-a.attack)[0]!;
 await r.ok(rival,'/api/v1/inventory/purchases',{itemId:weapon.id,quantity:10});
 for(let i=0;i<10;i++)await r.ok(rival,'/api/v1/skills',{resource:'attack'});
 assert.ok((await r.me(rival)).attack>(await r.me(actor)).defense*1.4,'The incoming fixture must be a real, reliably stronger attacker.');
 const incoming=await r.ok(rival,'/api/v1/battles',{targetCharacterId:actor.id});
 const records=(await r.db.query('SELECT id,result FROM battles WHERE id=ANY($1::uuid[])',[ [victory.battleId,incoming.battleId] ])).rows;
 assert.equal(records.find(b=>b.id===victory.battleId)!.result.winnerId,actor.id);assert.equal(records.find(b=>b.id===incoming.battleId)!.result.winnerId,rival.id);
 const before=await r.me(actor);await signIn(actor);
 const widths=[320,360,390,412,430,768,1024,1366],pages:[string,string][]=[['home','/game/home'],['armory','/game/armory'],['land','/game/land'],['battle','/game/battle'],['profile','/game/profile']];
 const layouts:Record<string,Awaited<ReturnType<typeof shape>>>={};
 const baselinePath=existsSync(root+'/before/layouts.json')?root+'/before/layouts.json':'docs/phase48/final-polish/baseline-layouts.json';
 const prior=baseline?null:JSON.parse(await readFile(baselinePath,'utf8'));
 for(const width of widths){
  await page.setViewportSize({width,height:width>=900?1536:844});
  for(const [name,path] of pages){
   await visit(path);if(name==='land'&&width<900)await page.locator('.gold-flow').evaluate(node=>node.removeAttribute('open'));
   const key=width+'-'+name,layout=await shape();layouts[key]=layout;
   assert.equal(layout.overflow,false,key+' overflows');assert.equal(await page.locator('.primary-nav a').count(),5);
   assert.ok(layout.trades.every(r=>r.width>=44&&r.height>=44),key+' trade controls must remain 44px');
   if(name==='land'&&width===390)assert.ok(layout.fullRows>=4);
   if([320,390,430,1024].includes(width))await shot(key);
   if(prior){for(const field of ['header','menu','rows','art','trades'] as const)assert.deepEqual(layout[field],prior[key][field],key+' preserves '+field+' dimensions and positions');}
   if(name==='home'){
    if(!baseline){assert.equal(await page.locator('#activity-title').innerText(),'Recent Activity');assert.deepEqual(await page.locator('.feed-tabs a').allTextContents(),['All','Battles','Comments','Broadcasts']);}
    assert.equal(await page.locator('.activity-battle .outcome-victory').count(),1);assert.equal(await page.locator('.activity-battle .outcome-defeat').count(),1);
   }
  }
 }
 await page.setViewportSize({width:390,height:844});await visit('/game/home');await page.locator('#activity-title').scrollIntoViewIfNeeded();await shot('390-home-recent-activity');
 for(const state of ['victory','defeat']){
  const row=page.locator('.activity-battle').filter({has:page.locator('.outcome-'+state)});
  // Native locator screenshots scroll only far enough to enter the viewport;
  // center the row so fixed navigation cannot cover the actual status.
  await row.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
  const visible=await row.locator('h3').evaluate(node=>{const r=node.getBoundingClientRect();return r.top>=document.querySelector('.resource-lower')!.getBoundingClientRect().bottom&&r.bottom<document.querySelector('.primary-nav')!.getBoundingClientRect().top;});assert.ok(visible,state+' close-up is unobstructed');
  await row.locator('h3').screenshot({path:out+'/390-'+state+'-heading.png',animations:'disabled'});captures.push('390-'+state+'-heading.png');
  await row.locator('.combat-outcome').screenshot({path:out+'/390-'+state+'-badge.png',animations:'disabled'});captures.push('390-'+state+'-badge.png');
 }
 await page.locator('.activity-feed').evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
 await page.locator('.activity-feed').screenshot({path:out+'/390-outcomes-context.png',animations:'disabled'});captures.push('390-outcomes-context.png');
 for(const state of ['victory','defeat']){
  const row=page.locator('.activity-battle').filter({has:page.locator('.outcome-'+state)});
  assert.ok(await row.locator('time[datetime]').count());assert.ok(await row.locator('a[href^="/game/battles/"]').count());assert.ok(await row.locator('a[href^="/game/players/"]').count());
  assert.equal(await row.locator('.combat-outcome button,.combat-outcome a,[role=button].combat-outcome').count(),0);
  if(!baseline){assert.equal(await row.locator('.combat-outcome').evaluate(node=>getComputedStyle(node).clipPath),'none');}
 }
 // Keyboard focus, native disclosures, reduced-motion and the existing five
 // destinations remain functional; no synthetic financial request is sent.
 await page.clock.resume();await visit('/game/land');await page.locator('.land-flow-head').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.gold-flow').getAttribute('open'),null);
 assert.ok(await page.locator('.land-flow-head').evaluate(node=>getComputedStyle(node).outlineStyle!=='none'));
 await page.emulateMedia({reducedMotion:'reduce'});const transition=await page.locator('.land-property .button-gold').first().evaluate(node=>getComputedStyle(node).transitionDuration);assert.ok(transition.split(',').every(v=>parseFloat(v)===0));
 for(const tab of ['battles','comments','broadcasts']){await visit('/game/home?feed='+tab);assert.equal(await page.locator('.feed-tabs a[aria-current=page]').innerText(),tab[0]!.toUpperCase()+tab.slice(1));}
 const after=await r.me(actor);for(const key of ['gold','xp','bankedGold','inventory','land','units','battleStats'] as const)assert.deepEqual(after[key],before[key],key+' changed during read-only review');
 assert.deepEqual(errors,[]);
 await writeFile(out+'/layouts.json',JSON.stringify(layouts,null,2)+'\n');
 const summary={passed:true,stage,widths,visits,captures,geometryComparedToBaseline:!baseline,actualDurableVictories:1,actualDurableDefeats:1,browserErrors:errors,productionContacted:false,limitations:['Chromium touch emulation, not physical Android/iPhone or WebKit verification.','Only paint, typography and display labels may differ; no economy or transaction handler is changed.']};
 await writeFile(out+'/summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({passed:true,stage,visits,captures:captures.length,geometryComparedToBaseline:!baseline}));
}finally{await context.close();await browser.close();await app.close();await r.close();}
