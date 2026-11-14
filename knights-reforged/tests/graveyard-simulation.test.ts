import test from 'node:test';import assert from 'node:assert/strict';
import {simulatePopulation,populationHourlyIncome} from '../src/privacy/graveyard-simulation.js';
import {humanVictoryLoot} from '../src/human-pvp-loot.js';
test('public endowment sensitivity preserves existing integer transfer and population bounds',()=>{
 for(const id of ['alpha-0.3','level100-content-1']){assert.equal(populationHourlyIncome(id,12).reduce((a,b)=>a+b,0),594);assert.equal(populationHourlyIncome(id,24).reduce((a,b)=>a+b,0),1188);}
 assert.throws(()=>populationHourlyIncome('level100-content-1',97));
 const passive=simulatePopulation([55],365,0,1);assert.equal(passive.generatedGold,'481800');assert.equal(passive.npcWalletGold,'481800');assert.equal(passive.playerLootGold,'0');
 const once=simulatePopulation([55],1,1,1);assert.equal(once.playerLootGold,String(humanVictoryLoot(55,1).amount));assert.equal(once.npcWalletGold,'1319');
 let wallet=0,expectedLoot=0;for(let day=0;day<2;day++){let sequence=0;for(let h=0;h<24;h++){wallet+=1000;if([0,4,9,14,19].includes(h)){const amount=humanVictoryLoot(wallet,++sequence).amount;wallet-=amount;expectedLoot+=amount;}}}
 assert.equal(simulatePopulation([1000],2,1,5).playerLootGold,String(expectedLoot),'Gold sequence resets from its 24-hour anchor, independently of the XP rolling window');
 const repeat=simulatePopulation([55],90,3,20);assert.ok(BigInt(repeat.playerLootGold)>0n);assert.equal(repeat.conservation,true);assert.deepEqual(simulatePopulation([55],90,3,20),repeat);
 const overflow=simulatePopulation([133200],1095,0,1);assert.equal(overflow.npcWalletGold,'2147483647');assert.ok(BigInt(overflow.retainedGold)>0n);assert.equal(BigInt(overflow.npcWalletGold)+BigInt(overflow.retainedGold),BigInt(overflow.generatedGold));
});
