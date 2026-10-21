// Unadopted, offline candidate. Never imported by src/, a migration or startup.
import {createHash} from 'node:crypto';
import {alpha,activeArmy,selectEquipment,trainedPower,type OwnedItem} from '../../src/alpha-rules.js';
import {rules} from '../../src/rules.js';
import {callingFor,callingPower,botCatalog,type Calling} from '../../src/strategy-rules.js';
import {botBlueprint} from '../../src/development.js';
import {equipmentResale} from '../../src/game-feel-rules.js';

export const candidate=Object.freeze({id:'bot-calibration-candidate-1',adopted:false,armyChanges:false,
  ratios:Object.freeze({green:Object.freeze([.55,.62,.70]),seasoned:Object.freeze([.80,.88,.94]),elite:Object.freeze([.96,1,1.04])}),maximumPurseSpendPercent:25,
  maximumUpkeepPercentOfPropertyNet:35,operatingHours:2,trainingLimit:25});
export type Tier='green'|'seasoned'|'elite';
export interface Lot {quantity:number;unitCost:number;}
export interface Holding {itemId:string;quantity:number;lots:Lot[];}
export interface BotSnapshot {id:string;accountId:string;name:string;level:number;tier:Tier;variant:number;calling:Calling;militia:number;legacyFloor:number;
  attackTraining:number;defenseTraining:number;skillPoints:number;gold:number;vault:number;reserve:number;arrears:number;paused:boolean;
  grossIncome:number;propertyUpkeep:number;inventory:Holding[];}
export interface Trade {itemId:string;quantity:number;gold:number;}
export function inventory(s:BotSnapshot):OwnedItem[]{return s.inventory.filter(h=>h.quantity>0).map(h=>({...alpha.items.find(i=>i.id===h.itemId)!,inventoryId:h.itemId,quantity:h.quantity}));}
export function power(level:number,p:number,owned:OwnedItem[],training:number,calling:Calling,mode:'attack'|'defense',maintained=true){
  const selected=selectEquipment(owned,p,mode,maintained),base=(mode==='attack'?rules.baseAttack:rules.baseDefense)+(level-1)*(mode==='attack'?rules.attackPerLevel:rules.defensePerLevel)+(p-1)*rules.unit[mode]+selected[mode];
  return callingPower(trainedPower(base,training),callingFor(calling)[mode==='attack'?'attackPercent':'defensePercent']);
}
export function participants(s:BotSnapshot){return Math.min(10,activeArmy(s.level,Math.min(9,s.militia),0,Math.min(10,s.legacyFloor)).participants);}
export function equipmentRate(s:BotSnapshot){return inventory(s).reduce((n,i)=>n+i.quantity*i.upkeep,0);}
export function humanReference(level:number,profile:'starter'|'ordinary'|'established'|'large'){
  const p=profile==='starter'?1:profile==='ordinary'?Math.max(1,Math.round(Math.min(10,1+Math.floor(level/5))*.7)):Math.min(profile==='large'?101:21,1+2*level);
  const gearLevel=profile==='starter'?1:Math.max(1,Math.min(50,level)-(profile==='ordinary'?2:0));
  const owned=(['weapon','armor','spell']as const).map(category=>{const i=alpha.items.filter(i=>i.category===category&&i.level<=gearLevel).sort((a,b)=>b.attack-a.attack||b.defense-a.defense||a.upkeep-b.upkeep||a.id.localeCompare(b.id))[0]!;return {...i,inventoryId:i.id,quantity:profile==='ordinary'?Math.ceil(p*.8):p};});
  const training=profile==='starter'?0:Math.min(25,Math.floor(profile==='ordinary'?level/6:(level-1)/3));
  return {level,profile,participants:p,training,inventory:owned,attack:power(level,p,owned,training,'Freeblade','attack'),upkeep:owned.reduce((s,i)=>s+i.quantity*i.upkeep,0)};
}
export function blueprintSnapshot(level:number,tier:Tier,variant=0):BotSnapshot{
  const b=botBlueprint(level,tier,variant),propertyUpkeep=b.properties.reduce((s,p)=>s+p.quantity*alpha.properties.find(a=>a.id===p.id)!.hourlyUpkeep,0);
  const inventory=b.items.filter(i=>b.quantities[i.id]!>0).map(i=>({itemId:i.id,quantity:b.quantities[i.id]!,lots:[{quantity:b.quantities[i.id]!,unitCost:i.price}]}));
  return {id:`${level}:${tier}:${variant}`,accountId:'synthetic-disabled-account',name:b.name,level,tier,variant,calling:b.calling,militia:b.participants-1,legacyFloor:1,
    attackTraining:b.training,defenseTraining:b.training,skillPoints:(alpha.progression.milestones??[]).filter(m=>m.level<=level).reduce((n,m)=>n+m.points,0),
    gold:b.gold,vault:b.bankedGold,reserve:equipmentRate({inventory}as BotSnapshot)*48,arrears:0,paused:false,grossIncome:b.grossIncome,propertyUpkeep,inventory};
}
export function fingerprint(s:BotSnapshot){return createHash('sha256').update(JSON.stringify(s)).digest('hex');}
export function saleReturn(holding:Holding,n:number){let left=n,gold=0;for(const lot of holding.lots){const q=Math.min(left,lot.quantity);gold+=q*equipmentResale(lot.unitCost);left-=q;}if(left)throw new Error('Incomplete saved inventory lots');return gold;}
function validate(s:BotSnapshot){
  if(!Number.isInteger(s.level)||s.level<1||s.level>50||!['green','seasoned','elite'].includes(s.tier)||!Number.isInteger(s.variant)||s.variant<0||s.variant>2||s.militia<0||s.militia>20||s.legacyFloor<1||s.legacyFloor>101)throw new Error('Unsupported bot snapshot');
  for(const n of[s.gold,s.vault,s.reserve,s.arrears,s.skillPoints,s.attackTraining,s.defenseTraining])if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid bot finances or progression');
  if(s.attackTraining>25||s.defenseTraining>25||new Set(s.inventory.map(i=>i.itemId)).size!==s.inventory.length)throw new Error('Invalid bot holdings');
  for(const h of s.inventory){if(!alpha.items.some(i=>i.id===h.itemId)||!Number.isInteger(h.quantity)||h.quantity<0||h.quantity>1000||h.lots.some(l=>!Number.isInteger(l.quantity)||l.quantity<0||!Number.isInteger(l.unitCost)||l.unitCost<0)||h.lots.reduce((n,l)=>n+l.quantity,0)!==h.quantity)throw new Error('Invalid saved inventory lots');}
}
export function planCalibration(s:BotSnapshot,training='earned-points' as 'earned-points'|'gear-only'){
  validate(s);if(!['earned-points','gear-only'].includes(training))throw new Error('Unknown candidate');
  const p=participants(s),reference=humanReference(s.level,'ordinary'),target=reference.attack*candidate.ratios[s.tier][s.variant]!,propertyNet=s.grossIncome-s.propertyUpkeep;
  const beforeDefense=power(s.level,p,inventory(s),s.defenseTraining,s.calling,'defense',!s.paused),oldRate=equipmentRate(s);
  const base={policy:candidate.id,training,snapshotHash:fingerprint(s),botId:s.id,level:s.level,tier:s.tier,variant:s.variant,participants:p,referenceArmy:reference.participants,referenceAttack:reference.attack,targetDefense:target,beforeDefense,oldRate,propertyNet};
  const own=new Map(s.inventory.map(i=>[i.itemId,i]));
  function trades(desired:{itemId:string;quantity:number}[]){const wanted=new Map(desired.map(i=>[i.itemId,i.quantity])),sales:Trade[]=[],purchases:Trade[]=[];
    for(const h of s.inventory){const q=h.quantity-(wanted.get(h.itemId)??0);if(q>0)sales.push({itemId:h.itemId,quantity:q,gold:saleReturn(h,q)});}
    for(const h of desired){const q=h.quantity-(own.get(h.itemId)?.quantity??0);if(q>0)purchases.push({itemId:h.itemId,quantity:q,gold:q*alpha.items.find(i=>i.id===h.itemId)!.price});}
    return {sales,purchases};
  }
  const maxPoints=training==='gear-only'?0:Math.min(s.skillPoints,25-s.defenseTraining);
  // Finite catalog choices and ordinary quantities, never hidden power bonuses.
  const options=(['weapon','armor','spell']as const).map(category=>{
    const choices=new Set<string>();for(const lag of[0,2,5]){const item=alpha.items.filter(i=>i.category===category&&i.level<=Math.max(1,s.level-lag)).sort((a,b)=>b.defense-a.defense||b.attack-a.attack||a.upkeep-b.upkeep||a.id.localeCompare(b.id))[0];if(item)choices.add(item.id);}
    for(const h of s.inventory)if(alpha.items.find(i=>i.id===h.itemId)?.category===category&&alpha.items.find(i=>i.id===h.itemId)!.level<=s.level)choices.add(h.itemId);
    const result=[{itemId:'',quantity:0,defense:0,upkeep:0}];for(const id of[...choices].sort()){const item=alpha.items.find(i=>i.id===id)!;for(const q of new Set([1,Math.ceil(p*.4),Math.ceil(p*.6),Math.ceil(p*.8),p]))result.push({itemId:id,quantity:q,defense:item.defense*q,upkeep:item.upkeep*q});}return result;
  });
  let best:{desired:{itemId:string;quantity:number}[];points:number;defense:number;rate:number;score:number;trades:ReturnType<typeof trades>;cost:number;refund:number;topup:number;reserveReturn:number;finalGold:number;finalReserve:number}|null=null;
  const retained=Math.ceil(s.gold*(100-candidate.maximumPurseSpendPercent)/100);
  for(const w of options[0]!)for(const a of options[1]!)for(const m of options[2]!){const choices=[w,a,m],rate=w.upkeep+a.upkeep+m.upkeep;
    if(rate>Math.floor(propertyNet*candidate.maximumUpkeepPercentOfPropertyNet/100))continue;
    for(let points=0;points<=maxPoints;points++){
      const defense=callingPower(trainedPower(rules.baseDefense+(s.level-1)*rules.defensePerLevel+(p-1)*rules.unit.defense+w.defense+a.defense+m.defense,s.defenseTraining+points),callingFor(s.calling).defensePercent);
      const score=Math.abs(defense-target);if(best&&score>best.score+.000001)continue;
      const desired=choices.filter(i=>i.quantity).map(({itemId,quantity})=>({itemId,quantity})),trade=trades(desired),cost=trade.purchases.reduce((n,t)=>n+t.gold,0),refund=trade.sales.reduce((n,t)=>n+t.gold,0);
      const topup=Math.max(0,rate-s.reserve),reserveReturn=0;
      // Funding must work using only the pre-existing exposed purse plus actual
      // FIFO sales, without using a prepaid-reserve refund as purchase capital.
      if(s.gold+refund-cost-topup-s.arrears<Math.max(retained,rate*candidate.operatingHours))continue;
      const finalGold=s.gold+refund-cost+reserveReturn-topup-s.arrears,finalReserve=Math.max(s.reserve,rate);
      if(!best||score<best.score-.000001||(Math.abs(score-best.score)<.000001&&(points<best.points||points===best.points&&cost-refund<best.cost-best.refund)))best={desired,points,defense,rate,score,trades:trade,cost,refund,topup,reserveReturn,finalGold,finalReserve};
    }
  }
  if(!best)return {...base,status:'deferred' as const,reason:'No affordable sustainable candidate',desired:s.inventory.map(({itemId,quantity})=>({itemId,quantity})),points:0,afterDefense:beforeDefense,newRate:oldRate,netHourly:propertyNet-oldRate,purchases:[]as Trade[],sales:[]as Trade[],purchaseCost:0,saleRefund:0,reserveReturn:0,reserveTopup:0,finalGold:s.gold,finalReserve:s.reserve};
  const improvement=Math.abs(beforeDefense-target)-best.score;
  if(improvement<Math.max(.02*reference.attack,1)||s.paused)return {...base,status:'unchanged' as const,reason:s.paused?'Maintenance paused; no calibration until ordinarily funded':'Existing defense is within candidate tolerance or no meaningful improvement',desired:s.inventory.map(({itemId,quantity})=>({itemId,quantity})),points:0,afterDefense:beforeDefense,newRate:oldRate,netHourly:propertyNet-oldRate,purchases:[]as Trade[],sales:[]as Trade[],purchaseCost:0,saleRefund:0,reserveReturn:0,reserveTopup:0,finalGold:s.gold,finalReserve:s.reserve};
  return {...base,status:'planned' as const,reason:'Paid deterministic equipment and existing earned points only',desired:best.desired,points:best.points,afterDefense:best.defense,newRate:best.rate,netHourly:propertyNet-best.rate,purchases:best.trades.purchases,sales:best.trades.sales,purchaseCost:best.cost,saleRefund:best.refund,reserveReturn:best.reserveReturn,reserveTopup:best.topup,finalGold:best.finalGold,finalReserve:best.finalReserve};
}
export type CalibrationPlan=ReturnType<typeof planCalibration>;
export function applyPlanToSnapshot(s:BotSnapshot,plan:CalibrationPlan):BotSnapshot{
 if(plan.snapshotHash!==fingerprint(s)||plan.botId!==s.id)throw new Error('Plan snapshot mismatch');if(plan.status!=='planned')return structuredClone(s);
 const holdings=plan.desired.filter(i=>i.quantity).map(h=>{const old=s.inventory.find(i=>i.itemId===h.itemId),sold=Math.max(0,(old?.quantity??0)-h.quantity);let skip=sold;
  const lots=(old?.lots??[]).map(l=>{const n=Math.min(skip,l.quantity);skip-=n;return {quantity:l.quantity-n,unitCost:l.unitCost};}).filter(l=>l.quantity>0);const bought=plan.purchases.find(p=>p.itemId===h.itemId);if(bought)lots.push({quantity:bought.quantity,unitCost:alpha.items.find(i=>i.id===h.itemId)!.price});return {...h,lots};});
 return {...structuredClone(s),inventory:holdings,gold:plan.finalGold,reserve:plan.finalReserve,arrears:0,defenseTraining:s.defenseTraining+plan.points,skillPoints:s.skillPoints-plan.points};
}
