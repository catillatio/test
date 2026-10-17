import {readFileSync} from 'node:fs';
export const previousStrategy=JSON.parse(readFileSync(new URL('../rulesets/strategy-0.1/rules.json',import.meta.url),'utf8'));
export const strategy=JSON.parse(readFileSync(new URL('../rulesets/strategy-0.2/rules.json',import.meta.url),'utf8')) as {
  id:string;provenance:string;
  callings:Record<'Freeblade'|'Warden'|'Spellward',{description:string;attackPercent:number;defensePercent:number;healthRecoveryPercent:number;manaRecoveryPercent:number;spiritRecoveryPercent:number}>;
  callingChange:{cooldownSeconds:number;laterCost:number};
  bots:{populationVersion:string;minLevel:number;maxLevel:number;tiers:string[];dailyRewardedBattles:number;perTargetRewardedBattles:number;rewardWindowSeconds:number;recoverySeconds:number;walletBase:number;walletPerLevel:number;maintenanceHours:number};
  bounties:{minimum:number;maximum:number;feePercent:number;minimumFee:number;minimumLevel:number;minimumQuests:number;durationSeconds:number;cancelAfterSeconds:number;sponsorActiveLimit:number;sponsorDailyLimit:number;targetDailyLimit:number;sponsorTargetCooldownSeconds:number;claimantDailyLimit:number;claimantDailyGoldLimit:number;pairClaimCooldownSeconds:number;sponsorClaimantCooldownSeconds:number};
  developmentAccount:{username:string;gold:number;armyParticipants:number};
};
if(strategy.id!=='strategy-0.2'||Object.keys(strategy.callings).join(',')!=='Freeblade,Warden,Spellward')throw new Error('Invalid strategy ruleset.');
export type Calling=keyof typeof strategy.callings;
export function callingFor(name:string){return strategy.callings[name as Calling]??strategy.callings.Freeblade;}
export function callingPower(power:number,percent:number){return Math.round(power*(100+percent))/100;}
export function recoverySeconds(name:string,resource:'health'|'mana'|'spirit',base:number){return Math.ceil(base*callingFor(name)[`${resource}RecoveryPercent`]/100);}
export function bountyFee(amount:number){return Math.max(strategy.bounties.minimumFee,Math.ceil(amount*strategy.bounties.feePercent/100));}
export const previousBotCatalog=JSON.parse(readFileSync(new URL('../rulesets/passive-rivals-1/rules.json',import.meta.url),'utf8'));
export const phase4BotCatalog=JSON.parse(readFileSync(new URL('../rulesets/passive-rivals-2/rules.json',import.meta.url),'utf8'));
export const phase41BotCatalog=JSON.parse(readFileSync(new URL('../rulesets/passive-rivals-3/rules.json',import.meta.url),'utf8'));
export const phase42BotCatalog=JSON.parse(readFileSync(new URL('../rulesets/passive-rivals-4/rules.json',import.meta.url),'utf8'));
export const botCatalog=JSON.parse(readFileSync(new URL('../rulesets/passive-rivals-5/rules.json',import.meta.url),'utf8')) as {
  variants:number;minimumGold:number;
  identities:Record<string,string>;economy:{walletBase:number;walletIncomeHours:number;walletEquipmentPercent:number;vaultIncomeHours:number;vaultEstatePercent:number;estateBands:{minimumLevel:number;types:number;copies:number}[];estateCopiesPercent:Record<string,number>};
  id:string;provenance:string;armyCap:number;levelsPerArmyMember:number;manaBase:number;levelsPerManaUpgrade:number;spiritBase:number;levelsPerSpiritUpgrade:number;profiles:Record<string,{armyPercent:number;equipmentPercent:number;itemLevelLag:number;levelsPerTraining:number;surname:string;goldPercent:number;calling:'Freeblade'|'Warden'|'Spellward';spellMinimumLevel:number;armorMinimumLevel:number;healthBonus:number}>;
  healthBase:number;levelsPerHealthUpgrade:number;healthPerUpgrade:number;names:string[];calibrateSeasoned:boolean;calibrationElitePercent:number;benchmark:{armyPercent:number;equipmentPercent:number;itemLevelLag:number;levelsPerTraining:number;calling:string};
};
if(botCatalog.id!=='passive-rivals-5'||botCatalog.armyCap!==10||botCatalog.names.length!==50)throw new Error('Invalid passive rival population catalog.');

if(Object.keys(botCatalog.identities).length!==450||new Set(Object.values(botCatalog.identities)).size!==450||Object.values(botCatalog.identities).some(name=>name.length>28||!/^([\p{L}\p{N} '\-]){2,28}$/u.test(name)))throw new Error('Invalid fantasy rival identities.');
