// OFFLINE RESEARCH ONLY. No runtime imports this file or selects these curves.
// Fixed restored snapshots: reward counterfactuals, never production telemetry.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {launchResearchBots,loadout,power} from './simulation/level100-e2b.js';
import {areRivals,resolveAlphaCombat,levelRequirement} from '../src/alpha-rules.js';
import {victoryExperience47} from '../src/game-feel-rules.js';
import {scaleBotExperience} from '../src/bot-experience.js';

const policies=['current','continuous-v1','bands-v1','hybrid-v1'] as const;
type Policy=typeof policies[number];
// Retain 65%, the original two floors, level scaling, cap and human win budget.
export function researchReward(policy:Policy,level:number,otherLevel:number,ratio:number,kind:'bot'|'human',victory=1){
 const old=victoryExperience47(level,otherLevel,kind==='bot'||victory<=3,10000,ratio*10000);
 let full=old.amount;
 if(policy!=='current'&&(kind==='bot'||victory<=3)){
  const multiplier=policy==='bands-v1'?(ratio<.1?0:ratio<.2?.1:ratio<.35?.25:Math.min(1.25,Math.max(.5,Math.floor(ratio*20)/20))):
   ratio<.35?.5*(ratio/.35)**2:Math.min(1.25,Math.max(.5,ratio));
  const easyRepeat=policy==='hybrid-v1'&&ratio<.35?[1,.5,.25,.1,0][Math.min(victory-1,4)]!:1;
  full=Math.max(1,Math.floor(old.base*old.levelPercent/100*multiplier*easyRepeat));
 }
 return kind==='bot'?scaleBotExperience(full,65,[100,85,70,55,40][Math.min(victory-1,4)]!).amount:full;
}
function stats(values:number[],encounters:number){
 if(!values.length)return {victories:0,encounters,note:'No winning cases'};
 values.sort((a,b)=>a-b);const q=(p:number)=>values[Math.max(0,Math.ceil(p*values.length)-1)]!,total=values.reduce((s,x)=>s+x,0);
  return {victories:values.length,encounters,onePercent:100*values.filter(x=>x===1).length/values.length,p25:q(.25),median:q(.5),p75:q(.75),max:values.at(-1),mean:total/values.length,xpPerEncounter:total/encounters,xpPerStamina:total/encounters};
}
export function study(){
 const bots=launchResearchBots(),rows:unknown[]=[],reproduction:Record<string,unknown>={};assert.equal(bots.length,900);
 for(const level of [1,10,25,50,75,100])for(const build of ['offense','tank','balanced'] as const)for(const army of ['small','full'])for(const gear of ['weak','appropriate']){
  const n=army==='small'?Math.max(1,level):5*level,inv=loadout(gear==='weak'?1:level,n,build,true);
  // Legal synthetic specialization: budget level-1, 25 training cap; remaining
  // points are unspent. Balanced splits that budget. Armies/gear are assumed paid.
  const budget=Math.max(0,level-1),atkTraining=build==='offense'?Math.min(25,budget):build==='balanced'?Math.min(25,Math.floor(budget/2)):0;
  const defTraining=build==='tank'?Math.min(25,budget):build==='balanced'?Math.min(25,Math.floor(budget/2)):0;
  const eligible=bots.filter(b=>areRivals(level,b.level));
  for(const role of ['attacker','defender'] as const)for(const kind of role==='attacker'?['bot','human'] as const:['human'] as const){
   const recipient=power(level,n,inv,role==='attacker'?'attack':'defense',role==='attacker'?atkTraining:defTraining);
   const buckets=new Map<string,number[]>();let encounters=0;
   for(const enemy of eligible){
    const opponent=power(enemy.level,enemy.n,enemy.inventory,role==='attacker'?'defense':'attack',enemy.training,enemy.calling),ratio=opponent/recipient;
    let wins=0;for(let ar=-10;ar<=10;ar++)for(let dr=-10;dr<=10;dr++){
     const outcome=role==='attacker'?resolveAlphaCombat({attack:recipient,health:100,maxHealth:100,gold:0},{defense:opponent,health:100,maxHealth:100,gold:0},ar,dr).outcome:
      resolveAlphaCombat({attack:opponent,health:100,maxHealth:100,gold:0},{defense:recipient,health:100,maxHealth:100,gold:0},ar,dr).outcome;
     if(outcome===(role==='attacker'?'attacker_win':'defender_win'))wins++;
    }encounters+=441;
    const difficulty=ratio<.35?'trivial':ratio<.8?'weak':ratio<=1.05?'even':'strong';
    for(const policy of policies)for(const victory of [1,2,3,4,5]){
     const reward=researchReward(policy,level,enemy.level,ratio,kind,victory);
     for(const group of ['all',difficulty]){const key=[policy,victory,group].join('|'),values=buckets.get(key)??[];for(let i=0;i<wins;i++)values.push(reward);buckets.set(key,values);}
    }
   }
   for(const [key,values] of buckets){const [policy,victory,difficulty]=key.split('|');
    // Difficulty rows have their own encounter denominator, including losses.
    const denominator=difficulty==='all'?encounters:eligible.filter(e=>{const r=power(e.level,e.n,e.inventory,role==='attacker'?'defense':'attack',e.training,e.calling)/recipient;return (r<.35?'trivial':r<.8?'weak':r<=1.05?'even':'strong')===difficulty;}).length*441;
    const summary=stats(values,denominator);
    rows.push({...summary,...(role==='defender'?{xpPerStamina:null}:{}),level,build,army,gear,n,role,kind,policy,victory:Number(victory),difficulty,projection:level>50,atkTraining,defTraining});
   }
  }
 }
 // Reproduce the exact earlier developing-level-50 build, not the new training matrix.
 const level=50,n=50,inv=loadout(level,n,'offense',true),attack=power(level,n,inv,'attack',8),values:number[]=[];let encounters=0;
 for(const b of bots.filter(b=>areRivals(level,b.level))){const defense=power(b.level,b.n,b.inventory,'defense',b.training,b.calling);for(let ar=-10;ar<=10;ar++)for(let dr=-10;dr<=10;dr++){encounters++;if(resolveAlphaCombat({attack,health:100,maxHealth:100,gold:0},{defense,health:100,maxHealth:100,gold:0},ar,dr).outcome==='attacker_win')values.push(researchReward('current',level,b.level,defense/attack,'bot'));}}
 Object.assign(reproduction,stats(values,encounters),{oneCases:values.filter(x=>x===1).length,training:8,n,attack,originalBaseline:'5427755221968247671a361a29fbbc66594021f3'});
 assert.equal(values.length,56305);assert.equal(values.filter(x=>x===1).length,44100);
 const controlled=[];
 for(const level of[1,10,25,50,75,100])for(const ratio of[.01,.1,.2,.3499,.35,.5,.7,1,1.1])for(const kind of ['bot','human'] as const)for(const policy of policies){
  let wins=0;for(let ar=-10;ar<=10;ar++)for(let dr=-10;dr<=10;dr++)if(resolveAlphaCombat({attack:10000,health:100,maxHealth:100,gold:0},{defense:10000*ratio,health:100,maxHealth:100,gold:0},ar,dr).outcome==='attacker_win')wins++;
  const probability=wins/441,awards=Array.from({length:100},(_,n)=>researchReward(policy,level,level,ratio,kind,n+1));
  const xp100=awards[0]!*100*probability,repeat100=awards.reduce((s,x)=>s+x,0),requirement=levelRequirement(level)+Math.max(0,level-50)*150;
  controlled.push({level,ratio,kind,policy,winProbability:probability,awards:awards.slice(0,6),freshXpPer100Stamina:xp100,sameTargetXpPer100Wins:repeat100,requirement,
   activeHoursPerLevelAt30AttacksHour:xp100?requirement/(xp100/100*30):null,occasionalDaysAt10AttacksDay:xp100?requirement/(xp100/100*10):null});
 }
 return {baseline:'e9165c34ef8ddaba4e04488438ba110cc2020376',productionContacted:false,activation:'offline-only; no runtime policy installed',method:{cohort:900,rolls:'exhaustive 21 x 21; no random seed needed',quantiles:'nearest rank',humanOpponents:'synthetic cohort power templates; no measured human distribution',resources:'one stamina per encounter; restored Health snapshots; no refills or shopping feedback',builds:72,botDefenderXp:0,humanDefense:'three-full-win budget; no defender stamina spent',rates:'local fixed-level estimates, not dynamic progression predictions; finite targets and daily windows constrain fresh strategies',levels75And100:'projected expanded fixtures; no production activation assumed'},reproduction,rows,controlled};
}
if(process.argv[1]?.endsWith('historical-xp-study.ts')){
 const out='docs/historical-reconciliation';mkdirSync(out,{recursive:true});const result=study();writeFileSync(out+'/xp-results.json.gz',gzipSync(JSON.stringify(result)+'\n',{level:9}));
 const representative=(result.rows as Record<string,unknown>[]).filter(r=>r.build==='offense'&&r.army==='small'&&r.gear==='appropriate'&&r.role==='attacker'&&r.difficulty==='all'&&[1,5].includes(r.victory as number));
 writeFileSync(out+'/xp-summary.json',JSON.stringify({...result,rows:representative,controlled:result.controlled.filter(r=>[.01,.2,.3499,.35,.7,1].includes(r.ratio))})+'\n');console.log(JSON.stringify({rows:result.rows.length,reproduction:result.reproduction}));
}
