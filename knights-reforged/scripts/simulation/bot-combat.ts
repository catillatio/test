// Deterministic, in-memory development simulation. No database, HTTP, seed or
// provisioning calls. Uses the actual combat, recovery, upkeep and XP helpers.
import assert from 'node:assert/strict';
import {alpha,activeArmy,areRivals,selectEquipment,trainedPower,resolveAlphaCombat,advanceLevel,levelRequirement,maintenanceBill,type OwnedItem} from '../../src/alpha-rules.js';
import {botBlueprint} from '../../src/development.js';
import {botVictoryRewards,botCombat} from '../../src/bot-combat-rules.js';
import {victoryExperience47} from '../../src/game-feel-rules.js';
import {victoryLoot45,healingQuote} from '../../src/gameplay-rules.js';
import {callingFor,callingPower,recoverySeconds} from '../../src/strategy-rules.js';
import {rules,regenerate} from '../../src/rules.js';
import {scaleBotExperience} from '../../src/bot-experience.js';

const H=3600000,DAY=24*H,MAX=2147483647;
export interface SimulationOptions {level:number;hours:number;policy:'phase48'|'phase49';mode:'varied'|'same';players?:number;seed?:number;decisionSeconds?:number;spiritCapacity?:number;heal?:boolean;restartAtHour?:number;loadout?:'natural'|'established';botXpPercent?:100|65|40;dailySessionHours?:number;}
interface Fighter {
 id:string;name:string;level:number;xp:number;levelXp:number;calling:string;militia:number;training:number;inventory:OwnedItem[];
 health:number;maxHealth:number;hpAt:number;spirit:number;maxSpirit:number;spiritAt:number;
 wallet:number;vault:number;retained:bigint;reserve:bigint;arrears:bigint;remainder:bigint;paused:boolean;maintenanceAt:number;rate:number;
 propertyNet:number;nextIncome:number;lastFinanceBoundary:number;
}
const owned=(items:typeof alpha.items,quantities:Record<string,number>):OwnedItem[]=>items.map(i=>({...i,inventoryId:i.id,quantity:quantities[i.id]??0}));
const xpFor=(level:number)=>Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((s,n)=>s+n,0);
function power(f:Fighter,mode:'attack'|'defense'){
 const p=activeArmy(f.level,f.militia,0).participants,e=selectEquipment(f.inventory,p,mode,!f.paused);
 const base=(mode==='attack'?rules.baseAttack:rules.baseDefense)+(f.level-1)*(mode==='attack'?rules.attackPerLevel:rules.defensePerLevel)+(p-1)*rules.unit[mode]+e[mode];
 return callingPower(trainedPower(base,mode==='attack'?f.training:0),callingFor(f.calling)[mode+'Percent' as 'attackPercent'|'defensePercent']);
}
function botDefense(f:Fighter){
 const p=Math.min(10,activeArmy(f.level,Math.min(9,f.militia),0).participants),e=selectEquipment(f.inventory,p,'defense',!f.paused);
 return callingPower(trainedPower(rules.baseDefense+(f.level-1)*rules.defensePerLevel+(p-1)*rules.unit.defense+e.defense,f.training),callingFor(f.calling).defensePercent);
}
function recover(f:Fighter,t:number){
 const hp=regenerate(f.health,f.maxHealth,new Date(f.hpAt),new Date(t),recoverySeconds(f.calling,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount);
 const sp=regenerate(f.spirit,f.maxSpirit,new Date(f.spiritAt),new Date(t),recoverySeconds(f.calling,'spirit',alpha.resources.spiritSeconds));
 f.health=hp.value;f.hpAt=+hp.updated;f.spirit=sp.value;f.spiritAt=+sp.updated;
}
const balance=(f:Fighter)=>BigInt(f.wallet)+f.reserve+f.retained;
const credit=(f:Fighter,n:bigint)=>{const paid=n<BigInt(MAX-f.wallet)?n:BigInt(MAX-f.wallet);f.wallet+=Number(paid);f.retained+=n-paid;};

export function simulateBotCombat(options:SimulationOptions){
 const {level,hours,policy,mode}=options,players=options.players??1,decision=(options.decisionSeconds??30)*1000,capacity=options.spiritCapacity??3;
 assert.ok(Number.isInteger(level)&&level>=1&&level<=50&&hours>0&&hours<=336&&Number.isInteger(players)&&players>=1&&players<=50&&decision>=6000&&decision%6000===0);
 assert.ok(options.dailySessionHours===undefined||(options.dailySessionHours>0&&options.dailySessionHours<=24));
 const xpPercent=options.botXpPercent??botCombat.fullXpPercent;
 assert.ok([100,65,40].includes(xpPercent));
 const training=Math.min(25,Math.floor(level/6)),entitlements=level-1+(alpha.progression.milestones??[]).filter(m=>m.level<=level).reduce((s,m)=>s+m.points,0);
 assert.ok(capacity>=3&&(capacity-3)*2+training<=entitlements,'Starting Spirit/training must be affordable through actual level skill entitlements.');
 const common={xp:xpFor(level),levelXp:0,health:100,maxHealth:100,hpAt:0,spirit:capacity,maxSpirit:capacity,spiritAt:0,retained:0n,arrears:0n,remainder:0n,paused:false,maintenanceAt:0,nextIncome:H,lastFinanceBoundary:0};
 let bots:Fighter[]=Array.from({length:50},(_,i)=>i+1).flatMap(l=>['green','seasoned','elite'].flatMap(tier=>[0,1,2].map(variant=>{
  const b=botBlueprint(l,tier,variant),rate=b.items.reduce((s,i)=>s+i.upkeep*b.quantities[i.id]!,0),propertyNet=b.properties.reduce((s,p)=>{const a=alpha.properties.find(a=>a.id===p.id)!;return s+p.quantity*(a.hourlyIncome-a.hourlyUpkeep);},0);
  return {...common,id:l+':'+tier+':'+variant,name:b.name,level:l,xp:xpFor(l),calling:b.calling,militia:b.participants-1,training:b.training,inventory:owned(b.items,b.quantities),health:b.health,maxHealth:b.health,spirit:b.spirit,maxSpirit:b.spirit,wallet:b.gold,vault:b.bankedGold,reserve:BigInt(rate*48),rate,propertyNet};
 })));
 const p=options.loadout==='established'?Math.min(10,1+2*level):Math.max(1,Math.round(Math.min(10,1+Math.floor(level/5))*.7)),quantity=options.loadout==='established'?10:Math.ceil(p*.8);
 const items=(['weapon','armor','spell'] as const).map(c=>alpha.items.filter(i=>i.category===c&&i.level<=Math.max(1,level-(options.loadout==='established'?0:2))).sort((a,b)=>b.attack-a.attack||b.defense-a.defense||a.id.localeCompare(b.id))[0]!);
 const inventory=owned(items,Object.fromEntries(items.map(i=>[i.id,quantity]))),rate=inventory.reduce((s,i)=>s+i.quantity*i.upkeep,0);
 // Synthetic starting snapshots, not gameplay grants: owned legal gear, a
 // 5,000 purse after its purchase, one paid upkeep hour, no human Land income.
 let humans:Fighter[]=Array.from({length:players},(_,i)=>({...common,id:'human-'+i,name:'Synthetic human '+i,level,calling:'Freeblade',militia:p-1,training,inventory:structuredClone(inventory),wallet:5000,vault:500,reserve:BigInt(rate),rate,propertyNet:0}));
 let pairs=new Map<string,{start:number;n:number}>(),attempts=new Map<string,number>(),budgets=Array.from({length:players},()=>[] as {at:number;target:string}[]);
 let rng=(options.seed??4901)>>>0;const roll=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng%21-10;};
 const initialCombined=[...bots,...humans].reduce((s,f)=>s+balance(f),0n),initialVault=[...bots,...humans].reduce((s,f)=>s+f.vault,0);
 let generated=0n,upkeepPaid=0n,healingSpent=0n,loot=0,xp=0,wins=0,losses=0,knockouts=0,oneXpWins=0,zeroGoldWins=0,repeatWins=0,trivialWins=0,levelUps=0,refillSpirit=0,refillHealth=0,heals=0,maintenanceActions=0,restarts=0,naturalSpirit=0,naturalHealth=0,activeMs=0;
 const thresholds=[5,8,10,17,25,40,50],milestones:{player:number;level:number;calendarHours:number;activeHours:number}[]=[];
 for(let player=0;player<players;player++)for(const reached of thresholds.filter(n=>n<=level))milestones.push({player,level:reached,calendarHours:0,activeHours:0});
 const sessionStarts:{hour:number;player:number;level:number;health:number;spirit:number;wallet:number}[]=[];
 const blocked={spirit:0,health:0,targetHealth:0,level:0,noOpponents:0},samples:Record<string,unknown>[]=[],lastSamples:Record<string,unknown>[]=[];
 const hourly:{hour:number;levels:number[];wins:number;gold:number;xp:number;botWallets:number;levelUps:number}[]=[];
 const fund=(f:Fighter,t:number)=>{
  const topup=f.reserve<BigInt(f.rate)?BigInt(f.rate)-f.reserve:0n,cost=f.arrears+topup;
  if(BigInt(f.wallet)<cost){f.paused=true;f.maintenanceAt=t;return false;}
  f.wallet-=Number(cost);f.reserve+=topup;upkeepPaid+=f.arrears;f.arrears=0n;f.paused=false;f.maintenanceAt=t;return true;
 };
 const materialize=(f:Fighter,t:number,isBot:boolean)=>{
  if(f.propertyNet&&f.nextIncome<=t){const periods=1+Math.floor((t-f.nextIncome)/H),amount=BigInt(f.propertyNet)*BigInt(periods);generated+=amount;credit(f,amount);f.nextIncome+=periods*H;}
  if(f.retained){const paid=f.retained<BigInt(MAX-f.wallet)?f.retained:BigInt(MAX-f.wallet);f.wallet+=Number(paid);f.retained-=paid;}
  if(!f.paused&&f.rate){const bill=maintenanceBill(f.rate,new Date(f.maintenanceAt),new Date(t),f.remainder,f.reserve,f.wallet);f.wallet-=bill.fromWallet;f.reserve=bill.credit;f.arrears=bill.arrears;f.remainder=bill.remainder;f.paused=bill.paused;f.maintenanceAt=+bill.throughAt;upkeepPaid+=bill.paid;}else f.maintenanceAt=t;
  if(isBot&&f.nextIncome-H>f.lastFinanceBoundary){fund(f,t);f.lastFinanceBoundary=f.nextIncome-H;}
  const hp=f.health,sp=f.spirit;recover(f,t);if(!isBot){naturalSpirit+=f.spirit-sp;naturalHealth+=f.health-hp;}
 };
 const startingAttack=power(humans[0]!,'attack');
 const fixed=bots.filter(b=>areRivals(level,b.level)).sort((a,b)=>Math.abs(botDefense(a)/startingAttack-.85)-Math.abs(botDefense(b)/startingAttack-.85)||a.id.localeCompare(b.id))[0]!.id;
 const duration=hours*H;let nextHour=H;
 for(let t=0;t<duration;t+=6000){
  if(options.restartAtHour&&t===options.restartAtHour*H){({bots,humans,pairs,attempts,budgets}=structuredClone({bots,humans,pairs,attempts,budgets}));restarts++;}
  if(t>=nextHour){for(const b of bots)materialize(b,t,true);hourly.push({hour:t/H,levels:humans.map(a=>a.level),wins,gold:loot,xp,botWallets:bots.reduce((s,b)=>s+b.wallet,0),levelUps});nextHour+=H;}
  if(options.dailySessionHours!==undefined&&t%DAY>=options.dailySessionHours*H)continue;
  activeMs+=6000;
  if(t%decision)continue;
  for(let ai=0;ai<humans.length;ai++){
   const a=humans[ai]!;materialize(a,t,false);
   if(t%DAY===0)sessionStarts.push({hour:t/H,player:ai,level:a.level,health:a.health,spirit:a.spirit,wallet:a.wallet});
   if(a.health<alpha.combat.minimumHealth){const quote=healingQuote(a.health,a.maxHealth,a.level,a.wallet);if(options.heal&&quote.affordable){a.wallet-=quote.cost;healingSpent+=BigInt(quote.cost);a.health=a.maxHealth;a.hpAt=t;heals++;}else blocked.health++;continue;}
   if(a.spirit<alpha.combat.spiritCost){blocked.spirit++;continue;}
   if(a.paused&&fund(a,t))maintenanceActions++;
   const attack=power(a,'attack');
   let candidates=bots.filter(b=>mode!=='same'||b.id===fixed).filter(b=>areRivals(a.level,b.level));
   if(!candidates.length){blocked.level++;continue;}
   candidates=candidates.filter(b=>regenerate(b.health,b.maxHealth,new Date(b.hpAt),new Date(t),recoverySeconds(b.calling,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount).value>=1);
   if(!candidates.length){blocked.targetHealth++;continue;}
   const meaningful=candidates.filter(b=>{const r=botDefense(b)/attack;return r>=.35&&r<=1.15;});if(meaningful.length)candidates=meaningful;
   candidates.sort((x,y)=>(attempts.get(a.id+'/'+x.id)??0)-(attempts.get(a.id+'/'+y.id)??0)||Math.abs(botDefense(x)/attack-.95)-Math.abs(botDefense(y)/attack-.95)||x.id.localeCompare(y.id));
   const b=candidates[0];if(!b){blocked.noOpponents++;continue;}materialize(b,t,true);
   const pair=a.id+'/'+b.id;attempts.set(pair,(attempts.get(pair)??0)+1);
   const before={health:a.health,spirit:a.spirit,level:a.level,wallet:b.wallet};
   const combat=resolveAlphaCombat({attack,health:a.health,maxHealth:a.maxHealth,gold:a.wallet},{defense:botDefense(b),health:b.health,maxHealth:b.maxHealth,gold:b.wallet},roll(),roll());
   if(a.health===a.maxHealth)a.hpAt=t;if(b.health===b.maxHealth)b.hpAt=t;
   a.health=combat.attackerHealthAfter;b.health=combat.defenderHealthAfter;if(a.spirit===a.maxSpirit)a.spiritAt=t;a.spirit-=alpha.combat.spiritCost;
   let gold=0,award=0,victory=0,multiplier=100;
   if(combat.outcome==='attacker_win'){
    wins++;if(b.health===0)knockouts++;const prior=pairs.get(pair),fresh=!prior||prior.start<=t-DAY;victory=fresh?1:prior.n+1;pairs.set(pair,{start:fresh?t:prior.start,n:victory});
    let trivial=false;
    if(policy==='phase49'){const r=botVictoryRewards(b.wallet,a.level,b.level,victory,attack,botDefense(b));gold=r.loot.amount;award=scaleBotExperience(r.xp.unreducedAmount,xpPercent,r.xp.repeatMultiplier).amount;multiplier=r.loot.multiplier;trivial=r.xp.trivial;}
    else{const entries=budgets[ai]!.filter(e=>e.at>t-DAY),available=entries.length<6&&!entries.some(e=>e.target===b.id);if(available)entries.push({at:t,target:b.id});budgets[ai]=entries;const r=victoryExperience47(a.level,b.level,available,attack,botDefense(b));gold=victoryLoot45(b.wallet,victory,true,available,b.level).amount;award=r.amount;trivial=r.trivial;multiplier=available?[100,75,50,25,10][Math.min(victory-1,4)]!:0;}
    assert.ok(gold<=b.wallet);b.wallet-=gold;credit(a,BigInt(gold));loot+=gold;award=Math.min(award,MAX-a.xp);a.xp+=award;xp+=award;
    const progress=advanceLevel(a.level,a.levelXp,award);a.level=progress.level;a.levelXp=progress.progress;
    if(progress.gained){levelUps+=progress.gained;refillSpirit+=a.maxSpirit-a.spirit;refillHealth+=a.maxHealth-a.health;a.spirit=a.maxSpirit;a.health=a.maxHealth;a.spiritAt=t;a.hpAt=t;}
    for(const reached of thresholds)if(before.level<reached&&a.level>=reached)milestones.push({player:ai,level:reached,calendarHours:t/H,activeHours:activeMs/H});
    if(award===1)oneXpWins++;if(!gold)zeroGoldWins++;if(victory>1)repeatWins++;if(trivial)trivialWins++;
   }else losses++;
   const sample={minute:t/60000,player:ai,target:b.id,attackerLevel:before.level,defenderLevel:b.level,attack,defense:botDefense(b),defenderMaintenancePaused:b.paused,outcome:combat.outcome,gold,xp:award,remainingDefenderGold:b.wallet,pairVictory:victory,multiplier,healthBefore:before.health,healthAfter:a.health,spiritBefore:before.spirit,spiritAfter:a.spirit,levelAfter:a.level};
   if(samples.length<12)samples.push(sample);lastSamples.push(sample);if(lastSamples.length>12)lastSamples.shift();
   assert.ok(a.wallet>=0&&b.wallet>=0&&a.health>=0&&b.health>=0&&a.spirit>=0);
  }
 }
 for(const f of bots)materialize(f,duration,true);for(const f of humans)materialize(f,duration,false);
 hourly.push({hour:hours,levels:humans.map(a=>a.level),wins,gold:loot,xp,botWallets:bots.reduce((s,b)=>s+b.wallet,0),levelUps});
 const ending=[...bots,...humans].reduce((s,f)=>s+balance(f),0n);
 assert.equal(ending,initialCombined+generated-upkeepPaid-healingSpent);assert.equal([...bots,...humans].reduce((s,f)=>s+f.vault,0),initialVault);
 assert.ok([...bots,...humans].every(f=>f.wallet>=0&&f.reserve>=0n&&f.health>=0));
 return {options:{...options,botXpPercent:xpPercent,players,decisionSeconds:decision/1000,spiritCapacity:capacity,seed:options.seed??4901},activeHours:activeMs/H,calendarHours:hours,milestones,sessionStarts,naturalSpirit,naturalHealth,startingEquipment:inventory.map(i=>({id:i.id,quantity:i.quantity})),startingArmy:p,startingAttackTraining:training,
  wins,losses,knockouts,goldTransferred:loot,xpAwarded:xp,oneXpWins,zeroGoldWins,repeatWins,trivialWins,levelUps,refillSpirit,refillHealth,heals,healingGold:Number(healingSpent),maintenanceActions,
  finalLevels:humans.map(a=>a.level),finalWallets:humans.map(a=>a.wallet),finalSpirit:humans.map(a=>a.spirit),finalHealth:humans.map(a=>a.health),distinctTargets:new Set([...attempts.keys()].map(x=>x.split('/')[1])).size,
  maximumVictoriesInOnePair:Math.max(0,...[...pairs.values()].map(x=>x.n)),blocked,generatedPropertyGold:generated.toString(),upkeepPaid:upkeepPaid.toString(),initialCombined:initialCombined.toString(),endingCombined:ending.toString(),vaultUnchanged:true,conserved:true,restarts,hourly,samples,lastSamples};
}
