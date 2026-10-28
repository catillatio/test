// Offline only: paid/maintained synthetic builds, finite 900-rival cohort.
// No database, server, activation or population provisioning is performed.
import {mkdirSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {boundedVictoryXp,pvpXp,type XpInput} from '../src/pvp-xp-policy.js';
import {victoryExperience47} from '../src/game-feel-rules.js';
import {scaleBotExperience} from '../src/bot-experience.js';
import {researchReward} from './historical-xp-study.js';
import {launchResearchBots,loadout,power} from './simulation/level100-e2b.js';
import {alpha,areRivals,resolveAlphaCombat} from '../src/alpha-rules.js';
import {advanceProgression,prepareProgressionEpoch} from '../src/progression-policy.js';
import {regenerate} from '../src/rules.js';
import {recoverySeconds} from '../src/strategy-rules.js';
import {healingQuote} from '../src/gameplay-rules.js';
import {botVictoryRewards} from '../src/bot-combat-rules.js';
const DAY=86400000;
function oldXp(i:XpInput){const full=victoryExperience47(i.level,i.opponentLevel,i.eligible,i.power,i.opponentPower).amount;
 return i.botVictory?scaleBotExperience(full,65,[100,85,70,55,40][Math.min(i.botVictory-1,4)]!).amount:full;}
function distribution(values:number[],encounters:number){const sorted=[...values].sort((a,b)=>a-b),q=(p:number)=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??null,total=sorted.reduce((a,b)=>a+b,0);
 return {encounters,wins:sorted.length,onePercent:100*sorted.filter(v=>v===1).length/(sorted.length||1),median:q(.5),p75:q(.75),mean:total/(sorted.length||1),xpPerStamina:total/(encounters||1)};}
export function study(){
 const cohort=launchResearchBots(),matrix=[];
 // Exhaustively enumerate 441 roll pairs for each build/target combination.
 for(const level of [1,5,10,17,25,50,75,100])for(const participants of [...new Set([1,level,5*level])])for(const build of ['offense','tank','balanced'] as const){
  const training=Math.min(25,level-1),inv=loadout(level,participants,build,true),attack=power(level,participants,inv,'attack',build==='tank'?0:training);
  const before:number[]=[],after:number[]=[],causes={strength:0,rounding:0};let encounters=0;
  for(const target of cohort.filter(t=>areRivals(level,t.level))){
   const defense=power(target.level,target.n,target.inventory,'defense',target.training,target.calling),i={level,opponentLevel:target.level,power:attack,opponentPower:defense,eligible:true,botVictory:1};
   const old=oldXp(i),next=boundedVictoryXp(i);let wins=0;
   for(let ar=-10;ar<=10;ar++)for(let dr=-10;dr<=10;dr++){
    encounters++;if(resolveAlphaCombat({attack,health:100,maxHealth:100,gold:0},{defense,health:100,maxHealth:100,gold:0},ar,dr).outcome==='attacker_win')wins++;
   }
   for(let n=0;n<wins;n++){before.push(old);after.push(next.amount);}
   if(old===1)causes[defense/Math.max(1,attack)<.35?'strength':'rounding']+=wins;
  }
  matrix.push({level,participants,build,training,before:distribution(before,encounters),afterFreshIsolated:distribution(after,encounters),oneXpCause:causes});
 }
 const controlled=[];
 for(const level of [1,5,10,17,25,50,75,100])for(const ratio of [.01,.1,.2,.3499,.35,.7,1,1.1])for(const bot of [false,true])for(const rotation of [false,true]){
  let units=0,bonus=0,before=0,after=0,unboundedC=0;const firstSix=[];
  for(let n=0;n<100;n++){
   const victory=rotation?1:n+1,i={level,opponentLevel:level,power:10000,opponentPower:ratio*10000,eligible:bot||victory<=3,...(bot?{botVictory:victory}:{})};
   const r=boundedVictoryXp(i,rotation?0:n,units);units+=r.budgetUnits;bonus+=r.bonusAmount;before+=oldXp(i);after+=r.amount;unboundedC+=researchReward('hybrid-v1',level,level,ratio,bot?'bot':'human',victory);
   if(n<6)firstSix.push(r.amount);
  }
  controlled.push({level,ratio,bot,rotation,before100Wins:before,policyC100Wins:unboundedC,after100Wins:after,bonus,units,firstSix});
 }
 const dynamic=[];
 for(const level of [1,10,17,25,50,75,100])for(const participants of [...new Set([1,level,5*level])])for(const behavior of ['same-easy','rotate-easy','meaningful'] as const)for(const expanded of [false,true]){
  for(const policy of ['current','bounded'] as const)dynamic.push(resourceDay(level,participants,behavior,policy,expanded));
 }
 return {policy:pvpXp,method:{productionContacted:false,cohort:cohort.length,matrix:'exhaustive legal rolls; isolated first wins do not share allowance',dynamic:'24h seeded finite cohort, real damage/health/stamina, paid healing, earned loot, XP epochs/refills; starting gear paid/maintained; no shopping or ally acquisition',limits:'Synthetic scenarios, not typical-player telemetry. Inventory remains fixed; maintenance is assumed funded, so gold is an optimistic upper bound. No lifetime pacing forecast.'},matrix,controlled,dynamic};
}
export function resourceDay(startLevel:number,participants:number,behavior:'same-easy'|'rotate-easy'|'meaningful',policy:'current'|'bounded',expanded=false){
 const targets=launchResearchBots().map(t=>({...t,defense:power(t.level,t.n,t.inventory,'defense',t.training,t.calling),pair:[] as number[],easy:[] as number[]})),inv=loadout(startLevel,participants,'offense',true),epoch=expanded?prepareProgressionEpoch(startLevel,0,'xp-post50-150-1'):undefined;
 let level=startLevel,progress=0,health=100,spirit=3,hpAt=0,spAt=0,gold=25000,healing=0,xp=0,bonus=0,attacks=0,wins=0,seed=8173;
 const events:{at:number;units:number}[]=[],awards:number[]=[];let fixed:string|undefined;
 const draw=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%21-10;};
 // At most one attack per natural two-minute interval; no automatic action
 // created by the XP change. Level refills can remove resource blocking.
 for(let at=0;at<DAY;at+=120000){
  const now=new Date(at),hp=regenerate(health,100,new Date(hpAt),now,recoverySeconds('Freeblade','health',alpha.resources.healthSeconds),alpha.resources.healthAmount),sp=regenerate(spirit,3,new Date(spAt),now,recoverySeconds('Freeblade','spirit',alpha.resources.spiritSeconds));
  health=hp.value;hpAt=+hp.updated;spirit=sp.value;spAt=+sp.updated;
  if(spirit<1)continue;
  if(health<alpha.combat.minimumHealth){const quote=healingQuote(health,100,level,gold);if(!quote.affordable)continue;gold-=quote.cost;healing+=quote.cost;health=100;hpAt=at;}
  const attack=power(level,participants,inv,'attack',Math.min(25,startLevel-1));
  const spent=events.filter(e=>e.at>at-DAY).reduce((s,e)=>s+e.units,0);
  const choices=targets.filter(t=>{
   const ratio=t.defense/attack;
   return areRivals(level,t.level)&&(behavior==='meaningful'?ratio>=.35&&ratio<=1.1:ratio<.35)&&(!fixed||behavior!=='same-easy'||t.id===fixed);
  }).map(t=>{
   const recovered=regenerate(t.health,t.maxHealth,new Date(t.hpAt),now,recoverySeconds(t.calling,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount);
   t.health=recovered.value;t.hpAt=+recovered.updated;
   const defense=t.defense,pair=t.pair.filter(time=>time>at-DAY),easy=t.easy.filter(time=>time>at-DAY);
   const i={level,opponentLevel:t.level,power:attack,opponentPower:defense,eligible:true,botVictory:pair.length+1},r=boundedVictoryXp(i,easy.length,spent);
   return {t,defense,i,r,reward:policy==='bounded'?r.amount:oldXp(i)};
  }).filter(c=>c.t.health>0).sort((a,b)=>b.reward-a.reward||a.t.id.localeCompare(b.t.id));
  const c=choices[0];if(!c)continue;if(!fixed)fixed=c.t.id;
  const result=resolveAlphaCombat({attack,health,maxHealth:100,gold},{defense:c.defense,health:c.t.health,maxHealth:c.t.maxHealth,gold:c.t.wallet},draw(),draw());
  if(health===100)hpAt=at;if(spirit===3)spAt=at;if(c.t.health===c.t.maxHealth)c.t.hpAt=at;health=result.attackerHealthAfter;c.t.health=result.defenderHealthAfter;spirit--;attacks++;
  if(result.outcome!=='attacker_win')continue;
  wins++;c.t.pair.push(at);if(c.r.trivial)c.t.easy.push(at);
  const loot=botVictoryRewards(c.t.wallet,level,c.t.level,c.i.botVictory,attack,c.defense).loot.amount;c.t.wallet-=loot;gold+=loot;
  if(policy==='bounded'){events.push({at,units:c.r.budgetUnits});bonus+=c.r.bonusAmount;}
  xp+=c.reward;awards.push(c.reward);const next=advanceProgression(level,progress,c.reward,epoch);level=next.level;progress=next.progress;
  if(next.gained){health=100;spirit=3;hpAt=at;spAt=at;}
 }
 return {startLevel,participants,behavior,policy,expanded,attacks,wins,xp,bonus,levelAfter:level,progress,healthAfter:health,staminaAfter:spirit,goldAfter:gold,healingGold:healing,distribution:distribution(awards,attacks)};
}
if(process.argv[1]?.endsWith('pvp-xp-balance-study.ts')){const result=study();mkdirSync('docs/pvp-xp-balance',{recursive:true});writeFileSync('docs/pvp-xp-balance/results.json.gz',gzipSync(JSON.stringify(result)+'\n',{level:9}));console.log(JSON.stringify({matrix:result.matrix.length,controlled:result.controlled.length,dynamic:result.dynamic.length,examples:result.controlled.filter(r=>r.level===50&&r.ratio===.2)}));}
