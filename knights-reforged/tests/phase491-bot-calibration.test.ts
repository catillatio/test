import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {alpha,activeArmy,selectEquipment,trainedPower} from '../src/alpha-rules.js';import {rules} from '../src/rules.js';import {callingFor,callingPower} from '../src/strategy-rules.js';import {botCombat} from '../src/bot-combat-rules.js';
import {candidate,blueprintSnapshot,planCalibration,applyPlanToSnapshot,participants,inventory,power,equipmentRate,humanReference} from '../scripts/experiments/bot-calibration-model.js';
import {simulateBotCombat} from '../scripts/simulation/bot-combat.js';
test('bot-only candidate never changes members, identities, Calling, level, Land, Vault or attack training and funds every acquisition',()=>{
 let planned=0;
 for(let level=1;level<=50;level++)for(const tier of['green','seasoned','elite']as const)for(let variant=0;variant<3;variant++){
  const before=blueprintSnapshot(level,tier,variant),original=structuredClone(before),plan=planCalibration(before),after=applyPlanToSnapshot(before,plan);assert.deepEqual(before,original);
  for(const key of['id','accountId','name','level','calling','militia','legacyFloor','attackTraining','vault','grossIncome','propertyUpkeep']as const)assert.equal(after[key],before[key],key);
  assert.ok(participants(after)<=10);assert.equal(after.skillPoints,before.skillPoints-plan.points);assert.ok(plan.points<=before.skillPoints);assert.ok(after.defenseTraining<=25);
  assert.equal(power(after.level,participants(after),inventory(after),after.defenseTraining,after.calling,'defense',!after.paused),plan.afterDefense);
  if(plan.status==='planned'){planned++;assert.equal(after.gold+after.reserve,before.gold+before.reserve+plan.saleRefund-plan.purchaseCost-before.arrears);assert.ok(before.gold+plan.saleRefund-plan.purchaseCost-plan.reserveTopup>=Math.max(Math.ceil(before.gold*.75),2*plan.newRate));assert.ok(plan.netHourly>0);assert.ok(equipmentRate(after)<=Math.floor((after.grossIncome-after.propertyUpkeep)*.35));}
 }
 assert.ok(planned>200);
});
test('repeated plans are deterministic, frozen and never rely on free points, new members or an attacker-supplied target',()=>{
 const b=blueprintSnapshot(25,'green'),a=planCalibration(b);assert.deepEqual(planCalibration(b),a);assert.equal(candidate.adopted,false);assert.equal(candidate.armyChanges,false);assert.ok(Object.isFrozen(candidate.ratios.elite));
 const noPoints=planCalibration({...b,skillPoints:0});assert.equal(noPoints.points,0);assert.equal(planCalibration(b,'gear-only').points,0);
 assert.throws(()=>planCalibration({...b,level:100}));assert.throws(()=>planCalibration({...b,level:200}));assert.throws(()=>planCalibration({...b,militia:21}));assert.throws(()=>applyPlanToSnapshot({...b,gold:b.gold+1},a),/mismatch/);
 assert.throws(()=>planCalibration({...b,inventory:b.inventory.map((h,i)=>i? h:{...h,lots:[]})}),/lots/);
});
test('human powers and capped participation use the original helpers, including 100/200 stress cases; low-level bot ceilings remain real',()=>{
 for(const level of[1,8,17,25,50,100,200])for(const profile of['starter','ordinary','established','large']as const){const h=humanReference(level,profile),p=activeArmy(level,h.participants-1,0).participants;assert.equal(h.participants,p);const e=selectEquipment(h.inventory,p,'attack');assert.equal(h.attack,callingPower(trainedPower(rules.baseAttack+(level-1)*rules.attackPerLevel+(p-1)*rules.unit.attack+e.attack,h.training),callingFor('Freeblade').attackPercent));}
 const first=blueprintSnapshot(1,'elite'),plan=planCalibration(first);assert.equal(plan.participants,1);assert.ok(plan.afterDefense<plan.referenceAttack,'No fabricated level1 strength to force a difficulty band');
 assert.equal(botCombat.id,'bot-combat-rewards-2');assert.equal(botCombat.fullXpPercent,65);assert.deepEqual(botCombat.victoryPercentages,[100,85,70,55,40]);
});
test('legacy paid lots use FIFO refunds, integer resale, no arbitrary new purchase currency or automatic reserve-financed acquisitions',()=>{
 const b=blueprintSnapshot(17,'elite');b.inventory[0]!.lots=[{quantity:1,unitCost:75},{quantity:b.inventory[0]!.quantity-1,unitCost:120}].filter(l=>l.quantity);
 const p=planCalibration(b);if(p.status==='planned'){assert.ok(p.saleRefund>=0);assert.equal(p.purchaseCost,p.purchases.reduce((s,i)=>s+alpha.items.find(a=>a.id===i.itemId)!.price*i.quantity,0));assert.ok(b.gold+p.saleRefund-p.purchaseCost-p.reserveTopup>=Math.ceil(b.gold*.75));}
 const poor={...blueprintSnapshot(8,'green'),gold:0,reserve:0,skillPoints:0};assert.notEqual(planCalibration(poor).status,'planned');assert.equal(planCalibration({...b,paused:true}).status,'unchanged');
});
test('offline injection leaves accepted simulator identical when absent and cannot enlarge a bot army',()=>{
 const options={level:8,hours:1,policy:'phase49' as const,mode:'varied' as const,heal:true,seed:49101};assert.deepEqual(simulateBotCombat(options),simulateBotCombat({...options}));
 assert.throws(()=>simulateBotCombat({...options,botLoadout:()=>({militia:20,training:0,inventory:[],wallet:0,reserve:0n})}),/army members/);
 const runtime=readFileSync(new URL('../src/game.ts',import.meta.url),'utf8');assert.doesNotMatch(runtime,/calibration|uncapped-support|Math\.log/);
});

test('test-only SQL prototype rejects production/nonlocal/missing authorization before opening a connection',async()=>{
 const {inspectFixtureBot,applyFixtureCalibration}=await import('../scripts/experiments/bot-calibration-store.js');let connected=false;
 const db={query:async()=>{throw new Error('Unexpected query');},connect:async()=>{connected=true;throw new Error('Unexpected connection');},end:async()=>{}};
 const b=blueprintSnapshot(8,'green'),plan=planCalibration(b);
 for(const permission of[{mode:'production',allowLocalExperiment:true,databaseUrl:'postgresql://unused@127.0.0.1/local_test'},{mode:'test',allowLocalExperiment:false,databaseUrl:'postgresql://unused@127.0.0.1/local_test'},{mode:'test',allowLocalExperiment:true,databaseUrl:'postgresql://unused@private.invalid/kingdom_come'},{mode:'test',allowLocalExperiment:true,databaseUrl:'not a URL'}]){
  await assert.rejects(inspectFixtureBot(db,b.id,permission as any),/required/);await assert.rejects(applyFixtureCalibration(db,permission as any,plan,'12345678-1234-4234-8234-123456789abc'),/required/);
 }
 assert.equal(connected,false);
});
