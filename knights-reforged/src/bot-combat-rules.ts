import {readFileSync} from 'node:fs';
import {gameplay} from './gameplay-rules.js';
import {gameFeel,victoryExperience47} from './game-feel-rules.js';
import {pvp} from './pvp-rules.js';
import {scaleBotExperience} from './bot-experience.js';
import {progressiveBotLoot} from './bot-loot.js';
import {deepFreeze} from './compatibility-rules.js';
import {definitionDigest} from './expansion-artwork.js';

export const previousBotCombat=JSON.parse(readFileSync(new URL('../rulesets/bot-combat-rewards-1/rules.json',import.meta.url),'utf8')) as {
 id:string;baseGoldRuleset:string;baseXpRuleset:string;windowSeconds:number;victoryPercentages:number[];provisionalRepeatFloor:boolean;
};
export const previousBotCombatV2=JSON.parse(readFileSync(new URL('../rulesets/bot-combat-rewards-2/rules.json',import.meta.url),'utf8')) as typeof previousBotCombat&{fullXpPercent:number};
export const botCombat=deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/bot-combat-rewards-3/rules.json',import.meta.url),'utf8')) as typeof previousBotCombatV2&{
 previousRuleset:string;gold:{percent:number;baseMaximum:null;levelMaximum:null;threshold:number;logarithmicScale:number;formula:string;arithmetic:string};
});
export const botCombatDigest='4bea2fa399c6cd9ec45579d345c68c8c28ca4e563e59bf192cb7653f6ae7f394';
if(previousBotCombat.id!=='bot-combat-rewards-1'||previousBotCombatV2.id!=='bot-combat-rewards-2'||botCombat.id!=='bot-combat-rewards-3'||
 previousBotCombatV2.fullXpPercent!==65||botCombat.fullXpPercent!==65||definitionDigest(botCombat)!==botCombatDigest||
 [previousBotCombat,previousBotCombatV2,botCombat].some(policy=>policy.baseGoldRuleset!==gameplay.id||policy.baseXpRuleset!==gameFeel.id||policy.windowSeconds!==pvp.loot.windowSeconds||policy.victoryPercentages.join(',')!=='100,85,70,55,40'))throw new Error('Invalid bot combat reward policy.');

// Pure reward calculation only. The caller resolves combat, holds both saved
// character locks, and advances the existing sequence once per actual victory.
export function botVictoryRewards(gold:number,attackerLevel:number,defenderLevel:number,victory:number,attackPower:number,defensePower:number){
 if(!Number.isSafeInteger(gold)||gold<0||!Number.isSafeInteger(defenderLevel)||defenderLevel<1||!Number.isSafeInteger(victory)||victory<1)throw new RangeError('Invalid bot reward state.');
 const multiplier=botCombat.victoryPercentages[Math.min(victory-1,botCombat.victoryPercentages.length-1)]!;
 const base=Number(BigInt(gold)*BigInt(botCombat.gold.percent)/100n),fullLoot=progressiveBotLoot(base);
 const fullXp=victoryExperience47(attackerLevel,defenderLevel,true,attackPower,defensePower);
 const scaledXp=scaleBotExperience(fullXp.amount,botCombat.fullXpPercent,multiplier);
 const reductionReasons:('repeat_opponent'|'overwhelming_advantage')[]=[];
 if(multiplier<100)reductionReasons.push('repeat_opponent');
 if(fullXp.trivial)reductionReasons.push('overwhelming_advantage');
 return {
  loot:{base,multiplier,unreducedAmount:fullLoot,amount:Number(BigInt(fullLoot)*BigInt(multiplier)/100n),botCap:null,botRewardAvailable:true,rulesetId:botCombat.id},
  xp:{...fullXp,unreducedAmount:fullXp.amount,fullXpPercent:botCombat.fullXpPercent,scaledFullAmount:scaledXp.scaledFullAmount,repeatMultiplier:multiplier,amount:scaledXp.amount,
   reduced:reductionReasons.length>0,reason:fullXp.trivial?'overwhelming_advantage':multiplier<100?'repeat_opponent':'matched_victory',reductionReasons,rulesetId:botCombat.id}
 };
}
