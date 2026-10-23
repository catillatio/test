// First visual checkpoint only: owner-selected assets, real local routes, no production.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import ejs from 'ejs';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
if(!testDatabaseUrl)throw new Error('Use a designated disposable local *_test database.');
const out='docs/phase51b-selected-art/screenshots';await mkdir(out,{recursive:true});
const selected=['dawnspire-cathedral','wyrmcrest-keep','astral-observatory','throne-of-ash','eclipse-citadel','tempest-port'];
const now=new Date('2026-10-23T21:00:00Z'),r=await realm({isolated:true,clock:()=>now});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config});
const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'America/New_York'});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
let page=await context.newPage();const errors:string[]=[],checks:string[]=[],details:unknown[]=[];page.on('pageerror',e=>errors.push(e.message));
async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200);await page.evaluate(async()=>{await document.fonts.ready;document.documentElement.style.scrollBehavior='auto';});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('.primary-nav a').count(),5);}
async function artCheck(selector:string,id:string){const style=await page.locator(selector).evaluate(e=>{const s=getComputedStyle(e),b=e.getBoundingClientRect();return{image:s.backgroundImage,size:s.backgroundSize,filter:s.filter,width:b.width,height:b.height,label:e.getAttribute('aria-label')};});assert.ok(style.image.includes('/art/properties-51b/'+id+'.webp'),id);assert.equal(style.size,'contain');assert.equal(style.filter,'none');details.push({id,selector,...style});}
try{
 await page.clock.install({time:new Date(+now-60000)});await page.clock.pauseAt(now);
 const actor=await r.player('Elowen Stonehaven'),viewer=await r.player('Alaric Greyford');
 await r.prepare(actor,2000000,Array.from({length:54},(_,i)=>levelRequirement(i+1)).reduce((n,x)=>n+x,0));await r.ok(actor,'/api/v1/tutorial',{action:'skip'});
 const receipts:Record<string,string>={};for(const id of [...selected,'crown-harbour'])receipts[id]=(await r.ok(actor,'/api/v1/land/purchases',{propertyId:id,quantity:1})).commandId;
 const login=async(cookie:string)=>context.addCookies([{name:'kr_session',value:cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 await login(actor.cookie);await visit('/game/land');
 for(const id of selected){const row='[data-land-property="'+id+'"]';await artCheck(row+' .catalog-art',id);const buttons=await page.locator(row+' button,'+row+' .market-bulk-link').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().height));assert.ok(buttons.every(h=>h>=44));}
 assert.ok((await page.locator('[data-land-property="crown-harbour"] .catalog-art').evaluate(e=>getComputedStyle(e).backgroundImage)).includes('/land-simple-0.1/properties.webp'));
 for(const [id,name] of [['dawnspire-cathedral','390-land-selected'],['tempest-port','390-land-storm-gate']]){await page.locator('#property-'+id).evaluate(e=>e.scrollIntoView({block:'start'}));await page.evaluate(()=>window.scrollBy(0,-10));await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});}
 checks.push('390px real Land: six exact bindings, full portrait contain, no color filters, unchanged Crown Harbour, no overflow, five tabs, 44px controls');
 await visit('/game/profile');for(const id of selected)await artCheck('.profile-estate .property-art-51b-'+selected.indexOf(id),id);
 await page.locator('.profile-estate').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:out+'/390-profile-holdings.png',animations:'disabled'});
 const profileSize=await page.locator('.profile-estate .property-art-51b-0').evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));
 await login(viewer.cookie);await visit('/game/players/'+actor.id);for(const id of selected)await artCheck('.profile-estate .property-art-51b-'+selected.indexOf(id),id);
 checks.push('Owned/public Profile: six exact illustration bindings and accessible labels');
 await login(actor.cookie);for(const id of selected){await visit('/game/purchases/'+receipts[id]);await artCheck('.purchase-receipt .property-art-51b-'+selected.indexOf(id),id);}
 checks.push('Six saved purchase receipts use the shared mapping without changing saved receipt names');
 const receiptSize=await page.locator('.purchase-receipt .property-art-51b-5').evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));
 const styleNames=['styles','kingdoms-live','alpha','refinements','strategy','community','phase41','phase42','phase43','phase44','phase45','phase46','phase47','remaster','realm-theme','land-review','phase49'];
 const before=execFileSync('git',['show','2e05e1c15b50018607e906db0e2ad33866e95aac:knights-reforged/views/partials/catalog-art.ejs'],{encoding:'utf8'}),after=readFileSync('views/partials/catalog-art.ejs','utf8');
 const sizes=[{name:'Narrow Land',width:68,height:49},{name:'390px Land',width:80,height:58},{name:'Wide phone Land',width:90,height:60},{name:'Desktop Land',width:198,height:116},{name:'Profile',...profileSize},{name:'Receipt',...receiptSize}];
 // The gallery is fulfilled only inside this local browser, at the fixture
 // origin so existing same-origin-only art/styles load. It is not an app route;
 // real game responses and their strict CSP remain unchanged.
 await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1120,height:470});
 for(const id of selected){const entry=alpha.properties.find(p=>p.id===id)!,old=ejs.render(before,{entry,small:false}),next=ejs.render(after,{entry,small:false});
  const cases=sizes.map(s=>`<section class="sample context-${s.name.toLowerCase().replaceAll(" ","-")}"><h2>${s.name}</h2><p>${s.width} × ${s.height}</p><span>Before</span><div class="property-art-frame" style="--frame-width:${s.width}px;--frame-height:${s.height}px;width:${s.width}px!important;height:${s.height}px!important">${old}</div><span>Selected</span><div class="property-art-frame" style="--frame-width:${s.width}px;--frame-height:${s.height}px;width:${s.width}px!important;height:${s.height}px!important">${next}</div></section>`).join('');
  const galleryHtml=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styleNames.map(n=>`<link rel="stylesheet" href="${origin}/assets/${n}.css">`).join('')}<style>html,body{margin:0!important;padding:0!important;background:#11100f!important;color:#eee4d0!important;font:14px system-ui!important;scroll-behavior:auto!important}body{padding:22px!important}.preview-header h1{font:700 24px Georgia!important;margin:0 0 8px!important}.preview-header p{font:13px system-ui!important;color:#c5b79c!important;margin:0 0 22px!important}.preview-grid{display:grid;grid-template-columns:repeat(3,100px) 218px repeat(2,100px);gap:16px}.sample h2{font:700 13px Georgia!important;margin:0 0 7px!important;min-height:30px;max-width:100px;white-space:normal}.sample>p,.sample>span{font:12px system-ui!important;color:#c5b79c!important;margin:0 0 8px!important}.sample>span{display:block!important;margin-top:12px!important}.sample .property-art-frame{display:block!important;overflow:hidden!important}.context-profile .property-art-frame .catalog-art,.context-receipt .property-art-frame .catalog-art{width:100%!important;height:100%!important;transform:none!important;filter:none!important}.source{width:155px;max-height:300px;object-fit:contain}.review-content{display:flex;gap:25px}.preview-footer{margin-top:24px!important;font:12px/1.5 system-ui!important;color:#c5b79c!important}</style></head><body class="kingdoms-ui realm-remaster signed-in screen-land"><header class="preview-header"><h1>${entry.name} · L${entry.level} · ${id}</h1><p>Exact owner selection, no repainting · thumbnails below are native CSS pixels at device scale 1</p></header><div class="review-content"><img class="source" alt="Full selected owner crop" src="data:image/png;base64,${readFileSync('docs/phase51b-selected-art/source-crops/'+id+'.png').toString('base64')}"><div class="market-catalog preview-grid">${cases}</div></div><p class="preview-footer">Dark side framing preserves the complete portrait in existing wide frames. Only a 2px comparison-border edge was trimmed before lossless WebP encoding.<br>First visual checkpoint; no production adoption, full regression suite or PR yet.</p></body></html>`;
  const galleryUrl=origin+'/__phase51b_visual_gallery';await page.unroute(galleryUrl);
  await page.route(galleryUrl,route=>route.fulfill({contentType:'text/html',body:galleryHtml}));await page.goto(galleryUrl);
  await page.waitForLoadState('networkidle');await page.evaluate(()=>window.scrollTo(0,0));
  const geometry=await page.locator('.sample').evaluateAll(es=>es.map(e=>({frames:[...e.querySelectorAll('.property-art-frame')].map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),nextSize:getComputedStyle(e.querySelectorAll('.catalog-art')[1]!).backgroundSize})));
  assert.deepEqual(geometry.map(g=>g.frames[0]),sizes.map(({width,height})=>({width,height})));assert.ok(geometry.every(g=>g.nextSize==='contain'),JSON.stringify({id,geometry}));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:out+'/thumbnails-'+id+'.png',animations:'disabled',fullPage:true});
 }
 checks.push('Six native-size before/after sheets: 68×49, 80×58, 90×60, 198×116 plus actual Profile/receipt dimensions');
 assert.deepEqual(errors,[]);await writeFile('docs/phase51b-selected-art/visual-checks.json',JSON.stringify({passed:true,base:'2e05e1c15b50018607e906db0e2ad33866e95aac',productionContacted:false,checks,profileSize,receiptSize,details,errors},null,2)+'\n');console.log('PASS first visual checkpoint: six thumbnail sheets, 390px Land, owned/public Profile and six receipts');
}finally{await browser.close();await app.close();await r.close();}
