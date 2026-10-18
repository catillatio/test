// Reproducible arithmetic and disposable PostgreSQL examples; no live connection.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {victoryExperience} from '../src/progression-economy-rules.js';
import {victoryLoot} from '../src/pvp-rules.js';
import {gameplay,victoryExperience45,victoryLoot45} from '../src/gameplay-rules.js';
import {botBlueprint} from '../src/development.js';
const levels=[8,17,25,40,50];
const progression=levels.map(level=>{
 const requirement=levelRequirement(level),before=victoryExperience(level,level).amount,after=victoryExperience45(level,level,true,100,100).amount;
 const quest=alpha.quests.filter(q=>q.level<=level).sort((a,b)=>b.level-a.level||b.xp-a.xp)[0]!;
 return {level,requirement,beforeXp:before,afterMatchedXp:after,after75PercentStrengthXp:victoryExperience45(level,level,true,100,75).amount,
  percentOfLevel:Number((100*after/requirement).toFixed(2)),matchedFullWinsPerLevel:Math.ceil(requirement/after),
  quest:{name:quest.name,level:quest.level,xp:quest.xp,mana:quest.mana,goldMin:quest.goldMin,goldMax:quest.goldMax},
  botExample:{tier:'seasoned',exposedGold:botBlueprint(level,'seasoned').gold,netHourlyIncome:botBlueprint(level,'seasoned').netIncome,
   beforeLoot:victoryLoot(botBlueprint(level,'seasoned').gold,1,true).amount,afterLoot:victoryLoot45(botBlueprint(level,'seasoned').gold,1,true,true,level).amount}};
});
const botEconomy=Array.from({length:50},(_,i)=>i+1).map(level=>{
 const variants=['green','seasoned','elite'].flatMap(tier=>Array.from({length:3},(_,variant)=>botBlueprint(level,tier,variant)));
 return {level,population:variants.length,minimumWallet:Math.min(...variants.map(b=>b.gold)),maximumWallet:Math.max(...variants.map(b=>b.gold)),minimumNetHourly:Math.min(...variants.map(b=>b.netIncome)),maximumNetHourly:Math.max(...variants.map(b=>b.netIncome))};
});
const examples=JSON.parse(await readFile('test-results/phase45-combat-examples.json','utf8'));
const report={ruleset:gameplay.id,provenance:gameplay.provenance,progressionCurve:'Unchanged: Cumulative thresholds 0,12,30,60,105,165,245,350,485,650 for attained levels 1–10; from level 10 onward the next-level requirement is 200 + 45 × (level−10). Attained levels and in-level XP remain unchanged.',
 comparisonAssumptions:'Unrepeated equal-level, equal relevant pre-roll powers; these arithmetic rewards do not guarantee victory. The separate PostgreSQL examples record actual physical loadouts, rolls, transfers and XP.',
 progression,loot:{beforeMaximum:5000,afterMaximum:15000,percent:3,multipliers:[100,75,50,25,10],goldCreatedByBattle:0,
  exampleExposedBalances:[0,300,100000,1000000].map(gold=>({gold,before:victoryLoot(gold,1).amount,after:victoryLoot45(gold,1).amount}))},
 botEconomy:{population:450,newCapitalGranted:0,existingCatalogsChanged:false,positiveNetPortfolios:botEconomy.every(b=>b.minimumNetHourly>0),byLevel:botEconomy,
  policy:'No attack-triggered free wallet/reserve refill. Saved Land settles ordinary eligible time. Once per saved hourly boundary, bots can prepay upkeep from their own purse. No Vault withdrawals. Existing estates, wallets, inventories, identities and population are not rewritten by migration.'},
 budgets:{humanFullXpPerPair:3,botFullRewardsPerOpponent:1,botFullRewardsTotal:6,seconds:86400,repeatXp:1,trivialStrengthRatioBelow:0.35,botLootCap:'min(3000, 50 + floor(1.25 × min(targetLevel,50)²))'},
 actualPostgresExamples:examples.examples,limitations:['Arithmetic victory counts exclude regeneration, losses, opponents, quest prerequisites and earned skill choices.','Browser and local-container tests do not verify Railway edge settings or physical Android/iPhone behavior.','No live database or player balance was accessed for this report.']};
await mkdir('docs/phase45',{recursive:true});await writeFile('docs/phase45/balance.json',JSON.stringify(report,null,2)+'\n');
console.table(progression.map(p=>({level:p.level,requirement:p.requirement,beforeXP:p.beforeXp,matchedXP:p.afterMatchedXp,levelPercent:p.percentOfLevel,questXP:p.quest.xp,botGold:p.botExample.afterLoot})));
console.log('450 portfolios checked; no new capital grant. Details: docs/phase45/balance.json');
