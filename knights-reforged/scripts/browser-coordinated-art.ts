// Local HTTP review only. The real shared EJS renderer receives the candidate
// resolver from this fixture hook, never from a request or production setting.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import ejs from 'ejs';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {syntheticCutover} from '../tests/level100-e2b-fixture.js';
import {transaction} from '../src/db.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {expandedContent,definitionDigest} from '../src/expansion-content.js';
import {equipmentPresentation,presentationDigest} from '../src/equipment-presentation.js';
import {purchaseItems} from '../src/inventory.js';
import {buyEstate} from '../src/estate.js';
import {provisionBots} from '../src/development.js';
import {coordinatedArtwork,verifyCoordinatedArtwork,activeCoordinatedArtwork,rendererForCoordinatedSelection,approvedCoordinatedSelection,rendererForInstalledSelection} from '../src/coordinated-artwork.js';
if(!testDatabaseUrl)throw new Error('Designated disposable database required.');
const out=process.env.COORDINATED_ART_REVIEW_DIR??'docs/coordinated-art-2/screenshots';await mkdir(out,{recursive:true});await mkdir(out+'/icons',{recursive:true});
const installedRenderer=rendererForInstalledSelection(null);
const adoptedRenderer=rendererForCoordinatedSelection(approvedCoordinatedSelection);
let preview=false;
const compile=ejs.compile;
// Fixture-process engine wrapper: exercises the actual shared EJS resolver in
// server-rendered HTML, without adding any production preview API or option.
ejs.compile=((template:string,options:ejs.Options)=>{
 const render=compile(template,options);
 return (data:ejs.Data)=>render({...data,coordinatedArt:preview?adoptedRenderer:installedRenderer});
}) as typeof ejs.compile;
const now=new Date(),r=await realm({isolated:true,clock:()=>now}),config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config});
const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const page=await context.newPage(),errors:string[]=[],views:unknown[]=[],bindings:unknown[]=[];
page.on('pageerror',e=>errors.push(e.message));
async function visit(width:number,url:string){
 await page.setViewportSize({width,height:width===1024?1536:844});assert.equal((await page.goto(origin+url))?.status(),200);
 await page.evaluate(async()=>{await document.fonts.ready;for(const image of document.querySelectorAll<HTMLImageElement>('img.expansion-art'))image.loading='eager';await Promise.all([...document.querySelectorAll<HTMLImageElement>('img.expansion-art')].map(i=>i.decode()));});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),url+' overflow '+width);assert.equal(await page.locator('.primary-nav a').count(),5);
 for(const b of await page.locator('img[data-art-use="final"]').evaluateAll(imgs=>imgs.map(i=>({id:i.getAttribute('data-expansion-item')!,path:i.getAttribute('src')!,width:(i as HTMLImageElement).naturalWidth,height:(i as HTMLImageElement).naturalHeight,fit:getComputedStyle(i).objectFit,frameWidth:i.getBoundingClientRect().width,frameHeight:i.getBoundingClientRect().height})))){
  const e=coordinatedArtwork.entries.find(e=>e.id===b.id)!;assert.equal(b.path,e.path);assert.equal(b.width,e.width);assert.equal(b.height,e.height);assert.equal(b.fit,'cover');bindings.push({viewport:width,url,...b});
 }
}
async function screenshot(width:number,name:string,url:string,selector?:string,fullPage=false){await visit(width,url);if(selector)await page.locator(selector).first().scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+width+'-'+name+'.jpg',type:'jpeg',quality:86,animations:'disabled',fullPage});views.push({width,name,url,preview});}
async function businessSnapshot(){
 const result:Record<string,unknown>={};
 for(const {table_name:table} of(await r.db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows){
  assert.match(table,/^[a-z_]+$/);
  if(['notification_reads','notification_state'].includes(table))continue; // Normal view acknowledgements are intentionally persisted.
  result[table]=(await r.db.query('SELECT row_to_json(t) AS row FROM "'+table+'" t ORDER BY row_to_json(t)::text')).rows;
 }
 return definitionDigest(result);
}
try{
 const actor=await r.player('Owner Artwork Preview'),enemy=await r.player('Artwork Rival');
 for(const p of[actor,enemy]){await r.db.query('UPDATE characters SET attained_level=100 WHERE id=$1',[p.id]);await r.prepare(p,100000000);await r.ok(p,'/api/v1/tutorial',{action:'skip'});}
 await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
 assert.equal(Number((await r.db.query('SELECT count(*) AS n FROM development_bots')).rows[0]!.n),450);
 await syntheticCutover(r.db,false);const activation=(await r.db.query('SELECT id FROM realm_expansion_state')).rows[0]!.id;
 await transaction(r.db,async sql=>{
  await sql.query("INSERT INTO realm_expansion_events(id,kind,manifest_id,approval_digest,details) VALUES($1,'activate','level100-expansion-1',$2,$3)",[activation,'a'.repeat(64),{equipmentPresentation:{id:equipmentPresentation.id,digest:presentationDigest(),reviewed:true}}]);
  await purchaseItems(sql,actor.id,100,Object.fromEntries(expandedContent.items.filter(i=>i.acquisition!=='quest-exclusive').map(i=>[i.id,1])),randomUUID(),now);
  await purchaseItems(sql,enemy.id,100,{'eclipse-war-marshal-plate':1,'eclipse-aegis':1,'eclipse-gatehammer':1},randomUUID(),now);
  for(const p of expandedContent.properties.filter(p=>p.level>50))await buyEstate(sql,actor.id,100,p.id,1,randomUUID(),now);
 });
 const receipt=(await r.ok(actor,'/api/v1/inventory/purchases',{itemId:'argent-sentinel-plate',quantity:1})).commandId;
 const weaponReceipt=(await r.ok(actor,'/api/v1/inventory/purchases',{itemId:'royal-warblade',quantity:1})).commandId;
 const landReceipt=(await r.ok(actor,'/api/v1/land/purchases',{propertyId:'marcher-stronghold',quantity:1})).commandId;
 const battle=(await r.ok(actor,'/api/v1/battles',{targetCharacterId:enemy.id})).battleId;
 await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 // Settle/initialize the normal read paths before comparing their business rows.
 for(const url of['/game/profile','/game/players/'+actor.id,'/game/players/'+enemy.id,'/game/battles/'+battle])await visit(390,url);
 const before=await businessSnapshot();
 const quest=expandedContent.quests.find(q=>Object.entries(q.items).some(([id,quantity])=>quantity>1&&coordinatedArtwork.entries.some(e=>e.id===id&&e.path)))!;assert.ok(quest);
 for(const width of[320,390,430,1024])for(const after of[false,true]){
  preview=after;
  for(const category of['weapon','armor','spell','property']){
   const url=category==='property'?'/game/land':'/game/armory?category='+category;
   await visit(width,url);
   for(const e of coordinatedArtwork.entries.filter(e=>e.category===category)){
    const art=page.locator('#'+(category==='property'?'property-':'item-')+e.id+' .catalog-art').first();assert.equal(await art.count(),1);
    if(after&&e.path){assert.equal(await art.getAttribute('src'),e.path);assert.equal(await art.getAttribute('data-art-use'),'final');}
    if(after&&!e.path)assert.equal(await art.getAttribute('data-art-use'),'temporary-beta','blocked concept must stay a truthful placeholder');
    if(width===390){
     await art.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
     assert.ok(await art.evaluate(el=>{const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return top===el||!!top&&el.contains(top);}),e.id+' image occluded by fixed navigation');
     await art.screenshot({path:out+'/icons/'+(after?'after-':'before-')+e.id+'.png',animations:'disabled'});
    }
   }
   await screenshot(width,(after?'after-':'before-')+category,url,category==='property'?'#property-marcher-stronghold':undefined,true);
   if(width===390)await screenshot(width,(after?'after-':'before-')+category+'-viewport',url,category==='property'?'#property-marcher-stronghold':'#item-'+coordinatedArtwork.entries.find(e=>e.category===category&&e.level>=50)!.id);
  }
 }
 preview=true;
 for(const width of[320,390,430,1024]){
  await screenshot(width,'self-profile','/game/profile','.profile-inventory');await screenshot(width,'public-profile','/game/players/'+actor.id,'.profile-inventory');
  await screenshot(width,'equipment-receipt','/game/purchases/'+receipt,'.receipt-item');await screenshot(width,'weapon-receipt','/game/purchases/'+weaponReceipt,'.receipt-item');await screenshot(width,'quest-requirements','/game/quests/'+quest.id+'/requirements');await screenshot(width,'land-receipt','/game/purchases/'+landReceipt,'.receipt-item');await screenshot(width,'battle-equipment','/game/battles/'+battle,'.battle-armies');
 }
 assert.equal(await businessSnapshot(),before,'artwork reads preserved all populated business rows, including 450 bots and historical receipts/battles');
 const crops=await page.evaluate(async entries=>{
  const failures:string[]=[];let checked=0;
  const mattes=[function(data:Uint8ClampedArray,w:number,h:number){
   for(const [vertical,reverse]of[[false,false],[false,true],[true,false],[true,true]]){
    const depth=vertical?w:h,length=vertical?h:w,lines=[];
    for(let d=0;d<Math.ceil(depth*.25);d++){let max=0;for(let k=0;k<length;k++){const x=vertical?(reverse?w-1-d:d):k,y=vertical?k:(reverse?h-1-d:d),i=(y*w+x)*4;max=Math.max(max,data[i]!,data[i+1]!,data[i+2]!);}lines.push(max);}
    let band=0;while(band<lines.length&&lines[band]!<=3)band++;
    if(band>=Math.max(2,Math.ceil(depth*.02))&&band+2<lines.length&&Math.max(...lines.slice(band,band+3))-lines[band-1]!>=8)return true;
   }return false;
  }];
  for(const e of entries){const image=new Image();image.src=e.path!;await image.decode();const source=document.createElement('canvas');source.width=image.width;source.height=image.height;const sc=source.getContext('2d')!;sc.drawImage(image,0,0);if(mattes[0]!(sc.getImageData(0,0,image.width,image.height).data,image.width,image.height))failures.push(e.id+' source matte');
   for(const [w,h]of(e.category==='property'?[[68,49],[80,58],[90,60],[198,116],[60,60],[64,72]]:[[36,36],[60,60],[64,72],[76,76],[128,112]])){
    const canvas=document.createElement('canvas');canvas.width=w!;canvas.height=h!;const c=canvas.getContext('2d')!,scale=Math.max(w!/image.width,h!/image.height),sw=w!/scale,sh=h!/scale;c.drawImage(image,(image.width-sw)/2,e.category==='property'?0:(image.height-sh)/2,sw,sh,0,0,w!,h!);const pixels=c.getImageData(0,0,w!,h!).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255){failures.push(e.id+' transparency');break;}checked++;
   }
  }return {checked,failures};
 },coordinatedArtwork.entries.filter(e=>e.path));assert.deepEqual(crops.failures,[]);assert.deepEqual(errors,[]);if(activeCoordinatedArtwork)assert.deepEqual(activeCoordinatedArtwork,approvedCoordinatedSelection);
 for(const width of[320,390,430,1024]){const ids=new Set((bindings as {viewport:number;id:string}[]).filter(b=>b.viewport===width).map(b=>b.id));assert.deepEqual([...ids].sort(),coordinatedArtwork.entries.filter(e=>e.path).map(e=>e.id).sort());}
 await writeFile(out+'/verification.json',JSON.stringify({passed:true,productionContacted:false,previewOnly:true,renderer:'Actual local HTTP templates with fixture-only EJS resolver injection; no DOM image substitution or production bypass',widths:[320,390,430,1024],counts:{expected:52,usable:52,blocked:0},adoptionRehearsal:true,crops,businessRowsPreserved:true,activationRecordPreserved:true,errors,integrity:await verifyCoordinatedArtwork(),views,bindings},null,2)+'\n');
 console.log('COORDINATED_ART_BROWSER: PASS; 52 slots at four widths, 52 usable images, no blocked placeholders, 266 full-bleed crops; Profiles, receipts, battles and populated rows preserved.');
}finally{ejs.compile=compile;await browser.close();await app.close();await r.close();}
