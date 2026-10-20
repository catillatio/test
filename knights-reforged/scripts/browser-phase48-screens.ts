// Whole-screen Phase 4.8 review against an isolated, populated local test realm.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl,type Player} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {provisionBots} from '../src/development.js';
import {experienceView} from '../src/experience.js';

if(!testDatabaseUrl)throw new Error('A disposable local *_test database is required.');
const out='test-results/phase48-shared-screens';await mkdir(out,{recursive:true});
const r=await realm({isolated:true,clock:()=>new Date('2026-10-20T18:15:00Z'),developmentBotsEnabled:true,developmentBotBountiesEnabled:true,developmentBotRecruitmentEnabled:true});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000',ENABLE_DEV_BOTS:'1',ENABLE_DEV_BOT_BOUNTIES:'1',ENABLE_DEV_BOT_RECRUITMENT:'1'});
const app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/New_York',permissions:['clipboard-read','clipboard-write']});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const page=await context.newPage(),errors:string[]=[],checks:string[]=[],captures:string[]=[];let visits=0;
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/assets/')&&response.status()>=400)errors.push('Missing local asset');});
async function signIn(actor:Player){await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);}
async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200,path);visits++;await page.locator('.realm-resources').waitFor();if(!new URL(page.url()).hash)await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(100);}
async function shot(name:string){await page.screenshot({path:out+'/'+name+'.png',fullPage:false,animations:'disabled'});captures.push(name+'.png');}
async function noOverflow(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow at '+page.viewportSize()?.width+'px '+new URL(page.url()).pathname);}
async function header(){return page.evaluate(()=>{
 const result=[];for(const selector of ['.topbar','.resource-upper','.resource-lower','.primary-nav']){
  const node=document.querySelector(selector)!,r=node.getBoundingClientRect(),s=getComputedStyle(node);result.push({width:r.width,height:r.height,font:s.font,background:s.background,border:s.border});
 }return result;
});}
try{
 const actor=await r.player('Captain Arlen Westridge'),friend=await r.player('Lady Elira Westridge');
 await r.prepare(actor,200000,2500);await r.prepare(friend,20000,2500);
 await r.legacyArmy(actor,9);await r.legacyArmy(friend,4);
 for(const person of [actor,friend])for(const itemId of ['iron-sword','padded-coat','hearth-ward'])await r.ok(person,'/api/v1/inventory/purchases',{itemId,quantity:person===actor?10:5});
 for(const [propertyId,quantity] of [['smallholding',4],['woodland',3],['copper-workshop',2],['watchtower',1],['river-mill',2],['hearthstead-hamlet',1]] as const)await r.ok(actor,'/api/v1/land/purchases',{propertyId,quantity});
 await r.ok(actor,'/api/v1/army/invitations',{targetCharacterId:friend.id});await r.ok(friend,'/api/v1/army/acceptances',{targetCharacterId:actor.id});
 for(let i=0;i<3;i++)await r.ok(actor,'/api/v1/quests/border-patrol/runs');
 await r.ok(actor,'/api/v1/vault/deposits',{amount:2000});await r.ok(actor,'/api/v1/vault/withdrawals',{amount:250});
 await r.ok(actor,'/api/v1/settings/sound',{enabled:'0',volume:40});await r.ok(actor,'/api/v1/tutorial',{action:'skip'});
 await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
 const botIdentities=(await r.db.query('SELECT c.id,c.name,c.attained_level,c.profile_class FROM characters c JOIN development_bots b ON b.character_id=c.id ORDER BY c.id')).rows;assert.equal(botIdentities.length,450);
 const firstBattle=await r.ok(actor,'/api/v1/battles',{targetCharacterId:friend.id});
 const victory=firstBattle.data?.celebration?await r.ok(actor,'/api/v1/battles',{targetCharacterId:friend.id}):firstBattle;
 const incoming=await r.ok(friend,'/api/v1/battles',{targetCharacterId:actor.id});
 await r.ok(actor,'/api/v1/broadcasts',{body:'The roads are open. May your kingdom prosper.'});
 const before=await r.me(actor);await signIn(actor);
 const screens:[string,string][]=[['home','/game/home'],['armory','/game/armory'],['armor','/game/armory?category=armor'],['spells','/game/armory?category=spell'],['land','/game/land'],['quests','/game/quests?area=all'],['battle','/game/battle'],['profile','/game/profile'],['recruit','/game/army'],['army','/game/army?tab=army'],['dashboard','/game/army?tab=dashboard'],['vault','/game/vault'],['settings','/game/settings'],['champions','/game/champions'],['achievements','/game/achievements'],['bounties','/game/bounties'],['victory','/game/battles/'+victory.battleId],['revenge','/game/battles/'+incoming.battleId],['level-up','/game/battles/'+firstBattle.battleId]];
 const widths=[320,360,390,412,430,768,1024,1366];
 for(const width of widths){
  await page.setViewportSize({width,height:width>=900?1536:844});await visit('/game/land');const reference=await header();
  for(const [name,path] of screens){await visit(path);await noOverflow();assert.equal(await page.locator('.primary-nav a').count(),5);assert.deepEqual(await header(),reference,name+' must reuse the approved Land header and navigation');
   if([320,390,430].includes(width)||width===1024&&['home','armory','land','quests','battle','profile'].includes(name))await shot(width+'-'+name);
   if(name==='battle'){assert.equal(await page.locator('.recent-rivals').count(),0);assert.equal(await page.locator('.battle-summary').count(),0);}
   if(name==='armory'||name==='land'){
    const sizes=await page.locator('.single-trades button[type=submit]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height};}));assert.ok(sizes.every(s=>s.w>=44&&s.h>=44));
   }
   if(name==='profile')assert.ok(await page.locator('.profile-inventory').evaluate(node=>{const holdings=document.querySelector('.profile-estate');return !!holdings&&!!(node.compareDocumentPosition(holdings)&Node.DOCUMENT_POSITION_FOLLOWING);}));
  }
 }
 checks.push('152 screen visits at eight widths: shared Land header/navigation, five tabs, no horizontal overflow and 44px+ marketplace controls.');
 await page.setViewportSize({width:390,height:844});
 await visit('/game/quests?area=all');await page.getByRole('link',{name:/Next region:/}).click();await page.waitForURL('**area=vale');await visit('/game/quests');assert.equal(await page.locator('.region-filter>summary strong').innerText(),'The Vale');
 await page.locator('.region-filter>summary').click();await page.getByRole('link',{name:/The Eclipse Crown/}).click();assert.ok(await page.locator('.quest-card.is-locked').count()>0);assert.equal(await page.locator('.quest-card.is-locked button[type=submit]:not(:disabled)').count(),0);await shot('390-quests-locked');
 await visit('/game/quests?area=all');checks.push('Previous/next region navigation and remembered filters work; locked regions remain readable and quests stay disabled.');
 await visit('/game/profile');assert.equal(await page.locator('.profile-identity').getByText(/Joined/).count(),0);
 await visit('/game/army');await page.getByRole('button',{name:'Copy',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),before.invitationCode);assert.match(await page.locator('[data-copy-status]').innerText(),/copied/);checks.push('Invitation code copies through a user gesture; detailed army, accepted ally and dashboard pages render.');
 await visit('/game/settings');await page.locator('[name=volume]').evaluate(node=>{const input=node as HTMLInputElement;input.value='37';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('[data-sound-status]')?.textContent==='Sound settings saved.');
 assert.deepEqual((await(await page.request.get(origin+'/api/v1/me')).json()).sound,{enabled:false,volume:37});await page.reload();assert.equal(await page.locator('[name=volume]').inputValue(),'37');checks.push('Sound auto-saves through authenticated CSRF-protected idempotent commands and persists reload.');
 const after=await r.me(actor);for(const key of ['gold','xp','bankedGold','inventory','land','units'] as const)assert.deepEqual(after[key],before[key],key+' must not change while reviewing pages/settings');
 const newcomer=await r.player('Young Rowan Westridge');await signIn(newcomer);await visit('/game/tutorial');await shot('390-tutorial-intro');
 await page.getByRole('button',{name:'Start Tutorial',exact:true}).click();await page.waitForURL('**/game/tutorial?command=*');await shot('390-tutorial-step');
 await page.getByRole('link',{name:'Show Me',exact:true}).click();await page.waitForURL('**/game/quests?area=all#quest-border-patrol');assert.equal(await page.locator('#quest-border-patrol.guide-highlight').count(),1);await shot('390-tutorial-quest-highlight');
 const readingBefore=await r.me(newcomer);for(let i=0;i<6;i++)await r.ok(newcomer,'/api/v1/tutorial',{action:'next'});
 await visit('/game/land');assert.equal(await page.locator('#property-smallholding.guide-highlight').count(),1);await shot('390-tutorial-land');
 await r.ok(newcomer,'/api/v1/tutorial',{action:'next'});await r.ok(newcomer,'/api/v1/tutorial',{action:'finish'});await visit('/game/tutorial');await shot('390-tutorial-complete');assert.equal((await experienceView(r.db,newcomer.id)).tutorial.status,'completed');
 await page.reload();assert.match(await page.locator('.tutorial-complete').innerText(),/TUTORIAL COMPLETE/);await visit('/game/home');assert.equal(await page.locator('.tutorial-invitation,.tutorial-resume').count(),0);
 const readingAfter=await r.me(newcomer);for(const key of ['gold','xp','bankedGold','inventory','army','land'] as const)assert.deepEqual(readingAfter[key],readingBefore[key]);checks.push('Optional tutorial introduction, Show Me highlights, Land navigation, voluntary completion and permanent dismissal work without spending or fabricated rewards.');
 assert.deepEqual((await r.db.query('SELECT c.id,c.name,c.attained_level,c.profile_class FROM characters c JOIN development_bots b ON b.character_id=c.id ORDER BY c.id')).rows,botIdentities);
 // A large, legitimate fixture balance must remain readable, not just the
 // five/six-digit wallet used by the review captures. No live account is used.
 const treasury=await r.player('Treasury Layout Explorer');await r.prepare(treasury,2000000000,40000);await r.ok(treasury,'/api/v1/settings/sound',{enabled:'0',volume:30});const treasuryGold=(await r.me(treasury)).gold;await signIn(treasury);
 for(const width of [320,360,390,412,430,1024]){
  await page.setViewportSize({width,height:844});await visit('/game/land');await noOverflow();
  assert.equal(await page.locator('.gold-resource [data-wallet-gold]').innerText(),treasuryGold.toLocaleString('en'));
  const fits=await page.locator('.gold-resource').evaluate(node=>{const label=node.querySelector('[data-wallet-gold]')!,r=document.createRange();r.selectNodeContents(label);const text=r.getBoundingClientRect(),box=node.getBoundingClientRect();return text.left>=box.left&&text.right<=box.right;});assert.ok(fits,width+'px must display the full treasury balance');
 }
 checks.push('Full ten-digit treasury balances remain readable at 320–430px and desktop without clipped gold or horizontal overflow.');
 assert.deepEqual(errors,[]);
 await writeFile(out+'/summary.json',JSON.stringify({passed:true,checks,widths,visits,captures,browserErrors:errors,syntheticBotPopulation:450,productionContacted:false,limitations:['Chromium touch emulation; no physical iPhone/Android or WebKit claim.','Original sound set remains pending a separate owner audition.']},null,2)+'\n');
 console.log(JSON.stringify({passed:true,visits,checks,captures:captures.length}));
}finally{await context.close();await browser.close();await app.close();await r.close();}
