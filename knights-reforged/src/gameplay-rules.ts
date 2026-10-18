import {readFileSync} from 'node:fs';
import {levelRequirement} from './alpha-rules.js';
export const gameplay=JSON.parse(readFileSync(new URL('../rulesets/gameplay-refinement-1/rules.json',import.meta.url),'utf8')) as {
 id:string;provenance:string;healing:{levelsPerGoldPerHealth:number};
 loot:{percent:number;maximum:number;windowSeconds:number;victoryPercentages:number[];botBaseCap:number;botLevelSquaredPercent:number;botMaximum:number};
 victoryXp:{earlyRequirementPercent:number;earlyThroughLevel:number;transitionThroughLevel:number;transitionStepPercent:number;matureStartLevel:number;matureStartPercent:number;matureStepPercent:number;maximumRequirementPercent:number;maximumBase:number;relativeLevelPercent:number;minimumLevelPercent:number;maximumLevelPercent:number;minimumStrengthRatio:number;maximumStrengthPercent:number;repeatXp:number;humanFullVictoriesPerTarget:number;botFullVictoriesPerTarget:number;botFullVictoriesPerDay:number;windowSeconds:number};
};
if(gameplay.id!=='gameplay-refinement-1'||gameplay.loot.victoryPercentages.join(',')!=='100,75,50,25,10')throw new Error('Invalid gameplay refinement catalog.');
export function healingQuote(health:number,maxHealth:number,level:number,gold:number){
 if(![health,maxHealth,level,gold].every(Number.isSafeInteger)||health<0||maxHealth<health||level<1||gold<0)throw new RangeError('Invalid healing state.');
 const missing=maxHealth-health,unitCost=Math.ceil(level/gameplay.healing.levelsPerGoldPerHealth),cost=missing*unitCost;
 return {health,maxHealth,missing,unitCost,cost,availableGold:gold,affordable:gold>=cost,shortfall:Math.max(0,cost-gold),rulesetId:gameplay.id};
}
export function victoryLoot45(gold:number,victory:number,bot=false,available=true,defenderLevel=1){
 if(!Number.isSafeInteger(gold)||gold<0||!Number.isSafeInteger(victory)||victory<1||!Number.isSafeInteger(defenderLevel)||defenderLevel<1)throw new RangeError('Invalid loot state.');
 const r=gameplay.loot,base=Math.min(r.maximum,Math.floor(gold*r.percent/100));
 const multiplier=r.victoryPercentages[Math.min(victory-1,r.victoryPercentages.length-1)]!;
 const botCap=bot?Math.min(r.botMaximum,r.botBaseCap+Math.floor(Math.min(50,defenderLevel)**2*r.botLevelSquaredPercent/100)):null;
 return {base,multiplier,amount:bot?available?Math.min(botCap!,Math.floor(base*multiplier/100)):0:Math.floor(base*multiplier/100),botCap,botRewardAvailable:bot?available:null,rulesetId:gameplay.id};
}
export function victoryExperience45(attackerLevel:number,defenderLevel:number,fullReward=true,attackPower=100,defensePower=100){
 if(![attackPower,defensePower].every(n=>Number.isFinite(n)&&n>=0))throw new RangeError('Invalid combat strength.');
 const r=gameplay.victoryXp;
 const requirementPercent=attackerLevel<=r.earlyThroughLevel?r.earlyRequirementPercent:attackerLevel<=r.transitionThroughLevel?r.earlyRequirementPercent+(attackerLevel-r.earlyThroughLevel)*r.transitionStepPercent:Math.min(r.maximumRequirementPercent,r.matureStartPercent+(attackerLevel-r.matureStartLevel)*r.matureStepPercent);
 const base=Math.max(1,Math.min(r.maximumBase,Math.ceil(levelRequirement(attackerLevel)*requirementPercent/100)));
 const levelPercent=Math.max(r.minimumLevelPercent,Math.min(r.maximumLevelPercent,100+(defenderLevel-attackerLevel)*r.relativeLevelPercent));
 const ratio=defensePower/Math.max(1,attackPower),strengthPercent=Math.max(1,Math.min(r.maximumStrengthPercent,Math.floor(ratio*100)));
 const trivial=ratio<r.minimumStrengthRatio;
 const amount=fullReward&&!trivial?Math.max(1,Math.floor(base*levelPercent*strengthPercent/10000)):r.repeatXp;
 return {amount,base,requirementPercent,levelPercent,strengthPercent,difficultyPercent:levelPercent,trivial,reduced:!fullReward||trivial,reason:!fullReward?'repeat_budget':trivial?'overwhelming_advantage':'matched_victory',rulesetId:gameplay.id};
}
