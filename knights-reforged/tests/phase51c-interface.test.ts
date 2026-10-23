import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {realm,testDatabaseUrl} from './helpers.js';
import {guideSteps} from '../src/guide.js';
import {alpha} from '../src/alpha-rules.js';
const skip=!testDatabaseUrl;

test('Stamina is a presentation rename: installed definitions, lesson identities and old API keys stay intact',()=>{
 assert.deepEqual(guideSteps.map(s=>s.id),['quest','rewards','equipment','automatic','attack','victory','land','skills']);
 assert.equal(alpha.combat.spiritCost,1);assert.ok(alpha.resources.spirit>0);
 const templates=['resources','calling','attack-again'].map(name=>readFileSync('views/partials/'+name+'.ejs','utf8')).join('');
 assert.doesNotMatch(templates,/\bSpirit\b/);assert.match(templates,/Stamina/);assert.match(templates,/spirit/);
});

test('profiles disclose authoritative weapon/armor/spell stats without exposing private inventory entries',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Éowyn of Dawn'),b=await r.player('Profile Visitor');await r.prepare(a,30000,2500);
  for(const category of ['weapon','armor','spell']){const item=alpha.items.find(i=>i.category===category)!;await r.ok(a,'/api/v1/inventory/purchases',{itemId:item.id,quantity:2});}
  const state=await r.me(a),saved=(await r.db.query('SELECT * FROM inventory_lots WHERE character_id=$1 ORDER BY id',[a.id])).rows;
  for(const [url,cookie] of [['/game/profile',a.cookie],['/game/players/'+a.id,b.cookie]]){
   const page=await r.app.inject({url,headers:{cookie}});assert.equal(page.statusCode,200,page.body);assert.equal((page.body.match(/data-equipment-preview/g)||[]).length,3);
   for(const category of ['weapon','armor','spell']){const item=alpha.items.find(i=>i.category===category)!;assert.ok(page.body.includes('Inspect '+item.name.replaceAll("'",'&#39;')+', owned 2'));assert.match(page.body,/<dt>Unlock level<\/dt>/);assert.match(page.body,/<dt>Upkeep<\/dt>/);}
   for(const row of saved)assert.ok(!page.body.includes(row.id));assert.ok(!page.body.includes(a.accountId));assert.match(page.body,/<summary aria-label="Inspect/);
  }
  const outsider=await r.app.inject({url:'/api/v1/players/'+a.id,headers:{cookie:b.cookie}});assert.equal(outsider.statusCode,200);
  assert.ok(!JSON.stringify(outsider.json()).includes(a.accountId));assert.equal((await r.me(a)).gold,state.gold);
  assert.deepEqual((await r.db.query('SELECT * FROM inventory_lots WHERE character_id=$1 ORDER BY id',[a.id])).rows,saved);
 }finally{await r.close();}
});

test('optional Calling introduction preserves all eight tutorial cursors, completed/skip/replay states and existing costs',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Calling Apprentice');await r.prepare(a,1000);
  await r.ok(a,'/api/v1/tutorial',{action:'start'});
  await r.db.query('UPDATE tutorial_guides SET step_index=4 WHERE character_id=$1',[a.id]);
  const page=await r.app.inject({url:'/game/tutorial',headers:{cookie:a.cookie}});assert.match(page.body,/Optional: choose your Calling/);assert.match(page.body,/first change is free/);assert.match(page.body,/Next Lesson/);
  const changed=await r.app.inject({method:'POST',url:'/game/profile/calling',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{csrf:a.csrf,commandId:crypto.randomUUID(),className:'Warden',returnTo:'tutorial'}});
  assert.equal(changed.statusCode,303,changed.body);assert.match(changed.headers.location!,/^\/game\/tutorial\?command=/);assert.equal((await r.me(a)).gold,1000+alpha.startingGold);assert.equal((await r.me(a)).className,'Warden');
  assert.equal((await r.command(a,'/api/v1/profile',{className:'Spellward'})).json().error.code,'CALLING_COOLDOWN');
  assert.equal((await r.db.query('SELECT step_index FROM tutorial_guides WHERE character_id=$1',[a.id])).rows[0]!.step_index,4);
  await r.ok(a,'/api/v1/tutorial',{action:'next'});await r.ok(a,'/api/v1/tutorial',{action:'skip'});
  assert.equal((await r.db.query('SELECT tutorial_status FROM player_preferences WHERE character_id=$1',[a.id])).rows[0]!.tutorial_status,'skipped');
  await r.ok(a,'/api/v1/tutorial',{action:'resume'});for(let i=0;i<8;i++)await r.ok(a,'/api/v1/tutorial',{action:'next'});await r.ok(a,'/api/v1/tutorial',{action:'finish'});
  assert.equal((await r.db.query('SELECT tutorial_status FROM player_preferences WHERE character_id=$1',[a.id])).rows[0]!.tutorial_status,'completed');
  await r.ok(a,'/api/v1/tutorial',{action:'replay'});const before=(await r.db.query('SELECT * FROM tutorial_steps WHERE character_id=$1 ORDER BY step_id',[a.id])).rows;
  await r.app.inject({url:'/game/tutorial',headers:{cookie:a.cookie}});assert.deepEqual((await r.db.query('SELECT * FROM tutorial_steps WHERE character_id=$1 ORDER BY step_id',[a.id])).rows,before);
  const unauth=await r.app.inject({method:'POST',url:'/game/profile/calling',payload:{className:'Freeblade',returnTo:'tutorial'}});assert.equal(unauth.statusCode,403);
 }finally{await r.close();}
});

test('bulk views keep authoritative prices, recorded resale, quantity controls and exactly-once transactions',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const p=await r.player('Bulk Trader');await r.prepare(p,10000,2500);
  for(const url of ['/game/armory?category=weapon&bulk=iron-sword','/game/land?bulk=smallholding']){
   const view=await r.app.inject({url,headers:{cookie:p.cookie}});assert.equal(view.statusCode,200,view.body);const bulk=view.body.slice(view.body.indexOf('id="bulk-trade"'),view.body.indexOf('</section>',view.body.indexOf('id="bulk-trade"')));
   assert.match(bulk,/bulk-item-art/);assert.match(bulk,/catalog-art/);assert.match(bulk,/data-bulk-mode="buy"/);assert.match(bulk,/data-bulk-mode="sell"/);assert.match(bulk,/data-quantity-preset="max"/);assert.match(bulk,/name="csrf"/);assert.match(bulk,/name="commandId"/);
  }
  const before=await r.me(p),buyKey=crypto.randomUUID();const buy=await Promise.all([r.ok(p,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:5},buyKey),r.ok(p,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:5},buyKey)]);
  assert.equal(buy[0].commandId,buy[1].commandId);const bought=await r.me(p);assert.equal(before.gold-bought.gold,5*alpha.items.find(i=>i.id==='iron-sword')!.price);
  const sellKey=crypto.randomUUID(),refund=bought.inventory.find(i=>i.id==='iron-sword')!.resaleSteps![4]!;await Promise.all([r.ok(p,'/api/v1/inventory/sales',{itemId:'iron-sword',quantity:5},sellKey),r.ok(p,'/api/v1/inventory/sales',{itemId:'iron-sword',quantity:5},sellKey)]);
  assert.equal((await r.me(p)).gold-bought.gold,refund);assert.ok(refund<buy[0]!.data.goldSpent);
  const land=(await r.me(p)).land.properties.find(i=>i.id==='smallholding')!,cost=land.priceSteps.slice(0,5).reduce((sum,n)=>sum+n,0),gold=(await r.me(p)).gold,key=crypto.randomUUID();
  await Promise.all([r.ok(p,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:5},key),r.ok(p,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:5},key)]);assert.equal(gold-(await r.me(p)).gold,cost);
  assert.equal((await r.command(p,'/api/v1/inventory/sales',{itemId:'iron-sword',quantity:1})).statusCode,409);
 }finally{await r.close();}
});

test('equipment disclosure escapes saved names and reads stats from the catalog instead of forged item properties',async()=>{
 const {renderFile}=await import('ejs'),item=alpha.items[0]!;
 const html=await renderFile(new URL('../views/partials/equipment-preview.ejs',import.meta.url).pathname,{alpha,item:{...item,name:'Éowyn <img src=x onerror="unsafe()">',quantity:7,attack:9999999},category:{id:'weapon'}});
 assert.match(html,/Éowyn &lt;img/);assert.doesNotMatch(html,/<img src=x|9999999/);assert.match(html,/<dt>Attack<\/dt><dd>1<\/dd>/);assert.match(html,/<dt>Owned<\/dt><dd>7<\/dd>/);
});

test('legacy spirit payloads and receipts replay unchanged while current notices consistently say Stamina',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Spirit of Dawn');await r.prepare(a,0,2500);const key=crypto.randomUUID(),before=await r.me(a),result=await r.ok(a,'/api/v1/skills',{resource:'spirit'},key);
  assert.match(result.message,/Maximum Stamina increased/);const after=await r.me(a);assert.equal(after.maxSpirit,before.maxSpirit+1);assert.equal(after.spirit,before.spirit+1);assert.ok(!('stamina' in after));
  await r.db.query("UPDATE command_receipts SET result=jsonb_set(result,'{message}',to_jsonb('Maximum spirit increased by 1.'::text)) WHERE account_id=$1 AND command_id=$2",[a.accountId,key]);
  const replay=await r.ok(a,'/api/v1/skills',{resource:'spirit'},key);assert.equal(replay.message,'Maximum spirit increased by 1.');assert.equal((await r.me(a)).maxSpirit,after.maxSpirit);
  const page=await r.app.inject({url:'/game/profile?tab=skills&command='+key,headers:{cookie:a.cookie}});assert.match(page.body,/Maximum Stamina increased by 1/);assert.match(page.body,/Spirit of Dawn/);
 }finally{await r.close();}
});
