// E2b OFFLINE MODEL ONLY. No database, HTTP, seed, migration, runtime flag or grants.
import {readFileSync} from 'node:fs';
import {alpha,activeArmy,selectEquipment,propertyPrice,levelRequirement,trainedPower,areRivals,resolveAlphaCombat,maintenanceBill,type ItemDefinition,type QuestDefinition,type PropertyDefinition,type OwnedItem} from '../../src/alpha-rules.js';
import {rules,regenerate} from '../../src/rules.js';
import {botBlueprint} from '../../src/development.js';
import {botVictoryRewards} from '../../src/bot-combat-rules.js';
import {automaticFunding} from '../../src/maintenance.js';
import {callingFor,callingPower,recoverySeconds} from '../../src/strategy-rules.js';
import {healingQuote} from '../../src/gameplay-rules.js';
import {scheduledCandidates,scheduledNumber} from '../../src/bot-schedule.js';
export const baseline='27c64b9d0e5a894cb3e03efd3f423796b8706043';
import {expandedContent,questRarities} from '../../src/expansion-content.js';
export const proposal={regions:expandedContent.content!.areas.filter(a=>!alpha.content!.areas.some(b=>b.id===a.id)),items:expandedContent.items.filter(i=>!alpha.items.some(j=>j.id===i.id)&&i.acquisition!=='quest-exclusive'),quests:expandedContent.quests.filter(q=>!alpha.quests.some(j=>j.id===q.id)),properties:expandedContent.properties.filter(p=>!alpha.properties.some(q=>q.id===p.id)),midLevelMirrors:[] as (ItemDefinition&{replaces:string})[],repositionCandidates:[] as {id:string;possibleFuturePurchaseLevel:number}[]};
export const levels=[1,10,25,50,75,100,200,500];
export const categories=['weapon','armor','spell'] as const;
export type ArmyModel='current'|'historical-5x'|'uncapped-2x';
export function capacity(level:number,model:ArmyModel,legacyFloor=1){return model==='current'?activeArmy(level,100000,0,legacyFloor).capacity:Math.max(legacyFloor,model==='historical-5x'?5*level:1+2*level);}
export function studyRequirement(level:number,extra=0){if(!Number.isSafeInteger(extra)||extra<0||extra>1000)throw new RangeError('Invalid research XP slope.');return levelRequirement(level)+Math.max(0,level-50)*extra;}
export const catalogItems=(expanded=false)=>expanded?[...alpha.items.map(i=>{const retier=proposal.repositionCandidates.find(r=>r.id===i.id);return retier?{...i,level:retier.possibleFuturePurchaseLevel}:i;}),...proposal.midLevelMirrors,...proposal.items]:alpha.items;
export const catalogQuests=(expanded=false)=>expanded?[...alpha.quests,...proposal.quests]:alpha.quests;
export const catalogLand=(expanded=false)=>expanded?[...alpha.properties,...proposal.properties]:alpha.properties;
const prices=new Map<string,number|null>();
export function safeStudyPrice(base:number,n:number){const key=base+':'+n;if(!prices.has(key)){try{prices.set(key,propertyPrice(base,n));}catch{prices.set(key,null);}}return prices.get(key)!;}
export function selectStudy(inventory:OwnedItem[],participants:number,mode:'attack'|'defense',maintained=true){
 if(!Number.isSafeInteger(participants)||participants<1||participants>2500)throw new RangeError('Research participation outside 1–2500.');
 if(participants<=alpha.limits.participants)return selectEquipment(inventory,participants,mode,maintained);
 // Identical three-category sort/tiebreak/quantity arithmetic; only this
 // offline adapter lifts the active selector's 101 guard for comparison.
 const selected:ReturnType<typeof selectEquipment>['selected']=[],secondary=mode==='attack'?'defense':'attack';
 for(const category of categories){let left=participants;for(const i of inventory.filter(i=>i.category===category&&i.quantity>0&&(maintained||i.upkeep===0)).sort((a,b)=>b[mode]-a[mode]||b[secondary]-a[secondary]||a.upkeep-b.upkeep||a.id.localeCompare(b.id))){const quantity=Math.min(left,i.quantity);if(quantity){selected.push({itemId:i.id,name:i.name,category,quantity,attack:i.attack,defense:i.defense});left-=quantity;}}}
 return {selected,attack:selected.reduce((n,i)=>n+i.attack*i.quantity,0),defense:selected.reduce((n,i)=>n+i.defense*i.quantity,0)};
}
export type Build='offense'|'tank'|'balanced'|'economy';
export function loadout(level:number,n:number,build:Build,expanded=false){
 const legal=catalogItems(expanded).filter(i=>i.level<=level&&(build!=='economy'||i.upkeep<=3)),chosen=new Map<string,ItemDefinition>();
 for(const mode of build==='offense'?['attack'] as const:build==='tank'?['defense'] as const:['attack','defense'] as const)
  for(const category of categories){const other=mode==='attack'?'defense':'attack';const i=legal.filter(i=>i.category===category).sort((a,b)=>b[mode]-a[mode]||b[other]-a[other]||a.upkeep-b.upkeep||a.id.localeCompare(b.id))[0]!;chosen.set(i.id,i);}
 return [...chosen.values()].map(i=>({...i,quantity:n,inventoryId:'synthetic-'+i.id}));
}
export function power(level:number,n:number,inventory:OwnedItem[],mode:'attack'|'defense',training=0,calling='Freeblade',maintained=true){
 const e=selectStudy(inventory,n,mode,maintained),base=rules[mode==='attack'?'baseAttack':'baseDefense']+(level-1)*rules[mode==='attack'?'attackPerLevel':'defensePerLevel']+(n-1)*rules.unit[mode]+e[mode];
 return callingPower(trainedPower(base,training),callingFor(calling)[mode==='attack'?'attackPercent':'defensePercent']);
}
const portfolios=new Map<string,ReturnType<typeof calculatePortfolio>>();
export function portfolio(level:number,required:number,expanded=false){const key=level+':'+required+':'+expanded;if(!portfolios.has(key))portfolios.set(key,calculatePortfolio(level,required,expanded));return portfolios.get(key)!;}
function calculatePortfolio(level:number,required:number,expanded=false){
 const legal=catalogLand(expanded).filter(p=>p.level<=level),owned=new Map<string,number>();let net=0,gross=0,upkeep=0,cost=0,limits=0;
 while(net<required){const choices=legal.flatMap(p=>{const n=owned.get(p.id)??0,price=n<100?safeStudyPrice(p.price,n):null;return price===null?[]:[{p,price,gain:p.hourlyIncome-p.hourlyUpkeep}];}).filter(c=>c.gain>0).sort((a,b)=>a.price/a.gain-b.price/b.gain||a.p.id.localeCompare(b.p.id));
  const c=choices[0];if(!c)break;owned.set(c.p.id,(owned.get(c.p.id)??0)+1);net+=c.gain;gross+=c.p.hourlyIncome;upkeep+=c.p.hourlyUpkeep;cost+=c.price;limits++;if(limits>4000)throw new Error('Unbounded research portfolio.');
 }
 return {required,net,gross,upkeep,cost,units:limits,sustainable:net>=required,holdings:[...owned].map(([id,quantity])=>({id,quantity})),saturated:legal.filter(p=>(owned.get(p.id)??0)>=100).map(p=>p.id)};
}
export function armyStudy(){return levels.flatMap(level=>(['current','historical-5x','uncapped-2x'] as const).map(model=>{
 const cap=capacity(level,model);return {level,model,capacity:cap,participantsWithTwentyAllies:Math.min(cap,21),participantsWithTwentyMilitiaAndFiftyAllies:Math.min(cap,71),fullGearUsed:3*cap,balancedOwnedCopies:loadout(Math.min(level,100),cap,'balanced',level>50).reduce((n,i)=>n+i.quantity,0),daysOutboundOnlyToFill:Math.ceil((cap-1)/20),singleItemBatches:Math.ceil(cap/100),perItemInventoryCompatible:cap<=1000};
}));}
export function equipmentStudy(){return [50,75,100,200,500].flatMap(level=>[100,250,375,500,...(level===500?[2500]:[])].flatMap(n=>(['offense','tank','balanced','economy'] as const).map(build=>{
 const inv=loadout(level,n,build,level>50),rate=inv.reduce((s,i)=>s+i.upkeep*i.quantity,0),investment=inv.reduce((s,i)=>s+i.price*i.quantity,0),attack=selectStudy(inv,n,'attack'),defense=selectStudy(inv,n,'defense');
 return {level,participants:n,build,capacityFeasible:n<=capacity(level,'historical-5x'),inventoryLegalToday:inv.every(i=>i.quantity<=1000),items:inv.map(i=>({id:i.id,quantity:i.quantity,attack:i.attack,defense:i.defense,price:i.price,upkeep:i.upkeep})),owned:inv.reduce((s,i)=>s+i.quantity,0),usedAttacking:attack.selected.reduce((s,i)=>s+i.quantity,0),equipmentAttack:attack.attack,equipmentDefense:defense.defense,upkeep:rate,investment,zeroSurplus:portfolio(level,rate,level>50),halfIncomeToUpkeep:portfolio(level,rate*2,level>50)};
})));}

type Money={wallet:number;vault:bigint;retained:bigint;reserve:bigint;arrears:bigint;remainder:bigint;paused:boolean;rate:number;net:number;nextHour:number;maintenanceAt:number;adjustments?:{boundary:number;deduct:bigint;fraction:bigint}[];landFractions?:bigint[];};
type Fighter=Money&{id:string;level:number;inventory:OwnedItem[];n:number;calling:string;training:number;health:number;maxHealth:number;hpAt:number;spirit:number;maxSpirit:number;spAt:number;landUnits:number;landCapital:number;equipmentCapital:number;};
const H=3600000,DAY=24*H,MAX=2147483647;
const money=(f:Money)=>BigInt(f.wallet)+f.vault+f.retained+f.reserve;
const credit=(f:Money,gold:bigint)=>{const paid=gold<BigInt(MAX-f.wallet)?gold:BigInt(MAX-f.wallet);f.wallet+=Number(paid);f.retained+=gold-paid;};
const botTemplates=new Map<boolean,Fighter[]>();
export function proposedBotEstate(level:number,required:number){
 const p=catalogLand(true).filter(p=>p.level<=level).sort((a,b)=>(b.hourlyIncome-b.hourlyUpkeep)-(a.hourlyIncome-a.hourlyUpkeep)||a.id.localeCompare(b.id))[0]!;
 const gain=p.hourlyIncome-p.hourlyUpkeep,quantity=Math.max(1,Math.ceil(required/gain));if(quantity>100)throw new Error('Proposed NPC estate exceeds the real per-type ownership limit.');
 let cost=0;for(let n=0;n<quantity;n++){const price=safeStudyPrice(p.price,n);if(price===null)throw new Error('Proposed NPC capital exceeds a real unit quote.');cost+=price;}
 return {net:gain*quantity,cost,units:quantity,holdings:[{id:p.id,quantity}]};
}
export function researchBots(expanded:boolean){if(!botTemplates.has(expanded))botTemplates.set(expanded,makeResearchBots(expanded));return structuredClone(botTemplates.get(expanded)!);}
function makeResearchBots(expanded:boolean){
 const list:Fighter[]=[];
 for(let level=1;level<=50;level++)for(const tier of ['green','seasoned','elite'])for(let v=0;v<3;v++){
  const b=botBlueprint(level,tier,v),inventory=b.items.map(i=>({...i,inventoryId:i.id,quantity:b.quantities[i.id]!})),rate=inventory.reduce((n,i)=>n+i.upkeep*i.quantity,0);
  list.push({id:'synthetic-existing:'+level+':'+tier+':'+v,level,inventory,n:b.participants,calling:b.calling,training:b.training,health:b.health,maxHealth:b.health,hpAt:0,spirit:b.spirit,maxSpirit:b.spirit,spAt:0,wallet:b.gold,vault:BigInt(b.bankedGold),retained:0n,reserve:BigInt(rate*48),arrears:0n,remainder:0n,paused:false,rate,net:b.netIncome+rate,nextHour:H,maintenanceAt:0,landUnits:b.properties.reduce((s,p)=>s+p.quantity,0),landCapital:b.propertyInvestment,equipmentCapital:b.equipmentInvestment});
 }
 if(expanded){const create=(level:number,slot:number,reinforcement=false)=>{
  const tier=slot<3?'green':slot<6?'seasoned':'elite',ratio=tier==='green'?.2:tier==='seasoned'?.45:slot===7?.8:.6;
  const n=Math.max(1,Math.floor(5*level*ratio)),q=Math.max(1,Math.ceil(n*(tier==='green'?.6:tier==='seasoned'?.85:1))),gearLevel=Math.max(1,level-(tier==='green'?12:tier==='seasoned'?5:0));
  const inventory=loadout(gearLevel,q,'tank',true),rate=inventory.reduce((s,i)=>s+i.quantity*i.upkeep,0),estate=proposedBotEstate(level,Math.max(100,Math.ceil(rate/.35)));
  const healthPoints=Math.floor(level/5)+(tier==='elite'?2:0),health=100+healthPoints*10,wallet=Math.floor(3100+(estate.net-rate)*4+inventory.reduce((s,i)=>s+i.price*i.quantity,0)/10);
  const points=level-1+(alpha.progression.milestones??[]).filter(m=>m.level<=level).reduce((s,m)=>s+m.points,0),trainingBudget=Math.max(0,Math.floor((points-healthPoints-2*Math.floor(level/10))/2));
  list.push({id:'synthetic-proposed:'+(reinforcement?'reinforcement:':'upper:')+level+':'+slot,level,n,inventory,calling:tier==='elite'?'Warden':tier==='seasoned'?'Spellward':'Freeblade',training:Math.min(25,trainingBudget,Math.floor(level/(tier==='elite'?2:tier==='seasoned'?5:12))),health,maxHealth:health,hpAt:0,spirit:3+Math.floor(level/10),maxSpirit:3+Math.floor(level/10),spAt:0,wallet,vault:BigInt((estate.net-rate)*24),retained:0n,reserve:BigInt(rate*48),arrears:0n,remainder:0n,paused:false,rate,net:estate.net,nextHour:H,maintenanceAt:0,landUnits:estate.units,landCapital:estate.cost,equipmentCapital:inventory.reduce((s,i)=>s+i.price*i.quantity,0)});
 };
 for(let level=51;level<=100;level++)for(let slot=0;slot<8;slot++)create(level,slot);
 for(const level of[10,15,20,25,30,35,40,45,48,50])for(const slot of[1,3,4,6,7])create(level,slot,true);
 }
 return list;
}
export interface PaceOptions {name:string;expanded:boolean;extraXpPerLevel:number;sessionMinutes:number[];starts:number[];days:number;seed:number;availability?:number;acceptance?:number;calling?:string;shop?:boolean;armyModel?:ArmyModel;population?:'legacy450'|'proposed900';}
export function pace(o:PaceOptions){
 if(o.starts.length!==o.sessionMinutes.length||o.days<1||o.days>240||o.starts.some((s,i)=>!Number.isInteger(s)||s<0||s+o.sessionMinutes[i]!>1440||o.sessionMinutes[i]!<=0)||(o.availability??1)<0||(o.availability??1)>1||(o.acceptance??1)<0||(o.acceptance??1)>1)throw new Error('Invalid study schedule.');
 const model=o.armyModel??(o.expanded?'historical-5x':'current'),bots=researchBots(o.population?o.population==='proposed900':o.expanded),byLevel=new Map<number,Fighter[]>();for(const b of bots)byLevel.set(b.level,[...(byLevel.get(b.level)??[]),b]);
 const estimates=new Map(bots.map(b=>[b.id,power(b.level,b.n,b.inventory,'defense',0,b.calling)])),defenses=new Map(bots.map(b=>[b.id,power(b.level,b.n,b.inventory,'defense',b.training,b.calling)]));
 let rng=o.seed>>>0;const random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296),roll=()=>Math.floor(random()*21)-10;
 const a={wallet:alpha.startingGold,vault:0n,retained:0n,reserve:0n,arrears:0n,remainder:0n,paused:false,rate:0,net:0,nextHour:Infinity,maintenanceAt:0,adjustments:[] as {boundary:number;deduct:bigint;fraction:bigint}[],landFractions:[] as bigint[],level:1,progress:0,health:100,maxHealth:100,hpAt:0,mana:20,maxMana:20,mpAt:0,spirit:3,maxSpirit:3,spAt:0,calling:o.calling??'Freeblade',training:0,inventory:[] as OwnedItem[],allies:0,points:0};
 const initial=money(a)+bots.reduce((n,b)=>n+money(b),0n),holdings=new Map<string,number>(),loot=new Set<string>(),milestones=new Set<string>(),pair=new Map<string,{start:number;n:number}>(),attempts=new Map<string,number>(),invites:number[]=[];
 const rareTrials:Record<string,number>={};
 const earned={land:0n,quests:0n,upkeep:0n,shop:0n,healing:0n},stats={quests:0,attacks:0,wins:0,losses:0,oneXpWins:0,trivialWins:0,repeatWins:0,loot:0,xpQuest:0,xpCombat:0,heals:0,actions:0,invites:0,accepted:0,gearBuys:0,landBuys:0,levelUps:0,refillMana:0,refillSpirit:0,refillHealth:0,naturalMana:0,naturalSpirit:0,naturalHealth:0,manaSpent:0,staminaSpent:0,healthDamageApplied:0,enemyHealthDamageApplied:0,healingRestored:0,activeMinutes:0};
 const blocked={health:0,stamina:0,mana:0,opponents:0,questArmy:0,questGear:0,loot:0,upkeep:0};const reached:Record<string,number>={'1':0},daily:Record<string,unknown>[]=[],resourceAllocations={mana:0,spirit:0,health:0,attack:0},allied=new Set<string>(),lastInvite=new Map<string,number>();let skillStep=0,cursor=0,inviteCursor=0,lastQuestXp=0,lastDay=-1,reached100:number|null=null,playerIncome=0n;
 const items=catalogItems(o.expanded),quests=catalogQuests(o.expanded),land=catalogLand(o.expanded),itemMap=new Map(items.map(i=>[i.id,i]));
 const requirements=(q:QuestDefinition)=>Object.entries(q.items).map(([id,qty])=>{
  const mirror=o.expanded?proposal.midLevelMirrors.find(i=>i.replaces===id):undefined,item=itemMap.get(mirror?.id??id)!;
  const owned=a.inventory.filter(i=>i.id===id||i.id===mirror?.id).reduce((s,i)=>s+i.quantity,0);return {item,qty:Math.max(0,qty-owned)};
 });
 const fund=(f:Money,t:number,force=false)=>{if(!force&&!f.paused)return;const p=automaticFunding(f.rate,f.reserve,f.arrears,f.wallet);if(p.affordable&&(f.paused||p.cost||p.arrearsPaid)){f.wallet-=Number(p.cost);f.reserve=p.reserveAfter;earned.upkeep+=p.arrearsPaid;f.arrears=0n;f.paused=false;f.maintenanceAt=t;}};
 const settle=(f:Money,t:number)=>{
  let paid=false;if(f.nextHour<=t){const cycles=Math.floor((t-f.nextHour)/H)+1,due=(f.adjustments??[]).filter(x=>x.boundary<=t),deduct=due.reduce((s,x)=>s+x.deduct,0n),amount=BigInt(f.net)*BigInt(cycles)-deduct;f.landFractions=[...(f.landFractions??[]),...due.map(x=>x.fraction)];f.adjustments=(f.adjustments??[]).filter(x=>x.boundary>t);credit(f,amount);earned.land+=amount;if(f===a)playerIncome+=amount;f.nextHour+=cycles*H;paid=true;}
  if(f.retained){const amount=f.retained<BigInt(MAX-f.wallet)?f.retained:BigInt(MAX-f.wallet);f.wallet+=Number(amount);f.retained-=amount;}
  if(!f.paused&&f.rate){const b=maintenanceBill(f.rate,new Date(f.maintenanceAt),new Date(t),f.remainder,f.reserve,f.wallet);f.wallet-=b.fromWallet;f.reserve=b.credit;f.arrears=b.arrears;f.remainder=b.remainder;f.paused=b.paused;f.maintenanceAt=+b.throughAt;earned.upkeep+=b.paid;}else f.maintenanceAt=t;
  if(f===a){if(paid||f.paused)fund(f,t,paid);}else if(paid){const top=f.reserve<BigInt(f.rate)?BigInt(f.rate)-f.reserve:0n,cost=f.arrears+top;if(cost<=BigInt(f.wallet)){f.wallet-=Number(cost);earned.upkeep+=f.arrears;f.reserve+=top;f.arrears=0n;f.paused=false;}else f.paused=true;f.maintenanceAt=t;}
 };
 const allocate=()=>{const pattern=['mana','mana','spirit','health','attack'] as const;let guard=0;while(a.points&&guard++<200){const k=pattern[skillStep%pattern.length]!,cost=k==='spirit'?2:1;if(a.points<cost)break;skillStep++;if(k==='mana'&&a.maxMana>=500||k==='spirit'&&a.maxSpirit>=100||k==='health'&&a.maxHealth>=5000||k==='attack'&&a.training>=25)continue;a.points-=cost;resourceAllocations[k]++;if(k==='mana'){a.maxMana++;a.mana++;}else if(k==='spirit'){a.maxSpirit++;a.spirit++;}else if(k==='health'){a.maxHealth+=10;a.health+=10;}else a.training++;}};
 const award=(xp:number,t:number)=>{a.progress+=xp;while(a.progress>=studyRequirement(a.level,o.extraXpPerLevel)){a.progress-=studyRequirement(a.level,o.extraXpPerLevel);a.level++;a.points++;stats.levelUps++;stats.refillMana+=a.maxMana-a.mana;stats.refillSpirit+=a.maxSpirit-a.spirit;stats.refillHealth+=a.maxHealth-a.health;a.health=a.maxHealth;a.mana=a.maxMana;a.spirit=a.maxSpirit;a.hpAt=a.mpAt=a.spAt=t;reached[String(a.level)]=Number((t/DAY).toFixed(4));}
  const extras=[...(alpha.progression.milestones??[]).filter(m=>m.level<=a.level),{id:'quests-10',points:1,level:stats.quests>=10?1:99999},{id:'first-victory',points:1,level:stats.wins?1:99999}];for(const m of extras)if(a.level>=m.level&&!milestones.has(m.id)){a.points+=m.points;milestones.add(m.id);}allocate();
 };
 const members=()=>Math.min(capacity(a.level,model),1+a.allies);
 const buy=(item:ItemDefinition,qty:number,t:number)=>{const old=a.inventory.find(i=>i.id===item.id),wanted=Math.min(qty,100,(o.expanded?5000:1000)-(old?.quantity??0)),cost=wanted*item.price,newRate=a.rate+wanted*item.upkeep,top=Math.max(0,newRate-Number(a.reserve));if(wanted<1||cost+top>a.wallet)return false;
  a.wallet-=cost;earned.shop+=BigInt(cost);if(old)old.quantity+=wanted;else a.inventory.push({...item,inventoryId:item.id,quantity:wanted});a.rate=newRate;fund(a,t,true);stats.gearBuys++;return true;};
 const neededQuest=(q:QuestDefinition,seen=new Set<string>()):QuestDefinition|null=>{if(q.level>a.level||seen.has(q.id))return null;seen.add(q.id);if(q.requiresLoot&&!loot.has(q.requiresLoot)){const source=quests.find(p=>p.loot?.id===q.requiresLoot);return source?neededQuest(source,seen):null;}return q;};
 for(let t=0;t<o.days*DAY;t+=60000){
  const minute=t/60000%1440,online=o.starts.some((start,i)=>minute>=start&&minute<start+o.sessionMinutes[i]!);if(!online)continue;stats.activeMinutes++;
  const day=Math.floor(t/DAY);if(day!==lastDay){if(lastDay>=0)daily.push({day:lastDay+1,level:a.level,progress:a.progress,gold:a.wallet,net:a.net,upkeep:a.rate,allies:a.allies,quests:stats.quests,wins:stats.wins,losses:stats.losses});lastDay=day;}
  settle(a,t);const hp=regenerate(a.health,a.maxHealth,new Date(a.hpAt),new Date(t),recoverySeconds(a.calling,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount),mp=regenerate(a.mana,a.maxMana,new Date(a.mpAt),new Date(t),recoverySeconds(a.calling,'mana',alpha.resources.manaSeconds)),sp=regenerate(a.spirit,a.maxSpirit,new Date(a.spAt),new Date(t),recoverySeconds(a.calling,'spirit',alpha.resources.spiritSeconds));
  stats.naturalHealth+=hp.value-a.health;stats.naturalMana+=mp.value-a.mana;stats.naturalSpirit+=sp.value-a.spirit;a.health=hp.value;a.hpAt=+hp.updated;a.mana=mp.value;a.mpAt=+mp.updated;a.spirit=sp.value;a.spAt=+sp.updated;
  // One real action per minute, including social and shopping work.
  const recent=invites.filter(at=>at>t-DAY),wantedArmy=Math.min(capacity(a.level,model),bots.length+1);
  if(a.allies+1<wantedArmy&&recent.length<20&&(!invites.length||t-invites.at(-1)!>=30000)){let target:Fighter|undefined;for(let k=0;k<bots.length;k++){const b=bots[(inviteCursor++)%bots.length]!;if(!allied.has(b.id)&&t-(lastInvite.get(b.id)??-DAY)>=DAY){target=b;break;}}if(target){invites.push(t);lastInvite.set(target.id,t);stats.invites++;if(random()<(o.acceptance??1)){allied.add(target.id);a.allies=allied.size;stats.accepted++;}stats.actions++;continue;}}
  const ordered=quests.filter(q=>q.level<=a.level).sort((x,y)=>y.xp/y.mana-x.xp/x.mana||y.xp-x.xp||x.id.localeCompare(y.id));
  let q:QuestDefinition|null=null;for(const candidate of ordered){const n=neededQuest(candidate);if(n&&n.army<=members()){
   const needed=requirements(n);
   const required=needed.reduce((s,x)=>s+x.item.price*x.qty,0),rate=needed.reduce((s,x)=>s+x.item.upkeep*x.qty,0);
   if(required+Math.max(0,a.rate+rate-Number(a.reserve))<=a.wallet||!needed.some(x=>x.qty>0)){q=n;break;}blocked.questGear++;
  }}
  if(q){const missing=requirements(q).map(x=>({i:x.item,n:x.qty})).filter(x=>x.n>0);
   if(missing.length){const first=missing[0]!;if(buy(first.i,first.n,t)){stats.actions++;continue;}blocked.questGear++;q=null;}
  }
  if(!q)blocked.questArmy++;
  // Conservative Land reinvestment and affordable gear; never spend protected
  // money. Constant saved hourly rates; new lots earn only actual partial time.
  if(o.shop!==false&&stats.activeMinutes%5===0){
   const next=land.filter(p=>p.level<=a.level&&(holdings.get(p.id)??0)<100).flatMap(p=>{const cost=safeStudyPrice(p.price,holdings.get(p.id)??0);return cost===null?[]:[{p,cost,gain:p.hourlyIncome-p.hourlyUpkeep}];}).sort((x,y)=>x.cost/x.gain-y.cost/y.gain||x.p.id.localeCompare(y.p.id)).find(x=>x.cost<=a.wallet*.6);
   if(next&&(a.net<a.rate*2||stats.landBuys<10||stats.activeMinutes%20===0)){
    a.wallet-=next.cost;earned.shop+=BigInt(next.cost);holdings.set(next.p.id,(holdings.get(next.p.id)??0)+1);
    // Buying at a non-hour boundary joins the existing clock. Accumulate only
    // the short first period as exact BigInt numerator, settled below.
    if(!Number.isFinite(a.nextHour))a.nextHour=t+H;const numerator=BigInt(next.gain)*BigInt(a.nextHour-t);a.adjustments.push({boundary:a.nextHour,deduct:BigInt(next.gain)-numerator/BigInt(H),fraction:numerator%BigInt(H)});a.net+=next.gain;stats.landBuys++;stats.actions++;continue;
   }
   const target=Math.max(1,Math.ceil(members()*.8)),desired=loadout(a.level,target,'offense',o.expanded).filter(i=>(a.inventory.find(j=>j.id===i.id)?.quantity??0)<target).sort((x,y)=>x.price-y.price);
   const i=desired.find(i=>a.net>=a.rate*2+i.upkeep*2&&i.price<a.wallet*.12);if(i&&buy(i,Math.min(5,target-(a.inventory.find(j=>j.id===i.id)?.quantity??0)),t)){stats.actions++;continue;}
  }
  if(q&&a.mana>=q.mana){if(a.mana===a.maxMana)a.mpAt=t;a.mana-=q.mana;stats.manaSpent+=q.mana;stats.quests++;if(q.level>=71)for(const id of questRarities.quests[q.id]??[])rareTrials[id]=(rareTrials[id]??0)+1;stats.xpQuest+=q.xp;lastQuestXp=q.xp;const gold=q.goldMin+Math.floor(random()*(q.goldMax-q.goldMin+1));credit(a,BigInt(gold));earned.quests+=BigInt(gold);
   if(q.loot&&(!loot.has(q.loot.id)&&q.loot.firstGuaranteed||random()*100<q.loot.chance))loot.add(q.loot.id);award(q.xp,t);fund(a,t);stats.actions++;if(a.level>=100){reached100=t/DAY;break;}continue;
  }else blocked.mana++;
  if(a.health<alpha.combat.minimumHealth){const quote=healingQuote(a.health,a.maxHealth,a.level,a.wallet);if(quote.affordable&&quote.cost<=a.wallet*.05){a.wallet-=quote.cost;earned.healing+=BigInt(quote.cost);stats.healingRestored+=a.maxHealth-a.health;a.health=a.maxHealth;a.hpAt=t;stats.heals++;stats.actions++;}else blocked.health++;continue;}
  if(!a.spirit){blocked.stamina++;continue;}
  if(a.paused)blocked.upkeep++;
  const n=members(),attack=power(a.level,n,a.inventory,'attack',a.training,a.calling,!a.paused),pool:Fighter[]=[];
  for(let l=Math.max(1,a.level-Math.ceil(a.level*.2));l<=a.level+Math.ceil(a.level*.2);l++)if(areRivals(a.level,l))pool.push(...(byLevel.get(l)??[]));
  if(!pool.length){blocked.opponents++;continue;}
  const candidates:Fighter[]=[];for(let z=0;z<Math.min(24,pool.length);z++){const b=pool[(cursor+z)%pool.length]!;if((scheduledNumber(b.id+':'+day)%100)/100<(o.availability??1)&&regenerate(b.health,b.maxHealth,new Date(b.hpAt),new Date(t),recoverySeconds(b.calling,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount).value>0)candidates.push(b);}cursor=(cursor+11)%pool.length;
  const estimate=(b:Fighter)=>estimates.get(b.id)!/attack,matched=candidates.filter(b=>estimate(b)>=.35&&estimate(b)<=1.25),choices=matched.length?matched:candidates;
  choices.sort((x,y)=>(attempts.get(x.id)??0)-(attempts.get(y.id)??0)||Math.abs(estimate(x)-.85)-Math.abs(estimate(y)-.85)||x.id.localeCompare(y.id));
  const b=choices[0];if(!b){blocked.opponents++;continue;}settle(b,t);const bh=regenerate(b.health,b.maxHealth,new Date(b.hpAt),new Date(t),recoverySeconds(b.calling,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount);b.health=bh.value;b.hpAt=+bh.updated;
  const defense=b.paused?power(b.level,b.n,b.inventory,'defense',b.training,b.calling,false):defenses.get(b.id)!,result=resolveAlphaCombat({attack,health:a.health,maxHealth:a.maxHealth,gold:a.wallet},{defense,health:b.health,maxHealth:b.maxHealth,gold:b.wallet},roll(),roll());
  if(a.health===a.maxHealth)a.hpAt=t;if(b.health===b.maxHealth)b.hpAt=t;if(a.spirit===a.maxSpirit)a.spAt=t;stats.healthDamageApplied+=a.health-result.attackerHealthAfter;stats.enemyHealthDamageApplied+=b.health-result.defenderHealthAfter;a.health=result.attackerHealthAfter;b.health=result.defenderHealthAfter;a.spirit-=alpha.combat.spiritCost;stats.staminaSpent+=alpha.combat.spiritCost;stats.attacks++;attempts.set(b.id,(attempts.get(b.id)??0)+1);
  if(result.outcome==='attacker_win'){
   const old=pair.get(b.id),seq=old&&t-old.start<DAY?{...old,n:old.n+1}:{start:t,n:1};pair.set(b.id,seq);const reward=botVictoryRewards(b.wallet,a.level,b.level,seq.n,attack,defense);b.wallet-=reward.loot.amount;credit(a,BigInt(reward.loot.amount));stats.wins++;stats.loot+=reward.loot.amount;stats.xpCombat+=reward.xp.amount;if(reward.xp.amount===1)stats.oneXpWins++;if(reward.xp.trivial)stats.trivialWins++;if(seq.n>1)stats.repeatWins++;award(reward.xp.amount,t);fund(a,t);
  }else stats.losses++;
  stats.actions++;if(a.level>=100){reached100=t/DAY;break;}
 }
 const finish=reached100===null?o.days*DAY:Math.round(reached100*DAY);settle(a,finish);for(const b of bots)settle(b,finish);
 const final=money(a)+bots.reduce((n,b)=>n+money(b),0n),sources=earned.land+earned.quests,sinks=earned.upkeep+earned.shop+earned.healing;
 if(initial+sources-sinks!==final)throw new Error('E1 research gold conservation failed.');
 if(a.mana+stats.manaSpent!==20+stats.naturalMana+stats.refillMana+resourceAllocations.mana||a.spirit+stats.staminaSpent!==3+stats.naturalSpirit+stats.refillSpirit+resourceAllocations.spirit||a.health+stats.healthDamageApplied!==100+stats.naturalHealth+stats.refillHealth+resourceAllocations.health*10+stats.healingRestored)throw new Error('E1 research resource conservation failed.');
 if([a,...bots].some(f=>f.wallet<0||f.wallet>MAX||f.reserve<0n||f.retained<0n||f.arrears<0n))throw new Error('Invalid research treasury.');
 return {rareTrials,options:o,daysTo100:reached100,finalLevel:a.level,progress:a.progress,reached,stats,blocked,resources:{currentMana:a.mana,currentStamina:a.spirit,currentHealth:a.health,maxMana:a.maxMana,maxStamina:a.maxSpirit,maxHealth:a.maxHealth,allocations:resourceAllocations},wallet:a.wallet,vault:a.vault.toString(),reserve:a.reserve.toString(),netProperty:a.net,equipmentUpkeep:a.rate,army:members(),capacity:capacity(a.level,model),inventory:a.inventory.map(i=>({id:i.id,quantity:i.quantity})),holdings:[...holdings].map(([id,quantity])=>({id,quantity})),lastQuestXp,conserved:true,playerLandGold:playerIncome.toString(),fractionalLandNumerators:(a.landFractions??[]).map(String),initialCurrency:initial.toString(),finalCurrency:final.toString(),sources:Object.fromEntries(Object.entries(earned).map(([k,v])=>[k,v.toString()])),daily};
}

export function numericStudy(){return levels.map(level=>{
 const n=capacity(level,'historical-5x'),inv=loadout(level,n,'balanced',level>50),rate=inv.reduce((s,i)=>s+i.upkeep*i.quantity,0),attack=power(level,n,inv,'attack',25);
 return {level,participants:n,currentRequirement:levelRequirement(level),proposedRequirement:studyRequirement(level,150),currentCumulativeXp:Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((s,n)=>s+n,0),proposedCumulativeXp:Array.from({length:level-1},(_,i)=>studyRequirement(i+1,150)).reduce((s,n)=>s+n,0),largestItemStack:n,upkeep:rate,attack,largestRolledAttack:Math.round(attack*110),powerFitsPgInteger:Math.round(attack*110)<=2147483647,powerFitsJsSafeInteger:Number.isSafeInteger(Math.round(attack*110)),upkeepFitsPgInteger:rate<=2147483647,sevenDayUpkeep:(BigInt(rate)*168n).toString()};
});}
export function populationStudy(){
 const summarize=(expanded:boolean)=>{const bots=researchBots(expanded),newBots=bots.filter(b=>b.id.startsWith('synthetic-proposed:'));
  return {bots:bots.length,existing:bots.length-newBots.length,proposed:newBots.length,cashAndReserves:bots.reduce((s,b)=>s+money(b),0n).toString(),newCashAndReserves:newBots.reduce((s,b)=>s+money(b),0n).toString(),newAssetCapital:newBots.reduce((s,b)=>s+BigInt(b.landCapital+b.equipmentCapital),0n).toString(),propertyNetPerHour:bots.reduce((s,b)=>s+b.net,0),equipmentUpkeepPerHour:bots.reduce((s,b)=>s+b.rate,0),netAfterUpkeepPerHour:bots.reduce((s,b)=>s+b.net-b.rate,0),newMaximumInitialLots:Math.max(0,...newBots.map(b=>b.landUnits)),initialPaidLots:bots.reduce((s,b)=>s+b.landUnits,0),nominalHourlyLotRows30Days:bots.reduce((s,b)=>s+b.landUnits,0)*24*30,samples:[51,60,75,100].map(level=>({level,bots:bots.filter(b=>b.level===level).map(b=>({id:b.id,army:b.n,equipmentCopies:b.inventory.reduce((s,i)=>s+i.quantity,0),landLots:b.landUnits,landCapital:b.landCapital,equipmentCapital:b.equipmentCapital,propertyNet:b.net,upkeep:b.rate,wallet:b.wallet,reserve:b.reserve.toString()}))})),availability:levels.map(level=>({level,eligible:bots.filter(b=>areRivals(level,b.level)).length}))};
 };
 const schedules=[];for(const count of[450,900])for(const max of[5,10,12]){
  let nominated=0,selected=0,maximumSlot=0;const perBot=new Map<string,number>(),ids=Array.from({length:count},(_,i)=>'e1-synthetic-'+i);
  for(let window=0;window<288;window++){const slot=ids.filter(id=>scheduledNumber(id)%144===window%144).length;maximumSlot=Math.max(maximumSlot,slot);nominated+=slot;for(const id of scheduledCandidates(ids,window,{slots:144,maximum:max,population:count})){selected++;perBot.set(id,(perBot.get(id)??0)+1);}}
  schedules.push({population:count,maximumPerTick:max,nominated,selected,missed:nominated-selected,maximumSlot,botsWithoutOpportunity:ids.filter(id=>!perBot.has(id)).length,atMostTwoOpportunities:[...perBot.values()].every(n=>n<=2),uniqueCommandsWithThreeWorkers:selected,duplicateInvocationsWithThreeWorkers:2*selected,nominalPopulationRowsReadPerDayOneWorker:count*288*2});
 }
 return {current:summarize(false),proposed:summarize(true),schedules,incomeSweep:{batchSize:25,maximumBatchesPerCall:18,capacityPerCall:450,callsFor900Due:2,retainsHourlyRows:true,source:'src/bot-income.ts'},notProductionMetrics:true,measuredLatency:null};
}
