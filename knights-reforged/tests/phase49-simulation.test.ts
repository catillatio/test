import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBotCombat} from '../scripts/simulation/bot-combat.js';
test('paced play uses actual recovery, losses, level-up refills and finite shared gold, and survives state reconstruction',()=>{
 const options={level:17,hours:6,policy:'phase49' as const,mode:'varied' as const,heal:true};
 const run=simulateBotCombat(options),again=simulateBotCombat(options),restart=simulateBotCombat({...options,restartAtHour:3});
 assert.deepEqual(run,again);assert.ok(run.wins>6);assert.ok(run.losses>0);assert.ok(run.levelUps>0);assert.ok(run.refillSpirit>0);assert.ok(run.blocked.spirit>0);assert.ok(run.conserved);
 for(const key of['goldTransferred','xpAwarded','wins','losses','endingCombined','refillSpirit'] as const)assert.equal(restart[key],run[key]);assert.equal(restart.restarts,1);
 const old=simulateBotCombat({...options,policy:'phase48'});assert.ok(run.goldTransferred>old.goldTransferred);assert.ok(run.xpAwarded>old.xpAwarded);
});
test('sustained same-bot multi-account play is limited by shared Health and finite purse without duplicated income',()=>{
 const one=simulateBotCombat({level:17,hours:6,policy:'phase49',mode:'same',players:1,heal:true});
 const many=simulateBotCombat({level:17,hours:6,policy:'phase49',mode:'same',players:10,decisionSeconds:6,spiritCapacity:10,heal:true});
 assert.ok(many.wins>6);assert.ok(many.blocked.targetHealth>0);assert.ok(many.maximumVictoriesInOnePair>=5);assert.ok(many.knockouts>0);assert.equal(many.generatedPropertyGold,one.generatedPropertyGold);assert.ok(many.conserved&&many.vaultUnchanged);
 assert.ok(many.goldTransferred<10*one.goldTransferred,'shared bot Health/purse prevent ten copies of the solo extraction');
 assert.throws(()=>simulateBotCombat({level:8,hours:1,policy:'phase49',mode:'same',spiritCapacity:100}));
});
