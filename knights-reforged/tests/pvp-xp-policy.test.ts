import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedVictoryXp,bonusCapacity,pvpXp,type XpInput} from '../src/pvp-xp-policy.js';
import {victoryExperience47} from '../src/game-feel-rules.js';
import {botVictoryRewards} from '../src/bot-combat-rules.js';
import {loadout,power} from '../scripts/simulation/level100-e2b.js';
import {resourceDay} from '../scripts/pvp-xp-balance-study.js';
import {explain} from '../scripts/explain-pvp-xp.js';

const input=(level=50,ratio=.2,botVictory?:number):XpInput=>({level,opponentLevel:level,power:10000,opponentPower:10000*ratio,eligible:true,...(botVictory?{botVictory}:{})});
test('levels 1–100 retain exact meaningful awards, three human wins and bot floors',()=>{
 for(let level=1;level<=100;level++)for(const ratio of [.01,.1,.2,.3499,.35,.5,.7,1,1.25,2])for(let victory=1;victory<=6;victory++)for(const bot of [false,true]){
  const i={...input(level,ratio,bot?victory:undefined),eligible:bot||victory<=3},r=boundedVictoryXp(i,victory-1);
  const old=bot?botVictoryRewards(1000,level,level,victory,10000,ratio*10000).xp.amount:victoryExperience47(level,level,i.eligible,10000,ratio*10000).amount;
  assert.ok(Number.isSafeInteger(r.amount)&&r.amount>=old);
  if(ratio>=.35||!i.eligible||victory>=5)assert.equal(r.amount,old);
  assert.ok(r.bonusAmount<=bonusCapacity(level));
 }
});
test('first-win curve joins at .35 and very weak/early rounded rewards stay small',()=>{
 for(let level=1;level<=100;level++)for(const bot of [false,true]){
  const before=boundedVictoryXp(input(level,.35-1e-9,bot?1:undefined)),after=boundedVictoryXp(input(level,.35,bot?1:undefined));
  assert.ok(Math.abs(before.amount-after.amount)<=1);
  assert.equal(boundedVictoryXp(input(level,.01,bot?1:undefined)).amount,1);
 }
 assert.equal(boundedVictoryXp(input(5,1,1)).amount,1,'established bot rounding stays intact');
 assert.deepEqual([1,2,3,4,5,6].map(v=>boundedVictoryXp(input(50,.2,v),v-1).amount),[25,11,4,1,1,1]);
});
test('rotation, role switching and level-ups cannot replenish the shared allowance',()=>{
 let units=0,bonus=0;
 for(let n=0;n<10000;n++){
  // Fresh opponent each time, alternated attack/defense and all levels.
  const r=boundedVictoryXp(input(1+n%100,.3499,n%2?1:undefined),0,units);units+=r.budgetUnits;bonus+=r.bonusAmount;
  assert.ok(units<=pvpXp.budgetUnits);assert.ok(bonus<=pvpXp.maximumBonus);
 }
 assert.ok(units>9900);
 assert.equal(boundedVictoryXp(input(),0,10000).bonusAmount,0);
});
test('real legal equipment, specializations and varied paid participation across every level',()=>{
 let cases=0;
 for(let level=1;level<=100;level++)for(const n of [...new Set([1,Math.max(1,level),5*level])])for(const build of ['offense','tank','balanced'] as const){
  const inv=loadout(level,n,build,true),training=Math.min(25,level-1),recipient=power(level,n,inv,'attack',training);
  for(const enemyN of [...new Set([1,Math.max(1,level),5*level])]){
   const enemy=power(level,enemyN,loadout(level,enemyN,'tank',true),'defense',training),r=boundedVictoryXp({...input(level),power:recipient,opponentPower:enemy});
   assert.ok(r.amount>=r.baselineAmount);assert.ok(r.bonusAmount<=200);cases++;
  }
 }
 assert.ok(cases>=2600);
});
test('malformed budget, power and sequence values fail closed',()=>{
 for(const n of [-1,NaN,1.2,Infinity]){
  assert.throws(()=>boundedVictoryXp(input(),n),RangeError);
  assert.throws(()=>boundedVictoryXp(input(),0,n),RangeError);
  if(n!==1.2)assert.throws(()=>boundedVictoryXp({...input(),power:n}),RangeError);
 }
 assert.throws(()=>boundedVictoryXp(input(),0,10001),RangeError);
 assert.throws(()=>boundedVictoryXp({...input(),botVictory:0}),RangeError);
});
test('finite resource days respect the bonus bound and preserve meaningful-target progression',()=>{
 for(const level of [1,17,50,100])for(const expanded of [false,true]){
  const old=resourceDay(level,level,'meaningful','current',expanded),next=resourceDay(level,level,'meaningful','bounded',expanded);
  assert.deepEqual({...next,policy:'current'},old);
  const easy=resourceDay(level,level,'rotate-easy','bounded',expanded);
  assert.ok(easy.bonus<=200);assert.ok(easy.attacks<=720);assert.ok(easy.goldAfter>=0);assert.ok(easy.healthAfter>=0);assert.ok(easy.staminaAfter>=0);
 }
});
test('saved-snapshot attribution distinguishes strength, human allowance, bot rounding and storage limits',()=>{
 const base={id:'fixture',rewarded:true,snapshot:{attacker:{level:50,attack:10000,xp:2000},defender:{level:50,defense:2000,gold:1000}},result:{outcome:'attacker_win',attackerXp:1}};
 assert.equal(explain(base).primary,'trivial_strength');
 assert.equal(explain({...base,rewarded:false}).primary,'repeat_budget');
 assert.equal(explain({...base,snapshot:{attacker:{level:5,attack:100},defender:{level:5,defense:100,gold:100}},result:{...base.result,temporaryRival:true,lootDetails:{victory:1}}}).primary,'bot_scaling_and_rounding');
 assert.equal(explain({...base,snapshot:{...base.snapshot,attacker:{...base.snapshot.attacker,xp:2147483646},defender:{...base.snapshot.defender,defense:10000}}}).primary,'lifetime_storage_limit');
});
