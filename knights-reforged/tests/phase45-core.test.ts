import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {executeCommand} from '../src/commands.js';
import {healingQuote,victoryLoot45,victoryExperience45} from '../src/gameplay-rules.js';
import {victoryExperience} from '../src/progression-economy-rules.js';
const skip=!testDatabaseUrl;

test('gold healing settles free recovery, charges missing Health once under concurrent requests, and preserves ordinary resources',{skip},async()=>{
 let now=new Date('2046-01-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now});try{
  const a=await r.player();await r.prepare(a,1000);
  const contract=await r.app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:a.cookie}});assert.equal(contract.json().rulesetId,contract.json().state.rulesetId,'Existing top-level catalog version remains compatible.');
  await r.db.query('UPDATE characters SET health=40,health_updated_at=$2 WHERE id=$1',[a.id,now]);
  const before=await r.me(a),key=randomUUID();assert.equal(before.healing.cost,60);
  const replies=await Promise.all([r.ok(a,'/api/v1/health/restorations',{maxCost:60},key),r.ok(a,'/api/v1/health/restorations',{maxCost:60},key),r.ok(a,'/api/v1/health/restorations',{maxCost:60})]);
  // Either distinct request may win the lock; replayed copies share one result.
  assert.equal(replies[0].data.cost,replies[1].data.cost);assert.equal(replies[0].data.cost+replies[2].data.cost,60);const healed=await r.me(a);
  assert.equal(healed.health,100);assert.equal(healed.gold,before.gold-60);assert.equal(healed.mana,before.mana);assert.equal(healed.spirit,before.spirit);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM health_restorations')).rows[0]!.n,1);
  assert.equal((await r.ok(a,'/api/v1/health/restorations',{})).data.cost,0);assert.equal((await r.me(a)).gold,healed.gold);
  await r.db.query('UPDATE characters SET health=0,health_updated_at=$2 WHERE id=$1',[a.id,now]);
  assert.equal((await r.command(a,'/api/v1/health/restorations',{maxCost:1})).json().error.code,'HEALING_CHANGED');
  now=new Date(+now+before.calling.healthSeconds*1000);const recovered=await r.me(a);assert.ok(recovered.health>0);assert.equal(recovered.healing.missing,100-recovered.health);
  const poor=await r.player();await r.db.query('UPDATE characters SET health=0,health_updated_at=$2 WHERE id=$1',[poor.id,now]);
  assert.equal((await r.command(poor,'/api/v1/health/restorations',{})).json().error.code,'INSUFFICIENT_GOLD');
 }finally{await r.close();}
});
test('gold militia endpoints are absent; internal new orders fail, old members remain intact (legacy receipt replay is covered by migration tests)',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player();await r.db.query('UPDATE army_stacks SET quantity=2 WHERE character_id=$1',[a.id]);const before=await r.me(a);
  for(const url of ['/api/v1/army/recruitments','/game/army/recruit'])assert.equal((await r.command(a,url,{unitId:'militia',quantity:1})).statusCode,404);
  await assert.rejects(executeCommand(r.db,a.accountId,randomUUID(),'recruit',{unitId:'militia',quantity:1}),/Invite allies/);
  assert.equal((await r.me(a)).gold,before.gold);assert.equal((await r.me(a)).army.total,before.army.total);
  const page=await r.app.inject({method:'GET',url:'/game/army',headers:{cookie:a.cookie}});assert.doesNotMatch(page.body,/action="\/game\/army\/recruit"|Recruit militia/);assert.match(page.body,/Invite Ally/);
 }finally{await r.close();}
});
test('one-tap Land buys/sales and 1, 30, 59 minute purchases keep the saved hourly boundary and pay exactly once',{skip},async()=>{
 const start=new Date('2046-01-02T00:00:00Z');let now=start;const r=await realm({isolated:true,clock:()=>now});try{
  const a=await r.player();await r.prepare(a,10000);await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});
  const due=(await r.me(a)).land.nextPaymentAt!;
  for(const minute of [1,30,59]){now=new Date(+start+minute*60000);await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});assert.equal((await r.me(a)).land.nextPaymentAt,due);}
  const before=await r.me(a);assert.equal(before.payment.gold,16);assert.equal(before.payment.partial,true);
  now=new Date(due);const values=await Promise.all([r.me(a),r.me(a),r.me(a)]);assert.equal(values[0].gold,before.gold+16);assert.ok(values.every(s=>s.gold===values[0].gold));
  assert.equal(+new Date(values[0].payment.nextAt!)-+now,3600000);
  const count=(await r.db.query('SELECT (SELECT count(*) FROM land_income_settlements)+(SELECT count(*) FROM land_partial_settlements) AS n')).rows[0]!.n;
  await r.me(a);assert.equal((await r.db.query('SELECT (SELECT count(*) FROM land_income_settlements)+(SELECT count(*) FROM land_partial_settlements) AS n')).rows[0]!.n,count);
  const page=await r.app.inject({method:'GET',url:'/game/land',headers:{cookie:a.cookie}});assert.doesNotMatch(page.body,/name="preview"/);
  const key=randomUUID(),post={propertyId:'smallholding',quantity:'1',csrf:a.csrf,commandId:key};
  const responses=await Promise.all([r.app.inject({method:'POST',url:'/game/land/buy',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:post}),r.app.inject({method:'POST',url:'/game/land/buy',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:post})]);
  assert.ok(responses.every(response=>response.statusCode===303));assert.ok(responses.every(response=>String(response.headers.location).includes('/game/land?command=')));assert.equal((await r.me(a)).land.properties[0]!.owned,5);
 }finally{await r.close();}
});
test('upcoming payment matches authoritative purse movement with prepaid, wallet-funded, suspended and negative upkeep',{skip},async()=>{
 const start=new Date('2046-01-03T00:00:00Z');let now=start;const r=await realm({isolated:true,clock:()=>now});try{
  const a=await r.player();await r.prepare(a,10000);await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});
  await r.db.query('UPDATE maintenance_accounts SET hourly_rate=100,reserve_gold=100,settled_at=$2 WHERE character_id=$1',[a.id,start]);
  const prepaid=await r.me(a);assert.equal(prepaid.payment.gold,-93);assert.equal(prepaid.payment.automaticReserve,100);assert.equal(prepaid.payment.prepaidUpkeep,100);assert.equal(prepaid.payment.economicNet,-93);
  now=new Date(+start+3600000);const paid=await r.me(a);assert.equal(paid.gold-prepaid.gold,prepaid.payment.gold);assert.equal(paid.payment.gold,-93);
  now=new Date(+now+3600000);const next=await r.me(a);assert.equal(next.gold-paid.gold,-93);
  await r.db.query('UPDATE maintenance_accounts SET paused=true WHERE character_id=$1',[a.id]);const recovered=await r.me(a);assert.equal(recovered.maintenance.paused,false);assert.equal(recovered.payment.gold,-93);
 }finally{await r.close();}
});
test('historical Phase 4.5 healing, capped loot and XP definitions remain reproducible without retroactive changes',()=>{
 assert.equal(healingQuote(75,100,17,500).cost,50);assert.equal(healingQuote(100,100,50,0).cost,0);
 assert.equal(victoryLoot45(100000,1).amount,3000);assert.equal(victoryLoot45(1000000,1).amount,15000);assert.equal(victoryLoot45(0,1).amount,0);
 assert.deepEqual([1,2,3,4,5,6].map(n=>victoryLoot45(100000,n).multiplier),[100,75,50,25,10,10]);
 assert.equal(victoryLoot45(100000,1,true,false,50).amount,0);assert.ok(victoryLoot45(100000,1,true,true,50).amount>50);
 for(const level of [8,17,25,40,50]){
  const matched=victoryExperience45(level,level),old=victoryExperience(level,level);assert.ok(matched.amount>=old.amount);
  if(level>=17)assert.ok(matched.amount>old.amount);
  assert.ok(victoryExperience45(level,level+2,true,100,105).amount>=matched.amount);
  assert.equal(victoryExperience45(level,level,false).amount,1);assert.equal(victoryExperience45(level,level,true,1000,100).amount,1);
 }
});

test('healing and Land spending race under the same character lock without overdrawing gold',{skip},async()=>{
 const r=await realm({isolated:true,clock:()=>new Date('2046-01-04T00:00:00Z')});try{
  const a=await r.player();await r.db.query('UPDATE wallets SET balance=60 WHERE character_id=$1',[a.id]);await r.db.query('UPDATE characters SET health=50 WHERE id=$1',[a.id]);
  const results=await Promise.all([r.command(a,'/api/v1/health/restorations',{maxCost:50}),r.command(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1})]);
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);const state=await r.me(a);assert.ok(state.gold>=0);
  if(results[0]!.statusCode===200){assert.equal(state.health,100);assert.equal(state.gold,10);assert.equal(state.land.holdings.length,0);}else{assert.equal(state.health,50);assert.equal(state.gold,15);assert.equal(state.land.properties[0]!.owned,1);}
 }finally{await r.close();}
});
