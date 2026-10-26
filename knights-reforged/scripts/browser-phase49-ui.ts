// Actual local gameplay pages only. No Railway, live accounts or external fetches.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {provisionBots} from '../src/development.js';
import {championCategories} from '../src/competition.js';
import {levelRequirement} from '../src/alpha-rules.js';

if(!testDatabaseUrl)throw new Error('A designated disposable *_test database is required.');
const out='docs/phase49/ui-review/screenshots';await mkdir(out,{recursive:true});
const r=await realm({isolated:true,clock:()=>new Date('2026-10-20T21:00:00Z'),developmentBotsEnabled:true});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000',ENABLE_DEV_BOTS:'1'}),app=await createApp({db:r.db,config});
const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/New_York'});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
await context.addInitScript(()=>{(window as any).played=[];document.addEventListener('kingdom-sound-played',(e:any)=>(window as any).played.push(e.detail.cue));});
const page=await context.newPage(),checks:string[]=[],captures:string[]=[],errors:string[]=[],measurements:unknown[]=[];
page.on('pageerror',e=>errors.push(e.message));
async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200,path);await page.locator('.realm-resources').waitFor();await page.waitForTimeout(70);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path+' overflow');assert.equal(await page.locator('.primary-nav a').count(),5);}
async function shot(name:string){await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});captures.push(name+'.png');}
async function styleBaseline(){return page.evaluate(()=>({teal:getComputedStyle(document.querySelector('.resource-lower')!).backgroundImage,resourceHeight:document.querySelector('.resource-lower')!.getBoundingClientRect().height,rowHeight:document.querySelector('.land-property')!.getBoundingClientRect().height}));}
try{
 await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
 const actor=await r.player('Aldric of the Vale');await r.prepare(actor,250000,Array.from({length:16},(_,i)=>levelRequirement(i+1)).reduce((s,n)=>s+n,0));
 await r.ok(actor,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:4});await r.ok(actor,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:3});await r.ok(actor,'/api/v1/tutorial',{action:'skip'});await r.ok(actor,'/api/v1/settings/sound',{enabled:'1',volume:38});
 for(let i=0;i<9;i++){const a=await r.player(['Elowen Thornfield','Ser Garrick Vale','Morwen Ashford','Thrain Stonehand','Isolde Hawthorn','Cedric Ravenmere','Lady Rowan','Brynden Ironhart','Vaelor Blackwood'][i]!);await r.prepare(a,5000,Array.from({length:3+i},(_,n)=>levelRequirement(n+1)).reduce((s,n)=>s+n,0));await r.me(a);}
 await r.me(actor);await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 const stableTables=['accounts','development_bots','wallets','vault_accounts','inventory_entries','inventory_lots','land_holdings','army_stacks','battles','bounties','character_achievements','tutorial_guides','sound_preferences'];
 async function snapshot(){const rows:Record<string,string[]>={};for(const t of stableTables)rows[t]=(await r.db.query('SELECT row_to_json(t)::text row FROM '+t+' t')).rows.map(x=>x.row).sort();rows.characterProgression=(await r.db.query('SELECT id,account_id,name,xp,attained_level,level_xp,skill_points,profile_class,max_health,max_mana,max_spirit,attack_training,defense_training FROM characters ORDER BY id')).rows.map(x=>JSON.stringify(x));return rows;}
 const before=await snapshot();assert.equal(before.development_bots!.length,450);
 for(const width of[320,390,430,1024]){
  await page.setViewportSize({width,height:width===1024?900:844});
  await page.route('**/assets/phase49.css*',route=>route.fulfill({contentType:'text/css',body:''}));await visit('/game/land');const baseline=await styleBaseline();await page.unroute('**/assets/phase49.css*');
  await visit('/game/land');assert.deepEqual(await styleBaseline(),baseline,'Teal resource style and Land row dimensions must remain unchanged');measurements.push({width,...baseline});if(width<500)await shot(width+'-land');
  await visit('/game/home');const hall=await page.locator('.hall-menu-link').boundingBox(),calling=await page.locator('.calling-menu-link').boundingBox();assert.ok(hall&&calling&&Math.abs(hall.y-calling.y)<1&&calling.x>hall.x);
  if(width<500)await shot(width+'-home');
  await page.getByRole('link',{name:/^Calling/}).click();await page.waitForURL('**/game/home?calling=1#calling');await page.locator('#calling').scrollIntoViewIfNeeded();assert.equal(await page.locator('#calling-choice').inputValue(),'Freeblade');assert.ok(await page.getByRole('button',{name:'Choose calling',exact:true}).isVisible());if(width<500)await shot(width+'-calling');
  if(width===390){await page.locator('.calling-details>summary').click();await shot('390-calling-details');}
  await visit('/game/profile');assert.ok(await page.locator('[data-profile-stats]').isVisible());assert.ok(await page.locator('[data-profile-income]').isVisible());assert.equal(await page.locator('#calling-choice').count(),0);assert.ok(await page.getByText('Total Income',{exact:true}).isVisible());if(width<500)await shot(width+'-profile');
  for(const category of['victories','bounties','land','level']){
   await visit('/game/champions?category='+category);assert.equal(await page.locator('.champion-tabs a').count(),championCategories.length);assert.ok(await page.locator('.champion-row').count()<=20);
   const targets=await page.locator('.champion-tabs a,.champion-row .player-link').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));assert.ok(targets.every(e=>e.w>=44&&e.h>=44));
   if(category==='level'){assert.equal(await page.locator('.champion-row').count(),10);if(width<500)await shot(width+'-champions');}
  }
  checks.push(width+'px: no overflow, five tabs, Calling beside Hall, compact visible profile statistics, champion categories, bounded rankings, 44px targets, unchanged teal row and Land density');
 }
 assert.deepEqual(await snapshot(),before,'UI navigation cannot alter protected gameplay data');
 await visit('/game/home');await page.getByRole('link',{name:/^Calling/}).click();await page.waitForURL('**/game/home?calling=1#calling');
 await page.locator('.calling-details>summary').click();await page.locator('#calling-choice').selectOption('Spellward');await page.waitForTimeout(150);assert.deepEqual(await page.evaluate(()=>(window as any).played),[],'Routine controls remain silent while audio is enabled');
 const commandId=await page.locator('#calling [name=commandId]').inputValue(),wallet=(await r.me(actor)).gold;
 await page.getByRole('button',{name:'Choose calling',exact:true}).click();await page.waitForURL('**/game/home?calling=1&command=*#calling');assert.equal((await r.me(actor)).className,'Spellward');assert.equal((await r.me(actor)).gold,wallet);
 const response=await page.evaluate(async({commandId,csrf})=>{const response=await fetch('/game/profile/calling',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({commandId,csrf,className:'Spellward',returnTo:'home'})});return response.status;},{commandId,csrf:actor.csrf});assert.equal(response,200);assert.equal((await r.db.query('SELECT count(*)::int n FROM calling_changes WHERE character_id=$1',[actor.id])).rows[0]!.n,1);
 checks.push('Calling uses actual server command, returns to Home, free first change and same-key retry applies once; ordinary navigation and controls emit no sounds');
 assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/phase49-ui-browser.json',JSON.stringify({passed:true,checks,captures,measurements,errors,preservedTables:stableTables,preservedCharacterProgression:true,preservedBotCount:450,productionContacted:false},null,2)+'\n');console.log('PASS '+checks.length+' groups, '+captures.length+' screenshots');
}finally{await browser.close();await app.close();await r.close();}
