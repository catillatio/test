// Offline read-only evidence adapter. Input is an explicitly supplied JSON
// export of {id,snapshot,result,rewarded}; no credentials/network/DB writes.
import {readFileSync} from 'node:fs';
import {victoryExperience47} from '../src/game-feel-rules.js';
import {botVictoryRewards} from '../src/bot-combat-rules.js';
interface SavedBattle {id:string;rewarded?:boolean;snapshot?:{attacker?:{level:number;attack:number;xp?:number};defender?:{level:number;defense:number;gold:number}};
 result:{outcome?:string;attackerXp?:number;temporaryRival?:boolean;xpDetails?:{reason?:string;amount?:number;trivial?:boolean;rulesetId?:string};lootDetails?:{victory?:number}};}
export function explain(row:SavedBattle){
 const a=row.snapshot?.attacker,d=row.snapshot?.defender,r=row.result;
 if(r.outcome==='defender_win')return {id:row.id,recordedXp:r.attackerXp,primary:'attacking_loss',expectedXp:0};
 if(r.outcome!=='attacker_win')return {id:row.id,recordedXp:r.attackerXp,primary:'unknown_missing_outcome'};
 if(r.xpDetails?.rulesetId&&!['game-feel-1','bot-combat-rewards-2'].includes(r.xpDetails.rulesetId))return {
  id:row.id,recordedXp:r.attackerXp,recordedPolicy:r.xpDetails.rulesetId,primary:r.xpDetails.reason??'unknown_policy',note:'Use the recorded policy; current baseline arithmetic is not a historical replay.'};
 if(!a||!d)return {id:row.id,recordedXp:r.attackerXp,primary:'unknown_missing_snapshot'};
 const old=victoryExperience47(a.level,d.level,row.rewarded!==false,a.attack,d.defense);
 const bot=r.temporaryRival===true,victory=r.lootDetails?.victory;
 const scaled=bot&&victory?botVictoryRewards(d.gold,a.level,d.level,victory,a.attack,d.defense).xp:null;
 const nominal=scaled?.amount??old.amount;
 const causes=[];
 if(!bot&&row.rewarded===false)causes.push('repeat_budget');
 if(old.trivial)causes.push('trivial_strength');
 if(bot&&(scaled?.repeatMultiplier??100)<100)causes.push('bot_repeat_scaling');
 if(bot&&nominal===1&&!old.trivial&&old.amount>1)causes.push('bot_scaling_and_rounding');
 if(!bot&&old.amount===1&&!old.trivial&&row.rewarded!==false)causes.push('base_rounding');
 if(a.xp!==undefined&&r.attackerXp===1&&nominal>1&&a.xp===2147483646)causes.unshift('lifetime_storage_limit');
 return {id:row.id,recordedXp:r.attackerXp,recordedReason:r.xpDetails?.reason,recordedPolicy:r.xpDetails?.rulesetId,botIdentityRecorded:bot,
  ratio:d.defense/Math.max(1,a.attack),victory:bot?victory:null,legacyNominalXp:nominal,causes,
  primary:causes[0]??(r.attackerXp===1?'unknown':'ordinary_difficulty'),note:bot&&!victory?'Missing bot sequence; exact bot rounding unverified':undefined};
}
if(process.argv[1]?.endsWith('explain-pvp-xp.ts')){
 if(!process.argv[2])throw Error('Pass a read-only battle JSON export path.');
 const rows=JSON.parse(readFileSync(process.argv[2],'utf8')) as SavedBattle[];console.log(JSON.stringify(rows.map(explain),null,2));
}
