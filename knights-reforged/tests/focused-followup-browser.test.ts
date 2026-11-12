import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {uiThemeFixture} from './home-theme-fixture.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {callingName} from '../src/calling-presentation.js';
import {transaction} from '../src/db.js';

test('focused real-app Profile silhouettes, mapped Battle labels and charcoal comments preserve layout and gameplay',{timeout:180000},async()=>{
 const r=await uiThemeFixture(),apps:Awaited<ReturnType<typeof createApp>>[]=[],origins:string[]=[],baseline=process.env.KC_FOLLOWUP_BASELINE;
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const out='test-results/focused-followup';await mkdir(out,{recursive:true});const captures:unknown[]=[],errors:string[]=[];
 try{
  const people=[[r.owner,'Freeblade','freeblade'],[r.rival,'Warden','warden'],[r.patron,'Spellward','spellward']] as const;
  for(const [p,key] of people)await transaction(r.db,sql=>sql.query('UPDATE characters SET profile_class=$2 WHERE id=$1',[p.id,key]));
  const freeblade=r.coverage.graduate;await transaction(r.db,sql=>sql.query("UPDATE characters SET attained_level=75,profile_class='Freeblade' WHERE id=$1",[freeblade.id]));
  const text='The northern road is clear. Hold the gate until dawn. Freeblade is the word written on this old map.';
  await r.ok(r.rival,'/api/v1/comments',{profileId:r.owner.id,body:text});
  await r.ok(r.patron,'/api/v1/broadcasts',{body:'Scouts have returned from the western pass. The realm stands together.'});
  const factories:typeof createApp[]=[];
  if(baseline){
   for(const file of ['views/profile.ejs','views/battle.ejs','public/realm-iron-brass.css','public/player-experience.js'])assert.deepEqual(await readFile(baseline+'/'+file),execFileSync('git',['show','e508bca1cef210f0eb8816d68c35d718f10bf9c5:knights-reforged/'+file]));
   factories.push((await import(pathToFileURL(baseline+'/src/app.ts').href)).createApp);
  }
  factories.push(createApp);
  for(const factory of factories){const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await factory({db:r.db,config});apps.push(app);const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;origins.push(origin);}
  const historicalBattles=(await r.db.query('SELECT id,snapshot,result FROM battles ORDER BY id')).rows;
  const wallets=(await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id')).rows;
  for(const width of [320,390,1280]){
   const context=await browser.newContext({viewport:{width,height:width>=768?900:844},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>origins.includes(new URL(route.request().url()).origin)?route.continue():route.abort());
   // Freeze read side effects for paired visuals only; acknowledgment behavior
   // is exercised separately against real PostgreSQL in the notification test.
   await context.route('**/api/v1/notifications/read',route=>route.abort('failed'));
   const measurements:unknown[]=[];
   for(let side=0;side<origins.length;side++){
    const after=side===origins.length-1,origin=origins[side]!,label=after?'after':'before';await context.clearCookies();await context.addCookies([{name:'kr_session',value:r.owner.cookie.slice('kr_session='.length),url:origin,httpOnly:true,sameSite:'Lax'}]);
    async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode();}));});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await visit('/game/profile');measurements.push(await page.locator('.profile-identity').evaluate(e=>({identity:e.getBoundingClientRect().toJSON(),text:e.querySelector('div')!.getBoundingClientRect().toJSON(),nav:document.querySelector('.primary-nav')!.getBoundingClientRect().toJSON()})));
    await page.screenshot({path:out+`/profile-${width}-${label}.png`});captures.push({screen:'profile',width,side:label,scroll:0,zoom:1,sameFixture:true});
    await visit('/game/home?feed=comments');const message=page.locator('.message-text').filter({hasText:text});assert.equal(await message.count(),1);await message.scrollIntoViewIfNeeded();await page.screenshot({path:out+`/comments-${width}-${label}.png`});
    if(after){assert.equal(await message.innerText(),text);assert.equal(await message.evaluate(e=>getComputedStyle(e).color),'rgb(236, 229, 215)');assert.ok(await message.evaluate(e=>getComputedStyle(e).backgroundImage.includes('41, 39, 36')));}
    await visit('/game/battle');await page.screenshot({path:out+`/battle-${width}-${label}.png`});
    if(after){const labels=await page.locator('.bounty-target>span:first-of-type').allTextContents();for(const key of ['Freeblade','Warden','Spellward'])assert.ok(!labels.some(s=>s.includes(key)));for(const name of ['Barbarian','Tank','Mage'])assert.ok(labels.some(s=>s.includes(name)),name+' is rendered from the stored key');}
    if(width===390)for(const [p,key,file] of people){await visit('/game/players/'+p.id);const img=page.locator('.profile-identity>img');assert.equal(await img.getAttribute('alt'),callingName(key)+(after?' silhouette':' portrait'));assert.deepEqual(await img.evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),{width:60,height:60});await img.screenshot({path:out+`/silhouette-${file}-${label}-60.png`});await page.locator('.profile-identity').screenshot({path:out+`/identity-${file}-${label}.png`});
     if(after){assert.match((await img.getAttribute('src'))!,new RegExp('/class-silhouettes-1/'+file+'\\.svg$'));const alpha=await img.evaluate(e=>{const c=document.createElement('canvas');c.width=c.height=180;const x=c.getContext('2d')!;x.drawImage(e as HTMLImageElement,0,0,180,180);const pixels=x.getImageData(0,0,180,180).data;return {corners:[0,179,180*179,180*180-1].map(i=>pixels[i*4+3]),transparent:Array.from({length:180*180},(_,i)=>pixels[i*4+3]===0).filter(Boolean).length};});assert.deepEqual(alpha.corners,[0,0,0,0]);assert.ok(alpha.transparent>180*180*.35,'Silhouette has real open alpha, no baked portrait square');}
    }
   }
   if(baseline)assert.deepEqual(measurements[0],measurements[1],'Profile identity text, slot and navigation keep their exact layout');await context.close();
  }
  assert.deepEqual((await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id')).rows,wallets);assert.deepEqual((await r.db.query('SELECT id,snapshot,result FROM battles ORDER BY id')).rows,historicalBattles);assert.equal((await r.db.query('SELECT enabled FROM achievement_gold_state')).rows[0]!.enabled,false);assert.deepEqual(errors,[]);
  for(const file of ['freeblade','warden','spellward']){const svg=await readFile('public/art/class-silhouettes-1/'+file+'.svg','utf8');assert.doesNotMatch(svg,/<(?:image|script|foreignObject|rect)\b/i);}
  await writeFile(out+'/visual-evidence.json',JSON.stringify({sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseline:baseline?'e508bca1cef210f0eb8816d68c35d718f10bf9c5':null,actualChromium:true,captures,profileGeometryUnchanged:true,viewedClassNotViewer:true,realAlpha:true,walletsAndHistoricalBattlesUnchanged:true},null,2)+'\n');
 }finally{await browser.close();for(const app of apps)await app.close();await r.close();}
});
