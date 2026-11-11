// Real Fastify/EJS rendering and native commands on one disposable local schema.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {uiThemeFixture} from '../tests/home-theme-fixture.js';
import {profileBusinessSnapshot} from '../tests/classic-profile-fixture.js';
import {testDatabaseUrl,type Player} from '../tests/helpers.js';
assert.ok(testDatabaseUrl,'A local disposable *_test database is required');
const baselineCssPath=process.argv.find(v=>v.startsWith('--baseline-css='))?.slice('--baseline-css='.length)??'docs/dark-medieval-release/before.css';
const beforeCss=await readFile(baselineCssPath,'utf8');
const capture=process.argv.includes('--capture');
const out=capture?'docs/dark-medieval-release/capture':'test-results/dark-medieval-release';
await mkdir(out+'/screenshots',{recursive:true});
const r=await uiThemeFixture(),apps:Awaited<ReturnType<typeof createApp>>[]=[],checks:unknown[]=[],errors:string[]=[];
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const performanceChecks:unknown[]=[];
try{
 // Human-readable synthetic account metadata, before any preservation snapshot.
 await r.db.query('UPDATE accounts SET username=$2 WHERE id=$1',[r.owner.accountId,'ladyaveline']);
 await r.db.query('UPDATE accounts SET username=$2 WHERE id=$1',[r.rival.accountId,'cedricblackthorn']);
 // Additional real synthetic rivals keep the compact list representative.
 for(const name of ['Isolde Ravenshade','Gareth Ironwood','Mira of Westreach','Thorne Ashenfell']){
  const rival=await r.player(name,75);await r.ok(rival,'/api/v1/tutorial',{action:'skip'});await r.me(rival);
 }
 // Populate the real feed with a recent notification and ordinary battle using
 // original commands. Fixture-only clock changes put these above old setup events.
 r.advance(60);
 await r.ok(r.coverage.students[0]!, '/api/v1/army/acceptances',{targetCharacterId:r.owner.id});
 r.advance(60);
 const target=await r.me(r.rival);
 if(target.health<target.maxHealth)await r.ok(r.rival,'/api/v1/health/restorations');
 await r.ok(r.owner,'/api/v1/battles',{targetCharacterId:r.rival.id});
 r.advance(60);
 await r.ok(r.owner,'/api/v1/battles',{targetCharacterId:r.patron.id});
 await r.ok(r.rival,'/api/v1/comments',{profileId:r.owner.id,body:'The northern road is clear. My banner stands with yours.'});
 const actor=await r.me(r.owner);
 if(actor.health<actor.maxHealth)await r.ok(r.owner,'/api/v1/health/restorations');
 const origins:string[]=[];
 for(const make of [createApp,createApp]){const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await make({db:r.db,config});apps.push(app);const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;origins.push(origin);}
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(()=>{
   (window as any).__visualCls=0;(window as any).__visualShifts=[];
   new PerformanceObserver(list=>{for(const e of list.getEntries() as any[])if(!e.hadRecentInput){(window as any).__visualCls+=e.value;const shifts=(window as any).__visualShifts;if(shifts.length<30)shifts.push({value:e.value,time:e.startTime,sources:e.sources.map((s:any)=>({tag:s.node?.tagName,classes:typeof s.node?.className==='string'?s.node.className:'',before:{y:s.previousRect.y,height:s.previousRect.height},after:{y:s.currentRect.y,height:s.currentRect.height}}))});}}).observe({type:'layout-shift',buffered:true});
 });
 await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(!origins.includes(url.origin))return route.abort();
   if(url.origin===origins[0]&&url.pathname==='/assets/realm-iron-brass.css')return route.fulfill({contentType:'text/css',body:beforeCss});
   return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',res=>{if(res.status()>=400&&new URL(res.url()).pathname.startsWith('/assets/'))errors.push('Missing asset: '+new URL(res.url()).pathname)});
 async function visit(origin:string,path:string,actor:Player|null=r.owner){await context.clearCookies();if(actor)await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);assert.equal((await page.goto(origin+path))?.status(),200,path);await page.waitForLoadState('networkidle');await page.evaluate(async()=>{await document.fonts.ready;for(const img of document.images){img.loading='eager';await img.decode()}});}
 async function semantics(targetPage=page){return targetPage.evaluate(()=>({
 links:[...document.querySelectorAll<HTMLAnchorElement>('a')].filter(a=>!a.classList.contains('realm-brand')).map(a=>a.getAttribute('href')?.replace(/([?&]rotation=)[0-9a-f-]{36}/,'$1<fresh-rotation>')).sort(),
 forms:[...document.forms].map(f=>({action:f.getAttribute('action'),method:f.method,fields:[...f.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select,button,textarea')].map(i=>({tag:i.tagName,name:i.name,type:i.type,value:(()=>{if(i.name==='batchId'&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(i.value))throw new Error('Read snapshot nonce is malformed');return ['csrf','commandId','batchId'].includes(i.name)?'<volatile>':i.value;})(),disabled:i.disabled})),buttons:[...f.querySelectorAll('button')].map(b=>b.textContent?.trim())})),
 values:[...document.querySelectorAll('[data-wallet-gold],[data-payment-gold],[data-level-xp],[data-level-required],[data-level],[data-resource-value],[data-resource-max]')].map(e=>e.textContent?.trim()),
 art:[...document.querySelectorAll('img,use')].filter(e=>!e.closest('.realm-brand')).map(e=>[e.getAttribute('src'),e.getAttribute('href')]),
 nav:[...document.querySelectorAll('.primary-nav a')].map(a=>[a.getAttribute('href'),a.textContent?.trim()]),
 menu:[...document.querySelectorAll('.home-menu>a')].map(a=>[a.getAttribute('href'),a.textContent?.replace(/\s+/g,' ').trim()])
 }));}
 async function checkPlayerLinks(){
  const styles=await page.locator('.player-link').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return {font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight,color:s.color}}));
  for(const style of styles)assert.deepEqual(style,{font:'Georgia, "Times New Roman", serif',size:'15px',weight:'700',lineHeight:'20.25px',color:'rgb(239, 230, 212)'},'Every player-name profile link uses the shared neutral identity style');
  return styles.length;
 }
 const sharedPaths=['/game/home','/game/quests','/game/battle','/game/bounties','/game/armory','/game/armory?category=armor','/game/armory?category=spell','/game/land','/game/profile','/game/army','/game/vault','/game/settings','/game/champions','/game/tutorial','/game/players/'+r.rival.id];
 // Compare authoritative DOM before gameplay JavaScript acknowledges visible
 // notifications. Normal client acknowledgment remains enabled for all captures.
 const contractContext=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false});
 const contractPage=await contractContext.newPage();
 const authoritativeNotifications=new Map<string,{kind:string,id:string}>();
 async function contractVisit(origin:string,path:string){await contractContext.clearCookies();await contractContext.addCookies([{name:'kr_session',value:r.owner.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);assert.equal((await contractPage.goto(origin+path))?.status(),200);}
 for(const origin of origins)for(const path of sharedPaths)await contractVisit(origin,path);
 for(const path of sharedPaths){await contractVisit(origins[0]!,path);const before=await semantics(contractPage);await contractVisit(origins[1]!,path);assert.deepEqual(await semantics(contractPage),before,'Authoritative forms/data/navigation including unread counts: '+path);checks.push({screen:path,authoritativeContracts:'MATCH'});for(const form of before.forms)if(form.action==='/game/notifications/read'){const raw=form.fields.find(f=>f.name==='events')?.value;assert.equal(typeof raw,'string');for(const event of JSON.parse(raw!))authoritativeNotifications.set(event.kind+':'+event.id,event);}}
 for(const actor of [r.owner,r.rival]){
  let original:Awaited<ReturnType<typeof semantics>>|undefined;
  for(const [i,origin] of origins.entries()){
   await contractContext.clearCookies();await contractContext.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
   assert.equal((await contractPage.goto(origin+'/game/battles/'+r.victory.battleId))?.status(),200);
   if(i===0)original=await semantics(contractPage);else assert.deepEqual(await semantics(contractPage),original,'Report forms, resources, navigation and artwork retain exact contracts');
  }
  checks.push({screen:actor.id===r.owner.id?'victory':'defeat',authoritativeContracts:'MATCH'});
 }
 await contractContext.close();
 // Both real browser origins share a schema. Viewing the first page legitimately
 // acknowledges notifications before the second SSR response. Validate every live
 // event against the exact initial catalog, then normalize only this evolving
 // unread subset; full original form equality was already asserted above.
 function stableLiveContract(contract:Awaited<ReturnType<typeof semantics>>){
   return {...contract,forms:contract.forms.map(form=>form.action!=='/game/notifications/read'?form:{...form,fields:form.fields.map(field=>{
     if(field.name!=='events')return field;
     const events=JSON.parse(field.value);assert.ok(Array.isArray(events));
     assert.equal(new Set(events.map((e:any)=>e.kind+':'+e.id)).size,events.length);
     for(const event of events)assert.deepEqual(event,authoritativeNotifications.get(event.kind+':'+event.id),'Live acknowledgment references only an authoritative personal event');
     return {...field,value:'<validated current unread subset>'};
   })})};
 }
 const beforeData=await profileBusinessSnapshot(r.db);
 for(const [width,height] of [[320,780],[390,844],[430,932],[1280,900]]){
  await page.setViewportSize({width:width!,height:height!});let baseline:Awaited<ReturnType<typeof semantics>>|undefined;
  for(const [i,origin] of origins.entries()){
   await visit(origin,'/game/home');const contract=stableLiveContract(await semantics());if(i===0)baseline=contract;else{const {nav:beforeNav,...beforeStable}=baseline!;const {nav:afterNav,...afterStable}=contract;assert.deepEqual(afterStable,beforeStable,'Live Home values, links, forms and artwork are unchanged');assert.deepEqual(afterNav.map(n=>n[0]),beforeNav.map(n=>n[0]),'Live navigation destinations remain unchanged while normal read acknowledgments update counts');}
   const mode=i?'after':'before';
   performanceChecks.push({width,mode,...await page.evaluate(()=>({cls:(window as any).__visualCls,shifts:(window as any).__visualShifts,domReadyMs:(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).domContentLoadedEventEnd,resources:performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,bytes:(r as PerformanceResourceTiming).decodedBodySize,durationMs:r.duration}))}))});
   await page.screenshot({path:`${out}/screenshots/${width}-home-${mode}.jpg`,quality:94});await page.screenshot({path:`${out}/screenshots/${width}-home-${mode}-full.jpg`,quality:94,fullPage:true});
   await page.locator('.home-activity').scrollIntoViewIfNeeded();
   await page.evaluate(()=>window.scrollTo(0,document.querySelector('.home-activity')!.getBoundingClientRect().top+scrollY-20));
   assert.ok(await page.locator('.activity-battle').count()>0,'Populated battle feed');
   assert.ok(await page.locator('.activity-army').count()>0,'Populated army/notification feed');
   await page.screenshot({path:`${out}/screenshots/${width}-activity-${mode}.jpg`,quality:94});
   if(i){assert.equal(await page.locator('.topbar').count(),0);assert.ok(await page.locator('.gold-resource .coin-icon').isVisible(),'One original coin is visible beside carried Gold');assert.equal(await page.locator('.coin-icon').count(),1);assert.equal(await page.locator('.hud-account .profile-link').count(),1);assert.equal(await page.locator('.home-menu>a').count(),8);assert.equal(await page.locator('.primary-nav a').count(),5);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No Home overflow');const menuHeights=await page.locator('.home-menu>a').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));assert.ok(menuHeights.every(h=>h>=44),'Menu touch targets');assert.ok(Math.max(...menuHeights)-Math.min(...menuHeights)<1,'Calling subtitle retains uniform menu row heights');
    const menuBackgrounds=await page.locator('.home-menu>a').evaluateAll(es=>es.map(e=>getComputedStyle(e).backgroundImage));
    assert.equal(new Set(menuBackgrounds).size,1,'All Home menu buttons share one neutral material, without destination color fills');
    const homeHeader=await page.locator('.realm-resources').evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),h=e.closest('.character-header')!.getBoundingClientRect();return {borderLeft:s.borderLeftWidth,borderRight:s.borderRightWidth,shadow:s.boxShadow,inset:parseFloat(s.marginLeft)+parseFloat(s.marginRight),alignment:Math.abs(r.left-h.left)+Math.abs(r.right-h.right)}});
    assert.equal(homeHeader.borderLeft,'1px');assert.equal(homeHeader.borderRight,'1px');assert.notEqual(homeHeader.shadow,'none');assert.ok(homeHeader.alignment<1&&homeHeader.inset===0,'Home HUD spans the full game frame');
    const meters=await page.locator('.resource-disclosure').evaluateAll(es=>es.map(e=>({value:e.querySelector('meter')!.value,max:e.querySelector('meter')!.max,reading:Number(e.querySelector('[data-resource-value]')!.textContent),maximum:Number(e.querySelector('[data-resource-max]')!.textContent)})));for(const m of meters){assert.equal(m.value,m.reading);assert.equal(m.max,m.maximum);}

    await page.locator('.account-name').evaluate(e=>e.textContent='A very long account name that must not escape the HUD or hide Profile');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.hud-account .profile-link').scrollIntoViewIfNeeded();assert.ok(await page.locator('.hud-account .profile-link').evaluate(e=>{const r=e.getBoundingClientRect(),hud=e.closest('.realm-resources')!.getBoundingClientRect();return r.left>=hud.left&&r.right<=hud.right&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'Profile link remains unobscured with a long username');
    checks.push({screen:'home',width,height,semantics:'MATCH',brandingRemoved:true,profilePreserved:true,overflow:false});
   }
  }
 }
 await page.setViewportSize({width:390,height:844});
 for(const path of sharedPaths.slice(1)){
  await visit(origins[1]!,path);await checkPlayerLinks();assert.equal(await page.locator('.topbar').count(),0,path);assert.equal(await page.locator('.hud-account .profile-link').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Shared screen overflow '+path);checks.push({screen:path,semantics:'MATCH',brandingRemoved:true,overflow:false});
 }
 const storedReport=(await r.db.query('SELECT attacker_id,defender_id,outcome,result FROM battles WHERE id=$1',[r.victory.battleId])).rows[0]!;
 assert.ok(storedReport.result.bountyClaim,'Representative report has a genuine successful bounty claim');
 const reviewScenes=[
  {name:'home',path:'/game/home',actor:r.owner},
  {name:'profile',path:'/game/profile',actor:r.owner},
  {name:'attack',path:'/game/battle',actor:r.owner},
  {name:'weapons',path:'/game/armory',actor:r.owner},
  {name:'armor',path:'/game/armory?category=armor',actor:r.owner},
  {name:'spells',path:'/game/armory?category=spell',actor:r.owner},
  {name:'land',path:'/game/land',actor:r.owner},
  {name:'victory',path:'/game/battles/'+r.victory.battleId,actor:r.owner},
  {name:'defeat',path:'/game/battles/'+r.victory.battleId,actor:r.rival},
  {name:'home-attacks',path:'/game/home?feed=battles',actor:r.owner},
  {name:'home-losses',path:'/game/home?feed=battles',actor:r.rival}
 ];
 await mkdir(out+'/review',{recursive:true});
 for(const [width,height] of [[390,844],[430,932],[1280,900]]){
  await page.setViewportSize({width:width!,height:height!});
  for(const scene of reviewScenes){
   await visit(origins[1]!,scene.path,scene.actor);
   await checkPlayerLinks();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow: '+scene.name+' '+width);
   assert.equal(await page.locator('.primary-nav a').count(),5);
   assert.equal(await page.locator('.topbar').count(),0);
   assert.ok(await page.locator('.gold-resource .coin-icon').isVisible(),'Shared HUD coin remains visible on nested screens');assert.equal(await page.locator('.coin-icon').count(),1);
   if(scene.name==='home-attacks'||scene.name==='home-losses'){
    assert.ok(await page.locator('.activity-battle').count()>=(scene.name==='home-attacks'?3:1),'Home attack feed is populated by real fixture battles');
    if(scene.name==='home-losses')assert.ok(await page.locator('.activity-loss').count()>0,'Genuine losing attacks retain their distinct outcome');
    assert.equal(await page.locator('.activity-entry:not(.activity-battle)').count(),0);
    await page.locator('.home-activity').scrollIntoViewIfNeeded();
    await page.evaluate(()=>window.scrollTo(0,document.querySelector('.home-activity')!.getBoundingClientRect().top+scrollY-20));
   }
   if(scene.name==='victory'||scene.name==='defeat'){
    const attacking=storedReport.attacker_id===scene.actor.id,win=(storedReport.outcome==='attacker_win')===attacking,b=storedReport.result;
    assert.equal(win,scene.name==='victory','Scene label matches actual saved outcome');
    assert.equal(await page.locator('#battle-outcome').innerText(),win?'VICTORY!':'DEFEAT');
    const received=b.pvpRulesetId?attacking:win;
    assert.equal(await page.locator('.battle-gold-reward dd').innerText(),(received?'+':b.loot?'-':'')+b.loot.toLocaleString('en'));
    assert.equal(await page.locator('.battle-damage-dealt dd').innerText(),String(attacking?b.defenderDamage:b.attackerDamage));
    assert.equal(await page.locator('.battle-damage-received dd').innerText(),String(attacking?b.attackerDamage:b.defenderDamage));
    assert.equal(await page.locator('.bounty-escrow strong.gold').innerText(),b.bountyClaim.reward.toLocaleString('en')+' bounty gold');
   }
   if(scene.name==='home'||scene.name==='home-attacks'||scene.name==='home-losses'){
    for(const row of await page.locator('.activity-battle').all()){
     const id=(await row.getAttribute('id'))!.slice('activity-'.length),saved=(await r.db.query('SELECT attacker_id,defender_id,outcome,result FROM battles WHERE id=$1',[id])).rows[0]!;
     const b=saved.result,attacking=saved.attacker_id===scene.actor.id,won=(saved.outcome==='attacker_win')===attacking;
     assert.equal(await row.locator('.combat-outcome').innerText(),won?'VICTORY':'DEFEAT');
     assert.equal(await row.locator('.activity-battle-rewards .gold').innerText(),(won?'+':'−')+(b.loot??0)+' gold');
     assert.equal(await row.locator('.activity-xp').innerText(),'+'+(attacking?(b.attackerXp??0):(b.defenderXp??0))+' XP');
     assert.equal(await row.locator('.activity-battle-damage strong').nth(0).innerText(),String(attacking?b.defenderDamage:b.attackerDamage));
     assert.equal(await row.locator('.activity-battle-damage strong').nth(1).innerText(),String(attacking?b.attackerDamage:b.defenderDamage));
     assert.ok(await row.locator('a[href="/game/battles/'+id+'"]').isVisible(),'Original View Battle action remains visible');
    }
   }
   const frame=await page.locator('.realm-resources').evaluate(e=>{const s=getComputedStyle(e);return {width:s.borderLeftWidth,color:s.borderLeftColor,top:s.borderTopColor}});
   assert.deepEqual(frame,{width:'1px',color:'rgb(105, 96, 82)',top:'rgb(162, 140, 97)'},'Home and secondary screens share the same HUD frame');
   assert.ok(await page.locator('.realm-resources').evaluate(e=>{const r=e.getBoundingClientRect(),h=e.closest('.character-header')!.getBoundingClientRect();return Math.abs(r.left-h.left)<.5&&Math.abs(r.right-h.right)<.5}),'HUD spans the full game frame without side insets');
   if(scene.name.startsWith('home')){
    const border=await page.locator('.home-activity').evaluate(e=>{const s=getComputedStyle(e);return [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth]});
    assert.deepEqual(border,['1px','1px','1px','1px'],'Recent Activity is fully framed');
   }
   if(scene.name==='profile'){
    const actions=await page.locator('.profile-collection-actions .button').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return {border:s.borderTopWidth,background:s.backgroundImage,shadow:s.boxShadow,height:e.getBoundingClientRect().height}}));
    assert.equal(actions.length,2);assert.ok(actions.every(s=>s.border==='0px'&&s.background==='none'&&s.shadow==='none'&&s.height>=44),'Achievements and Tutorial stay borderless and touch-accessible');
   }
   if(['weapons','armor','spells','land'].includes(scene.name)){
    const surfaces=await page.locator('.catalog-row').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return {image:s.backgroundImage,color:s.backgroundColor}}));
    assert.ok(surfaces.every(s=>s.image==='none'&&s.color==='rgba(0, 0, 0, 0)'),'Catalog names have no gray stripes or texture fills');
   }
   if(scene.name==='attack')assert.equal(await page.locator('#rival-list').evaluate(e=>getComputedStyle(e).backgroundImage),'none','Rival reading surface has no iron texture');
   const motion=await page.evaluate(()=>({animations:document.getAnimations().filter(a=>a.playState==='running').length,celebrating:document.querySelectorAll('.is-celebrating').length}));
   assert.deepEqual(motion,{animations:0,celebrating:0},'No automatic visual motion: '+scene.name);
   await page.screenshot({path:`${out}/review/${width}-${scene.name}.jpg`,quality:94});
   await page.screenshot({path:`${out}/review/${width}-${scene.name}-full.jpg`,quality:94,fullPage:true});
   const atmosphere=await page.locator('.page-backdrop').evaluate(e=>{const s=getComputedStyle(e);return {display:s.display,position:s.position,pointerEvents:s.pointerEvents,image:s.backgroundImage}});
   assert.equal(atmosphere.display,'block');assert.equal(atmosphere.position,'fixed');assert.equal(atmosphere.pointerEvents,'none');
   const expectedScene=scene.name==='profile'?'profile':['attack','victory','defeat'].includes(scene.name)?'battle':['weapons','armor','spells'].includes(scene.name)?'armory':scene.name==='land'?'land':null;
   if(expectedScene)assert.ok(atmosphere.image.includes('/art/dark-medieval-environments/'+expectedScene+'.webp'),'Dedicated scenery matches destination');
   assert.ok(!/art\/(properties-|land-review)/.test(atmosphere.image),'Catalog/property artwork is never repurposed as a screen background');
   checks.push({screen:scene.name,width,height,actualBrowserCapture:true,overflow:false,automaticMotion:false,dedicatedEnvironment:expectedScene??'existing-shared-castle',savedBattleValues:scene.name==='victory'||scene.name==='defeat'?'MATCH':undefined});
   // Same real game and data, only the frozen prior stylesheet differs.
   await visit(origins[0]!,scene.path,scene.actor);
   if(scene.name==='home-attacks'||scene.name==='home-losses')await page.evaluate(()=>window.scrollTo(0,document.querySelector('.home-activity')!.getBoundingClientRect().top+scrollY-20));
   await page.screenshot({path:`${out}/review/${width}-${scene.name}-before.jpg`,quality:94});
  }
 }
 // First-visit rewards also stay static when motion is permitted: use a fresh
 // context with empty session storage, rather than relying on replay suppression.
 const motionContext=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference'});
 await motionContext.addCookies([{name:'kr_session',value:r.owner.cookie.split('=')[1]!,url:origins[1]!,httpOnly:true,sameSite:'Lax'}]);
 const motionPage=await motionContext.newPage();
 await motionPage.addInitScript(()=>{(window as any).__rewardMutations=0;document.addEventListener('DOMContentLoaded',()=>new MutationObserver(rs=>{for(const r of rs){const e=r.target instanceof Element?r.target:r.target.parentElement;if(e?.closest('[data-reward-count]'))(window as any).__rewardMutations++;}}).observe(document,{subtree:true,childList:true,characterData:true}),{once:true});});
 assert.equal((await motionPage.goto(origins[1]!+'/game/battles/'+r.victory.battleId))?.status(),200);await motionPage.waitForLoadState('networkidle');
 assert.equal(await motionPage.locator('.is-celebrating').count(),0);
 assert.equal(await motionPage.evaluate(()=>(window as any).__rewardMutations),0,'SSR rewards are not animated or rewritten');
 await motionContext.close();
 checks.push({interaction:'First-visit reward values remain static with no-preference and fresh session storage',result:'PASS'});
 for(const width of [700,800]){
  await page.setViewportSize({width,height:900});await visit(origins[1]!,'/game/home?feed=battles');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Battle ledger fits tablet transition '+width);
  const title=page.locator('.activity-battle h3').first();await title.evaluate(e=>e.querySelector('a')!.textContent='ANameWithoutSpacesThatStillNeedsToFit');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Long opponent names do not overflow tablet ledger');
  assert.ok(await page.locator('.activity-battle .feed-actions .button').first().isVisible());
  checks.push({screen:'home-attacks',width,tabletTransition:'PASS',longName:'PASS'});
 }
 for(const path of ['/login','/register']){await visit(origins[1]!,path,null);assert.equal(await page.locator('.realm-brand').count(),1);checks.push({screen:path,brandingPreserved:true});}
 checks.push({interaction:'live read acknowledgments remain valid subsets of the exact authoritative notification catalog',result:'PASS'});
 assert.deepEqual(await profileBusinessSnapshot(r.db),beforeData,'Read-only rendering preserves business rows');
 await visit(origins[1]!,'/game/home');for(const selector of ['.income-disclosure','.xp-resource','.resource-disclosure.health','.resource-disclosure.mana','.resource-disclosure.spirit']){await page.locator(selector+'>summary').click();assert.ok(await page.locator(selector).evaluate(e=>e.hasAttribute('open')));await page.locator(selector+'>summary').click();}
 await page.getByRole('button',{name:'Continue Tutorial',exact:true}).click();await page.waitForURL(url=>url.pathname==='/game/tutorial');checks.push({interaction:'native tutorial resume',result:'PASS'});
 await visit(origins[1]!,'/game/home');await page.locator('.home-menu a[href="/game/land"]').click();await page.waitForURL('**/game/land');checks.push({interaction:'Home Land link',result:'PASS'});
 await visit(origins[1]!,'/game/home');await page.locator('.hud-account .profile-link').click();await page.waitForURL('**/game/profile');checks.push({interaction:'compact profile access',result:'PASS'});
 await visit(origins[1]!,'/game/home');
 for(const tab of ['battles','comments','broadcasts','all']){
   await page.locator(`.feed-tabs a[href='/game/home?feed=${tab}']`).click();
   await page.waitForURL(url=>url.searchParams.get('feed')===tab);
   assert.equal(await page.locator(`.feed-tabs a[href='/game/home?feed=${tab}'][aria-current=page]`).count(),1);
   await checkPlayerLinks();
   if(tab==='battles')assert.equal(await page.locator('.activity-entry:not(.activity-battle)').count(),0);
 }
 await visit(origins[1]!,'/game/home?feed=all');
 const report=page.locator('.activity-comment .report-message').first();
 await report.locator('summary').click();assert.ok(await report.getAttribute('open')!==null);
 assert.equal(await report.locator('select[name="reason"]').count(),1);assert.equal(await report.locator('button[type="submit"]').innerText(),'Send report');
 await report.locator('summary').click();
 const resourceColor=await page.locator('.realm-resource .stat-icon').evaluateAll(es=>es.map(e=>({filter:getComputedStyle(e).filter,width:e.getBoundingClientRect().width,animation:getComputedStyle(e).animationName})));
 assert.equal(new Set(resourceColor.map(c=>c.filter)).size,3,'Each resource has distinct tightly colored light');
 assert.ok(resourceColor.every(c=>c.animation==='none'&&c.width<=34),'Icon lighting remains static and compact');
 checks.push({interaction:'Read-only battle feed values match saved records; native comment reporting remains intact; static resource color',result:'PASS',resourceColor});
 checks.push({interaction:'Shared neutral player-name typography across pages, filters and viewports; unified Home header and neutral menu materials',result:'PASS'});
 checks.push({interaction:'native All/Battles/Comments/Broadcasts activity filtering',result:'PASS'});
 // Native controls also work without gameplay/presentation JavaScript.
 const staticContext=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false,reducedMotion:'reduce'});
 await staticContext.addCookies([{name:'kr_session',value:r.owner.cookie.split('=')[1]!,url:origins[1]!,httpOnly:true,sameSite:'Lax'}]);
 const staticPage=await staticContext.newPage();assert.equal((await staticPage.goto(origins[1]!+'/game/home'))?.status(),200);
 assert.equal(await staticPage.locator('.home-menu>a').count(),8);
 await staticPage.setViewportSize({width:320,height:780});
 const hydrationShift=await staticPage.evaluate(()=>{
   const hud=document.querySelector('.realm-resources')!,timers=[...document.querySelectorAll<HTMLElement>('[data-recovery]')],original=timers.map(e=>e.textContent);
   const initial=hud.getBoundingClientRect().height;
   for(const timer of timers)if(timer.dataset.next)timer.textContent=timer.dataset.recovery==='mana'?'03:00':'01:48';
   const ready=hud.getBoundingClientRect().height;
   const meterBottoms=[...document.querySelectorAll('meter[data-resource-meter]')].map(e=>e.getBoundingClientRect().bottom);
   const readingTops=[...document.querySelectorAll('.resource-reading>strong')].map(e=>e.getBoundingClientRect().top);
   timers.forEach((e,i)=>e.textContent=original[i]!);return {shift:Math.abs(ready-initial),meterSpread:Math.max(...meterBottoms)-Math.min(...meterBottoms),readingSpread:Math.max(...readingTops)-Math.min(...readingTops)};
 });
 assert.ok(hydrationShift.shift<1,'Narrow HUD reserves recovery timer space before hydration');
 assert.ok(hydrationShift.meterSpread<1&&hydrationShift.readingSpread<1,'Narrow resource values and bars align across all three columns');
 checks.push({interaction:'320px recovery placeholders and populated timers retain HUD height',result:'PASS'});
 await staticPage.setViewportSize({width:390,height:844});
 await staticPage.locator('.income-disclosure>summary').click();assert.ok(await staticPage.locator('.income-disclosure').getAttribute('open')!==null);
 await staticPage.locator('.income-disclosure>summary').click();
 await staticPage.locator('.tutorial-resume button').click();await staticPage.waitForURL(url=>url.pathname==='/game/tutorial');
 checks.push({interaction:'native forms and disclosure with JavaScript disabled',result:'PASS'});await staticContext.close();
 await visit(origins[1]!,'/game/home');
 // The wallet is static even when the browser allows motion. Anchor the
 // glow to the amount, and verify it is unchanged over time in either mode.
 for(const preference of ['no-preference','reduce'] as const){
  await page.emulateMedia({reducedMotion:preference});
  const glow=await page.evaluate(()=>{
    const host=document.querySelector('[data-wallet-gold]')!,range=document.createRange();range.selectNodeContents(host);
    const h=host.getBoundingClientRect(),n=range.getBoundingClientRect(),p=getComputedStyle(host,'::after'),matrix=new DOMMatrix(p.transform==='none'?undefined:p.transform);
    return {animations:host.getAnimations({subtree:true}).length,name:p.animationName,transform:p.transform,opacity:p.opacity,display:p.content==='none'?'none':p.display,number:h.toJSON(),centerError:Math.abs(h.x+parseFloat(p.left)+parseFloat(p.width)/2+matrix.e-(n.x+n.width/2)),anchorError:Math.abs(parseFloat(p.top)-h.height*.72)};
  });
  assert.equal(glow.animations,0);assert.equal(glow.name,'none');assert.notEqual(glow.display,'none');
  assert.ok(glow.centerError<.5&&glow.anchorError<.5,'Static glow remains centered on the number');
  await page.waitForTimeout(200);
  const later=await page.locator('[data-wallet-gold]').evaluate(e=>({name:getComputedStyle(e,'::after').animationName,transform:getComputedStyle(e,'::after').transform,opacity:getComputedStyle(e,'::after').opacity,number:e.getBoundingClientRect().toJSON()}));
  assert.equal(later.name,'none');assert.equal(later.transform,glow.transform);assert.equal(later.opacity,glow.opacity);assert.deepEqual(later.number,glow.number);
  checks.push({interaction:'One original coin; centered gold glow and digits remain static',preference,result:'PASS',glow});
 }
 await page.locator('.home-menu>a').first().focus();
 assert.ok(await page.locator('.home-menu>a').first().evaluate(e=>getComputedStyle(e).outlineStyle!=='none'));
 await page.locator('.resource-upper>a').focus();assert.ok(await page.locator('.resource-upper>a').evaluate(e=>getComputedStyle(e).outlineStyle!=='none'),'Level link retains visible keyboard focus');
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // Inspect the same amount-anchored decoration verified above, rather than
 // the retired wrapper pseudo-element (which no longer generates content).
 assert.equal(await page.locator('[data-wallet-gold]').evaluate(e=>getComputedStyle(e,'::after').display),'none','High contrast suppresses decorative glow');
 await page.screenshot({path:`${out}/screenshots/390-static-fallback.jpg`,quality:94});
 await page.locator('.hud-account .profile-link').click();await page.waitForURL('**/game/profile');
 checks.push({interaction:'keyboard focus, reduced motion and forced-colors fallback',result:'PASS'});
 await writeFile(out+'/performance-diagnostic.json',JSON.stringify(performanceChecks,null,2));
 // The newly recorded 320px frozen reference exposes its existing loading shift.
 // Keep every original reference gate, and enforce the same 0.01 bound on the
 // candidate at all four sizes; the historical CSS remains unmodified.
 assert.ok(performanceChecks.filter((p:any)=>p.mode==='after'||p.width!==320).every((p:any)=>p.cls<.01),'Candidate and original reference viewports have no material layout shift');
 assert.deepEqual(errors,[]);await writeFile(out+'/verification.json',JSON.stringify({base:'3e6067e448f77ffba38b191773281ccf20e56e7c',mode:'Actual EJS/Fastify/Chromium; synthetic local PostgreSQL schema',checks,assetAndScriptErrors:errors,readOnlyBusinessPreservation:'PASS',performance:performanceChecks},null,2));
 console.log('DARK_MEDIEVAL_RELEASE: PASS — static Home, Attack, Weapons/Armor/Spells, Land, genuine Victory/Defeat and populated Home attacks; unchanged contracts/business data and native interactions.');
}finally{await browser?.close();for(const app of apps)await app.close();await r.close();}
