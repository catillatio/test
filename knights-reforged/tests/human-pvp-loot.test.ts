import test from 'node:test';
import assert from 'node:assert/strict';
import {humanPvpLoot,humanPvpLootDigest,humanVictoryLoot,validateHumanPvpLoot} from '../src/human-pvp-loot.js';
import {definitionDigest} from '../src/expansion-artwork.js';
import {botVictoryRewards} from '../src/bot-combat-rules.js';
import {victoryLoot45} from '../src/gameplay-rules.js';

test('Uncapped human PvP uses exact 3% and two integer floors at every repeat percentage through safe-integer balances',()=>{
 for(const [gold,expected]of[[0,0],[33,0],[34,1],[1000000,30000],[2147483647,64424509],[Number.MAX_SAFE_INTEGER,270215977642229]])assert.equal(humanVictoryLoot(gold!,1).amount,expected);
 assert.deepEqual([1,2,3,4,5,6].map(n=>humanVictoryLoot(1000000,n).amount),[30000,22500,15000,7500,3000,3000]);
 assert.equal(humanVictoryLoot(99,2).base,2);assert.equal(humanVictoryLoot(99,2).amount,1,'preserve floor of 3% before floor of pair reduction');
 for(const gold of[0,33,34,99,500001,2147483647,Number.MAX_SAFE_INTEGER])for(let n=1;n<=8;n++){
  const result=humanVictoryLoot(gold,n),percentage=[100n,75n,50n,25n,10n][Math.min(n-1,4)]!;
  assert.equal(BigInt(result.amount),(BigInt(gold)*3n/100n)*percentage/100n);assert.ok(Number.isSafeInteger(result.amount));assert.ok(result.amount<=gold);
 }
 for(const bad of[-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>humanVictoryLoot(bad,1));
 for(const bad of[0,-1,NaN,1.1,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>humanVictoryLoot(1000,bad));
});

test('Human uncapped loot has an immutable identity without a replacement cap or changes to the fixed window',()=>{
 assert.equal(humanPvpLoot.maximum,null);assert.equal(humanPvpLoot.percent,3);assert.equal(humanPvpLoot.windowSeconds,86400);assert.equal(definitionDigest(humanPvpLoot),humanPvpLootDigest);assert.equal(humanVictoryLoot(1000000,1).rulesetId,humanPvpLoot.id);
 for(const bad of[{...humanPvpLoot,percent:4},{...humanPvpLoot,maximum:15000},{...humanPvpLoot,windowSeconds:3600},{...humanPvpLoot,victoryPercentages:[100,100,100,100,100]}])assert.throws(()=>validateHumanPvpLoot(bad as typeof humanPvpLoot));
});

test('Bot ceilings and 100/85/70/55/40 safeguards remain pinned to their existing reward policy',()=>{
 assert.deepEqual([1,2,3,4,5,6].map(n=>botVictoryRewards(1000000000,100,100,n,100,100).loot.amount),[3000,2550,2100,1650,1200,1200]);
 assert.equal(botVictoryRewards(1000000000,100,100,1,100,100).loot.rulesetId,'bot-combat-rewards-2');
 assert.equal(victoryLoot45(1000000,1).amount,15000,'retain the original capped historical helper and immutable bot base rules');
 assert.equal(humanVictoryLoot(1000000000,1).amount,30000000);
});
