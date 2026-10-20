// Synthetic disposable PostgreSQL realm only; no live service or external fetch.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {levelRequirement} from '../src/alpha-rules.js';

if(!testDatabaseUrl)throw new Error('A designated disposable *_test database is required.');
const out='docs/phase49/art-integration/screenshots';await mkdir(out,{recursive:true});
const r=await realm({isolated:true,clock:()=>new Date('2026-10-20T21:00:00Z')});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config});
const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/New_York'});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const page=await context.newPage(),errors:string[]=[],captures:string[]=[],checks:string[]=[];page.on('pageerror',e=>errors.push(e.message));
async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200);await page.locator('.realm-resources').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No overflow');assert.equal(await page.locator('.primary-nav a').count(),5);}
async function shot(name:string){await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});captures.push(name+'.png');}
try{
 const actor=await r.player('Aldric of the Vale');await r.prepare(actor,250000,Array.from({length:39},(_,i)=>levelRequirement(i+1)).reduce((s,n)=>s+n,0));await r.ok(actor,'/api/v1/tutorial',{action:'skip'});
 const mine=await r.ok(actor,'/api/v1/land/purchases',{propertyId:'moonwell-sanctuary',quantity:2});await r.ok(actor,'/api/v1/land/purchases',{propertyId:'wyrmcrest-keep',quantity:1});
 await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 for(const width of[320,390,430,1024]){
  await page.setViewportSize({width,height:width===1024?1536:844});await visit('/game/land');
  for(const id of['moonwell-sanctuary','wyrmcrest-keep']){
   const row=page.locator('[data-land-property="'+id+'"]');await row.scrollIntoViewIfNeeded();assert.equal(await row.locator('[data-art-atlas=properties-49]').count(),1);
   const art=row.locator('.property-art-49'),style=await art.evaluate(e=>({image:getComputedStyle(e).backgroundImage,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}));assert.ok(style.image.includes('/art/properties-49/'));assert.ok(style.w>40&&style.h>40);
   const targets=await row.locator('button,.market-bulk-link').evaluateAll(es=>es.filter(e=>e.getClientRects().length>0).map(e=>({text:e.textContent?.trim(),height:e.getBoundingClientRect().height})));assert.ok(targets.every(e=>e.height>=44),JSON.stringify({width,targets}));await shot(width+'-'+(id==='moonwell-sanctuary'?'gold-mine':'keep'));
  }
  await visit('/game/profile');await page.locator('.profile-estate').scrollIntoViewIfNeeded();assert.ok(await page.locator('.profile-estate').getByRole('heading',{name:'Gold Mine',exact:true}).isVisible());await shot(width+'-holdings');
  await visit('/game/purchases/'+mine.commandId);assert.ok(await page.getByRole('heading',{name:'Gold Mine',exact:true}).isVisible());assert.ok(await page.getByRole('button',{name:'Buy more Gold Mine',exact:true}).isVisible());await shot(width+'-receipt');
  checks.push(width+'px: approved artwork loads, Gold Mine displays, no overflow, five tabs, 44px trade targets, unchanged receipt/Buy More flow');
 }
 assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/phase49-properties-browser.json',JSON.stringify({passed:true,checks,captures,errors,productionContacted:false},null,2)+'\n');console.log('PASS '+checks.length+' groups, '+captures.length+' screenshots');
}finally{await browser.close();await app.close();await r.close();}
