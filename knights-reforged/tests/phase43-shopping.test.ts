import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {alpha} from '../src/alpha-rules.js';
const skip=!testDatabaseUrl;
test('all three equipment categories and Land have keyboard-free controls; durable private Buy More receipts never purchase on GET',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Market Visitor'),b=await r.player();await r.prepare(a,10000);
  for(const category of ['weapon','armor','spell']){
   const page=await r.app.inject({method:'GET',url:'/game/armory?category='+category,headers:{cookie:a.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/data-market-form/);assert.match(page.body,/name="quantity" value="1"/);assert.ok(!page.body.includes('data-quantity-control'));
   const item=alpha.items.find(i=>i.category===category)!;const bulk=await r.app.inject({url:'/game/armory?category='+category+'&bulk='+item.id,headers:{cookie:a.cookie}});assert.equal(bulk.statusCode,200,bulk.body);assert.match(bulk.body,/data-quantity-minus/);assert.match(bulk.body,/data-quantity-plus/);assert.match(bulk.body,/readonly inputmode="none"/);
  }
  for(const [url,payload] of [['/game/armory/buy',{itemId:'squires-blade',quantity:2}],['/game/land/buy',{propertyId:'smallholding',quantity:2}]] as const){
   const key=randomUUID();const response=await r.app.inject({method:'POST',url,headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{...payload,csrf:a.csrf,commandId:key}});
   assert.equal(response.statusCode,303,response.body);assert.equal(response.headers.location,'/game/purchases/'+key);
   const before=await r.me(a),page=await r.app.inject({method:'GET',url:String(response.headers.location),headers:{cookie:a.cookie}});
   assert.equal(page.statusCode,200,page.body);assert.match(page.body,/Buy More/);assert.match(page.body,/Purchased <strong>2<\/strong>/);assert.match(page.body,/data-quantity-plus/);
   assert.ok(!page.body.includes('value="'+key+'"'),'Receipt reuses no submitted command ID.');
   await r.app.inject({method:'GET',url:String(response.headers.location),headers:{cookie:a.cookie}});assert.equal((await r.me(a)).gold,before.gold);
   const replay=await r.app.inject({method:'POST',url,headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{...payload,csrf:a.csrf,commandId:key}});assert.equal(replay.statusCode,303);assert.equal((await r.me(a)).gold,before.gold);
   const denied=await r.app.inject({method:'GET',url:String(response.headers.location),headers:{cookie:b.cookie}});assert.equal(denied.statusCode,404);
  }
  const oldKey=randomUUID(),oldPayload={propertyId:'smallholding',quantity:1};
  await r.ok(a,'/api/v1/land/purchases',oldPayload,oldKey);
  await r.db.query("UPDATE command_receipts SET result=jsonb_set(result,'{data}',jsonb_build_object('goldSpent',result->'data'->'goldSpent')) WHERE account_id=$1 AND command_id=$2",[a.accountId,oldKey]);
  const saved=await r.me(a),oldPost=await r.app.inject({method:'POST',url:'/game/land/buy',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{...oldPayload,csrf:a.csrf,commandId:oldKey}});
  assert.equal(oldPost.statusCode,303);assert.equal(oldPost.headers.location,'/game/land?command='+oldKey);
  assert.equal((await r.app.inject({method:'GET',url:String(oldPost.headers.location),headers:{cookie:a.cookie}})).statusCode,200);
  assert.equal((await r.me(a)).gold,saved.gold);assert.deepEqual((await r.me(a)).land.holdings,saved.land.holdings);
  const home=await r.app.inject({method:'GET',url:'/game/home',headers:{cookie:a.cookie}});assert.ok(!home.body.includes('href="/game/bounties"'));assert.match(home.body,/href="\/game\/land"/);
  const battle=await r.app.inject({method:'GET',url:'/game/battle',headers:{cookie:a.cookie}});assert.match(battle.body,/href="\/game\/bounties"/);
  const quests=await r.app.inject({method:'GET',url:'/game/quests?area=all',headers:{cookie:a.cookie}});assert.match(quests.body,/region-chevron/);assert.match(quests.body,/Quest region/);assert.match(quests.body,/All Regions/);
 }finally{await r.close();}
});
test('bulk selection is read-only, category bounded, escaped and independent of transaction values',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player();await r.prepare(a,1000);const before=await r.me(a);
  for(const url of ['/game/armory?category=armor&bulk=squires-blade','/game/armory?bulk=%3Cimg%20src=x%20onerror=alert(1)%3E','/game/land?bulk=smallholding&bulk=woodland']){
   const page=await r.app.inject({url,headers:{cookie:a.cookie}});assert.equal(page.statusCode,200,page.body);assert.ok(!page.body.includes('id="bulk-trade"'));assert.ok(!page.body.includes('<img src=x'));
  }
  const land=await r.app.inject({url:'/game/land?bulk=smallholding',headers:{cookie:a.cookie}});assert.equal(land.statusCode,200,land.body);assert.match(land.body,/id="bulk-trade"/);assert.match(land.body,/data-quantity-preset="max"/);
  const after=await r.me(a);assert.equal(after.gold,before.gold);assert.equal(after.bankedGold,before.bankedGold);assert.deepEqual(after.inventory,before.inventory);assert.deepEqual(after.land.holdings,before.land.holdings);
 }finally{await r.close();}
});
