// Disposable PostgreSQL and localhost HTTP only. --before runs the same fixture
// against the pinned baseline checkout; no source injection or DOM art swapping.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {syntheticCutover} from '../tests/level100-e2b-fixture.js';
import {createApp} from '../src/app.js';import {loadConfig} from '../src/config.js';
import {transaction} from '../src/db.js';import {expandedContent,definitionDigest} from '../src/expansion-content.js';
import {equipmentPresentation,presentationDigest} from '../src/equipment-presentation.js';
import {purchaseItems} from '../src/inventory.js';import {buyEstate} from '../src/estate.js';
if(!testDatabaseUrl)throw Error('Disposable *_test database required');
const before=process.argv.includes('--before'),evidence=process.argv.includes('--evidence'),stage=before?'before':'after';
const out=process.env.HISTORICAL_BROWSER_OUT??'test-results/historical-priority/'+stage;await mkdir(out,{recursive:true});
const now=new Date('2038-05-01T12:00:00Z'),r=await realm({isolated:true,clock:()=>now});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox']}),errors:string[]=[],views:unknown[]=[];
try{
 const actor=await r.player('Artwork Review'),target=await r.player('Review Rival');
 for(const p of[actor,target]){await r.db.query('UPDATE characters SET attained_level=100 WHERE id=$1',[p.id]);await r.prepare(p,200000000);await r.ok(p,'/api/v1/tutorial',{action:'skip'});}
 await syntheticCutover(r.db,false);const activation=(await r.db.query('SELECT id FROM realm_expansion_state')).rows[0]!.id;
 await transaction(r.db,async sql=>{
  await sql.query("INSERT INTO realm_expansion_events(id,kind,manifest_id,approval_digest,details) VALUES($1,'activate','level100-expansion-1',$2,$3)",[activation,'a'.repeat(64),{equipmentPresentation:{id:equipmentPresentation.id,digest:presentationDigest(),reviewed:true}}]);
  await purchaseItems(sql,actor.id,100,Object.fromEntries(expandedContent.items.filter(i=>i.acquisition!=='quest-exclusive').map(i=>[i.id,1])),randomUUID(),now);
  await purchaseItems(sql,target.id,100,{'eclipse-war-marshal-plate':1,'eclipse-gatehammer':1},randomUUID(),now);
  for(const property of expandedContent.properties)await buyEstate(sql,actor.id,100,property.id,1,randomUUID(),now);
 });
 const receipt=(await r.ok(actor,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:1})).commandId;
 const battle=(await r.ok(actor,'/api/v1/battles',{targetCharacterId:target.id})).battleId;
 const snapshot=async()=>{const result:Record<string,unknown>={};for(const table of ['wallets','land_holdings','inventory_entries','inventory_lots','inventory_transactions','equipment_slots','battles','command_receipts','realm_expansion_state']){
   assert.ok((await r.db.query('SELECT to_regclass($1) AS present',[table])).rows[0]!.present,'required preservation table '+table);
   result[table]=(await r.db.query('SELECT row_to_json(t) AS row FROM '+table+' t ORDER BY row_to_json(t)::text')).rows;
  }return definitionDigest(result);};
 // Warm authoritative settlement and view paths before the preservation check.
 for(const url of ['/game/profile','/game/players/'+actor.id,'/game/battles/'+battle])await r.app.inject({url,headers:{cookie:actor.cookie}});
 const saved=await snapshot();
 for(const [width,dpr,textScale] of [[320,1,1],[390,2,1],[430,3,1],[1280,1,1],[320,2,1.25]]){
  const context=await browser.newContext({viewport:{width:width!,height:900},deviceScaleFactor:dpr,reducedMotion:'reduce',isMobile:width!<700,hasTouch:width!<700});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const [name,path,selector] of [
   ['weapons','/game/armory?category=weapon','.market-catalog'],['armor','/game/armory?category=armor','.market-catalog'],['spells','/game/armory?category=spell','.market-catalog'],
   ['inventory','/game/profile','.profile-inventory'],['profile-land','/game/profile','.profile-estate'],['public-equipment','/game/players/'+actor.id,'.profile-inventory'],
   ['land-catalog','/game/land','#property-marcher-stronghold'],['bulk','/game/armory?category=weapon&bulk=iron-sword#bulk-trade','#bulk-trade'],
   ['receipt','/game/purchases/'+receipt,'.receipt-item'],['battle','/game/battles/'+battle,'.battle-armies'],
  ]){
   assert.equal((await page.goto(origin+path))?.status(),200,path);
   await page.evaluate(async scale=>{await document.fonts.ready;document.documentElement.style.fontSize=(16*scale!)+'px';for(const image of document.querySelectorAll('img'))image.loading='eager';await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));},textScale);
   await page.locator(selector!).first().scrollIntoViewIfNeeded();
   assert.equal(await page.locator('.primary-nav a').count(),5);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1,JSON.stringify({width,name,overflow}));
   const broken=await page.locator('img.catalog-art').evaluateAll(images=>images.filter(i=>!(i as HTMLImageElement).naturalWidth).map(i=>(i as HTMLImageElement).src));assert.deepEqual(broken,[]);
   const frames=await page.locator('.equipment-art-frame').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),child=el.firstElementChild!,cs=getComputedStyle(child);return {width:r.width,height:r.height,border:s.borderTopWidth,innerBorder:cs.borderTopWidth,fit:cs.objectFit};}));
   if(!before){assert.ok(frames.every(f=>f.width===f.height&&f.border==='1px'&&f.innerBorder==='0px'&&f.fit==='contain'),JSON.stringify({name,width,frames}));
    for(const scope of ['.market-catalog','.profile-inventory','.battle-armies','.bulk-item-art','.receipt-item']){
     const sizes=await page.locator(scope+' .equipment-art-frame:not(.equipment-art-small)').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width));
     if(sizes.length)assert.ok(sizes.every(size=>size===sizes[0]),JSON.stringify({name,width,scope,sizes}));
    }
    const misplaced=await page.locator('.equipment-preview > summary').evaluateAll(es=>es.filter(e=>{const frame=e.querySelector('.equipment-art-frame')?.getBoundingClientRect(),quantity=e.querySelector('strong')?.getBoundingClientRect();return frame&&quantity&&quantity.top<frame.bottom-1;}).length);
    assert.equal(misplaced,0,'ownership labels stay below equipment');
    const overlaps=await page.locator('.market-catalog .catalog-row').evaluateAll(es=>es.filter(e=>{const frame=e.querySelector('.equipment-art-frame')?.getBoundingClientRect(),link=e.querySelector('.market-bulk-link')?.getBoundingClientRect();return frame&&link&&Math.min(frame.right,link.right)>Math.max(frame.left,link.left)&&Math.min(frame.bottom,link.bottom)>Math.max(frame.top,link.top);}).length);
    assert.equal(overlaps,0,'Bulk click targets do not obscure equipment');
   }
   if(name==='profile-land'){
    const marcher=page.locator('.owned-property').filter({hasText:'Marcher Stronghold'});await marcher.scrollIntoViewIfNeeded();
    if(!before)assert.equal(await marcher.locator('img').getAttribute('src'),'/assets/art/regional-weapon-land-1/marcher-stronghold.webp');
   }
   if(evidence&&textScale===1)await page.screenshot({path:out+'/'+width+'-'+name+'.png',animations:'disabled'});
   views.push({name,width,dpr,textScale,frames:frames.length,overflow});
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.equal(await snapshot(),saved,'views preserve finances, quantities, receipts, activation and saved combat');
 await writeFile(out+'/verification.json',JSON.stringify({passed:true,stage,productionContacted:false,views,errors,businessRowsPreserved:true},null,2)+'\n');
 console.log('HISTORICAL_PRIORITY_BROWSER: PASS '+views.length+' views; '+stage);
}finally{await browser.close();await app.close();await r.close();}
