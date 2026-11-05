// Isolated real application with synthetic accounts; never connects to production.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {uiThemeFixture} from '../tests/home-theme-fixture.js';
import {profileBusinessSnapshot} from '../tests/classic-profile-fixture.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import type {Player} from '../tests/helpers.js';
const out='test-results/play-readiness';await mkdir(out+'/screenshots',{recursive:true});
const r=await uiThemeFixture(),config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config});
await r.db.query('UPDATE accounts SET username=$2 WHERE id=$1',[r.owner.accountId,'ladyaveline']);
await r.db.query('UPDATE accounts SET username=$2 WHERE id=$1',[r.rival.accountId,'cedricblackthorn']);
const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({hasTouch:true,viewport:{width:390,height:844},reducedMotion:'reduce'});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const page=await context.newPage(),errors:string[]=[],checks:unknown[]=[],failures:unknown[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',res=>{if(res.status()>=400&&new URL(res.url()).pathname.startsWith('/assets/'))errors.push('Missing local asset: '+new URL(res.url()).pathname);});
const scenes:[string,string,Player|null][]=[
 ['home','/game/home',r.owner],['quests','/game/quests',r.owner],['requirements','/game/quests/'+r.coverage.missingQuestId+'/requirements',r.owner],
 ['battle','/game/battle',r.owner],['bounties','/game/bounties',r.owner],['victory','/game/battles/'+r.victory.battleId,r.owner],['defeat','/game/battles/'+r.victory.battleId,r.rival],
 ['weapons','/game/armory',r.owner],['armor','/game/armory?category=armor',r.owner],['spells','/game/armory?category=spell',r.owner],['land','/game/land',r.owner],
 ['army','/game/army?tab=dashboard',r.owner],['profile','/game/profile',r.owner],['public-profile','/game/players/'+r.rival.id,r.owner],['settings','/game/settings',r.owner],
 ['vault','/game/vault',r.owner],['champions','/game/champions',r.owner],['achievements','/game/achievements',r.owner],['tutorial','/game/tutorial',r.coverage.students[7]!],
 ['purchase','/game/purchases/'+r.coverage.equipmentPurchase,r.owner],['activity','/game/home?feed=battles',r.owner],['broadcasts','/game/home?feed=broadcasts',r.owner],
 ['login','/login',null],['register','/register',null],['privacy','/legal/privacy',null],['terms','/legal/terms',null],['deletion','/account-deletion',null]
];
async function visit(path:string,actor:Player|null){await context.clearCookies();if(actor)await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);const response=await page.goto(origin+path);assert.equal(response?.status(),200,path);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(img=>img.complete).map(img=>img.decode().catch(()=>{})));});}
try{
 const before=await profileBusinessSnapshot(r.db);
 for(const [width,height] of [[320,712],[360,800],[360,780],[384,832],[390,844],[393,873],[412,915],[432,960],[600,960],[800,1280],[1280,800]]){
  await page.setViewportSize({width:width!,height:height!});
  for(const [name,path,actor] of scenes){
   await visit(path,actor);
   const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,nav:[...document.querySelectorAll('.primary-nav a')].map(e=>({text:e.textContent?.trim(),...((r)=>({width:r.width,height:r.height}))(e.getBoundingClientRect())})),broken:[...document.images].filter(img=>img.complete&&img.naturalWidth===0).map(img=>img.getAttribute('src')),buttons:[...document.querySelectorAll<HTMLButtonElement>('button.button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({text:e.textContent?.trim(),height:e.getBoundingClientRect().height}))}));
   if(result.overflow||result.broken.length||result.nav.some(n=>n.width<44||n.height<44))failures.push({name,width,height,...result});
   if(actor)assert.equal(result.nav.length,5,name);
   checks.push({name,width,height,overflow:result.overflow,brokenArtwork:result.broken.length,navTargets:result.nav.length});
   if(width===390&&['home','battle','victory','defeat','weapons','land','profile','activity','settings','deletion'].includes(name))await page.screenshot({path:out+'/screenshots/'+name+'-390.png'});
  }
 }
 await writeFile(out+'/viewport-results.json',JSON.stringify({checks,failures},null,2)+'\n');
 // Large text and landscape are separate browser evidence, not an Android-emulator claim.
 for(const [width,height]of [[390,844],[844,390],[600,400]]){
  await page.setViewportSize({width:width!,height:height!});await visit('/game/settings',r.owner);
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Large text / landscape settings overflow');
 }
 assert.deepEqual(await profileBusinessSnapshot(r.db),before,'Read-only screen visits preserve game and financial rows');
 // Real native form: public posting consent, server CSRF and saved message.
 await page.setViewportSize({width:390,height:844});await visit('/game/home?feed=broadcasts',r.owner);
 const form=page.locator('form[action="/game/social/broadcast"]');await form.locator('textarea').fill('Synthetic Play readiness verification.');await form.locator('input[name="communityPolicy"]').check();await form.getByRole('button').click();await page.waitForLoadState('networkidle');assert.ok((await page.locator('.activity-feed').innerText()).includes('Synthetic Play readiness verification.'));
 // Explicitly record expected social mutation separately; financial/game rows stay exact.
 const afterPost=await profileBusinessSnapshot(r.db);for(const table of ['wallets','economy_entries','economy_transactions','vault_accounts','vault_entries','inventory_transactions','battles','bounties','bounty_events'])assert.deepEqual(afterPost[table],before[table],'Social posting does not change '+table);
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[],'Responsive failures');
 // Genuine uncomposited phone screenshots: 1080x1920, within Play aspect-ratio requirements.
 const store=await browser.newContext({viewport:{width:432,height:768},deviceScaleFactor:2.5,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await store.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const storePage=await store.newPage();await store.addCookies([{name:'kr_session',value:r.owner.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 for(const name of ['home','quests','battle','victory','weapons','land','profile','army']){const scene=scenes.find(x=>x[0]===name)!;assert.equal((await storePage.goto(origin+scene[1]))?.status(),200);await storePage.evaluate(async()=>{await document.fonts.ready;for(const img of document.images)img.loading='eager';await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});await storePage.screenshot({path:out+'/screenshots/store-'+name+'.png'});}
 await store.close();
 await writeFile(out+'/verification.json',JSON.stringify({source:'real Fastify/EJS with isolated synthetic PostgreSQL',browser:'Chromium; not Android device certification',checks,failures,errors,storeScreenshots:8},null,2)+'\n');
 console.log('PLAY_BROWSER: PASS — '+checks.length+' real-view viewport cases; synthetic native social form; 8 genuine listing captures');
}finally{await context.close();await browser.close();await app.close();await r.close();}
