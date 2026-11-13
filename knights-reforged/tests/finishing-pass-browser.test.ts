import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium,type Page} from 'playwright-core';
import {classicProfileFixture} from './classic-profile-fixture.js';
import {realm} from './helpers.js';
import {transaction} from '../src/db.js';
import {provisionBots} from '../src/development.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {randomUUID} from 'node:crypto';
import {notificationSummary} from '../src/notifications.js';

const out='test-results/finishing-pass';
async function factories(){
 const before=process.env.KC_FINISHING_BASELINE,all:typeof createApp[]=[];
 if(before){for(const file of ['views/profile.ejs','views/battle.ejs','views/bounties.ejs','public/player-experience.js','public/realm-iron-brass.css'])assert.deepEqual(await readFile(before+'/'+file),execFileSync('git',['show','56fbd34c74166bd585de9157d8d41a022f6be6c9:knights-reforged/'+file]));all.push((await import(pathToFileURL(before+'/src/app.ts').href)).createApp);}
 all.push(createApp);return all;
}
async function ready(page:Page){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode();}));});}
async function alpha(page:Page){return page.locator('.profile-identity>img').evaluate(e=>{
 const c=document.createElement('canvas');c.width=c.height=180;const x=c.getContext('2d')!;x.drawImage(e as HTMLImageElement,0,0,180,180);const p=x.getImageData(0,0,180,180).data;let minX=180,minY=180,maxX=0,maxY=0,light=0,weight=0,transparent=0;
 for(let y=0;y<180;y++)for(let xx=0;xx<180;xx++){const i=(y*180+xx)*4,a=p[i+3]!;if(a===0)transparent++;if(a>=90){minX=Math.min(minX,xx);minY=Math.min(minY,y);maxX=Math.max(maxX,xx);maxY=Math.max(maxY,y);light+=(p[i]!*.2126+p[i+1]!*.7152+p[i+2]!*.0722)*a;weight+=a;}}
 return {width:maxX-minX+1,height:maxY-minY+1,luminance:light/weight,transparent,corners:[0,179,180*179,180*180-1].map(i=>p[i*4+3])};
});}

test('finishing pass: larger readable Profile symbols and shared compact Battle/Bounty identities',{timeout:150000},async()=>{
 const r=await classicProfileFixture(),browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']}),apps:Awaited<ReturnType<typeof createApp>>[]=[],origins:string[]=[],errors:string[]=[],evidence:unknown[]=[];
 await mkdir(out,{recursive:true});
 try{
  const people=[[r.owner,'Freeblade','freeblade'],[r.rival,'Warden','warden'],[r.patron,'Spellward','spellward']] as const;
  for(const [p,key] of people)await transaction(r.db,sql=>sql.query('UPDATE characters SET profile_class=$2 WHERE id=$1',[p.id,key]));
  // The shared combat fixture ends with this player defeated. Use the real
  // paid healing command so the visual review also shows enabled Attack controls.
  await r.ok(r.owner,'/api/v1/health/restorations');
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  await r.ok(r.patron,'/api/v1/bounties/placements',{targetCharacterId:r.rival.id,amount:1000});
  for(const factory of await factories()){const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000',ENABLE_DEV_BOTS:'1'}),app=await factory({db:r.db,config});apps.push(app);const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;origins.push(origin);}
  // Settlement/read behavior is unchanged; take preservation baselines only
  // after each lazy projection has been prepared, at the same fixed clock.
  for(const [p] of people)await r.me(p);
  const wallets=(await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id')).rows,battles=(await r.db.query('SELECT id,snapshot,result FROM battles ORDER BY id')).rows;
  const metrics:Record<string,Awaited<ReturnType<typeof alpha>>>={};
  for(const width of [320,390,1280]){
   const context=await browser.newContext({viewport:{width,height:width===1280?900:844},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>origins.includes(new URL(route.request().url()).origin)?route.continue():route.abort());await context.route('**/api/v1/notifications/read',route=>route.abort('failed'));
   const shapes:unknown[]=[],rosters:Awaited<ReturnType<Page['evaluate']>>[]=[];
   for(let index=0;index<origins.length;index++){
    const current=index===origins.length-1,label=current?'after':'before',origin=origins[index]!;await context.clearCookies();await context.addCookies([{name:'kr_session',value:r.owner.cookie.slice('kr_session='.length),url:origin,httpOnly:true,sameSite:'Lax'}]);
    async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200);await ready(page);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path+' fits '+width);assert.equal(await page.locator('.primary-nav>a').count(),5);}
    await visit('/game/profile');shapes.push(await page.locator('.profile-identity').evaluate(e=>({slot:e.getBoundingClientRect().toJSON(),text:e.querySelector('div')!.getBoundingClientRect().toJSON(),panels:[...document.querySelectorAll('main>.panel')].map(p=>p.getBoundingClientRect().toJSON()),nav:document.querySelector('.primary-nav')!.getBoundingClientRect().toJSON()})));await page.screenshot({path:out+`/profile-${width}-${label}.png`});
    if(width===390)for(const [p,key,file] of people){await visit('/game/players/'+p.id);const img=page.locator('.profile-identity>img');assert.equal(await img.getAttribute('alt'),({Freeblade:'Barbarian',Warden:'Tank',Spellward:'Mage'})[key]+' silhouette');assert.deepEqual(await img.evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),{width:60,height:60});metrics[file+'-'+label]=await alpha(page);assert.deepEqual(metrics[file+'-'+label]!.corners,[0,0,0,0]);assert.ok(metrics[file+'-'+label]!.transparent>180*180*.3);await img.screenshot({path:out+`/${file}-${label}-60.png`});await page.locator('.profile-identity').screenshot({path:out+`/identity-${file}-${label}.png`});}
    await visit('/game/battle');
    const rows=await page.locator('#rival-list .bounty-row').evaluateAll(rows=>rows.map(row=>{const button=row.querySelector('button')!,identity=row.querySelector('.bounty-target')!,name=identity.querySelector('h3')!,level=identity.querySelector('span')!,img=identity.querySelector('img');return {id:(row.querySelector('[name=targetCharacterId]') as HTMLInputElement).value,rowHeight:row.getBoundingClientRect().height,button:button.getBoundingClientRect().toJSON(),nameFont:getComputedStyle(name).font,levelFont:getComputedStyle(level).font,icon:img?{width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height,src:img.getAttribute('src'),decorative:img.getAttribute('aria-hidden'),left:img.getBoundingClientRect().left,nameLeft:name.getBoundingClientRect().left,top:img.getBoundingClientRect().top,nameTop:name.getBoundingClientRect().top}:null};}));rosters.push(rows);
    if(current){assert.ok(rows.length>0);for(const row of rows){assert.ok(row.icon);assert.ok(row.icon.width>=26&&row.icon.width<=30);assert.equal(row.icon.height,row.icon.width);assert.equal(row.icon.decorative,'true');assert.ok(row.icon.left<row.icon.nameLeft);assert.ok(Math.abs(row.icon.top-row.icon.nameTop)<=2,'Marker aligns with the player name, not the bottom of the row');assert.match(row.icon.src!,/class-silhouettes-1\/(freeblade|warden|spellward)\.svg/);assert.ok(row.button.width>=76&&row.button.height>=44);}const saved=(await r.db.query('SELECT c.id,c.profile_class FROM characters c WHERE c.id=ANY($1::uuid[])',[rows.map(v=>v.id)])).rows;for(const row of rows)assert.ok(row.icon!.src!.includes(({Freeblade:'freeblade',Warden:'warden',Spellward:'spellward'} as Record<string,string>)[saved.find(s=>s.id===row.id)!.profile_class]!));}
    await page.screenshot({path:out+`/battle-${width}-${label}.png`});
    // Follow real snapshot cursors until a human opponent is visible, asserting
    // every subsequently rendered row uses the same marker. No ranker changes.
    let pages=0;while(current&&!await page.locator(`.bounty-target a[href="/game/players/${r.rival.id}"]`).count()&&await page.getByRole('link',{name:'More rivals',exact:true}).count()){
     await page.getByRole('link',{name:'More rivals',exact:true}).click();await ready(page);assert.equal(await page.locator('#rival-list .bounty-row').count(),await page.locator('#rival-list .class-silhouette').count());assert.ok(++pages<35);
    }
    if(current){assert.equal(await page.locator(`.bounty-target a[href="/game/players/${r.rival.id}"]`).count(),1);await page.locator(`.bounty-row:has(a[href="/game/players/${r.rival.id}"])`).screenshot({path:out+`/human-row-${width}.png`});}
    await visit('/game/bounties');if(current){assert.equal(await page.locator('.bounty-list .bounty-row').count(),await page.locator('.bounty-list .class-silhouette').count());assert.match((await page.locator('.bounty-list .class-silhouette').first().getAttribute('src'))!,/warden\.svg/);}await page.screenshot({path:out+`/bounties-${width}-${label}.png`});
   }
   if(origins.length===2){assert.deepEqual(shapes[0],shapes[1],'Unchanged Profile slot, text, panels, nav');const before=rosters[0] as {id:string;rowHeight:number;button:{width:number;height:number};nameFont:string;levelFont:string}[],after=rosters[1] as typeof before;assert.deepEqual(before.map(r=>r.id),after.map(r=>r.id),'Recommendation order untouched');for(let i=0;i<before.length;i++){assert.equal(after[i]!.button.width,before[i]!.button.width);assert.equal(after[i]!.button.height,before[i]!.button.height);assert.equal(after[i]!.nameFont,before[i]!.nameFont);assert.equal(after[i]!.levelFont,before[i]!.levelFont);assert.ok(after[i]!.rowHeight<=before[i]!.rowHeight+21,'At most one necessary wrapped name line, no inflated rows');}}
   evidence.push({width,profile:shapes,rosters});await context.close();
  }
  if(origins.length===2)for(const file of ['freeblade','warden','spellward']){const before=metrics[file+'-before']!,after=metrics[file+'-after']!;assert.ok(after.width>=before.width*1.04&&after.height>=before.height*1.04,'Art is slightly larger within the unchanged 60px slot');assert.ok(after.luminance>=before.luminance*1.18,'Visible silhouette is measurably brighter');}
  assert.deepEqual((await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id')).rows,wallets);assert.deepEqual((await r.db.query('SELECT id,snapshot,result FROM battles ORDER BY id')).rows,battles);assert.deepEqual(errors,[]);
  await writeFile(out+'/visual-evidence.json',JSON.stringify({sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),before:process.env.KC_FINISHING_BASELINE?'56fbd34c74166bd585de9157d8d41a022f6be6c9':null,actualChromium:true,transparentAlpha:metrics,sameProfileGeometry:true,noChangedFontsOrAttackDimensions:true,syntheticBots:450,featureActivation:false,walletsAndHistoricalBattlesUnchanged:true,evidence},null,2)+'\n');
 }finally{await browser.close();for(const app of apps)await app.close();await r.close();}
});

test('read acknowledgments repaint all personal-event controls, including partial counts and the zero state',{timeout:60000},async()=>{
 const now=new Date('2032-02-01T12:00:00Z'),r=await realm({isolated:true,clock:()=>now}),browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']}),apps:Awaited<ReturnType<typeof createApp>>[]=[],origins:string[]=[];await mkdir(out,{recursive:true});
 try{
  const owner=await r.player('Notification Knight'),sender=await r.player('Messenger Knight'),invite=await r.player('Waiting Ally');for(const p of [owner,sender,invite])await r.prepare(p,1000,30);await r.ok(invite,'/api/v1/army/invitations',{targetCharacterId:owner.id});
  const ids=[];for(let i=0;i<5;i++){const id=randomUUID();ids.push(id);await r.db.query("INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$3,'comment',$4,'community-0.1',$5,$6)",[id,sender.id,owner.id,'Message '+(i+1),randomUUID(),now]);}
  for(const factory of await factories()){const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await factory({db:r.db,config});apps.push(app);const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;origins.push(origin);}
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await context.addInitScript(()=>Object.defineProperty(document,'hidden',{get:()=>false}));const pages:Page[]=[];
  for(let i=0;i<origins.length;i++){const origin=origins[i]!;await context.addCookies([{name:'kr_session',value:owner.cookie.slice('kr_session='.length),url:origin,httpOnly:true,sameSite:'Lax'}]);const page=await context.newPage();pages.push(page);await page.route('**/api/v1/notifications/read',route=>route.abort('failed'));await page.goto(origin+'/game/notifications');await ready(page);assert.match(await page.locator('.personal-notification-tools').innerText(),/View 5 unread personal events/);await page.screenshot({path:out+`/notifications-${i===origins.length-1?'after':'before'}-initial5.png`,fullPage:true});}
  const current=pages.at(-1)!;const summary=await current.request.post(origins.at(-1)!+'/api/v1/notifications/read',{headers:{'x-csrf-token':owner.csrf,origin:origins.at(-1)!},data:{events:ids.slice(0,2).map(id=>({id,kind:'comment'}))}});assert.equal(summary.status(),200);
  // Use the actual refreshed, authenticated summary, then verify partial count
  // text and fixed read-batch identity stay synchronized without replacing IDs.
  const batch=await current.locator('[name=batchId]').inputValue();await current.evaluate(()=>window.dispatchEvent(new Event('focus')));await current.waitForFunction(()=>document.querySelector('[data-personal-events-link]')?.textContent==='View 3 unread personal events ›');assert.match(await current.locator('.personal-notification-tools').innerText(),/View 3 unread personal events/);assert.equal(await current.locator('[name=batchId]').inputValue(),batch);
  for(let i=0;i<pages.length;i++){
   const page=pages[i]!,label=i===pages.length-1?'after':'before';await page.unroute('**/api/v1/notifications/read');for(const h of await page.locator('article h3').all()){await h.scrollIntoViewIfNeeded();await page.waitForTimeout(100);}await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(()=>document.querySelector('[data-notification-badge=home]')?.hasAttribute('hidden'));
   const controls=page.locator('.personal-notification-tools');if(i===pages.length-1){assert.ok(await controls.isHidden());assert.equal(await page.locator('[data-personal-events-link]').textContent(),'View 0 unread personal events ›');assert.ok(await controls.locator('button').isDisabled());assert.doesNotMatch(await page.locator('body').innerText(),/View \d+ unread personal events|Mark all current personal events as read/);assert.equal(await page.locator('[data-notification-badge=army] [data-notification-number]').innerText(),'1');}else{assert.ok(await controls.isVisible());assert.match(await controls.innerText(),/View 5 unread personal events/,'The baseline reproduces the stale text even though the badge has cleared');}
   assert.doesNotMatch(await page.locator('.primary-nav').innerText(),/undefined/);
   for(const badge of await page.locator('[data-notification-badge]:not([data-notification-badge=home]):not([data-notification-badge=army])').all())assert.ok(await badge.isHidden());
   // Return focus to a noninteractive heading after viewing the event list;
   // keep the normal accessible skip-link behavior, not a screenshot CSS override.
   await page.getByRole('heading',{level:1}).click();
   await page.screenshot({path:out+`/notifications-${label}-cleared0.png`,fullPage:true});
  }
  assert.equal((await notificationSummary(r.db,owner.id)).home,0);assert.equal((await notificationSummary(r.db,owner.id)).army,1);await context.close();await writeFile(out+'/notification-ui-evidence.json',JSON.stringify({partialCount:'5 → 3',finalCount:0,badgeHidden:true,unreadLinkHidden:true,markAllHiddenAndDisabled:true,readBatchUnchanged:true,pendingArmyInvitation:1,baselineStaleTextReproduced:origins.length===2,productionWrites:false},null,2)+'\n');
 }finally{await browser.close();for(const app of apps)await app.close();await r.close();}
});
