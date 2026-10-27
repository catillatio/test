import {readFileSync} from 'node:fs';
import {levelRequirement} from './alpha-rules.js';
import {victoryExperience47} from './game-feel-rules.js';
import {scaleBotExperience} from './bot-experience.js';
import {botCombat} from './bot-combat-rules.js';

// All new balance numbers live in this immutable version. Legacy helpers and
// their installed JSON remain unchanged, including above-threshold rounding.
export const pvpXp=JSON.parse(readFileSync(new URL('../rulesets/pvp-xp-hybrid-1/rules.json',import.meta.url),'utf8')) as {
 id:string;provenance:string;easyStrengthRatio:number;joiningStrengthPercent:number;easyVictoryPercentages:number[];
 windowSeconds:number;bonusRequirementPercent:number;maximumBonus:number;budgetUnits:number;
};
if(pvpXp.id!=='pvp-xp-hybrid-1'||pvpXp.easyStrengthRatio!==.35||pvpXp.joiningStrengthPercent!==50||
 pvpXp.easyVictoryPercentages.join(',')!=='100,50,25,10,0'||pvpXp.windowSeconds!==86400||
 pvpXp.bonusRequirementPercent!==10||pvpXp.maximumBonus!==200||pvpXp.budgetUnits!==10000)throw new Error('Invalid PvP XP policy.');

export interface XpInput {level:number;opponentLevel:number;power:number;opponentPower:number;eligible:boolean;botVictory?:number;}
export function bonusCapacity(level:number){return Math.max(1,Math.min(pvpXp.maximumBonus,Math.floor(levelRequirement(level)*pvpXp.bonusRequirementPercent/100)));}
export function boundedVictoryXp(input:XpInput,easyWins=0,spentUnits=0){
 const {level,opponentLevel,power,opponentPower,eligible,botVictory}=input;
 if(![level,opponentLevel].every(n=>Number.isSafeInteger(n)&&n>=1)||![easyWins,spentUnits].every(n=>Number.isSafeInteger(n)&&n>=0)||spentUnits>pvpXp.budgetUnits||
  (botVictory!==undefined&&(!Number.isSafeInteger(botVictory)||botVictory<1)))throw new RangeError('Invalid PvP XP input.');
 const old=victoryExperience47(level,opponentLevel,eligible,power,opponentPower);
 const ratio=opponentPower/Math.max(1,power),easy=ratio<pvpXp.easyStrengthRatio;
 const repeatMultiplier=botVictory===undefined?100:botCombat.victoryPercentages[Math.min(botVictory-1,botCombat.victoryPercentages.length-1)]!;
 const scale=(amount:number)=>botVictory===undefined?amount:scaleBotExperience(amount,botCombat.fullXpPercent,repeatMultiplier).amount;
 const baseline=scale(old.amount),easyPercent=pvpXp.easyVictoryPercentages[Math.min(easyWins,pvpXp.easyVictoryPercentages.length-1)]!;
 const strengthPercent=easy?pvpXp.joiningStrengthPercent*(ratio/pvpXp.easyStrengthRatio)**2:old.strengthPercent;
 const smooth=eligible&&easy?Math.max(1,Math.floor(old.base*old.levelPercent*strengthPercent/10000)):old.amount;
 // Apply C to the extra full award, then preserve both existing bot floors.
 // The existing 1-XP floor is never multiplied away.
 const candidate=eligible&&easy?scale(1+Math.floor((smooth-1)*easyPercent/100)):baseline;
 const capacity=bonusCapacity(level),available=Math.floor((pvpXp.budgetUnits-spentUnits)*capacity/pvpXp.budgetUnits);
 const bonus=Math.min(Math.max(0,candidate-baseline),available);
 const units=bonus?Math.ceil(bonus*pvpXp.budgetUnits/capacity):0;
 return {...old,amount:baseline+bonus,baselineAmount:baseline,candidateAmount:candidate,bonusAmount:bonus,budgetUnits:units,
  bonusCapacity:capacity,budgetRemainingUnits:pvpXp.budgetUnits-spentUnits-units,easyWins,easyPercent,strengthRatio:ratio,strengthPercent,
  fullXpPercent:botVictory===undefined?100:botCombat.fullXpPercent,repeatMultiplier,
  reduced:!eligible||easy||repeatMultiplier<100,
  reason:!eligible?'repeat_budget':easy?(candidate>baseline&&bonus<candidate-baseline?'easy_bonus_budget':easyPercent===0?'easy_repeat':bonus>0?'easy_victory':'overwhelming_advantage'):old.reason,
  rulesetId:pvpXp.id};
}
export type PvpXpDetails=ReturnType<typeof boundedVictoryXp>;
