import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {victoryExperience45,victoryLoot45} from '../src/gameplay-rules.js';
import {victoryExperience47,equipmentResale,gameFeel} from '../src/game-feel-rules.js';
const levels=[8,17,25,40,50];
const xp=levels.map(level=>{
 const cases=[['matched',level,100,true],['meaningful decisive',level,40,true],['trivial',Math.max(1,level-2),25,true],['repeat allowance exhausted',level,100,false]] as const;
 const quest=alpha.quests.filter(q=>q.level<=level).sort((a,b)=>b.level-a.level||b.xp-a.xp)[0]!;
 return {level,requirement:levelRequirement(level),quest:{name:quest.name,xp:quest.xp,mana:quest.mana},
  cases:cases.map(([opponent,defenderLevel,power,full])=>({opponent,defenderLevel,strengthRatio:power/100,fullAllowance:full,before:victoryExperience45(level,defenderLevel,full,100,power).amount,after:victoryExperience47(level,defenderLevel,full,100,power).amount,percentOfLevel:Math.round(10000*victoryExperience47(level,defenderLevel,full,100,power).amount/levelRequirement(level))/100}))};
});
const economy=JSON.parse(await readFile('test-results/phase47-bot-economy.json','utf8'));
const report={ruleset:gameFeel.id,xp,progressionCurve:'Unchanged: cumulative thresholds 0,12,30,60,105,165,245,350,485,650 through level 10. Later next-level requirement = 200 + 45 × (level−10). Character levels remain uncapped; existing content unchanged.',
 explanation:'+1 XP is intentional after encounter budgets, below 35% relevant strength, or after integer rounding at very low levels. The decisive presentation label is not used by the XP function. Only a non-trivial 35–50% strength ratio is now rounded up to a 50% strength factor; full matched and challenging rewards stay unchanged. Bot allowances: one full encounter per opponent and six total per rolling 24 hours, then 1 XP and zero ordinary gold. Human allowance: three per pair; separate defensive budget. Spirit and eligibility unchanged.',
 resale:[5,12,40,75,120,9000,175000].map(paid=>({paid,before:Math.floor(paid/2),after:equipmentResale(paid)})),
 botEconomy:economy,botFirstLoot:economy.samples.map((sample:any)=>({level:sample.level,before:victoryLoot45(sample.before.exposed_gold,1,true,true,sample.level).amount,after72Hours:victoryLoot45(sample.after.exposed_gold,1,true,true,sample.level).amount,cap:victoryLoot45(sample.before.exposed_gold,1,true,true,sample.level).botCap,repeat:0})),botLoot:levels.map(level=>({level,cap:victoryLoot45(1000000,1,true,true,level).botCap})),
 preservation:{humanCapitalGranted:0,botCapitalGranted:0,holdingsRewritten:0,oldBattleRewardsRecalculated:false,lootChanged:false},
 limitations:['This is a populated synthetic Phase 4.6 fixture and deterministic arithmetic, not an audit of live Railway records.','The read-only owner bot audit identifies live overdue cursors or portfolio drift. No one-time correction is included or executed.']};
await mkdir('docs/phase47',{recursive:true});await writeFile('docs/phase47/balance.json',JSON.stringify(report,null,2)+'\n');
console.table(xp.map(row=>({level:row.level,requirement:row.requirement,matched:row.cases[0]!.after,decisiveBefore:row.cases[1]!.before,decisiveAfter:row.cases[1]!.after,trivial:1,repeat:1,quest:row.quest.xp})));
