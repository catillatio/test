import {readFileSync} from 'node:fs';
import {levelRequirement} from './alpha-rules.js';
export const initialProgressionEconomy=JSON.parse(readFileSync(new URL('../rulesets/progression-economy-0.1/rules.json',import.meta.url),'utf8'));
export const progressionEconomy=JSON.parse(readFileSync(new URL('../rulesets/progression-economy-0.2/rules.json',import.meta.url),'utf8')) as {
 id:string;provenance:string;victoryXp:{requirementPercent:number;minimum:number;maximum:number;relativeLevelPercent:number;minimumDifficultyPercent:number;maximumDifficultyPercent:number;repeatedMinimum:number;humanFullVictoriesPerTarget:number;botFullVictoriesPerTarget:number;botFullVictoriesPerDay:number;windowSeconds:number};
 income:{intervalMilliseconds:number;policy:string};recruitment:{rosterLimit:number;botAcceptance:string};statistics:{kills:string;deaths:string};
};
export function victoryExperience(attackerLevel:number,defenderLevel:number,fullReward=true){
 const r=progressionEconomy.victoryXp;
 const base=Math.max(r.minimum,Math.min(r.maximum,Math.ceil(levelRequirement(attackerLevel)*r.requirementPercent/100)));
 const difficulty=Math.max(r.minimumDifficultyPercent,Math.min(r.maximumDifficultyPercent,100+(defenderLevel-attackerLevel)*r.relativeLevelPercent));
 const amount=fullReward?Math.max(r.minimum,Math.floor(base*difficulty/100)):r.repeatedMinimum;
 return {amount,base,difficultyPercent:difficulty,reduced:!fullReward,rulesetId:progressionEconomy.id};
}
