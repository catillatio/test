// Design-only local sandbox. No runtime import, public switch, registry adoption,
// source asset edit, gameplay formula change or production connection exists.
import ejs from 'ejs';import assert from 'node:assert/strict';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve} from 'node:path';
import {chromium} from 'playwright-core';import {competitionFixture} from '../tests/phase6-fixtures.js';import {syntheticCutover} from '../tests/level100-e2b-fixture.js';import {testDatabaseUrl} from '../tests/helpers.js';import {createApp} from '../src/app.js';import {loadConfig} from '../src/config.js';import {transaction} from '../src/db.js';
import {expandedContent,definitionDigest} from '../src/expansion-content.js';import {equipmentPresentation,presentationDigest,presentedItem,presentationArt} from '../src/equipment-presentation.js';import {coordinatedArtwork} from '../src/coordinated-artwork.js';import type {ItemDefinition} from '../src/alpha-rules.js';
if(!testDatabaseUrl)throw Error('Designated disposable *_test database required.');
const out='docs/ui-polish-preview',images=out+'/screenshots';await mkdir(images,{recursive:true});
const policyBefore=presentationDigest(),catalogBefore=definitionDigest(expandedContent),artBefore=definitionDigest(coordinatedArtwork);
const base=expandedContent.items.map(i=>presentedItem(i,equipmentPresentation.id)),sourceById=new Map(base.map(i=>[i.id,i]));const skins=new Map(base.map(i=>[i.id,i.id]));
const numerical=(i:ItemDefinition)=>({id:i.id,category:i.category,level:i.level,attack:i.attack,defense:i.defense,price:i.price,upkeep:i.upkeep,acquisition:i.acquisition??'shop'});
const changes:any[]=[];
for(const [category,moved,after,before]of[
 ['weapon',['cinderwyrm-cleaver','moonthorn-recurve','oathbound-greatsword'],'Mountain Warden’s Zweihander','Stormglass Pike'],
 ['armor',['embercrest-bulwark','nightwatch-carapace','oathkeepers-cuirass'],'Moonfen Sentinel Harness','Astral Archon Robes']
]as const){
 const slots=base.filter(i=>i.category===category&&i.acquisition!=='quest-exclusive').sort((a,b)=>a.level-b.level||a.price-b.price),identities=slots.filter(i=>!moved.some(id=>id===i.id));const insert=identities.findIndex(i=>i.name===before);assert.ok(insert>identities.findIndex(i=>i.name===after));identities.splice(insert,0,...moved.map(id=>sourceById.get(id)!));
 assert.equal(new Set(identities.map(i=>i.id)).size,slots.length);assert.equal(identities.length,slots.length);
 for(let n=0;n<slots.length;n++){const target=slots[n]!,skin=identities[n]!;skins.set(target.id,skin.id);if(target.id!==skin.id)changes.push({slot:n,category,targetId:target.id,level:target.level,previousName:target.name,proposedName:skin.name,sourceEntryId:skin.id,unchangedValues:numerical(target)});}
 const names=identities.map(i=>i.name),a=names.indexOf(after),b=names.indexOf(before);assert.ok(moved.every(id=>{const n=names.indexOf(sourceById.get(id)!.name);return n>a&&n<b;}));
}
function skinEntry(entry:ItemDefinition){return sourceById.get(skins.get(entry.id)??entry.id)??entry;}
function remap(entry:ItemDefinition){const skin=skinEntry(entry);return {...entry,name:skin.name};}
assert.ok(base.every(i=>definitionDigest(numerical(i))===definitionDigest(numerical(remap(i)))));
const manifests={id:'ui-polish-presentation-preview-1',status:'mockup-only-not-adopted',activationDefault:false,basePresentation:equipmentPresentation.id,basePresentationDigest:policyBefore,catalogDigest:catalogBefore,method:'Move requested name/art pairs before the named anchor, preserve other pairs relative order, zip to the same ordered numeric slots.',changes};
await writeFile(out+'/presentation-candidate.json',JSON.stringify(manifests,null,2)+'\n');
let candidate=false,screenWindow:'main'|'weapon-late'|'armor-late'='main';
const landIds=coordinatedArtwork.entries.filter(e=>e.category==='property').map(e=>e.id);
const compile=ejs.compile;
ejs.compile=((template:string,options:ejs.Options)=>{const render=compile(template,options);return(data:ejs.Data)=>{
 if(data.__uiPolishPrepared||!data.screen||!data.alpha||!data.state)return render(data);
 const original=data,items=original.alpha.items as ItemDefinition[];
 const shown=items.map(i=>candidate?remap(i):i);
 // Camera windows for review only; no catalogue filter/tab is added to the game.
 const windowed=data.screen==='armory'?shown.filter(i=>i.acquisition==='quest-exclusive'||(screenWindow==='main'?i.level>=12&&i.level<=50:i.level>=50&&i.level<=90)):shown;
 const state={...original.state,land:{...original.state.land,properties:data.screen==='land'?original.state.land.properties.filter((p:ItemDefinition)=>landIds.includes(p.id)):original.state.land.properties},inventory:original.state.inventory.map((i:ItemDefinition)=>candidate?remap(i):i)};
 const coordinatedArt=(entry:ItemDefinition)=>{const result=original.coordinatedArt(candidate?skinEntry(entry):entry);return result?{...result,use:candidate?'mockup-candidate-not-adopted':result.use}:null;};
 const regionalArt=(entry:ItemDefinition)=>original.regionalArt(candidate?skinEntry(entry):entry);
 const art=(entry:ItemDefinition)=>{const result=original.presentationArt(candidate?skinEntry(entry):entry);return {...result,entry:{...result.entry,name:entry.name}};};
 return render({...original,__uiPolishPrepared:true,state,alpha:{...original.alpha,items:windowed},coordinatedArt,regionalArt,presentationArt:art});
};})as typeof ejs.compile;
const r=await competitionFixture();let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,app:Awaited<ReturnType<typeof createApp>>|undefined;
const evidence:any[]=[];const errors:string[]=[];const artworkRequests=new Set<string>();
try{
 const shop=await r.player('Aveline Ashford',100),fighter=await r.player('Aveline of the March',50),target=await r.player('Rowan of the Vale',5),patron=await r.player('Bounty Sponsor',5);
 for(let n=0;n<7;n++){const rival=await r.player(['Cedric Blackthorn','Elowen Stonewatch','Garrick Fenwarden','Isolde Dawnwatch','Rowan Ironmarch','Thrain Crownguard','Morwen Ashford'][n]!,[45,48,49,50,51,52,55][n]!);await r.legacyArmy(rival,n*3);if(n%3)await r.ok(rival,'/api/v1/profile',{className:n%3===1?'Warden':'Spellward'});}
 for(const p of[shop,fighter,target,patron])await r.ok(p,'/api/v1/tutorial',{action:'skip'});await r.prepare(shop,1000000000);await syntheticCutover(r.db,false);
 const activation=(await r.db.query('SELECT id FROM realm_expansion_state')).rows[0]!.id;
 await transaction(r.db,sql=>sql.query("INSERT INTO realm_expansion_events(id,kind,manifest_id,approval_digest,details) VALUES($1,'activate','level100-expansion-1',$2,$3)",[activation,'a'.repeat(64),{equipmentPresentation:{id:equipmentPresentation.id,digest:policyBefore,reviewed:true}}]));
 for(const item of base.filter(i=>i.acquisition!=='quest-exclusive'))await r.ok(shop,'/api/v1/inventory/purchases',{itemId:item.id,quantity:1});
 for(const id of landIds)await r.ok(shop,'/api/v1/land/purchases',{propertyId:id,quantity:1});
 const contract=await r.ok(patron,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000});
 const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'});app=await createApp({db:r.db,config});const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/__ui-polish-preview.css')return route.fulfill({contentType:'text/css',body:await readFile(out+'/polish.css','utf8')});return route.continue();});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',x=>{const path=new URL(x.url()).pathname;if(x.status()>=400&&path.startsWith('/assets/'))errors.push('Missing local asset');if(path.startsWith('/assets/art/'))artworkRequests.add(path);});
 const captures=[['weapons','/game/armory?category=weapon',shop,'main'],['armor','/game/armory?category=armor',shop,'main'],['spells','/game/armory?category=spell',shop,'main'],['rivals','/game/battle',fighter,'main'],['land','/game/land',shop,'main'],['weapons-progression','/game/armory?category=weapon',shop,'weapon-late'],['armor-progression','/game/armory?category=armor',shop,'armor-late'],['bounty-list','/game/bounties',shop,'main']]as const;
 const shotData=new Map<string,any>();
 for(const width of[320,390,430,1024])for(const stage of['before','preview']as const)for(const [name,path,actor,window]of captures){
  if(width!==390&&(name.endsWith('progression')||name==='bounty-list'))continue;
  candidate=stage==='preview';screenWindow=window;await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);await page.setViewportSize({width,height:width===1024?1000:844});assert.equal((await page.goto(origin+path))?.status(),200,path);await page.waitForLoadState('networkidle');
  const unpolishedRows=await page.locator('.market-catalog .catalog-row,.rival-row').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));
  if(candidate){await page.addStyleTag({url:origin+'/__ui-polish-preview.css'});await page.evaluate(()=>document.body.classList.add('ui-polish-preview'));}
  await page.evaluate(async()=>{await document.fonts.ready;const flow=document.querySelector('details.gold-flow');if(flow)flow.removeAttribute('open');});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow '+width);assert.equal(await page.locator('.primary-nav a').count(),5);
  const icons=await page.locator('.market-catalog .catalog-art').evaluateAll(es=>es.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))),rows=await page.locator('.market-catalog .catalog-row,.rival-row').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));
  const rendered=await page.locator('.market-catalog [data-item]').evaluateAll(es=>es.map(e=>({id:e.getAttribute('data-item')!,name:e.querySelector('h2')!.textContent!.trim(),source:e.querySelector('.catalog-art')?.getAttribute('data-art-source'),src:e.querySelector('.catalog-art')?.getAttribute('src')})));
  for(const row of rendered){const entry=sourceById.get(row.id)!,skin=candidate?skinEntry(entry):entry;assert.equal(row.name,skin.name,'exact displayed identity');assert.equal(row.source,presentationArt(skin).entry.id,'exact artwork source');const path=coordinatedArtwork.entries.find(e=>e.id===skin.id)?.path??presentationArt(skin).path;if(path)assert.equal(row.src,path,'exact image path');}
  const info={width,screen:name,stage,icons,rows,rendered};const key=width+':'+name;if(!candidate)shotData.set(key,info);else{const old=shotData.get(key);assert.deepEqual(icons,old.icons,'icon dimensions remain unchanged');assert.ok(rows.every((h,i)=>h<=unpolishedRows[i]!+1),name+' '+width+': styling must not increase row height');}
  assert.ok((await page.locator('.primary-nav a').evaluateAll(es=>es.map(e=>e.getBoundingClientRect()))).every(b=>b.width>=44&&b.height>=44));
  if(name==='bounty-list'){const button=page.getByRole('button',{name:'Hunt '+(await r.me(target)).name});assert.equal(await button.isEnabled(),true,'level-100 may hunt the level-5 target');}
  if(width===390||candidate&&width===1024&&['weapons','land'].includes(name))await page.screenshot({path:images+'/'+width+'-'+stage+'-'+name+'.jpg',type:'jpeg',quality:86,animations:'disabled'});
  if(width===390&&name.endsWith('progression')){
   // Cropped row strips exclude fixed page chrome. Chromium's tall-element
   // capture can otherwise paint offscreen fixed links over the middle row.
   await page.evaluate(()=>document.querySelectorAll<HTMLElement>('.skip-link,.primary-nav').forEach(e=>e.style.visibility='hidden'));
   try{await page.locator('.market-catalog').screenshot({path:images+'/'+width+'-'+stage+'-'+name+'-rows.jpg',type:'jpeg',quality:88,animations:'disabled'});}
   finally{await page.evaluate(()=>document.querySelectorAll<HTMLElement>('.skip-link,.primary-nav').forEach(e=>e.style.removeProperty('visibility')));}
  }
  evidence.push(info);
 }
 // Existing commands, not a mock purchase handler. No live state or receipts.
 candidate=true;await context.addCookies([{name:'kr_session',value:shop.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);screenWindow='main';await page.goto(origin+'/game/armory?category=weapon');const id='cinderwyrm-cleaver',old=(await r.me(shop)).inventory.find(i=>i.id===id)!.quantity;await Promise.all([page.waitForURL(/command=/),page.locator('#item-'+id+' form[data-trade-mode=buy] button[type=submit]').click()]);assert.equal((await r.me(shop)).inventory.find(i=>i.id===id)!.quantity,old+1);
 await transaction(r.db,sql=>sql.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]));const claimed=await r.ok(shop,'/api/v1/battles',{targetCharacterId:target.id,bountyId:contract.data.bountyId});assert.equal((await r.db.query('SELECT result FROM battles WHERE id=$1',[claimed.battleId])).rows[0]!.result.bountyClaim.reward,1000);
 assert.equal(presentationDigest(),policyBefore);assert.equal(definitionDigest(expandedContent),catalogBefore);assert.equal(definitionDigest(coordinatedArtwork),artBefore);assert.deepEqual(errors,[]);
 const used=new Map<string,string>();for(const path of [...artworkRequests].sort()){const local=resolve('public',path.replace(/^\/assets\//,''));used.set(path,createHash('sha256').update(await readFile(local)).digest('hex'));}
 await writeFile(out+'/verification.json',JSON.stringify({passed:true,productionContacted:false,mockupOnly:true,activeRegistriesChanged:false,sourcePolicy:policyBefore,catalog:catalogBefore,artRegistry:artBefore,candidateDigest:definitionDigest(manifests),changedPresentationSlots:changes.length,views:evidence,assetHashes:Object.fromEntries(used),errors,actualFixturePurchase:true,actual100Versus5BountyClaim:true},null,2)+'\n');console.log('PASS: '+evidence.length+' local preview views; fixed icon sizes and row density; real purchase and cross-level bounty claim.');await context.close();
}finally{ejs.compile=compile;await browser?.close();await app?.close();await r.close();}
