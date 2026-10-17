import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
const skip=!testDatabaseUrl;
test('all three equipment categories and Land have keyboard-free controls; durable private Buy More receipts never purchase on GET',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Market Visitor'),b=await r.player();await r.prepare(a,10000);
  for(const category of ['weapon','armor','spell']){
   const page=await r.app.inject({method:'GET',url:'/game/armory?category='+category,headers:{cookie:a.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/data-quantity-minus/);assert.match(page.body,/data-quantity-plus/);assert.match(page.body,/readonly inputmode="none"/);
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
  const home=await r.app.inject({method:'GET',url:'/game/home',headers:{cookie:a.cookie}});assert.ok(!home.body.includes('href="/game/bounties"'));assert.match(home.body,/href="\/game\/land"/);
  const battle=await r.app.inject({method:'GET',url:'/game/battle',headers:{cookie:a.cookie}});assert.match(battle.body,/href="\/game\/bounties"/);
  const quests=await r.app.inject({method:'GET',url:'/game/quests?area=all',headers:{cookie:a.cookie}});assert.match(quests.body,/region-chevron/);assert.match(quests.body,/Quest region/);assert.match(quests.body,/All regions/);
 }finally{await r.close();}
});
