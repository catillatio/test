import test from 'node:test';import assert from 'node:assert/strict';
import {support,assertCurrentEquivalent,human,currentBot,proposedBot,encounter} from '../scripts/simulation/phase491-armies.js';
import {botBlueprint} from '../src/development.js';
import {botCombat} from '../src/bot-combat-rules.js';
test('offline army baseline exactly matches actual equipment selectors, training and Callings at all existing and stress levels',()=>{
 for(const level of[...Array.from({length:50},(_,i)=>i+1),100,200])for(const army of[1,10,21,51,101,500,1000,10000]){const p=assertCurrentEquivalent(level,army);assert.equal(p.model,p.actual);assert.ok(Number.isFinite(p.model));}
});
test('support proposal preserves first 21 slots and stays monotonic, sublinear, finite; nothing changes active policy',()=>{
 for(let n=1;n<=21;n++)assert.equal(support(n),n);assert.ok(support(10000)<60);for(let n=2;n<=10000;n++){assert.ok(support(n)>support(n-1));assert.ok(support(n)<=n);}
 assert.equal(botCombat.id,'bot-combat-rewards-2');assert.equal(botCombat.fullXpPercent,65);assert.deepEqual(botCombat.victoryPercentages,[100,85,70,55,40]);assert.equal(currentBot(50,'elite').participants,10);
});
test('bot proposals retain finite catalog purses/estates, debit every extra equipment upkeep copy and freeze future content',()=>{
 for(const level of[1,5,15,25,50,100,200])for(const tier of['green','seasoned','elite'] as const){const b=proposedBot(level,tier,'uncapped-support'),old=botBlueprint(Math.min(50,level),tier);assert.equal(b.wallet,old.gold);assert.deepEqual(b.properties,old.properties);assert.equal(b.netIncome,old.netIncome+currentBot(level,tier).upkeep-b.upkeep);assert.ok(Number.isFinite(b.power)&&b.power>0);}
});
test('roll enumeration handles defender ties, no guaranteed matched victory or decisive-XP bonus',()=>{
 assert.ok(encounter(100,100,17).winPercent<50);assert.equal(encounter(10000,1,17).xpPerWin,1);assert.equal(encounter(1,10000,17).winPercent,0);assert.equal(human(200,10000,'current').participants,101);
});
