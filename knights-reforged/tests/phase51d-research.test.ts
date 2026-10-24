import test from 'node:test';import assert from 'node:assert/strict';
import {proposedDefense,defenseFarm} from '../scripts/phase51d-review.js';
test('research-only defensive transfer cases conserve purses, retain eligibility and bound repeat rewards',()=>{
 for(const purse of[0,1,1000,100000,2147483647])for(const level of[8,17,50,100,200])for(const win of[1,2,3,4,5,10]){
  const reward=proposedDefense(purse,level,level,win);assert.equal(reward.amount+reward.attackerAfter,purse);assert.ok(reward.amount>=0&&reward.amount<=5000);assert.ok(reward.xp>=1);
 }
 assert.equal(proposedDefense(100000,17,17,1).amount,1000);assert.equal(proposedDefense(100000,17,17,6).amount,100);
 assert.equal(proposedDefense(100000,8,100,1).amount,0);assert.equal(proposedDefense(100000,17,17,1,0.2).amount,0);assert.equal(proposedDefense(100000,17,17,1,1,true).amount,0);
 for(const level of[8,17,50,100,200])for(const hours of[1,6])for(const alts of[1,5])for(const healing of[false,true]){const r=defenseFarm(level,hours,alts,healing);assert.equal(r.defenderWallet+r.attackerWallets+r.healingSink,r.initialGold);assert.ok(r.defenderHealth>=0&&r.defenderHealth<=100);}
});
