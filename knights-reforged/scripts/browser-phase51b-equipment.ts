// Existing atlas vs exact owner-selected CURRENT tiles. Disposable local realm only.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
if(!testDatabaseUrl)throw new Error('Use a designated local disposable *_test database.');
const before=process.argv.includes('--before'),verifyOnly=process.argv.includes('--verify-only'),stage=before?'before':'after';
const out=verifyOnly?'test-results/phase47-browser/phase51b-equipment':'docs/phase51b-selected-equipment/screenshots/'+stage;await mkdir(out,{recursive:true});
const ids=['oathbound-greatsword','crown-of-ash-blade','eclipse-greatsword','sovereigns-bastion','eclipse-citadel-plate'];
const r=await realm({isolated:true,clock:()=>new Date('2026-10-23T21:00:00Z')});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const page=await context.newPage(),errors:string[]=[],views:unknown[]=[],shots:string[]=[];page.on('pageerror',e=>errors.push(e.message));
async function login(cookie:string){await context.addCookies([{name:'kr_session',value:cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);}
async function visit(path:string){assert.equal((await page.goto(origin+path))?.status(),200);await page.evaluate(async()=>{await document.fonts.ready;document.documentElement.style.scrollBehavior='auto';});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('.primary-nav a').count(),5);}
async function inspect(scope:string,id:string,width:number,where:string){
 const name=alpha.items.find(i=>i.id===id)!.name,selector=scope+' [aria-label="'+name+' illustration"]';
 const locator=page.locator(selector).first();assert.ok(await locator.count(),where+': '+id);
 const value=await locator.evaluate(e=>{const s=getComputedStyle(e),b=e.getBoundingClientRect();return{image:s.backgroundImage,size:s.backgroundSize,position:s.backgroundPosition,filter:s.filter,width:b.width,height:b.height,border:s.borderTopWidth,radius:s.borderTopLeftRadius,shadow:s.boxShadow,color:s.backgroundColor,label:e.getAttribute('aria-label')};});
 if(before)assert.ok(value.image.includes('/art/fantasy-0.2/'));else{
  assert.ok(value.image.includes('/art/equipment-51b-current-1/'+id+'.webp'));assert.equal(value.size,'cover');assert.equal(value.filter,'none');assert.equal(value.border,'0px');assert.equal(value.radius,'0px');assert.equal(value.shadow,'none');assert.equal(value.color,'rgba(0, 0, 0, 0)');
  assert.ok(await locator.evaluate(async e=>{const url=/^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(e).backgroundImage)![1]!;const im=new Image();im.src=url;await im.decode();return im.naturalWidth===208&&im.naturalHeight===208;}));
 }
 views.push({stage,viewportWidth:width,where,id,...value,image:value.image.replace(origin,'')});
 if(width===390&&['Armory','Owned Profile','Saved battle loadout','Saved receipt','Missing equipment purchase'].includes(where)){await locator.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest'}));await locator.screenshot({path:out+'/native-'+where.replaceAll(' ','-').toLowerCase()+'-'+id+'.png',animations:'disabled'});}
}
async function shot(width:number,name:string){await page.screenshot({path:out+'/'+width+'-'+name+'.png',animations:'disabled'});shots.push(width+'-'+name+'.png');}
try{
 await page.clock.install({time:new Date('2026-10-23T20:59:00Z')});await page.clock.pauseAt(new Date('2026-10-23T21:00:00Z'));
 const actor=await r.player('Lady Maren Ashford'),other=await r.player('Torin Ironwood'),viewer=await r.player('Elric Stonevale');
 const xp=Array.from({length:49},(_,i)=>levelRequirement(i+1)).reduce((n,x)=>n+x,0);
 for(const p of [actor,other,viewer]){await r.prepare(p,2000000,xp);await r.ok(p,'/api/v1/tutorial',{action:'skip'});}
 await r.legacyArmy(actor,4);
 const receipts:Record<string,string>={};for(const id of ids)receipts[id]=(await r.ok(actor,'/api/v1/inventory/purchases',{itemId:id,quantity:1})).commandId;
 const hit=await r.ok(actor,'/api/v1/battles',{targetCharacterId:other.id});
 const saved=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
 assert.ok(ids.every(id=>saved.attackEquipment.some((item:any)=>item.itemId===id)));
 const financialBefore=await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id');
 const recordsBefore=await r.db.query('SELECT account_id,command_id,result FROM command_receipts ORDER BY account_id,command_id');
 for(const width of (process.argv.includes('--390-only')?[390]:[320,390,430,1024])){
  await page.setViewportSize({width,height:width===1024?1100:844});await login(actor.cookie);
  for(const category of ['weapon','armor']){
   await visit('/game/armory?category='+category);
   for(const id of ids.filter(id=>alpha.items.find(i=>i.id===id)!.category===category))await inspect('.market-catalog',id,width,'Armory');
   await page.locator('#item-'+(category==='weapon'?'oathbound-greatsword':'sovereigns-bastion')).evaluate(e=>e.scrollIntoView({block:'start'}));await shot(width,'armory-'+category);
  }
  await visit('/game/profile');for(const id of ids)await inspect('.profile-inventory-grid',id,width,'Owned Profile');
  await page.locator('.profile-inventory-grid').first().evaluate(e=>e.scrollIntoView({block:'start'}));await shot(width,'profile-equipment');
  await login(viewer.cookie);await visit('/game/players/'+actor.id);for(const id of ids)await inspect('.profile-inventory-grid',id,width,'Public Profile');
  await login(actor.cookie);
  for(const id of ids){await visit('/game/purchases/'+receipts[id]);await inspect('.purchase-receipt',id,width,'Saved receipt');}
  await visit('/game/battles/'+hit.battleId);for(const detail of await page.locator('.additional-equipment').all())await detail.evaluate(e=>e.setAttribute('open',''));
  for(const id of ids)await inspect('.own-equipment',id,width,'Saved battle loadout');
  await page.locator('.battle-armies').evaluate(e=>e.scrollIntoView({block:'start'}));await shot(width,'battle-equipment');
  await login(viewer.cookie);await visit('/game/quests?area=all');
  for(const id of ids){const name=alpha.items.find(i=>i.id===id)!.name;if(await page.locator('.quest-requirements [aria-label="'+name+' illustration"]').count())await inspect('.quest-requirements',id,width,'Quest requirement');}
  await visit('/game/quests/lift-crown-of-ash/requirements');await inspect('.quest-equipment','crown-of-ash-blade',width,'Missing equipment purchase');
 }
 assert.deepEqual((await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result,saved);
 assert.deepEqual((await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id')).rows,financialBefore.rows);
 assert.deepEqual((await r.db.query('SELECT account_id,command_id,result FROM command_receipts ORDER BY account_id,command_id')).rows,recordsBefore.rows);
 assert.deepEqual(errors,[]);
 const file=verifyOnly?'test-results/phase47-phase51b-equipment.json':'docs/phase51b-selected-equipment/'+stage+'-browser.json';
 await writeFile(file,JSON.stringify({passed:true,stage,productionContacted:false,views,shots,errors,preservedSavedBattle:true,preservedWalletsAndReceipts:true},null,2)+'\n');
 console.log('PASS '+stage+' selected equipment: '+views.length+' real-route bindings, '+shots.length+' captures, saved battle/wallets/receipts unchanged');
}finally{await browser.close();await app.close();await r.close();}
