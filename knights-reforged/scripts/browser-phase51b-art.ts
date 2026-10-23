// Focused local artwork checkpoint. No production endpoint, release, or database.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import ejs from 'ejs';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
if(!testDatabaseUrl)throw new Error('Use a designated disposable local *_test database.');
const out='docs/phase51b-selected-art/screenshots';await mkdir(out,{recursive:true});
const manifest=JSON.parse(readFileSync('public/art/properties-51b-fullbleed-2/provenance.json','utf8'));
const selected:string[]=manifest.assets.map((a:any)=>a.id);
const sizes=[{name:'Narrow Land',width:68,height:49},{name:'Standard Land',width:80,height:58},{name:'Wide phone Land',width:90,height:60},{name:'Desktop Land',width:198,height:116},{name:'Profile',width:60,height:60},{name:'Receipt',width:64,height:72}];
const now=new Date('2026-10-23T21:00:00Z'),r=await realm({isolated:true,clock:()=>now});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config});
const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'America/New_York'});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
let page=await context.newPage();const errors:string[]=[],checks:string[]=[],details:unknown[]=[],samples:unknown[]=[];
page.on('pageerror',e=>errors.push(e.message));
async function visit(path:string){
 assert.equal((await page.goto(origin+path))?.status(),200);
 await page.evaluate(async()=>{await document.fonts.ready;document.documentElement.style.scrollBehavior='auto';});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(await page.locator('.primary-nav a').count(),5);
}
async function inspectArt(selector:string,id:string){
 const info=await page.locator(selector).evaluate(async e=>{
  const s=getComputedStyle(e),b=e.getBoundingClientRect(),frame=e.closest('.property-art-frame')?.getBoundingClientRect();
  const url=/^url\(["']?(.*?)["']?\)$/.exec(s.backgroundImage)![1]!;
  const image=new Image();image.src=url;await image.decode();
  const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;
  const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
  const top:number[]=[],bottom:number[]=[],left:number[]=[],right:number[]=[];
  for(let x=0;x<c.width;x++){top.push(x*4);bottom.push(((c.height-1)*c.width+x)*4);}
  for(let y=0;y<c.height;y++){left.push(y*c.width*4);right.push((y*c.width+c.width-1)*4);}
  let opaque=true;for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255){opaque=false;break;}
  return {image:s.backgroundImage,size:s.backgroundSize,position:s.backgroundPosition,repeat:s.backgroundRepeat,color:s.backgroundColor,filter:s.filter,border:s.borderTopWidth,shadow:s.boxShadow,radius:s.borderTopLeftRadius,width:b.width,height:b.height,label:e.getAttribute('aria-label'),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,opaque,edgeColors:[top,bottom,left,right].map(points=>new Set(points.map(p=>`${pixels[p]},${pixels[p+1]},${pixels[p+2]},${pixels[p+3]}`)).size),fillsFrame:!frame||Math.abs(frame.width-b.width)<.1&&Math.abs(frame.height-b.height)<.1};
 });
 assert.ok(info.image.includes('/art/properties-51b-fullbleed-2/'+id+'.webp'),id);
 assert.equal(info.size,'cover');assert.equal(info.position,'50% 0%');assert.equal(info.repeat,'no-repeat');
 assert.equal(info.filter,'none');assert.equal(info.color,'rgba(0, 0, 0, 0)');
 assert.equal(info.border,'0px');assert.equal(info.radius,'0px');assert.equal(info.shadow,'none');assert.ok(info.fillsFrame);
 assert.ok(info.opaque);assert.ok(info.edgeColors.every(n=>n>=8),'No uniform embedded edge strips: '+id);
 const asset=manifest.assets.find((a:any)=>a.id===id),scale=Math.max(info.width/info.naturalWidth,info.height/info.naturalHeight);
 const visible={left:(info.naturalWidth-info.width/scale)/2,top:0,width:info.width/scale,height:info.height/scale};
 const [x,y,w,h]=asset.landmarkBounds;
 assert.ok(x>=visible.left&&x+w<=visible.left+visible.width&&y>=0&&y+h<=visible.height,'Landmark clipping: '+id+' '+info.width+'x'+info.height);
 return {...info,image:info.image.replace(origin,''),visibleSourceRectangle:visible,reviewedLandmark:asset.landmarkDescription};
}
async function recordArt(selector:string,id:string,where:string,width:number){details.push({id,where,viewportWidth:width,...await inspectArt(selector,id)});}
try{
 await page.clock.install({time:new Date(+now-60000)});await page.clock.pauseAt(now);
 const actor=await r.player('Elowen Stonehaven'),viewer=await r.player('Alaric Greyford');
 await r.prepare(actor,2000000,Array.from({length:54},(_,i)=>levelRequirement(i+1)).reduce((n,x)=>n+x,0));await r.ok(actor,'/api/v1/tutorial',{action:'skip'});
 const receipts:Record<string,string>={};for(const id of [...selected,'crown-harbour'])receipts[id]=(await r.ok(actor,'/api/v1/land/purchases',{propertyId:id,quantity:1})).commandId;
 const login=async(cookie:string)=>context.addCookies([{name:'kr_session',value:cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 for(const width of [320,390,430,1024]){
  await page.setViewportSize({width,height:width===1024?1536:844});await login(actor.cookie);await visit('/game/land');
  for(const id of selected){
   const row='[data-land-property="'+id+'"]';await recordArt(row+' .catalog-art',id,'Land',width);
   const controls=await page.locator(row+' button,'+row+' .market-bulk-link').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().height));assert.ok(controls.every(h=>h>=44));
  }
  assert.ok((await page.locator('[data-land-property="crown-harbour"] .catalog-art').evaluate(e=>getComputedStyle(e).backgroundImage)).includes('/land-simple-0.1/properties.webp'));
  for(const [id,name] of [['dawnspire-cathedral','land-selected'],['tempest-port','land-storm-gate']]){
   await page.locator('#property-'+id).evaluate(e=>e.scrollIntoView({block:'start'}));await page.evaluate(()=>window.scrollBy(0,-10));
   await page.screenshot({path:out+'/'+width+'-'+name+'.png',animations:'disabled'});
  }
  await visit('/game/profile');for(const id of selected)await recordArt('.profile-estate .property-art-51b-'+selected.indexOf(id),id,'Owned Profile',width);
  await page.locator('.profile-estate').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:out+'/'+width+'-profile-holdings.png',animations:'disabled'});
  await login(viewer.cookie);await visit('/game/players/'+actor.id);for(const id of selected)await recordArt('.profile-estate .property-art-51b-'+selected.indexOf(id),id,'Public Profile',width);
  await login(actor.cookie);for(const id of selected){await visit('/game/purchases/'+receipts[id]);await recordArt('.purchase-receipt .property-art-51b-'+selected.indexOf(id),id,'Saved receipt',width);}
  checks.push(width+'px: six full-bleed bindings in Land, owned/public Profiles and receipts; landmark-safe proportional crops, opaque nonuniform edges, no borders/mattes/overflow, five tabs and 44px trade controls');
 }
 // Browser-only review gallery at the fixture origin, not an application route.
 // Real game responses retain their strict CSP, same-origin art and authentication.
 await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1120,height:450});
 const styleNames=['styles','kingdoms-live','alpha','refinements','strategy','community','phase41','phase42','phase43','phase44','phase45','phase46','phase47','remaster','realm-theme','land-review','phase49'];
 const partial=readFileSync('views/partials/catalog-art.ejs','utf8');
 for(const id of selected){
  const entry=alpha.properties.find(p=>p.id===id)!,art=ejs.render(partial,{entry,small:false});
  const cases=sizes.map((s,i)=>`<section class="sample context-${s.name.toLowerCase().replaceAll(' ','-')}"><h2>${s.name}</h2><p>${s.width} × ${s.height}</p><div class="property-art-frame" id="sample-${i}" style="--frame-width:${s.width}px;--frame-height:${s.height}px;width:${s.width}px!important;height:${s.height}px!important">${art}</div></section>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styleNames.map(n=>`<link rel="stylesheet" href="${origin}/assets/${n}.css">`).join('')}<style>html,body{margin:0!important;padding:0!important;background:#171411!important;color:#eee4d0!important;font:14px system-ui!important;scroll-behavior:auto!important}body{padding:22px!important}.preview-header h1{font:700 24px Georgia!important;margin:0 0 8px!important}.preview-header p{font:13px/1.5 system-ui!important;color:#c5b79c!important;margin:0 0 22px!important}.preview-grid{display:grid;grid-template-columns:repeat(3,100px) 218px repeat(2,100px);gap:16px}.sample h2{font:700 13px Georgia!important;margin:0 0 7px!important;min-height:30px;max-width:100px;white-space:normal}.sample>p{font:12px system-ui!important;color:#c5b79c!important;margin:0 0 12px!important}.sample .property-art-frame{display:block!important;overflow:hidden!important}.context-profile .property-art-frame .catalog-art,.context-receipt .property-art-frame .catalog-art{width:100%!important;height:100%!important;transform:none!important;filter:none!important}.source{width:155px;height:auto;display:block}.reference{width:155px;flex:none}.reference small{display:block;margin:0 0 9px;font:12px system-ui;color:#c5b79c}.review-content{display:flex;align-items:flex-start;gap:25px}.preview-footer{margin-top:22px!important;font:12px/1.5 system-ui!important;color:#c5b79c!important}</style></head><body class="kingdoms-ui realm-remaster signed-in screen-land"><header class="preview-header"><h1>${entry.name} · L${entry.level} · ${id}</h1><p>Selected portrait identity at left; corrected full-bleed scene at six actual sizes.<br>Native CSS pixels, device scale 1. Natural landscape extension/recomposition; no artificial matte or distorted architecture.</p></header><div class="review-content"><div class="reference"><small>Owner's selected source</small><img class="source" alt="Owner's selected source, reference only" src="data:image/png;base64,${readFileSync('docs/phase51b-selected-art/source-crops/'+id+'.png').toString('base64')}"></div><div class="market-catalog preview-grid">${cases}</div></div><p class="preview-footer">All corrected frames are filled edge to edge. Spires, rings, crescents and gate landmarks are checked against each crop.<br>Focused visual checkpoint only; no full CI, PR, merge or deployment.</p></body></html>`;
  const url=origin+'/__phase51b_visual_gallery';await page.unroute(url);await page.route(url,route=>route.fulfill({contentType:'text/html',body:html}));await page.goto(url);await page.waitForLoadState('networkidle');await page.evaluate(()=>window.scrollTo(0,0));
  for(const [i,s] of sizes.entries()){
   const actual=await inspectArt('#sample-'+i+' .catalog-art',id);assert.equal(actual.width,s.width);assert.equal(actual.height,s.height);
   samples.push({id,frame:s.name,...actual});
   await page.locator('#sample-'+i).screenshot({path:out+'/native-'+id+'-'+s.width+'x'+s.height+'.png',animations:'disabled'});
  }
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/thumbnails-'+id+'.png',animations:'disabled',fullPage:true});
 }
 checks.push('36 native-size full-bleed samples: all six properties at every required dimension, with landmark bounds, edge coverage and no embedded uniform strips');
 assert.deepEqual(errors,[]);
 await writeFile('docs/phase51b-selected-art/visual-checks.json',JSON.stringify({passed:true,checkpoint:'full-bleed-2',base:'985171bc40700d4a91009059eefd79d2afaace67',productionContacted:false,checks,details,samples,errors,limitations:'Landmark bounds are manually identified from the scene masters. Geometry confirms their retention, not automatic semantic identity. Native PNGs and game captures require owner visual review.'},null,2)+'\n');
 console.log('PASS focused full-bleed check: 4 viewport groups, 96 real-route bindings, 36 native samples, 18 review captures, no production contact');
}finally{await browser.close();await app.close();await r.close();}
