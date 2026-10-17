import {readFileSync} from 'node:fs';
export const strategy=JSON.parse(readFileSync(new URL('../rulesets/strategy-0.1/rules.json',import.meta.url),'utf8')) as {
  id:string;provenance:string;
  callings:Record<'Freeblade'|'Warden'|'Spellward',{description:string;attackPercent:number;defensePercent:number;healthRecoveryPercent:number;manaRecoveryPercent:number;spiritRecoveryPercent:number}>;
  callingChange:{cooldownSeconds:number;laterCost:number};
  bots:{populationVersion:string;minLevel:number;maxLevel:number;tiers:string[];dailyRewardedBattles:number;perTargetRewardedBattles:number;rewardWindowSeconds:number;recoverySeconds:number;walletBase:number;walletPerLevel:number;maintenanceHours:number};
  bounties:{minimum:number;maximum:number;feePercent:number;minimumFee:number;minimumLevel:number;minimumQuests:number;durationSeconds:number;cancelAfterSeconds:number;sponsorActiveLimit:number;sponsorDailyLimit:number;targetDailyLimit:number;sponsorTargetCooldownSeconds:number;claimantDailyLimit:number;claimantDailyGoldLimit:number;pairClaimCooldownSeconds:number;sponsorClaimantCooldownSeconds:number};
  developmentAccount:{username:string;gold:number;armyParticipants:number};
};
if(strategy.id!=='strategy-0.1'||Object.keys(strategy.callings).join(',')!=='Freeblade,Warden,Spellward')throw new Error('Invalid strategy ruleset.');
export type Calling=keyof typeof strategy.callings;
export function callingFor(name:string){return strategy.callings[name as Calling]??strategy.callings.Freeblade;}
export function callingPower(power:number,percent:number){return Math.round(power*(100+percent))/100;}
export function recoverySeconds(name:string,resource:'health'|'mana'|'spirit',base:number){return Math.ceil(base*callingFor(name)[`${resource}RecoveryPercent`]/100);}
export function bountyFee(amount:number){return Math.max(strategy.bounties.minimumFee,Math.ceil(amount*strategy.bounties.feePercent/100));}
