import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {victoryExperience45} from '../src/gameplay-rules.js';
import {victoryExperience} from '../src/progression-economy-rules.js';
import {levelRequirement} from '../src/alpha-rules.js';
import {calculateLandAccrual} from '../src/land-rules.js';
const skip=!testDatabaseUrl;

test('victory XP retains the existing curve, scales by relative level and always has a positive diminished floor',()=>{
 for(const level of [1,10,25,40,50]){
  const weak=victoryExperience(level,Math.max(1,level-2)),even=victoryExperience(level,level),strong=victoryExperience(level,level+2);
  assert.ok(weak.amount>=1&&even.amount>=weak.amount&&strong.amount>=even.amount);
  assert.equal(even.base,Math.min(100,Math.ceil(levelRequirement(level)*0.05)));
  assert.equal(victoryExperience(level,level+2,false).amount,1);
 }
 assert.equal(victoryExperience(25,20).amount,11);assert.equal(victoryExperience(25,25).amount,44);assert.equal(victoryExperience(25,30).amount,88);
});

test('reproduces 3591/hour versus 1100 cohort payment and three-minute legacy timer; shared cycle pays all eligible holdings',{skip},async()=>{
 const start=new Date('2045-01-01T00:00:00Z');let now=start;
 const r=await realm({isolated:true,clock:()=>now});try{
  const a=await r.player('Estate Clock Tester');await r.prepare(a,1000);
  const first=randomUUID(),second=randomUUID();
  // Historical saved rates are explicit fixtures, not catalog claims.
  for(const [id,income,stamp] of [[first,1100,start],[second,2491,new Date(+start+180000)]] as const)
   await r.db.query(`INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through)
    VALUES($1,$2,'smallholding','Saved estate fixture','alpha-0.3',1,1,45,$3,0,3600,$4,$4)`,[id,a.id,income,stamp]);
  assert.equal(calculateLandAccrual(start,new Date(+start+3600000),3600,1,1100,0).netGold,1100n);
  assert.equal(calculateLandAccrual(new Date(+start+180000),new Date(+start+3600000),3600,1,2491,0).netGold,0n);
  now=new Date(+start+180000);const before=await r.me(a);
  assert.equal(before.economy.netHourlyIncome,3591);assert.equal(before.land.nextPropertyPaymentGold,'3466');assert.equal(before.land.partialNextPayment,true);
  now=new Date(+start+3600000);const firstPay=await r.me(a);assert.equal(firstPay.gold-before.gold,3466);
  assert.equal(firstPay.land.nextPaymentAt,new Date(+start+7200000).toISOString());
  now=new Date(+start+7200000);const fullPay=await r.me(a);assert.equal(fullPay.gold-firstPay.gold,3591);
  assert.equal(fullPay.land.nextPropertyPaymentGold,'3591');assert.equal(fullPay.land.partialNextPayment,false);
  const cursor=fullPay.land.nextPaymentAt;assert.equal((await r.me(a)).gold,fullPay.gold);assert.equal((await r.me(a)).land.nextPaymentAt,cursor);
  now=new Date(+start+5*3600000);const offline=await r.me(a);assert.equal(offline.gold-fullPay.gold,3*3591);
  const count=(await r.db.query('SELECT (SELECT count(*) FROM land_income_settlements)+(SELECT count(*) FROM land_partial_settlements) AS n')).rows[0]!.n;
  await Promise.all([r.me(a),r.me(a),r.me(a)]);
  assert.equal((await r.me(a)).gold,offline.gold);assert.equal((await r.db.query('SELECT (SELECT count(*) FROM land_income_settlements)+(SELECT count(*) FROM land_partial_settlements) AS n')).rows[0]!.n,count);
 }finally{await r.close();}
});

test('purchases never shift the shared hourly clock; partial first earnings and saved rates survive subsequent hourly payments',{skip},async()=>{
 let now=new Date('2045-02-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now});try{
  const a=await r.player();await r.prepare(a,10000);
  await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});const first=await r.me(a),due=first.land.nextPaymentAt;
  now=new Date(+now+180000);await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:2});
  const bought=await r.me(a);assert.equal(bought.land.nextPaymentAt,due);
  now=new Date(due!);const paid=await r.me(a);
  assert.equal(paid.gold-bought.gold,Number(bought.land.nextPropertyPaymentGold));
  assert.equal(+new Date(paid.land.nextPaymentAt!)-+now,3600000);
  now=new Date(+now+3600000);const next=await r.me(a);
  assert.equal(next.gold-paid.gold,next.economy.netHourlyIncome);
 }finally{await r.close();}
});

test('a full shared cycle pays the displayed 3591 net after distinct property and equipment upkeep; prepaid reserves are accounted separately',{skip},async()=>{
 const start=new Date('2045-04-01T00:00:00Z');let now=start;const r=await realm({isolated:true,clock:()=>now});try{
  const a=await r.player('Upkeep Auditor');await r.prepare(a,10000);
  for(const [income,upkeep] of [[1200,100],[2800,100]])await r.db.query(`INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through)
    VALUES($1,$2,'smallholding','Saved estate fixture','alpha-0.3',1,1,45,$3,$4,3600,$5,$5)`,[randomUUID(),a.id,income,upkeep,start]);
  await r.db.query('UPDATE maintenance_accounts SET hourly_rate=209,reserve_gold=209,settled_at=$2 WHERE character_id=$1',[a.id,start]);
  const before=await r.me(a);assert.equal(before.economy.netHourlyIncome,3591);
  now=new Date(+start+3600000);const first=await r.me(a);
  assert.equal(first.gold-before.gold,3591,'The prepaid bill is consumed once and 209 moves into next-hour reserve, not a second expense.');
  assert.equal(first.maintenance.reserveGold,'209');assert.equal(before.payment.automaticReserve,209);
  assert.equal(first.gold+Number(first.maintenance.reserveGold)-before.gold-Number(before.maintenance.reserveGold),3591);
  now=new Date(+start+7200000);const next=await r.me(a);assert.equal(next.gold-first.gold,3591);assert.equal(next.maintenance.reserveGold,'209');
  assert.equal((await r.me(a)).gold,next.gold);
  const charges=(await r.db.query("SELECT sum(charged_gold)::text AS n FROM maintenance_events WHERE character_id=$1 AND reason='accrual'",[a.id])).rows[0]!.n;assert.equal(charges,'418');
 }finally{await r.close();}
});

test('human defensive victories also earn level-aware XP, diminish to one, replay once, and never refill Health on a defensive level-up',{skip},async()=>{
 const r=await realm({isolated:true,clock:()=>new Date('2045-04-02T00:00:00Z')});try{
  const a=await r.player('Honest Challenger'),b=await r.player('Iron Sentinel');await r.prepare(a,1000,650);await r.prepare(b,10000,650);
  await r.legacyArmy(b,20);await r.ok(b,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});
  await r.db.query('UPDATE characters SET max_health=1000,health=1000,max_spirit=100,spirit=100 WHERE id=ANY($1::uuid[])',[[a.id,b.id]]);
  const start=await r.me(b),legacyXp=victoryExperience45(start.level,start.level,true,start.defense,(await r.me(a)).attack).amount;
  assert.equal(legacyXp,1,'the original trivial-victory fixture remains reproducible');
  const expected=[4,2,1,1]; // Versioned easy-victory curve and taper, then human quota.
  for(let i=0;i<4;i++){
   const before=await r.me(b),key=randomUUID(),hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key);
   const report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
   assert.equal(report.outcome,'defender_win');assert.equal(report.attackerXp,0);assert.equal(report.defenderXp,expected[i]);
   const after=await r.me(b);assert.equal(after.xp-before.xp,report.defenderXp);assert.equal(after.health,before.health-report.defenderDamage);
   await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key);assert.equal((await r.me(b)).xp,after.xp);
   const page=await r.app.inject({method:'GET',url:'/game/battles/'+hit.battleId,headers:{cookie:b.cookie}});assert.match(page.body,new RegExp('XP (?:gained|earned)</dt><dd[^>]*>\\+[^<]*'+report.defenderXp));
  }
  await r.db.query('UPDATE characters SET level_xp=$2 WHERE id=$1',[b.id,levelRequirement(start.level)-1]);
  const before=await r.me(b),hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});
  const report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
  assert.equal(report.defenderLevelGained,1);assert.equal((await r.me(b)).health,before.health-report.defenderDamage);
 }finally{await r.close();}
});
