import {readFileSync} from 'node:fs';
export const refinements=JSON.parse(readFileSync(new URL('../rulesets/refinements-0.1/rules.json',import.meta.url),'utf8')) as {
 id:string;provenance:string;combat:{cooldownSeconds:number;defenderMinimumHealth:number};
 bounties:{minimum:number;maximum:number;feePercent:number;minimumFee:number;minimumLevel:number;minimumQuests:number;durationSeconds:number;cancelAfterSeconds:number;targetDailyLimit:number;claimRequiresFinishingAttack:boolean;populationBotsExcluded:boolean};
 bots:{populationVersion:string;armyCap:number;naturalHealthRecovery:boolean;walletBase:number;walletPerLevel:number;walletPerLevelSquared:number};
 ui:{pollSeconds:number;publicTalesPageSize:number};
};
if(refinements.id!=='refinements-0.1'||refinements.combat.cooldownSeconds!==0||refinements.bounties.targetDailyLimit!==50)throw new Error('Invalid Phase 4.1 rules.');
export const bountyRules=refinements.bounties;
export function finalizedBountyFee(amount:number){return Math.max(bountyRules.minimumFee,Math.ceil(amount*bountyRules.feePercent/100));}
