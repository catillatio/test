// Offline, deterministic sensitivity study. No database/provider/network calls.
// Finite source-authored purses and static-estate surplus are financial inputs,
// not new endowments, refills, production observations or gameplay policy.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {alpha,areRivals,resolveAlphaCombat,type OwnedItem} from '../../src/alpha-rules.js';
import {botBlueprint} from '../../src/development.js';
import {botCatalog,strategy,recoverySeconds} from '../../src/strategy-rules.js';
import {expansionBots} from '../../src/expansion-bot-rules.js';
import {expandedContent} from '../../src/expansion-content.js';
import {duelCandidates,duelTarget,duelPressureAllows} from '../../src/bot-combat.js';
import {scheduledNumber} from '../../src/bot-schedule.js';
import {victoryLoot45} from '../../src/gameplay-rules.js';
import {progressiveBotLoot} from '../../src/bot-loot.js';
import {regenerate} from '../../src/rules.js';
import {power,loadout} from './level100-e2b.js';

const H=3600000,DAY=24*H,MAX=2147483647;
const repeat=JSON.parse(readFileSync(new URL('../../rulesets/bot-combat-rewards-2/rules.json',import.meta.url),'utf8')).victoryPercentages as number[];
assert.deepEqual(repeat,[100,85,70,55,40]);
type Policy='previous'|'progressive';
interface Bot {id:string;cohort:'original'|'expanded';level:number;tier:string;calling:string;wallet:number;retained:bigint;vault:number;net:number;attack:number;defense:number;health:number;maxHealth:number;hpAt:number;spirit:number;maxSpirit:number;spAt:number;lastIncome:number;}
function idFor(slot:string){const h=createHash('sha256').update('synthetic-loot-study:'+slot).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);}
function population():Bot[]{
 const old:Bot[]=[];
 for(let level=1;level<=50;level++)for(const tier of strategy.bots.tiers)for(let variant=0;variant<botCatalog.variants;variant++){
  const b=botBlueprint(level,tier,variant),inventory=b.items.map(i=>({...i,inventoryId:i.id,quantity:b.quantities[i.id]!}));
  old.push({id:idFor(level+':'+tier+':'+variant),cohort:'original',level,tier,calling:b.calling,wallet:b.gold,retained:0n,vault:b.bankedGold,net:b.netIncome,
   attack:power(level,b.participants,inventory,'attack',b.training,b.calling),defense:power(level,b.participants,inventory,'defense',b.training,b.calling),
   health:b.health,maxHealth:b.health,hpAt:0,spirit:b.spirit,maxSpirit:b.spirit,spAt:0,lastIncome:0});
 }
 const added:Bot[]=expansionBots.entries.map(b=>{
  const inventory:OwnedItem[]=b.equipment.map(e=>({...expandedContent.items.find(i=>i.id===e.itemId)!,quantity:e.quantity,inventoryId:e.itemId}));
  return {id:b.characterId,cohort:'expanded',level:b.level,tier:b.tier,calling:b.calling,wallet:b.wallet,retained:0n,vault:0,net:b.propertyNet-b.upkeep,
   attack:power(b.level,b.members+1,inventory,'attack',b.training,b.calling),defense:power(b.level,b.members+1,inventory,'defense',b.training,b.calling),
   health:b.health,maxHealth:b.health,hpAt:0,spirit:b.spirit,maxSpirit:b.spirit,spAt:0,lastIncome:0};
 });
 assert.equal(old.length,450);assert.equal(added.length,450);const bots=[...old,...added];
 assert.equal(new Set(bots.map(b=>b.id)).size,900);assert.ok(bots.every(b=>Number.isSafeInteger(b.net)&&b.net>=0));return bots;
}
function credit(b:{wallet:number;retained:bigint},amount:bigint){assert.ok(amount>=0n);const room=BigInt(MAX-b.wallet),paid=amount<room?amount:room;b.wallet+=Number(paid);b.retained+=amount-paid;}
function stockpile(bots:Bot[],days:number){for(const b of bots)credit(b,BigInt(b.net)*BigInt(days*24));}
function sum(bots:Bot[]){return bots.reduce((n,b)=>n+BigInt(b.wallet)+b.retained+BigInt(b.vault),0n);}
function payout(wallet:number,level:number,victory:number,policy:Policy){
 const first=policy==='previous'?victoryLoot45(wallet,1,true,true,level).amount:progressiveBotLoot(Number(BigInt(wallet)*3n/100n));
 return Number(BigInt(first)*BigInt(repeat[Math.min(victory-1,repeat.length-1)]!)/100n);
}
function recover(f:{health:number;maxHealth:number;hpAt:number;spirit:number;maxSpirit:number;spAt:number;calling:string},time:number){
 const hp=regenerate(f.health,f.maxHealth,new Date(f.hpAt),new Date(time),recoverySeconds(f.calling,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount);
 const sp=regenerate(f.spirit,f.maxSpirit,new Date(f.spAt),new Date(time),recoverySeconds(f.calling,'spirit',alpha.resources.spiritSeconds));
 f.health=hp.value;f.hpAt=+hp.updated;f.spirit=sp.value;f.spAt=+sp.updated;
}
function sequence(pairs:Map<string,{start:number;wins:number}>,key:string,time:number){let p=pairs.get(key);if(!p||time-p.start>=DAY)p={start:time,wins:0};p.wins++;pairs.set(key,p);return p.wins;}
function stats(values:number[]){const ordered=values.slice().sort((a,b)=>a-b);assert.ok(ordered.length);return {minimum:ordered[0]!,median:ordered[Math.floor((ordered.length-1)*.5)]!,p90:ordered[Math.floor((ordered.length-1)*.9)]!,p99:ordered[Math.floor((ordered.length-1)*.99)]!,maximum:ordered.at(-1)!,total:values.reduce((a,b)=>a+b,0)};}
function distributions(baseline:Bot[]){return [0,1,7,30].map(days=>{
 const bots=structuredClone(baseline);stockpile(bots,days);
 return {stockpileDays:days,bots:900,currency:sum(bots).toString(),exposedWallets:stats(bots.map(b=>b.wallet)),retainedUnexposed:bots.reduce((n,b)=>n+b.retained,0n).toString(),
  segments:[['all',bots],['levels-1-50',bots.filter(b=>b.level<=50)],['levels-51-100',bots.filter(b=>b.level>50)]].map(([name,entries])=>{const group=entries as Bot[],old=group.map(b=>payout(b.wallet,b.level,1,'previous')),updated=group.map(b=>payout(b.wallet,b.level,1,'progressive'));return {name,bots:group.length,previousFirstWin:stats(old),progressiveFirstWin:stats(updated),firstWinOver20000:updated.filter(n=>n>20000).length,aggregateRatio:Number((updated.reduce((a,b)=>a+b,0)/old.reduce((a,b)=>a+b,0)).toFixed(3))};})};
 });}
function campaign(baseline:Bot[],policy:Policy,level:number,days:number,initialStockpileDays:number,active:boolean){
 const bots=structuredClone(baseline);stockpile(bots,initialStockpileDays);const eligible=bots.filter(b=>areRivals(level,b.level)),human={health:100,maxHealth:100,hpAt:0,spirit:3,maxSpirit:3,spAt:0,calling:'Freeblade',wallet:100000,retained:0n};
 const humanAttack=power(level,5*level,loadout(level,5*level,'offense',true),'attack',25,'Freeblade'),pairs=new Map<string,{start:number;wins:number}>();
 const initial=sum(bots)+BigInt(human.wallet),vaultBefore=bots.reduce((n,b)=>n+BigInt(b.vault),0n),earned={amount:0n};let wins=0,losses=0,attempted=0,blocked=0,transferred=0,maximum=0,repeated=0,aboveThreshold=0;
 const byTier:Record<string,number>={};
 for(let time=0;time<days*DAY;time+=active?120000:10000){
  if(!active&&time%(6*H)>=30000)continue;
  for(const b of bots){const hours=Math.floor((time-b.lastIncome)/H);if(hours){const amount=BigInt(b.net)*BigInt(hours);credit(b,amount);earned.amount+=amount;b.lastIncome+=hours*H;}}
  recover(human,time);if(human.health<alpha.combat.minimumHealth||human.spirit<alpha.combat.spiritCost){blocked++;continue;}
  let target:Bot|undefined;
  for(const b of eligible){recover(b,time);if(b.health<1||b.defense>humanAttack)continue;if(!target||b.wallet>target.wallet||b.wallet===target.wallet&&b.id<target.id)target=b;}
  if(!target){blocked++;continue;}
  const random=scheduledNumber('loot-simulation:'+level+':'+time),result=resolveAlphaCombat({attack:humanAttack,health:human.health,maxHealth:human.maxHealth,gold:human.wallet},{defense:target.defense,health:target.health,maxHealth:target.maxHealth,gold:target.wallet},random%21-10,Math.floor(random/21)%21-10);
  if(human.health===human.maxHealth)human.hpAt=time;if(human.spirit===human.maxSpirit)human.spAt=time;if(target.health===target.maxHealth)target.hpAt=time;
  human.health=result.attackerHealthAfter;human.spirit-=alpha.combat.spiritCost;target.health=result.defenderHealthAfter;attempted++;
  if(result.outcome==='attacker_win'){
   wins++;const victory=sequence(pairs,target.id,time),amount=payout(target.wallet,target.level,victory,policy);assert.ok(amount>=0&&amount<=target.wallet);
   target.wallet-=amount;credit(human,BigInt(amount));transferred+=amount;maximum=Math.max(maximum,amount);if(victory>1)repeated++;if(amount>20000)aboveThreshold++;byTier[target.tier]=(byTier[target.tier]??0)+amount;
  }else losses++;
 }
 // Account for the final completed income boundary; income is the sole source.
 for(const b of bots){const hours=Math.floor((days*DAY-b.lastIncome)/H),amount=BigInt(b.net)*BigInt(hours);credit(b,amount);earned.amount+=amount;}
 const final=sum(bots)+BigInt(human.wallet)+human.retained;assert.equal(initial+earned.amount,final);assert.equal(bots.reduce((n,b)=>n+BigInt(b.vault),0n),vaultBefore);
 return {policy,level,days,initialStockpileDays,visits:active?'two-minute-active-stress':'four-short-visits-per-day',eligibleBots:eligible.length,attempted,wins,losses,blocked,repeatedVictories:repeated,above20000Victories:aboveThreshold,goldTransferred:transferred,maximumPayout:maximum,byTier,conserved:true,vaultUnchanged:true,initialCurrency:initial.toString(),earnedStaticEstateSurplus:earned.amount.toString(),finalCurrency:final.toString(),remainingBotWallets:eligible.reduce((n,b)=>n+b.wallet,0),humanRetained:human.retained.toString()};
}
function duels(baseline:Bot[],policy:Policy){
 const bots=structuredClone(baseline);stockpile(bots,30);const initial=sum(bots),byId=new Map(bots.map(b=>[b.id,b])),ids=bots.map(b=>b.id),pairs=new Map<string,{start:number;wins:number}>(),initiated=new Map<string,number>(),incoming=new Map<string,number[]>();let attempted=0,wins=0,transferred=0,blocked=0,considered=0;
 const candidates=bots.map(b=>({id:b.id,account_id:b.id,level:b.level,active:true,disabled:true}));
 for(let window=0;window<288;window++)for(const id of duelCandidates(ids,window)){
  considered++;const a=byId.get(id)!,targetId=duelTarget(candidates,candidates.find(b=>b.id===id)!,window),b=targetId?byId.get(targetId):undefined,time=window*300000;if(!b){blocked++;continue;}
  const previous=incoming.get(b.id)??[];
  if(!duelPressureAllows({initiated:initiated.get(id)??0,targeted:previous.length,recent:previous.filter(t=>t>time-H).length})){blocked++;continue;}
  recover(a,time);recover(b,time);if(a.health<alpha.combat.minimumHealth||b.health<1||a.spirit<alpha.combat.spiritCost){blocked++;continue;}
  const random=scheduledNumber(id+':'+window),result=resolveAlphaCombat({attack:a.attack,health:a.health,maxHealth:a.maxHealth,gold:a.wallet},{defense:b.defense,health:b.health,maxHealth:b.maxHealth,gold:b.wallet},random%21-10,Math.floor(random/21)%21-10);
  if(a.health===a.maxHealth)a.hpAt=time;if(a.spirit===a.maxSpirit)a.spAt=time;if(b.health===b.maxHealth)b.hpAt=time;
  a.health=result.attackerHealthAfter;a.spirit-=alpha.combat.spiritCost;b.health=result.defenderHealthAfter;attempted++;initiated.set(id,(initiated.get(id)??0)+1);incoming.set(b.id,[...previous,time]);
  if(result.outcome==='attacker_win'){wins++;const amount=payout(b.wallet,b.level,sequence(pairs,id+':'+b.id,time),policy);b.wallet-=amount;credit(a,BigInt(amount));transferred+=amount;}
 }
 assert.equal(sum(bots),initial);return {policy,stockpileDays:30,simulatedHours:24,considered,attempted,wins,blocked,goldRedistributed:transferred,currencyBefore:initial.toString(),currencyAfter:sum(bots).toString(),conserved:true,incomeAndPurchasesExcluded:true};
}
export function buildLootEconomyReport(){
 const bots=population(),sources=['rulesets/passive-rivals-5/rules.json','rulesets/level100-rivals-1/rules.json','rulesets/gameplay-refinement-1/rules.json','rulesets/bot-combat-rewards-2/rules.json','rulesets/bot-combat-rewards-3/rules.json','rulesets/alpha-0.3/rules.json','src/development.ts','src/bot-combat.ts','src/bot-loot.ts'];
 const report={protocol:'kingdom-bot-loot-economic-study-v1',productionObserved:false,simulationOnly:true,population:{total:bots.length,original:bots.filter(b=>b.cohort==='original').length,expanded:bots.filter(b=>b.cohort==='expanded').length},
  assumptions:{wallets:'Source-authored finite blueprints; not current production purses. Original 450 UUIDs are deterministic synthetic study identities; added 450 UUIDs come from the published manifest.',income:'Only fixed authored net hourly estate surplus funds the 1/7/30-day stockpile and farming scenarios. Existing protected Vault balances are unchanged.',spending:'Autonomous purchases, estate growth, human costs, XP and level-ups are held fixed. This is a liquidity upper-bound sensitivity, not a calibrated live forecast.',human:'One fully equipped offensive 5×level army, training25, Health100, Stamina3; natural recovery and actual combat/level eligibility. No paid healing/refills. No extra daily reward quota.',botDuels:'Existing deterministic scheduler, pair repeats, two initiations/day, four incoming/day and one incoming/hour. Day-long isolation verifies redistribution with no income/purchases.'},
  inputs:Object.fromEntries(sources.map(path=>[path,createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex')])),
  stockpileDistributions:distributions(bots),farming:[50,75,100].flatMap(level=>[1,7,30].flatMap(days=>[false,true].flatMap(active=>(['previous','progressive'] as const).map(policy=>campaign(bots,policy,level,days,30,active))))),botDuels:(['previous','progressive'] as const).map(policy=>duels(bots,policy))};
 assert.equal(report.farming.length,36);assert.ok(report.farming.every(r=>r.conserved&&r.vaultUnchanged));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const path=new URL('../../docs/bot-loot/ECONOMIC_SIMULATION.json',import.meta.url),serialized=JSON.stringify(buildLootEconomyReport(),null,2)+'\n';
 if(process.argv.includes('--check'))assert.equal(readFileSync(path,'utf8'),serialized,'Economic study is stale');else writeFileSync(path,serialized);
 console.log('BOT_LOOT_ECONOMY: PASS — 900 source-defined bots; finite-wallet conservation verified');
}
