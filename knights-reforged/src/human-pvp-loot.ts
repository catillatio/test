// Current ordinary human loot. Historical capped helpers remain unchanged for
// their recorded policies and the independently approved bot reward pipeline.
import {readFileSync} from 'node:fs';
import {deepFreeze} from './compatibility-rules.js';
import {definitionDigest} from './expansion-artwork.js';
import {gameplay} from './gameplay-rules.js';
interface HumanLootPolicy {
 id:string;provenance:string;baseRuleset:string;target:string;percent:number;
 maximum:null;windowSeconds:number;victoryPercentages:number[];rounding:string;transfer:string;
}
export const humanPvpLoot=deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/human-pvp-loot-1/rules.json',import.meta.url),'utf8')) as HumanLootPolicy);
export const humanPvpLootDigest='39a583eaf0338815de91eba7221de5d1c0599952bc4e4f9970400ae05ea42531';
export function validateHumanPvpLoot(policy:HumanLootPolicy=humanPvpLoot){
 if(policy.id!=='human-pvp-loot-1'||policy.target!=='human'||policy.baseRuleset!==gameplay.id||policy.percent!==3||policy.maximum!==null||policy.windowSeconds!==gameplay.loot.windowSeconds||definitionDigest(policy.victoryPercentages)!==definitionDigest(gameplay.loot.victoryPercentages)||definitionDigest(policy)!==humanPvpLootDigest)throw Error('Unknown immutable human PvP loot policy.');
}
validateHumanPvpLoot();
export function humanVictoryLoot(gold:number,victory:number){
 if(!Number.isSafeInteger(gold)||gold<0||!Number.isSafeInteger(victory)||victory<1)throw RangeError('Invalid human loot state.');
 const multiplier=humanPvpLoot.victoryPercentages[Math.min(victory-1,humanPvpLoot.victoryPercentages.length-1)]!;
 const base=BigInt(gold)*BigInt(humanPvpLoot.percent)/100n;
 const amount=base*BigInt(multiplier)/100n;
 // Both results are <= the validated safe-integer wallet. Never multiply a
 // large Number balance before flooring; intermediate products use BigInt.
 return {base:Number(base),multiplier,amount:Number(amount),botCap:null,botRewardAvailable:null,rulesetId:humanPvpLoot.id};
}
