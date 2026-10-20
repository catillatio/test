import {readFileSync} from 'node:fs';
import {gameplay,victoryLoot45} from './gameplay-rules.js';
import {gameFeel,victoryExperience47} from './game-feel-rules.js';
import {pvp} from './pvp-rules.js';

export const botCombat=JSON.parse(readFileSync(new URL('../rulesets/bot-combat-rewards-1/rules.json',import.meta.url),'utf8')) as {
 id:string;baseGoldRuleset:string;baseXpRuleset:string;windowSeconds:number;victoryPercentages:number[];provisionalRepeatFloor:boolean;
};
if(botCombat.id!=='bot-combat-rewards-1'||botCombat.baseGoldRuleset!==gameplay.id||botCombat.baseXpRuleset!==gameFeel.id||
 botCombat.windowSeconds!==pvp.loot.windowSeconds||botCombat.victoryPercentages.join(',')!=='100,85,70,55,40')throw new Error('Invalid bot combat reward policy.');

// Pure reward calculation only. The caller resolves combat, holds both saved
// character locks, and advances the existing sequence once per actual victory.
export function botVictoryRewards(gold:number,attackerLevel:number,defenderLevel:number,victory:number,attackPower:number,defensePower:number){
 if(!Number.isSafeInteger(victory)||victory<1)throw new RangeError('Invalid bot victory sequence.');
 const multiplier=botCombat.victoryPercentages[Math.min(victory-1,botCombat.victoryPercentages.length-1)]!;
 const fullLoot=victoryLoot45(gold,1,true,true,defenderLevel);
 const fullXp=victoryExperience47(attackerLevel,defenderLevel,true,attackPower,defensePower);
 const reductionReasons:('repeat_opponent'|'overwhelming_advantage')[]=[];
 if(multiplier<100)reductionReasons.push('repeat_opponent');
 if(fullXp.trivial)reductionReasons.push('overwhelming_advantage');
 return {
  loot:{...fullLoot,multiplier,unreducedAmount:fullLoot.amount,amount:Math.floor(fullLoot.amount*multiplier/100),rulesetId:botCombat.id},
  xp:{...fullXp,unreducedAmount:fullXp.amount,repeatMultiplier:multiplier,amount:Math.max(1,Math.floor(fullXp.amount*multiplier/100)),
   reduced:reductionReasons.length>0,reason:fullXp.trivial?'overwhelming_advantage':multiplier<100?'repeat_opponent':'matched_victory',reductionReasons,rulesetId:botCombat.id}
 };
}
