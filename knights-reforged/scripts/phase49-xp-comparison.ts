// Offline balance review only: never connects to a database or modifies the
// active policy. All three candidates share the same gold and recovery rules.
import {mkdir,writeFile} from 'node:fs/promises';
import {simulateBotCombat,type SimulationOptions} from './simulation/bot-combat.js';
import {victoryExperience47} from '../src/game-feel-rules.js';
import {scaleBotExperience} from '../src/bot-experience.js';
import {levelRequirement,alpha} from '../src/alpha-rules.js';
const percentages=[100,65,40] as const,levels=[5,8,10,17,25,40,50],seeds=[4901,4919,4927];
const schedules=[{name:'six-hours',hours:6},{name:'one-hour-daily-14-days',hours:336,dailySessionHours:1},{name:'two-hours-daily-14-days',hours:336,dailySessionHours:2}];
const results=[];
function run(options:SimulationOptions,scenario:string){
 const s=simulateBotCombat(options);
 const {hourly,samples,lastSamples,...summary}=s;
 return {scenario,...summary,winRate:s.wins/Math.max(1,s.wins+s.losses),goldPerActiveHour:s.goldTransferred/s.activeHours,xpPerActiveHour:s.xpAwarded/s.activeHours,
  endOfSessions:hourly.filter(x=>!options.dailySessionHours||x.hour%24===options.dailySessionHours||x.hour===options.hours),firstBattle:samples[0],lastBattle:lastSamples.at(-1)};
}
for(const schedule of schedules)for(const level of levels)for(const seed of seeds)for(const botXpPercent of percentages)
 results.push(run({level,hours:schedule.hours,dailySessionHours:schedule.dailySessionHours,seed,botXpPercent,policy:'phase49',mode:'varied',heal:true},schedule.name));
for(const botXpPercent of percentages)for(const level of[8,17,50]){
 results.push(run({level,hours:6,botXpPercent,policy:'phase49',mode:'varied',loadout:'established',heal:true},'established-six-hours'));
 for(const players of[1,10])results.push(run({level,hours:6,botXpPercent,players,policy:'phase49',mode:'same',heal:true,decisionSeconds:6,spiritCapacity:level===8?3:10},'same-rival-six-hours'));
}
const formulaExamples=levels.map(level=>{
 const full=victoryExperience47(level,level,true,100,100).amount;
 const quests=alpha.quests.filter(q=>q.level<=level).sort((a,b)=>b.level-a.level||b.xp-a.xp);
 return {level,requirement:levelRequirement(level),matchedFull:full,quest:quests[0]&&{id:quests[0].id,level:quests[0].level,xp:quests[0].xp},policies:percentages.map(percent=>({percent,matched:[100,85,70,55,40].map(pair=>scaleBotExperience(full,percent,pair).amount),weak:scaleBotExperience(1,percent,100).amount,firstWinPercentOfLevel:100*scaleBotExperience(full,percent,100).amount/levelRequirement(level)}))};
});
await mkdir('docs/phase49',{recursive:true});
await writeFile('docs/phase49/xp-comparison.json',JSON.stringify({productionContacted:false,comparisonOnly:true,seeds,formulaExamples,
 assumptions:['Same seeded combat rolls, initial inventories, purses, Land rates, upkeep, healing prices, recovery and pair windows in every candidate; only full bot XP percentage differs.',
 'Daily sessions start at the same time each day for fourteen days. No actions while offline; real regeneration and due income/upkeep catch up. Six-hour scenarios are continuous active windows.',
 'Legal fixed natural loadout unless explicitly labeled established. No automatic equipment purchases, recruitment, skill spending, quests or human Land income; this isolates combat and is not a full-game leveling forecast.',
 'The target-selection heuristic has perfect knowledge of opponent strength and favors fresh, suitably matched opponents. It overestimates novice efficiency. All 450 bot purses and Health are shared in multi-account cases.',
 'Humans start with 5,000 spendable gold after owned equipment and one paid upkeep hour. Offline upkeep can exhaust this reserve and pause gear, especially at high levels; see maintenance, gold and outcome results.',
 'The character architecture remains uncapped; the simulated opponent catalog ends at level 50. Higher levels are reported honestly, without changing the level curve or granting gear.',
 'Calendar horizon includes the final overnight period. End-of-session snapshots report progress at each active session end; sessionStarts records actual recovered resources on return.',
 'Scale XP with an integer floor before the pair multiplier, then floor again; keep a 1-XP minimum. Gold formulas and currency sources never change.'],results},null,2)+'\n');
console.table(results.filter(x=>x.options.seed===4901&&['six-hours','one-hour-daily-14-days','two-hours-daily-14-days'].includes(x.scenario)).map(s=>({scenario:s.scenario,level:s.options.level,percent:s.options.botXpPercent,end:s.finalLevels.join(','),wins:s.wins,losses:s.losses,gold:s.goldTransferred,xp:s.xpAwarded,refillSpirit:s.refillSpirit,naturalSpirit:s.naturalSpirit,conserved:s.conserved})));
