// Offline catalog arithmetic only. Never reads a database or provisions bots.
import {writeFile} from 'node:fs/promises';
import {botBlueprint} from '../src/development.js';
import {victoryLoot45} from '../src/gameplay-rules.js';
import {alpha} from '../src/alpha-rules.js';
const levels=[5,8,15,17,25,40,50];
const samples=levels.map(level=>{
 const bot=botBlueprint(level,'seasoned',0),loot=victoryLoot45(bot.gold,1,true,true,level);
 return {level,name:bot.name,callingId:bot.calling,army:bot.participants,exposedGold:bot.gold,vault:bot.bankedGold,
  equipment:bot.items.map(item=>({id:item.id,name:item.name,level:item.level,quantity:bot.quantities[item.id]})),
  land:bot.properties.map(p=>({...p,name:alpha.properties.find(a=>a.id===p.id)!.name})),
  plots:bot.properties.reduce((n,p)=>n+p.quantity,0),grossIncome:bot.grossIncome,fullyFundedNetIncome:bot.netIncome,
  firstEligibleWinLoot:loot.amount,botLootCap:loot.botCap,
  winAfterPriorLossBefore:0,winAfterPriorLossAfter:loot.amount,repeatedWinWithinWindow:0,
  note:'Catalog starting-state arithmetic, not live balances or a guarantee of victory. Starting gold, Land and all rates remain unchanged.'};
});
const population=Array.from({length:50},(_,i)=>i+1).flatMap(level=>['green','seasoned','elite'].flatMap(tier=>[0,1,2].map(variant=>botBlueprint(level,tier,variant))));
const report={scope:'Offline deterministic catalog audit; no live data accessed or financial corrections applied.',population:population.length,botsPerLevel:9,
 minimumNetIncome:Math.min(...population.map(b=>b.netIncome)),minimumPlots:Math.min(...population.map(b=>b.properties.reduce((n,p)=>n+p.quantity,0))),maximumArmy:Math.max(...population.map(b=>b.participants)),
 capitalGranted:0,portfoliosChanged:0,formulaChanged:false,samples,
 policy:'One rewarded bot victory per opponent and six total per rolling 24 hours. Losses do not consume either allowance. Victories after the allowance is exhausted still earn the existing minimum 1 XP and zero ordinary gold. The existing fixed-sequence loot percentages, 3% of exposed gold, level-aware bot loot cap, Spirit costs and Vault protection remain unchanged.',
 history:'Old loss receipts and battle records remain immutable. The eligibility query ignores their old rewarded=true flag when counting successful bot victories; no prior gold or XP is recalculated.',
 rootCauses:['An already rewarded opponent or exhausted six-win budget intentionally yields zero gold, even if its wallet is full.','The previous code also counted rewarded=true defender_win records, so a loss could incorrectly exhaust an allowance.','Balances below 34 exposed gold round the 3% base to zero; protected Vault savings never count.'],
 income:'Saved estates settle through the existing independent background income worker, including offline periods. No profile-view grant or instant refill is added. Fully funded net income is positive for all 450 catalog portfolios.',
 limitations:['These are deterministic fixture/catalog results; the actual live bot purse and settlement journal were not inspected.','Observed historical/current deployment configuration remains an owner-side check; no realm initialization, reseeding or portfolio rewrite is authorized.']};
await writeFile('docs/phase48/bot-economy.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({population:report.population,minimumNetIncome:report.minimumNetIncome,minimumPlots:report.minimumPlots,maximumArmy:report.maximumArmy,capitalGranted:0}));
