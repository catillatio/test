import {mkdir,writeFile} from 'node:fs/promises';
import {simulateBotCombat} from './simulation/bot-combat.js';
import {botBlueprint} from '../src/development.js';
import {botVictoryRewards,botCombat} from '../src/bot-combat-rules.js';
import {victoryLoot45} from '../src/gameplay-rules.js';
import {victoryExperience47} from '../src/game-feel-rules.js';
import {levelRequirement} from '../src/alpha-rules.js';
const levels=[8,17,25,40,50];
const simulations=levels.flatMap(level=>(['varied','same'] as const).flatMap(mode=>(['phase48','phase49'] as const).map(policy=>simulateBotCombat({level,hours:24,mode,policy,heal:true}))));
for(const level of[17,50])for(const mode of['same','varied'] as const)for(const policy of['phase48','phase49'] as const)simulations.push(simulateBotCombat({level,hours:24,players:10,mode,policy,heal:true}));
for(const policy of['phase48','phase49'] as const)simulations.push(simulateBotCombat({level:17,hours:6,players:10,mode:'same',policy,decisionSeconds:6,spiritCapacity:10,heal:true}));
for(const level of[8,17,50])for(const policy of['phase48','phase49'] as const)simulations.push(simulateBotCombat({level,hours:24,mode:'varied',policy,loadout:'established',heal:true}));
for(const level of[8,17,50])for(const seed of[49,4901,4919,4927,4973])for(const policy of['phase48','phase49'] as const)simulations.push(simulateBotCombat({level,hours:6,mode:'varied',policy,seed,heal:true}));
const comparisons=levels.map(level=>{const b=botBlueprint(level,'seasoned',0);let oldWallet=b.gold,newWallet=b.gold;const repeat=[1,2,3,4,5,6].map(n=>{
 const before={gold:victoryLoot45(oldWallet,n,true,n===1,level).amount,xp:victoryExperience47(level,level,n===1).amount},after=botVictoryRewards(newWallet,level,level,n,100,100);
 oldWallet-=before.gold;newWallet-=after.loot.amount;return {victory:n,before:{...before,remaining:oldWallet},after:{gold:after.loot.amount,xp:after.xp.amount,remaining:newWallet,multiplier:after.loot.multiplier}};
 });return {level,requirement:levelRequirement(level),catalogWallet:b.gold,netHourlyIncome:b.netIncome,first:{gold:victoryLoot45(b.gold,1,true,true,level).amount,xp:victoryExperience47(level,level).amount},newOpponentAfterSixBefore:{gold:0,xp:1},newOpponentAfterSixAfter:botVictoryRewards(b.gold,level,level,1,100,100),repeat};});
await mkdir('docs/phase49',{recursive:true});await writeFile('docs/phase49/paced-simulations-'+botCombat.id+'.json',JSON.stringify({ruleset:botCombat.id,provisionalRepeatFloor:true,productionContacted:false,
 assumptions:['Pure deterministic simulation, not production telemetry or a promise of earnings.','Actual combat rolls, legal fixed inventories, difficulty XP, level requirements and level-up refills are used. Gear/army are not upgraded automatically after leveling.','Decisions every 30s (6s in the burst case); actual Spirit and Health eligibility/recovery, defender recovery, losses, maintenance and affordable paid healing govern completed attacks.','450 shared finite bot purses; actual saved portfolio rates and real-cost upkeep/reserves; no Vault withdrawals or extra endowments. Humans start with 5,000 after equipment and one paid upkeep hour; no human Land income or quests.','Player order is deterministic and serial, demonstrating contention, not CPU-thread fairness. Real concurrent transaction safety is tested separately in PostgreSQL.','Human skill allocations are budget-checked; unused points are not spent. No recruitment, banking, new Land, equipment purchases or strategy learning occurs during these scenarios.'],comparisons,simulations},null,2)+'\n');
console.table(simulations.map(s=>({level:s.options.level,players:s.options.players,mode:s.options.mode,policy:s.options.policy,wins:s.wins,losses:s.losses,gold:s.goldTransferred,xp:s.xpAwarded,levels:s.finalLevels.join(','),refillSpirit:s.refillSpirit,zeroGold:s.zeroGoldWins,conserved:s.conserved})));
