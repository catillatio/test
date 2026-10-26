// Real local rendering with disposable grants/drops. No production origin,
// public preview switch, account mutation or artwork generation is involved.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {syntheticCutover,syntheticHudson} from '../tests/level100-e2b-fixture.js';
import {transaction} from '../src/db.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {createSession} from '../src/auth.js';
import {equipmentArtwork,equipmentArtworkDigest,verifyEquipmentArtwork} from '../src/equipment-artwork.js';
import {equipmentPresentation,presentationDigest} from '../src/equipment-presentation.js';
import {expandedContent,definitionDigest} from '../src/expansion-content.js';
import {inspectHudson,provisionHudson} from '../src/hudson-provision.js';
import {questEquipmentDrops} from '../src/quest-equipment.js';
import {refreshMaintenance} from '../src/maintenance.js';
import {readInventory} from '../src/inventory.js';
import {profileBusinessSnapshot} from '../tests/classic-profile-fixture.js';
import {historicalClaim} from '../tests/phase6-fixtures.js';
if(!testDatabaseUrl)throw Error('Designated disposable *_test database required.');
const out=process.env.EQUIPMENT_CLEANUP_REVIEW_DIR??'docs/claim-statistics-artwork/screenshots';
await mkdir(out,{recursive:true});
const now=new Date(),r=await realm({isolated:true,clock:()=>now});
let app:Awaited<ReturnType<typeof createApp>>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const views:unknown[]=[],bindings:unknown[]=[],errors:string[]=[];
try{
 await verifyEquipmentArtwork();
 const actor=await r.player('Equipment Collector'),patron=await r.player('Historical Patron'),h=await syntheticHudson(r.db);
 await r.db.query('UPDATE characters SET attained_level=100 WHERE id=ANY($1::uuid[])',[[actor.id,h.id]]);
 await r.prepare(actor,100000);await r.ok(actor,'/api/v1/tutorial',{action:'skip'});
 await syntheticCutover(r.db);
 const activation=(await r.db.query('SELECT id FROM realm_expansion_state')).rows[0]!.id;
 await transaction(r.db,sql=>sql.query("INSERT INTO realm_expansion_events(id,kind,manifest_id,approval_digest,details) VALUES($1,'activate','level100-expansion-1',$2,$3)",[activation,'a'.repeat(64),{equipmentPresentation:{id:equipmentPresentation.id,digest:presentationDigest(),reviewed:true}}]));
 const plan=await inspectHudson(r.db);
 await provisionHudson(r.db,plan,definitionDigest(plan));
 // Exercise the same quest-only acquisition and normal upkeep primitives as
 // authoritative quest commands, inside this test-only disposable fixture.
 await transaction(r.db,async sql=>{
  const id=randomUUID();await sql.query('INSERT INTO quest_runs(id,character_id,quest_id,ruleset_id,energy_spent,gold_reward,xp_reward) VALUES($1,$2,$3,$4,1,0,0)',[id,actor.id,'defend-the-hundred-kingdoms',expandedContent.id]);
  const drops=await questEquipmentDrops(sql,actor.id,id,randomUUID(),now,()=>0);assert.equal(drops.length,3);
  await refreshMaintenance(sql,actor.id,randomUUID(),now);
 });
 const mine=await readInventory(r.db,h.id),ordinary=await readInventory(r.db,actor.id);
 assert.equal(mine.length,3);assert.ok(mine.every(i=>i.quantity===15&&i.effectiveUpkeep===0&&i.maintenanceExempt));
 assert.ok(ordinary.every(i=>i.quantity===1&&!i.maintenanceExempt));
 assert.equal((await r.db.query('SELECT hourly_rate FROM maintenance_accounts WHERE character_id=$1',[actor.id])).rows[0]!.hourly_rate,510);
 const battle=await r.ok(actor,'/api/v1/battles',{targetCharacterId:h.id});
 const session=await createSession(r.db,h.accountId),hudsonCookie='kr_session='+session.token;
 const hudson={...h,cookie:hudsonCookie,csrf:''};
 await historicalClaim(r.db,hudson,actor,patron,'legacy_claim');
 await historicalClaim(r.db,hudson,actor,patron,'finishing_claim');
 await historicalClaim(r.db,actor,hudson,patron,'legacy_claim');
 const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'});
 app=await createApp({db:r.db,config});const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',e=>{if(e.status()>=400&&new URL(e.url()).pathname.startsWith('/assets/'))errors.push('Missing local asset');});
 async function visit(width:number,name:string,path:string,cookie:string,selector?:string){
  await context.addCookies([{name:'kr_session',value:cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
  await page.setViewportSize({width,height:width===1024?1000:844});assert.equal((await page.goto(origin+path))?.status(),200,path);
  await page.evaluate(async()=>{await document.fonts.ready;for(const i of document.querySelectorAll<HTMLImageElement>('img.expansion-art'))i.loading='eager';await Promise.all([...document.querySelectorAll<HTMLImageElement>('img.expansion-art')].map(i=>i.decode()));});
  if(selector)await page.locator(selector).first().scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow '+width);assert.equal(await page.locator('.primary-nav a').count(),5);
  const images=await page.locator('img[data-expansion-item^="king-hudsons-"]').evaluateAll(es=>es.map(el=>({id:el.getAttribute('data-expansion-item'),path:el.getAttribute('src'),fit:getComputedStyle(el).objectFit,width:(el as HTMLImageElement).naturalWidth,height:(el as HTMLImageElement).naturalHeight})));
  assert.ok(images.length>0,name+' must show the actual owned Hudson equipment');
  for(const i of images){const asset=equipmentArtwork.entries.find(e=>e.id===i.id)!;assert.equal(i.path,asset.path);assert.equal(i.fit,'cover');assert.equal(i.width,512);assert.equal(i.height,512);bindings.push({viewport:width,view:name,...i});}
  if(name.includes('profile')){
   assert.deepEqual(await page.locator('[data-profile-stats] dt').allTextContents(),['Kills','Battles Won','Deaths','Battles Lost','Quests','Initiated for']);
   assert.deepEqual(await page.locator('[data-profile-income] dt').allTextContents(),['Total Income','Upkeep','Net Income']);
   if(name!=='ordinary-profile'){const values=await page.locator('[data-profile-stats] dd').allTextContents();assert.equal(values[0],'2');assert.equal(values[2],'1');}
  }
  if(width===390)await page.screenshot({path:out+'/'+width+'-'+name+'.jpg',type:'jpeg',quality:87,animations:'disabled'});
  views.push({width,name,images:images.length});
 }
 // Initialize normal lazy settlement/read state before preservation comparison.
 for(const p of[actor,patron,hudson])await r.me(p);
 const before=await profileBusinessSnapshot(r.db);
 for(const width of[320,390,430,1024]){
  for(const category of['weapon','armor','spell'])await visit(width,'armory-'+category,'/game/armory?category='+category,hudsonCookie,'#item-king-hudsons-'+({weapon:'sword',armor:'shield',spell:'meteor-shower'}[category]));
  await visit(width,'self-profile','/game/profile',hudsonCookie,'.profile-inventory');
  await visit(width,'public-profile','/game/players/'+h.id,actor.cookie,'.profile-inventory');
  await visit(width,'ordinary-profile','/game/profile',actor.cookie,'.profile-inventory');
  await visit(width,'saved-battle','/game/battles/'+battle.battleId,actor.cookie,'.battle-armies');
 }
 const crops=await page.evaluate(async assets=>{
  const checks:unknown[]=[],failures:string[]=[];
  for(const asset of assets){const im=new Image();im.src=asset.path;await im.decode();
   for(const [w,h]of[[36,36],[60,60],[64,72],[76,76],[62,60],[68,61],[128,112]]){
    const canvas=document.createElement('canvas');canvas.width=w!;canvas.height=h!;const ctx=canvas.getContext('2d')!,scale=Math.max(w!/im.width,h!/im.height),sw=w!/scale,sh=h!/scale;ctx.drawImage(im,(im.width-sw)/2,(im.height-sh)/2,sw,sh,0,0,w!,h!);
    for(const [x,y,ew,eh]of[[0,0,w!,1],[0,h!-1,w!,1],[0,0,1,h!],[w!-1,0,1,h!]]){const data=ctx.getImageData(x!,y!,ew!,eh!).data;let maximum=0;for(let n=0;n<data.length;n+=4)maximum=Math.max(maximum,data[n]!,data[n+1]!,data[n+2]!);if(maximum<=3)failures.push(asset.id+' '+w+'x'+h+' artificial black edge');}
    checks.push({id:asset.id,width:w,height:h});
   }
  }return {checks,failures};
 },equipmentArtwork.entries.map(e=>({id:e.id,path:e.path})));
 assert.deepEqual(crops.failures,[]);assert.deepEqual(errors,[]);
 assert.deepEqual(await profileBusinessSnapshot(r.db),before,'rendering never rewrites granted quantities, entitlements, combat records or financial history');
 await writeFile(out+'/verification.json',JSON.stringify({passed:true,productionContacted:false,registry:equipmentArtwork.id,digest:equipmentArtworkDigest,views,bindings,crops,errors,hudsonQuantities:[15,15,15],hudsonUpkeep:0,ordinaryUpkeep:510,businessRowsUnchanged:true},null,2)+'\n');
 console.log('EQUIPMENT_CLEANUP_BROWSER: PASS; 28 views, 21 full-bleed crops, existing 15/15/15 grant and upkeep entitlements preserved.');await context.close();
}finally{await browser?.close();await app?.close();await r.close();}
