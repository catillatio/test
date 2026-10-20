// Land-only review against a synthetic local realm. Never accepts a live database.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';

if(!testDatabaseUrl)throw new Error('A disposable local *_test PostgreSQL database is required.');
const baseline=process.argv.includes('--baseline');
const polishReview=process.argv.includes('--polish-review');
const sharedReview=process.argv.includes('--shared-review');
const mobileReview=process.argv.includes('--mobile-review')||polishReview||sharedReview;
const out='test-results/phase48-land-'+(sharedReview?'shared':polishReview?'polish':mobileReview?'mobile':'only')+'/'+(baseline?'before':'after');
await mkdir(out,{recursive:true});
const fixedNow=new Date('2026-10-20T18:15:00.000Z');
const r=await realm({isolated:true,clock:()=>fixedNow});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'});
const app=await createApp({db:r.db,config});
const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1024,height:1536},hasTouch:true,isMobile:true,timezoneId:'America/New_York'});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const page=await context.newPage(),errors:string[]=[],checks:string[]=[];let landPosts=0;
let desktopPixelComparison:{width:number;height:number;differentPixels:number;protectedDifferentPixels:number}|null=null;
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/game/land/'))landPosts++;});
page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/assets/')&&response.status()>=400)errors.push('Asset response '+response.status()+' '+new URL(response.url()).pathname);});
async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200);await page.locator('.realm-resources').waitFor();await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0);});await page.waitForTimeout(180);}
async function shot(name:string){await page.screenshot({path:out+'/'+name+'.png',fullPage:false,animations:'disabled'});}
async function metrics(){return page.evaluate(()=>{
 const selectors={brand:'.topbar',resources:'.realm-resources',gold:'.resource-upper',recovery:'.resource-lower',title:'.page-heading',flow:'.land-income-panel',flowHeader:'.land-flow-head',flowColumns:'.flow-grid',payment:'.land-payment-row',paymentDate:'[data-land-payment-time]',firstRow:'.land-property',firstArt:'.property-art-frame',firstName:'.land-property h2',firstBuy:'.land-property .button-gold',navigation:'.primary-nav',navigationIcon:'.primary-nav .nav-icon',navigationLabel:'.primary-nav .nav-link span'};
 return Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{
  const node=document.querySelector(selector)!;const r=node.getBoundingClientRect(),s=getComputedStyle(node);
  return [name,{x:r.x,y:r.y,width:r.width,height:r.height,font:s.font,fontSize:s.fontSize,border:s.border,borderRadius:s.borderRadius,background:s.background,boxShadow:s.boxShadow}];
 }));
 });}
async function otherScreenFingerprint(path:string){await visit(path);return page.evaluate(()=>{
 const selectors=['.topbar','.realm-brand','.realm-resources','.resource-upper','.resource-lower','.primary-nav','.nav-icon','.button-gold','.home-menu','.catalog-row'];
 return {styles:Object.fromEntries(selectors.map(selector=>{
  const node=document.querySelector(selector);if(!node)return [selector,null];const r=node.getBoundingClientRect(),s=getComputedStyle(node);
  return [selector,{width:r.width,height:r.height,font:s.font,border:s.border,background:s.background,color:s.color}];
 })),landStylesheet:!!document.querySelector('link[href*="land-review.css"]')};
 });}
try{
 const actor=await r.player('Ser Marlow Ardent');await r.prepare(actor,50000,2500);
 for(const [propertyId,quantity] of [['smallholding',4],['woodland',3],['copper-workshop',2],['watchtower',1],['river-mill',2],['hearthstead-hamlet',1]] as const)await r.ok(actor,'/api/v1/land/purchases',{propertyId,quantity});
 await r.ok(actor,'/api/v1/inventory/purchases',{itemId:'ransackers-axe',quantity:2});
 await r.ok(actor,'/api/v1/tutorial',{action:'skip'});
 await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 const unchanged={home:await otherScreenFingerprint('/game/home'),armory:await otherScreenFingerprint('/game/armory')};
 if(!baseline&&!sharedReview){const saved=existsSync('test-results/phase48-land-only/before/other-screens.json')?'test-results/phase48-land-only/before/other-screens.json':'docs/phase48/land-only-review/baseline/other-screens.json';const before=JSON.parse(await readFile(saved,'utf8'));assert.deepEqual(unchanged,before,'Home and Armory presentation must remain unchanged.');checks.push('Home and Armory computed layout and styling match the untouched baseline; neither loads the Land stylesheet.');}
 await writeFile(out+'/other-screens.json',JSON.stringify(unchanged,null,2)+'\n');
 await visit('/game/land');
 if(!baseline||mobileReview)await page.evaluate(async()=>{await document.fonts.ready;for(const name of ['painted-properties','castle-landscape','interface-icons']){const image=new Image();image.src='/assets/art/land-review/'+name+'.webp';await image.decode();if(!image.naturalWidth)throw new Error('Review image did not decode');}});
 await shot('1024-land');const desktop=await metrics();
 if(mobileReview&&!baseline){
  const allowedChanges=await page.locator('.price-owned,.flow-heading-text,.land-sync-note').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {left:Math.floor(r.left),right:Math.ceil(r.right),top:Math.floor(r.top),bottom:Math.ceil(r.bottom)};}));
  const approved=(await readFile('docs/phase48/land-only-review/screenshots/1024-land.png')).toString('base64');
  const actual=(await readFile(out+'/1024-land.png')).toString('base64');
  // Decode local screenshots in a blank, network-blocked context. The game
  // correctly forbids data: images; its CSP must not be relaxed for a test.
  const comparisonPage=await browser.newPage();await comparisonPage.route('**/*',route=>route.abort());
  try{desktopPixelComparison=await comparisonPage.evaluate(async({approved,actual,allowedChanges})=>{
   const images=[];
   for(const bytes of [approved,actual]){const image=new Image();image.src='data:image/png;base64,'+bytes;await image.decode();images.push(image);}
   const [left,right]=images;if(!left||!right||left.naturalWidth!==1024||left.naturalHeight!==1536||right.naturalWidth!==1024||right.naturalHeight!==1536)throw new Error('Desktop comparison dimensions must match');
   const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1536;const context=canvas.getContext('2d',{willReadFrequently:true})!;
   context.drawImage(left,0,0);const expected=context.getImageData(0,0,1024,1536).data;
   context.clearRect(0,0,1024,1536);context.drawImage(right,0,0);const rendered=context.getImageData(0,0,1024,1536).data;
   let differentPixels=0,protectedDifferentPixels=0;
   for(let i=0;i<expected.length;i+=4){if(expected[i]===rendered[i]&&expected[i+1]===rendered[i+1]&&expected[i+2]===rendered[i+2]&&expected[i+3]===rendered[i+3])continue;
    differentPixels++;const x=i/4%1024,y=Math.floor(i/4/1024);let allowed=false;
    for(const r of allowedChanges)if(x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom){allowed=true;break;}
    if(!allowed)protectedDifferentPixels++;
   }
   return {width:1024,height:1536,differentPixels,protectedDifferentPixels};
  },{approved,actual,allowedChanges});
  assert.equal(desktopPixelComparison.protectedDifferentPixels,0,'Only approved price and Gold Flow metadata may differ from the desktop baseline.');
  }finally{await comparisonPage.close();}
  checks.push('Approved 1024px header, background, artwork, rows and navigation retain their pixels; only requested price/Gold Flow metadata may differ.');
 }
 if(!baseline){
  const scoped=await page.evaluate(()=>{
   const sheet=[...document.styleSheets].find(s=>s.href?.includes('/land-review.css'))!;
   const pending=[...sheet.cssRules],selectors:string[]=[];
   while(pending.length){const rule=pending.shift()!;if('selectorText' in rule)selectors.push(String(rule.selectorText));if('cssRules' in rule)pending.push(...(rule as CSSGroupingRule).cssRules);}
   return selectors;
  });
  assert.ok(scoped.length>0);assert.ok(scoped.every(s=>s.split(',').every(selector=>selector.trim().startsWith('.kingdoms-ui.screen-land'))));
  const frames=await page.locator('.land-review-art').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,display:getComputedStyle(node).display,background:getComputedStyle(node).backgroundImage})));
  assert.equal(frames.length,6);assert.ok(frames.every(frame=>frame.width>0&&frame.height>0&&frame.display==='block'&&frame.background.includes('/art/land-review/painted-properties.webp')));
  const me=await r.me(actor);assert.equal(await page.locator('.land-property').count(),me.land.properties.length);
  for(const property of me.land.properties){const row=page.locator('[data-land-property="'+property.id+'"]');assert.equal(await row.locator('[data-land-owned]').innerText(),String(property.owned));assert.equal(await row.locator('[data-land-unit-price]').innerText(),property.price.toLocaleString('en'));if(property.unlocked===false)assert.equal(await row.getByRole('button',{name:'Buy '+property.name,exact:true}).isDisabled(),true);}
  assert.equal(desktop.brand!.height,68);assert.equal(desktop.resources!.height,162);assert.equal(desktop.flow!.x,21);assert.equal(desktop.flow!.y,331);assert.equal(desktop.flow!.width,982);assert.equal(desktop.firstRow!.y,570);assert.equal(desktop.firstBuy!.width,115);assert.equal(desktop.firstBuy!.height,68);assert.equal(desktop.navigation!.height,98);
  checks.push('Land-only CSS selectors and asset loading are isolated; six original illustrations decode and occupy their frames. All 21 real catalog entries, prices, holdings and restrictions come from the server.');
 }
 await page.setViewportSize({width:390,height:844});await visit('/game/land');await shot('390-land');const mobile=await metrics();
 const mobileLayouts=[];
 if(mobileReview){
  assert.deepEqual(desktop,JSON.parse(await readFile('docs/phase48/land-only-review/browser.json','utf8')).desktop,'The approved desktop composition must remain unchanged.');
  for(const width of [320,390,430]){
   await page.setViewportSize({width,height:844});await visit('/game/land');await shot(width+'-land');
   const authoritative=await r.me(actor);assert.equal(await page.locator('[data-land-summary-net]').textContent(),(authoritative.economy.netHourlyIncome>0?'+':'')+authoritative.economy.netHourlyIncome.toLocaleString('en'));
   assert.equal(await page.locator('[data-land-summary-countdown]').textContent(),'Next '+await page.locator('[data-land-countdown]').textContent());
   if(polishReview||sharedReview){
    const polish=await page.locator('.land-property').first().evaluate(row=>{
     const name=row.querySelector('h2')!,price=row.querySelector('.price-owned>.gold')!,bulk=row.querySelector('.market-bulk-link')!,b=bulk.getBoundingClientRect();
     return {quieterPrice:parseFloat(getComputedStyle(price).fontSize)<parseFloat(getComputedStyle(name).fontSize),separateBulk:[...row.querySelectorAll('.single-trades button[type=submit]')].every(button=>{const r=button.getBoundingClientRect();return b.right<=r.left||b.left>=r.right||b.bottom<=r.top||b.top>=r.bottom;})};
    });assert.ok(polish.quieterPrice&&polish.separateBulk,'Price hierarchy and separated Bulk targets must match the approved refinements.');
   }
   const expanded=await metrics();await page.locator('.land-flow-head').click();await page.locator('.land-flow-head').blur();await shot(width+'-land-compact');
   const collapsed=await metrics();
   const layout=await page.evaluate(()=>{
    const navTop=document.querySelector('.primary-nav')!.getBoundingClientRect().top;
    const rows=[...document.querySelectorAll('.land-property')].map(node=>node.getBoundingClientRect());
    const targets=[...document.querySelectorAll('.topbar a,.resource-upper>a,.status-disclosure>summary,.land-flow-head,.income-explanation>summary,.single-trades button[type=submit],.market-bulk-link,.primary-nav a')].filter(node=>node.checkVisibility()).map(node=>{
     const r=node.getBoundingClientRect();
     const visible=r.top>=0&&(node.closest('.primary-nav')?r.bottom<=innerHeight:r.bottom<=navTop);
     const hit=visible?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2):null;
     return {label:node.getAttribute('aria-label')??node.textContent?.trim(),width:r.width,height:r.height,visible,centerReachable:!visible||!!hit&&(node===hit||node.contains(hit))};
    });
    return {width:innerWidth,headingFont:getComputedStyle(document.querySelector('.page-heading h1')!).fontSize,overflow:document.documentElement.scrollWidth>innerWidth,completeRows:rows.filter(r=>r.top>=0&&r.bottom<=navTop).length,targets};
   });
   if(!baseline){
    assert.equal(layout.overflow,false,width+'px horizontal overflow');assert.ok(layout.completeRows>=4,width+'px needs at least four complete property rows');
    assert.ok(layout.targets.every(t=>t.width>=44&&t.height>=44),width+'px undersized touch target');
    assert.ok(layout.targets.every(t=>t.centerReachable),width+'px overlapping touch target: '+JSON.stringify(layout.targets.filter(t=>!t.centerReachable)));
   }
   mobileLayouts.push({expanded,collapsed,...layout});
   if(!baseline){
    for(const selector of ['.income-disclosure>summary','.xp-resource>summary','.health>summary','.mana>summary','.spirit>summary']){
     const summary=page.locator(selector);await summary.focus();await page.keyboard.press('Enter');
     assert.notEqual(await summary.locator('..').getAttribute('open'),null);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     assert.ok(await summary.evaluate(node=>getComputedStyle(node).outlineStyle!=='none'),'Keyboard focus must stay visible');
     if(selector==='.income-disclosure>summary')await shot(width+'-income-disclosure');
     if(selector==='.health>summary')await shot(width+'-health-disclosure');
     await page.keyboard.press('Enter');await summary.blur();
    }
   }
  }
  if(!baseline){
   checks.push('320/390/430px: 4+ complete collapsed rows; 44px+ header, status, trade, Bulk and navigation targets; centers remain reachable; keyboard disclosures retain visible focus. The approved desktop metrics and styling match exactly.');
  }
  await writeFile(out+'/mobile-layouts.json',JSON.stringify(mobileLayouts,null,2)+'\n');
 }
 if(!baseline){
  const widths=[320,360,390,412,430,768,900,1024,1366];
  for(const width of widths){await page.setViewportSize({width,height:width>=900?1536:844});for(const path of ['/game/land','/game/land?bulk=smallholding#bulk-trade']){
   await visit(path);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' '+path+' overflows');assert.equal(await page.locator('.primary-nav a').count(),5);
   const sizes=await page.locator('.single-trades button[type=submit]').evaluateAll(nodes=>nodes.map(node=>({w:node.getBoundingClientRect().width,h:node.getBoundingClientRect().height})));assert.ok(sizes.every(size=>size.w>=44&&size.h>=44),width+' '+path+' trade sizes: '+JSON.stringify(sizes));
   const contained=await page.locator('.land-property').evaluateAll(rows=>rows.every(row=>{const r=row.getBoundingClientRect();return [...row.querySelectorAll('.single-trades button[type=submit]')].every(button=>{const b=button.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right;});}));assert.ok(contained,width+' '+path+' trade controls leave their property row');
  }}
  checks.push('18 Land/bulk responsive visits at 320–1366px: five tabs, 44px+ trade targets, no horizontal overflow.');
  await page.setViewportSize({width:390,height:844});await visit('/game/land');
  const toggle=page.locator('.land-flow-head');await toggle.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.gold-flow').getAttribute('open'),null);await toggle.blur();await shot('390-land-compact');
  const visible=await page.locator('.land-property').evaluateAll(rows=>{const top=document.querySelector('.primary-nav')!.getBoundingClientRect().top;return rows.filter(row=>{const r=row.getBoundingClientRect();return r.top>=0&&r.bottom<=top;}).length;});assert.ok(visible>=4);
  await toggle.focus();await page.keyboard.press('Enter');assert.notEqual(await page.locator('.gold-flow').getAttribute('open'),null);await toggle.blur();
  await page.locator('.income-explanation>summary').click();assert.equal(await page.locator('[data-next-property-payment]').isVisible(),true);await shot('390-income-details');await page.locator('.income-explanation>summary').click();
  const before=await r.me(actor),price=before.land.properties.find(p=>p.id==='smallholding')!.price,postsBefore=landPosts;
  await page.evaluate(()=>{const form=document.querySelector<HTMLFormElement>('#property-smallholding form')!;form.requestSubmit();form.requestSubmit();});await page.waitForURL('**/game/purchases/**');
  const purchased=await r.me(actor);assert.equal(purchased.gold,before.gold-price);assert.equal(purchased.land.properties.find(p=>p.id==='smallholding')!.owned,5);assert.equal(landPosts-postsBefore,1);
  await page.reload();assert.equal((await r.me(actor)).gold,purchased.gold);await page.getByRole('link',{name:'Return to Land',exact:true}).click();await page.waitForURL('**/game/land');
  const forSale=await r.me(actor),refund=forSale.land.properties.find(p=>p.id==='smallholding')!.saleRefundSteps[0]!;
  await page.getByRole('button',{name:'Sell Smallholding',exact:true}).click();await page.waitForURL('**/game/land?command=*');assert.equal((await r.me(actor)).gold,forSale.gold+refund);await page.reload();assert.equal((await r.me(actor)).gold,forSale.gold+refund);
  await page.getByRole('link',{name:'Bulk buy or sell Smallholding',exact:true}).click();await page.locator('#bulk-trade').waitFor();const bulk=page.locator('.bulk-trades form').first();await bulk.getByRole('button',{name:'Select 5 Smallholding',exact:true}).click();await page.reload();assert.equal(await bulk.locator('[name=quantity]').inputValue(),'5');await shot('390-land-bulk');
  checks.push('Keyboard disclosures and compact rows remain accessible; one-tap double submission buys once, receipt refresh charges nothing, sale refunds the exact authoritative amount once, Return to Land and persisted bulk quantity work.');
  const newcomer=await r.player('Elowen Greyfern');await context.addCookies([{name:'kr_session',value:newcomer.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
  for(const width of [390,1024]){await page.setViewportSize({width,height:width===390?844:1536});await visit('/game/land');assert.equal(await page.locator('[data-land-countdown]').innerText(),'No property owned');assert.ok(await page.locator('.land-payment-row').evaluate(node=>node.scrollWidth<=node.clientWidth));}
  checks.push('Empty Land state remains readable at 390px and 1024px without a clipped countdown.');
 }
 assert.deepEqual(errors,[]);
 await writeFile(out+'/summary.json',JSON.stringify({passed:true,baseline,viewport:{desktop:[1024,1536],mobile:[390,844]},checks,desktopPixelComparison,desktop,mobile,errors,productionContacted:false},null,2)+'\n');
 console.log(JSON.stringify({passed:true,baseline,checks,desktop,mobile},null,2));
}finally{await context.close();await browser.close();await app.close();await r.close();}
