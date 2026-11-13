import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {uiThemeFixture} from './home-theme-fixture.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';

test('Crowns real Chromium: one title, readable compact offers, same-state review and all commerce disabled',{timeout:120000},async()=>{
 const r=await uiThemeFixture(),apps:Awaited<ReturnType<typeof createApp>>[]=[],origins:string[]=[],baseline=process.env.KC_FOCUSED_BASELINE_ROOT;
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const out='test-results/focused-correction/crowns';await mkdir(out,{recursive:true});const captures=[],errors:string[]=[];
 try{
  const factories:typeof createApp[]=[];
  if(baseline){
   // The optional before renderer is an exact local extraction, never a theme
   // switch in the game. Future hosted CI still exercises every current check.
   for(const name of ['views/crowns.ejs','public/realm-iron-brass.css','src/npc-army.ts'])assert.deepEqual(await readFile(baseline+'/'+name),execFileSync('git',['show','536fb2d58d52190b595c03073d8bb29f6b4160c5:knights-reforged/'+name]));
   factories.push((await import(pathToFileURL(baseline+'/src/app.ts').href)).createApp);
  }
  factories.push(createApp);
  for(const factory of factories){const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await factory({db:r.db,config});apps.push(app);const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;origins.push(origin);}
  const before=await r.me(r.owner),wallets=(await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id')).rows;
  for(const width of [320,390,1280]){
   const context=await browser.newContext({viewport:{width,height:width>=768?900:844},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>origins.includes(new URL(route.request().url()).origin)?route.continue():route.abort());
   for(let side=0;side<origins.length;side++){
    const current=side===origins.length-1,origin=origins[side]!;await context.clearCookies();await context.addCookies([{name:'kr_session',value:r.owner.cookie.slice('kr_session='.length),url:origin,httpOnly:true,sameSite:'Lax'}]);
    assert.equal((await page.goto(origin+'/game/crowns'))?.status(),200);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
    const shape=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,heading:[...document.querySelectorAll('h1,h2')].filter(h=>h.textContent?.trim()==='Crowns Market').length,coins:[...document.querySelectorAll('use')].filter(u=>/#coins?$/.test(u.getAttribute('href')??'')).length,offers:document.querySelectorAll('.crown-offer').length,active:document.querySelectorAll('.crown-offer button:enabled').length,broken:[...document.images].filter(i=>!i.naturalWidth).length}));
    if(current){assert.equal(shape.overflow,false);assert.equal(shape.heading,1);assert.equal(shape.coins,1);assert.equal(shape.offers,3);assert.equal(shape.active,0);assert.equal(shape.broken,0);
     for(const offer of await page.locator('.crown-offer').all()){
      const card=await offer.boundingBox(),copy=await offer.locator('.crown-offer-copy').boundingBox(),button=await offer.locator('button').boundingBox();assert.ok(card&&copy&&button);assert.ok(button.x>=card.x&&button.x+button.width<=card.x+card.width+1&&button.y>=copy.y+copy.height-1,'Availability never overlaps or escapes offer copy');
      assert.ok(await offer.locator('h3').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=18));assert.ok(await offer.locator('p').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=13));
     }
    }
    const file=width+'-'+(current?'after':'before')+'.png';await page.screenshot({path:out+'/'+file});await page.screenshot({path:out+'/'+file.replace('.png','-full.png'),fullPage:true});captures.push({width,height:width>=768?900:844,side:current?'after':'before',file,fullPage:file.replace('.png','-full.png'),scrollY:await page.evaluate(()=>scrollY),zoom:1,...shape});
   }
   await context.close();
  }
  const context=await browser.newContext(),page=await context.newPage(),origin=origins.at(-1)!;await context.addCookies([{name:'kr_session',value:r.owner.cookie.slice('kr_session='.length),url:origin,httpOnly:true,sameSite:'Lax'}]);
  await page.goto(origin+'/game/home');await Promise.all([page.waitForURL('**/game/crowns'),page.locator('.home-menu a[href="/game/crowns"]').click()]);
  await page.goto(origin+'/game/settings');assert.ok(await page.locator('main a[href="/rules"]').count()>0);
  for(const url of ['/game/crowns/purchase','/game/crowns/consume','/game/crowns/grant','/api/v1/crowns/purchases','/api/v1/crowns/consumptions','/api/v1/crowns/grants','/api/v1/crowns/refunds'])assert.equal((await r.command(r.owner,url,{})).statusCode,503,url);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM crown_transactions')).rows[0]!.n,0);
  assert.equal((await r.db.query('SELECT balance::text AS n FROM crown_wallets WHERE character_id=$1',[r.owner.id])).rows[0]!.n,'0');
  assert.equal((await r.db.query('SELECT enabled FROM achievement_gold_state')).rows[0]!.enabled,false);
  assert.deepEqual((await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id')).rows,wallets);assert.equal((await r.me(r.owner)).gold,before.gold);assert.deepEqual(errors,[]);
  await page.goto(origin+'/game/crowns');await page.emulateMedia({forcedColors:'active'});assert.equal(await page.locator('.crown-offer[data-crown-offer="mana-refill"] use').evaluate(e=>getComputedStyle(e).opacity),'1');
  await context.close();await writeFile(out+'/captures.json',JSON.stringify({sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseline:baseline?'536fb2d58d52190b595c03073d8bb29f6b4160c5':null,actualChromium:true,sameSyntheticFixture:true,captures,commerceDisabled:true,achievementPayoutsDisabled:true},null,2)+'\n');
 }finally{await browser.close();for(const app of apps)await app.close();await r.close();}
});
