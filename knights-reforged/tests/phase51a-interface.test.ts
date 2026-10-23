import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {ownedProperties} from '../src/profiles.js';
import {hallOfChampions,championCategories} from '../src/competition.js';
import {alpha} from '../src/alpha-rules.js';
import type {CharacterState} from '../src/game.js';
const skip=!testDatabaseUrl;

test('profile ordering uses unlock level and catalog ties; legacy IDs and saved grouped finances survive',()=>{
 const holdings=[
  {propertyId:'retired-z',name:'Old Royal Fields',quantity:2,hourlyIncome:12,hourlyUpkeep:9},
  {propertyId:'copper-workshop',name:'Copper Workshop',quantity:1,hourlyIncome:2,hourlyUpkeep:1},
  {propertyId:'smallholding',name:'Smallholding',quantity:20,hourlyIncome:999,hourlyUpkeep:200},
  {propertyId:'woodland',name:'Woodland',quantity:1,hourlyIncome:1,hourlyUpkeep:0},
  {propertyId:'smallholding',name:'Smallholding',quantity:3,hourlyIncome:31,hourlyUpkeep:4},
  {propertyId:'retired-a',name:'Inherited Orchard',quantity:4,hourlyIncome:7,hourlyUpkeep:2},
 ];
 const state={land:{holdings}} as unknown as CharacterState,before=structuredClone(state),catalog=JSON.stringify(alpha.properties);
 const result=ownedProperties(state);
 assert.deepEqual(result.map(p=>p.id),['smallholding','woodland','copper-workshop','retired-a','retired-z']);
 assert.deepEqual(result.find(p=>p.id==='smallholding')&&[result[0]!.quantity,result[0]!.grossIncome,result[0]!.upkeep],[23,1030,204]);
 assert.equal(result.find(p=>p.id==='retired-z')!.name,'Old Royal Fields');
 assert.equal(result.reduce((n,p)=>n+p.grossIncome-p.upkeep,0),holdings.reduce((n,p)=>n+p.hourlyIncome-p.hourlyUpkeep,0));
 assert.deepEqual(state,before);assert.equal(JSON.stringify(alpha.properties),catalog);
});

test('single/bulk HTML purchases return to exact marketplace; concurrent retries, private receipts and JSON stay safe',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Market Review'),other=await r.player('Receipt Outsider');await r.prepare(a,50000,2500);
  for(const category of ['weapon','armor','spell'])for(const quantity of [1,5]){
   const item=alpha.items.find(i=>i.category===category)!,key=randomUUID(),before=await r.me(a);
   const post={method:'POST' as const,url:'/game/armory/buy',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{itemId:item.id,quantity,csrf:a.csrf,commandId:key}};
   const responses=await Promise.all([r.app.inject(post),r.app.inject(post)]);
   const expected='/game/armory?category='+category+'&command='+key+'#item-'+item.id;
   assert.ok(responses.every(x=>x.statusCode===303&&x.headers.location===expected));
   const after=await r.me(a);assert.equal(after.gold,before.gold-item.price*quantity);
   const page=await r.app.inject({url:expected,headers:{cookie:a.cookie}});assert.equal(page.statusCode,200,page.body);
   assert.match(page.body,new RegExp('Purchased ×'+quantity+' · '+(item.price*quantity).toLocaleString('en')+' gold'));
   assert.match(page.body,/class="market-purchase-feedback" role="status"/);assert.match(page.body,new RegExp('href="/game/purchases/'+key+'"'));
   await r.app.inject({url:expected,headers:{cookie:a.cookie}});assert.equal((await r.me(a)).gold,after.gold);
   const historic=await r.app.inject({url:'/game/purchases/'+key,headers:{cookie:a.cookie}});assert.equal(historic.statusCode,200);assert.match(historic.body,/Buy More/);
   assert.equal((await r.app.inject({url:'/game/purchases/'+key,headers:{cookie:other.cookie}})).statusCode,404);
   const foreign=await r.app.inject({url:expected,headers:{cookie:other.cookie}});assert.doesNotMatch(foreign.body,/class="market-purchase-feedback"/);
  }
  for(const quantity of [1,5]){
   const key=randomUUID(),post={method:'POST' as const,url:'/game/land/buy',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{propertyId:'smallholding',quantity,csrf:a.csrf,commandId:key}};
   const results=await Promise.all([r.app.inject(post),r.app.inject(post)]);
   assert.ok(results.every(x=>x.statusCode===303&&x.headers.location==='/game/land?command='+key+'#property-smallholding'));
   const rows=(await r.db.query('SELECT result FROM command_receipts WHERE account_id=$1 AND command_id=$2',[a.accountId,key])).rows;assert.equal(rows.length,1);
   const page=await r.app.inject({url:String(results[0]!.headers.location),headers:{cookie:a.cookie}});assert.match(page.body,new RegExp('Purchased ×'+quantity+' · '+Number(rows[0]!.result.data.goldSpent).toLocaleString('en')+' gold'));
  }
  const api=await r.command(a,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});assert.equal(api.statusCode,200);assert.equal(api.json().kind,'buy');assert.equal(api.json().data.quantity,1);assert.ok(api.json().state);
  const missing=await r.app.inject({url:'/game/land?command='+randomUUID(),headers:{cookie:a.cookie}});assert.equal(missing.statusCode,200);assert.doesNotMatch(missing.body,/class="market-purchase-feedback"/);
  const before=await r.me(a),denied=await r.app.inject({method:'POST',url:'/game/land/buy',headers:{cookie:a.cookie,origin:'http://untrusted.invalid'},payload:{propertyId:'smallholding',quantity:1,commandId:randomUUID(),csrf:a.csrf}});
  assert.equal(denied.statusCode,403);assert.equal((await r.me(a)).gold,before.gold);
 }finally{await r.close();}
});

test('partial and retired saved purchase URLs are read-only, escaped and never invent missing metadata',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player();await r.prepare(a,1000);
  const key=randomUUID(),input={itemId:'squires-blade',quantity:1};await r.ok(a,'/api/v1/inventory/purchases',input,key);
  await r.db.query("UPDATE command_receipts SET result=result-'data' WHERE account_id=$1 AND command_id=$2",[a.accountId,key]);
  const before=await r.me(a);
  const replay=await r.app.inject({method:'POST',url:'/game/armory/buy',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{...input,commandId:key,csrf:a.csrf}});
  assert.equal(replay.headers.location,'/game/armory?category=weapon&command='+key);
  for(const data of [null,{itemId:'squires-blade'},{itemId:'retired-sword',itemName:'Retired Sword',quantity:3,goldSpent:90}]){
   if(data)await r.db.query("UPDATE command_receipts SET result=jsonb_set(result,'{data}',$3::jsonb) WHERE account_id=$1 AND command_id=$2",[a.accountId,key,JSON.stringify(data)]);
   const page=await r.app.inject({url:'/game/purchases/'+key,headers:{cookie:a.cookie}});assert.equal(page.statusCode,200,page.body);assert.doesNotMatch(page.body,/undefined|NaN/);
   if(data?.itemId==='retired-sword')assert.doesNotMatch(page.body,/>Buy More</);
  }
  assert.equal((await r.me(a)).gold,before.gold);assert.deepEqual((await r.me(a)).inventory,before.inventory);
  assert.equal((await r.app.inject({url:'/game/purchases/'+randomUUID(),headers:{cookie:a.cookie}})).statusCode,404);
 }finally{await r.close();}
});

test('self/public holdings use the same order and saved rates; all Hall categories show actual levels without reranking',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Profile Owner'),b=await r.player('Other Champion');await r.prepare(a,30000,2500);
  for(const [propertyId,quantity] of [['smallholding',20],['woodland',1],['copper-workshop',1]] as const)await r.ok(a,'/api/v1/land/purchases',{propertyId,quantity});
  await r.db.query("UPDATE land_holdings SET hourly_income=999,hourly_upkeep=77 WHERE character_id=$1 AND property_id='smallholding'",[a.id]);
  await r.db.query("INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through) VALUES($1,$2,'retired-garden','Inherited Garden','alpha-0.2',1,1,30,17,3,3600,clock_timestamp(),clock_timestamp())",[randomUUID(),a.id]);
  const saved=(await r.db.query('SELECT * FROM land_holdings WHERE character_id=$1 ORDER BY id',[a.id])).rows;
  for(const [path,cookie] of [['/game/profile',a.cookie],['/game/players/'+a.id,b.cookie]]){
   const page=await r.app.inject({url:path!,headers:{cookie}});assert.equal(page.statusCode,200,page.body);
   const estate=page.body.slice(page.body.indexOf('class="panel profile-estate"'));
   assert.ok(estate.indexOf('<h3>Smallholding')<estate.indexOf('<h3>Woodland'));assert.ok(estate.indexOf('<h3>Woodland')<estate.indexOf('<h3>Copper Workshop'));assert.match(estate,/19,980 gold\/hr/);
   assert.ok(estate.indexOf('<h3>Copper Workshop')<estate.indexOf('<h3>Inherited Garden'));assert.match(estate,/17 gold\/hr/);
  }
  assert.deepEqual((await r.db.query('SELECT * FROM land_holdings WHERE character_id=$1 ORDER BY id',[a.id])).rows,saved);
  await r.db.query('UPDATE characters SET attained_level=101 WHERE id=$1',[b.id]);
  // Local ranking fixtures only; no runtime endpoint can write these standings.
  await r.db.query('UPDATE champion_standings SET battle_victories=3,bounty_claims=2,land_value=100 WHERE character_id=ANY($1::uuid[])',[[a.id,b.id]]);
  for(const category of championCategories){
   const before=(await r.db.query('SELECT * FROM champion_standings ORDER BY character_id')).rows;
   const hall=await hallOfChampions(r.db,a.id,category.id);assert.equal(hall.entries.length,2);
   const expected=(await r.db.query(`SELECT character_id FROM champion_standings WHERE eligible ORDER BY ${category.column} DESC,${category.id==='level'?'xp DESC,':''}created_at,character_id LIMIT 20`)).rows.map(x=>x.character_id);
   assert.deepEqual(hall.entries.map(x=>x.id),expected);assert.equal(hall.entries.find(x=>x.id===b.id)!.level,101);
   const page=await r.app.inject({url:'/game/champions?category='+category.id,headers:{cookie:a.cookie}});assert.equal(page.statusCode,200);assert.match(page.body,/class="champion-level">Level 101<\/small>/);
   assert.deepEqual((await r.db.query('SELECT * FROM champion_standings ORDER BY character_id')).rows,before);
  }
 }finally{await r.close();}
});
