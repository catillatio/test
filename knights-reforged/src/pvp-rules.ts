import {readFileSync} from 'node:fs';
import {bountyPlacementPolicy} from './bounty-policy.js';
export const pvp=JSON.parse(readFileSync(new URL('../rulesets/pvp-economy-0.1/rules.json',import.meta.url),'utf8')) as {
  id:string;provenance:string;
  loot:{percent:number;maximum:number;windowSeconds:number;victoryPercentages:number[];botMaximum:number;defenderVictoryLoot:number};
  bounties:{minimum:number;maximum:number;feePercent:number;minimumFee:number;minimumLevel:number;minimumQuests:number;durationSeconds:number;cancelAfterSeconds:number;targetDailyLimit:number;claimRequiresFinishingAttack:boolean;populationBotsExcluded:boolean;botTargetsRequireDevelopmentFlag:boolean;sponsorsCannotClaim:boolean};
  vault:{maximumBalance:number;depositFee:number;interest:number};
  bots:{populationVersion:string;dailyRewardedBattles:number;perTargetRewardedBattles:number};
};
if(pvp.id!=='pvp-economy-0.1'||pvp.loot.victoryPercentages.join(',')!=='100,75,50,25,10')throw new Error('Invalid PvP economy rules.');
export const bountyRules={...pvp.bounties,targetDailyLimit:bountyPlacementPolicy.targetLimit,sponsorTargetDailyLimit:bountyPlacementPolicy.sponsorTargetLimit,placementWindowSeconds:bountyPlacementPolicy.windowSeconds,quotaPolicyId:bountyPlacementPolicy.id};
export function bountyFee(amount:number){return Math.max(bountyRules.minimumFee,Math.ceil(amount*bountyRules.feePercent/100));}
export function victoryLoot(gold:number,victory:number,bot=false,botRewardAvailable=true){
  if(!Number.isSafeInteger(gold)||gold<0||!Number.isSafeInteger(victory)||victory<1)throw new RangeError('Invalid loot inputs.');
  const base=Math.min(pvp.loot.maximum,Math.floor(gold*pvp.loot.percent/100));
  const multiplier=pvp.loot.victoryPercentages[Math.min(victory-1,pvp.loot.victoryPercentages.length-1)]!;
  const diminished=Math.floor(base*multiplier/100);
  return {base,multiplier,amount:bot?botRewardAvailable?Math.min(pvp.loot.botMaximum,diminished):0:diminished,
    botCap:bot?pvp.loot.botMaximum:null,botRewardAvailable:bot?botRewardAvailable:null};
}
