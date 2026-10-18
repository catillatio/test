import {readFileSync} from 'node:fs';
import {victoryExperience45} from './gameplay-rules.js';
export const gameFeel=JSON.parse(readFileSync(new URL('../rulesets/game-feel-1/rules.json',import.meta.url),'utf8')) as {
 id:string;provenance:string;equipmentResale:{numerator:number;denominator:number;rounding:string};
 victoryXp:{minimumMeaningfulStrengthRatio:number;minimumStrengthPercent:number;maximumStrengthPercent:number;repeatXp:number};
 botIncome:{intervalSeconds:number;batchSize:number;maximumBatches:number};
};
if(gameFeel.id!=='game-feel-1')throw new Error('Invalid game-feel rules.');
export function equipmentResale(unitCost:number){
 if(!Number.isSafeInteger(unitCost)||unitCost<0)throw new RangeError('Invalid recorded equipment cost.');
 return Math.floor(unitCost*gameFeel.equipmentResale.numerator/gameFeel.equipmentResale.denominator);
}
export function victoryExperience47(attackerLevel:number,defenderLevel:number,fullReward=true,attackPower=100,defensePower=100){
 const old=victoryExperience45(attackerLevel,defenderLevel,fullReward,attackPower,defensePower),r=gameFeel.victoryXp;
 const strengthPercent=Math.max(r.minimumStrengthPercent,old.strengthPercent);
 const amount=fullReward&&!old.trivial?Math.max(1,Math.floor(old.base*old.levelPercent*strengthPercent/10000)):r.repeatXp;
 return {...old,amount,strengthPercent,rulesetId:gameFeel.id};
}
