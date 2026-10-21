// OFFLINE PROPOSALS ONLY. No runtime module imports this file; no writes or grants.
import {alpha,activeArmy,trainedPower,selectEquipment,areRivals,type ItemDefinition,type OwnedItem} from '../../src/alpha-rules.js';
import {rules} from '../../src/rules.js';
import {callingFor,callingPower,type Calling} from '../../src/strategy-rules.js';
import {botBlueprint} from '../../src/development.js';
import {botVictoryRewards} from '../../src/bot-combat-rules.js';
export type Policy='current'|'uncapped-linear'|'uncapped-support';
export const support=(n:number)=>n<=21?n:21+4*Math.log1p((n-21)/4);
export function gear(level:number,mode:'attack'|'defense',lag=0){return (['weapon','armor','spell'] as const).map(category=>alpha.items.filter(i=>i.category===category&&i.level<=Math.max(1,level-lag)).sort((a,b)=>b[mode]-a[mode]||b[mode==='attack'?'defense':'attack']-a[mode==='attack'?'defense':'attack']||a.upkeep-b.upkeep||a.id.localeCompare(b.id))[0]!);}
export function fighter(level:number,army:number,items:ItemDefinition[],quantities:number[],training:number,calling:Calling,mode:'attack'|'defense',policy:Policy='current',bot=false){
 const participants=policy==='current'?Math.min(bot?10:101,activeArmy(level,army-1,0).participants):army;
 const inventory=items.map((i,n)=>({...i,inventoryId:i.id,quantity:quantities[n]!}));
 const effective=(n:number)=>policy==='uncapped-support'?support(n):n;
 let equipment=0;
 // Same catalog sorting/selection, but proposal-only support weighting beyond
 // slot 21. Quantities remain real whole copies; unweighted upkeep is unchanged.
 for(const category of['weapon','armor','spell']){let occupied=0;const ordered=inventory.filter(i=>i.category===category).sort((a,b)=>b[mode]-a[mode]||b[mode==='attack'?'defense':'attack']-a[mode==='attack'?'defense':'attack']||a.upkeep-b.upkeep||a.id.localeCompare(b.id));for(const i of ordered){const n=Math.min(i.quantity,participants-occupied);if(n<=0)continue;equipment+=i[mode]*(effective(occupied+n)-effective(occupied));occupied+=n;}}
 const base=rules[mode==='attack'?'baseAttack':'baseDefense']+(level-1)*rules[mode==='attack'?'attackPerLevel':'defensePerLevel']+(effective(participants)-1)*rules.unit[mode]+equipment;
 const power=callingPower(Math.round(base*(100+training))/100,callingFor(calling)[mode==='attack'?'attackPercent':'defensePercent']);
 return {level,army,participants,effectiveParticipants:effective(participants),power,training,calling,upkeep:inventory.reduce((s,i)=>s+i.quantity*i.upkeep,0),investment:inventory.reduce((s,i)=>s+i.quantity*i.price,0),items:inventory.map(i=>({id:i.id,quantity:i.quantity}))};
}
export function human(level:number,army:number,policy:Policy='current',tier:'starter'|'lagged'|'best'='lagged'){
 const items=gear(tier==='starter'?1:Math.min(50,level),'attack',tier==='lagged'?2:0),n=Math.min(1000,army);
 return fighter(level,army,items,items.map(()=>n),Math.min(25,Math.floor((level-1)/3)),'Freeblade','attack',policy);
}
export function currentBot(level:number,tier:string){const b=botBlueprint(Math.min(50,level),tier);return {...fighter(Math.min(50,level),b.participants,b.items,b.items.map(i=>b.quantities[i.id]!),b.training,b.calling,'defense','current',true),wallet:b.gold,vault:b.bankedGold,netIncome:b.netIncome,grossIncome:b.grossIncome,properties:b.properties};}
export function encounter(attack:number,defense:number,level:number,botLevel=level,wallet=10000){
 let wins=0,totalDamage=0,received=0;const c=alpha.combat;
 for(let a=-c.variation;a<=c.variation;a++)for(let d=-c.variation;d<=c.variation;d++){
  const ap=Math.round(attack*(100+a)),dp=Math.round(defense*(100+d)),win=ap>dp;
  const damage=Math.min(c.loserDamageMax,c.loserDamageMin+Math.floor(Math.abs(ap-dp)/200));
  if(win)wins++;totalDamage+=win?damage:c.winnerDamage;received+=win?c.winnerDamage:damage;
 }
 const n=(2*c.variation+1)**2,p=wins/n,eligible=areRivals(level,botLevel),first=botVictoryRewards(wallet,level,botLevel,1,attack,defense),repeat=botVictoryRewards(wallet,level,botLevel,5,attack,defense);
 return {eligible,winPercent:Number((p*100).toFixed(2)),expectedDamageDealt:totalDamage/n,expectedDamageReceived:received/n,xpPerWin:eligible?first.xp.amount:null,repeatXp:eligible?repeat.xp.amount:null,goldPerWin:eligible?first.loot.amount:null,repeatGold:eligible?repeat.loot.amount:null,expectedXpPerAttempt:eligible?p*first.xp.amount:null,strengthRatio:defense/Math.max(1,attack)};
}
export function proposedBot(level:number,tier:'green'|'seasoned'|'elite',policy:Policy){
 // Illustrative finite loadout search, not an identity or wallet rewrite. At
 // 100/200 only existing level-50 art/stats are reused as a mechanical stress test.
 const reference=human(level,Math.min(21,1+Math.floor(level/2)),policy);
 const target=reference.power*({green:.8,seasoned:1,elite:1.18}[tier]);
 const items=gear(Math.min(50,level),'defense',tier==='green'?5:tier==='seasoned'?2:0),training=Math.min(25,Math.floor((level-1)/(tier==='elite'?3:6))),calling=tier==='elite'?'Warden':'Freeblade';
 let best:ReturnType<typeof fighter>|null=null,distance=Infinity;
 for(let p=1;p<=Math.min(101,1+2*level);p++)for(const coverage of[.4,.6,.8,1]){const f=fighter(level,p,items,items.map(()=>Math.max(1,Math.ceil(p*coverage))),training,calling,'defense',policy);const diff=Math.abs(f.power-target);if(diff<distance){best=f;distance=diff;}}
 const old=currentBot(level,tier);return {...best!,referenceArmy:reference.army,targetPower:target,netIncome:old.netIncome+old.upkeep-best!.upkeep,upkeepDelta:best!.upkeep-old.upkeep,wallet:old.wallet,vault:old.vault,properties:old.properties};
}
// An independent cross-check against the active selectors and training formula.
export function assertCurrentEquivalent(level:number,army:number){const h=human(level,army,'current','best'),items=gear(Math.min(50,level),'attack');const inventory:OwnedItem[]=items.map(i=>({...i,inventoryId:i.id,quantity:Math.min(1000,army)}));const p=activeArmy(level,army-1,0).participants,e=selectEquipment(inventory,p,'attack');return {model:h.power,actual:callingPower(trainedPower(rules.baseAttack+(level-1)*rules.attackPerLevel+(p-1)*rules.unit.attack+e.attack,h.training),callingFor('Freeblade').attackPercent)};}
