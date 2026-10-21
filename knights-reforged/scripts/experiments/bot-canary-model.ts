// Offline, unadopted proposal. No production imports, I/O or provisioning.
import {createHash} from 'node:crypto';
import {alpha,type OwnedItem} from '../../src/alpha-rules.js';
import {inventory,power,participants,equipmentRate,humanReference,fingerprint,type BotSnapshot,type Tier} from './bot-calibration-model.js';

export const canary=Object.freeze({id:'bot-canary-proposal-1',adopted:false,
  levels:Object.freeze([5,8,15,25,40,50]),tiers:Object.freeze(['green','seasoned','elite'] as const),
  maximumPurseSpendPercent:10,maximumTotalPurchaseGold:7500,maximumTotalExtraUpkeepPerHour:75,
  maximumPowerIncreasePercent:8,minimumDefenseIncreasePercent:1,
  targetDefenseIncreasePercent:5,maximumExtraUpkeepPercentOfPropertyNet:2,
  maximumTotalUpkeepPercentOfPropertyNet:35,operatingHours:4,
  maximumWinRateDropPoints:15,minimumOrdinaryWinPercent:25,quoteSeconds:900});
export const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const slotKey=(s:Pick<BotSnapshot,'level'|'tier'|'variant'>)=>`${s.level}:${s.tier}:${s.variant}`;
export const selectedSlots=Object.freeze(canary.levels.flatMap((level,band)=>canary.tiers.map((tier,t)=>`${level}:${tier}:${(band+t)%3}`)));

export function winPercent(attack:number,defense:number){
  let wins=0;const v=alpha.combat.variation;
  for(let a=-v;a<=v;a++)for(let d=-v;d<=v;d++)if(Math.round(attack*(100+a))>Math.round(defense*(100+d)))wins++;
  return wins*100/(2*v+1)**2;
}
export function powers(s:BotSnapshot){
  const p=participants(s),owned=inventory(s);
  return {attack:power(s.level,p,owned,s.attackTraining,s.calling,'attack',!s.paused),
    defense:power(s.level,p,owned,s.defenseTraining,s.calling,'defense',!s.paused)};
}
function validate(s:BotSnapshot){
  if(!s.id||!s.accountId||!Number.isInteger(s.level)||s.level<1||s.level>50||!canary.tiers.includes(s.tier)||!Number.isInteger(s.variant)||s.variant<0||s.variant>2)throw new Error('Unsupported saved bot');
  for(const n of[s.militia,s.legacyFloor,s.attackTraining,s.defenseTraining,s.skillPoints,s.gold,s.vault,s.reserve,s.arrears,s.grossIncome,s.propertyUpkeep])if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid saved state');
  if(s.militia>20||s.legacyFloor<1||s.legacyFloor>101||s.attackTraining>25||s.defenseTraining>25||new Set(s.inventory.map(i=>i.itemId)).size!==s.inventory.length)throw new Error('Invalid saved holdings');
  for(const h of s.inventory)if(!alpha.items.some(i=>i.id===h.itemId)||!Number.isInteger(h.quantity)||h.quantity<0||h.quantity>alpha.limits.inventory||h.lots.some(l=>!Number.isInteger(l.quantity)||l.quantity<0||!Number.isSafeInteger(l.unitCost)||l.unitCost<0)||h.lots.reduce((n,l)=>n+l.quantity,0)!==h.quantity)throw new Error('Invalid paid inventory lots');
}
export function planCanary(s:BotSnapshot){
  validate(s);
  const before=powers(s),oldRate=equipmentRate(s),propertyNet=s.grossIncome-s.propertyUpkeep;
  const base={policy:canary.id,slot:slotKey(s),botId:s.id,accountId:s.accountId,snapshotHash:fingerprint(s),
    participants:participants(s),before,oldRate,propertyNet};
  const unchanged=(reason:string)=>({...base,status:'control' as const,reason,purchases:[] as {itemId:string;quantity:number;gold:number}[],
    cost:0,reserveTopup:0,after:before,newRate:oldRate,netHourly:propertyNet-oldRate,finalGold:s.gold,finalReserve:s.reserve});
  if(s.paused||s.arrears)return unchanged('Unfunded maintenance; no automatic rescue');
  const profiles=['starter','ordinary','established','large'] as const;
  const benchmarks=profiles.map(p=>humanReference(s.level,p));
  if(winPercent(benchmarks[1]!.attack,before.defense)<canary.minimumOrdinaryWinPercent)return unchanged('Already too challenging for the fixed ordinary benchmark');
  const target=before.defense*(1+canary.targetDefenseIncreasePercent/100);
  let best:{item:typeof alpha.items[number];quantity:number;cost:number;rate:number;after:ReturnType<typeof powers>;topup:number;score:number}|undefined;
  // At most one paid catalog item type, one or two copies. Keep every old item.
  for(const item of [...alpha.items].sort((a,b)=>a.id.localeCompare(b.id)))for(const quantity of[1,2]){
    if(item.level>s.level||(s.inventory.find(i=>i.itemId===item.id)?.quantity??0)+quantity>alpha.limits.inventory)continue;
    const cost=item.price*quantity,rate=oldRate+item.upkeep*quantity,topup=Math.max(0,rate-s.reserve);
    if(cost+topup>Math.floor(s.gold*canary.maximumPurseSpendPercent/100)||rate>Math.floor(propertyNet*canary.maximumTotalUpkeepPercentOfPropertyNet/100)||rate-oldRate>Math.max(1,Math.floor(propertyNet*canary.maximumExtraUpkeepPercentOfPropertyNet/100))||s.gold-cost-topup<rate*canary.operatingHours||propertyNet-rate<=0)continue;
    const owned=inventory(s),old=owned.find(i=>i.id===item.id);if(old)old.quantity+=quantity;else owned.push({...item,inventoryId:item.id,quantity});
    const after={attack:power(s.level,base.participants,owned,s.attackTraining,s.calling,'attack'),defense:power(s.level,base.participants,owned,s.defenseTraining,s.calling,'defense')};
    if(after.defense<before.defense*(1+canary.minimumDefenseIncreasePercent/100)||after.defense>before.defense*(1+canary.maximumPowerIncreasePercent/100)||after.attack>before.attack*(1+canary.maximumPowerIncreasePercent/100))continue;
    const ordinaryAfter=winPercent(benchmarks[1]!.attack,after.defense);
    if(ordinaryAfter<canary.minimumOrdinaryWinPercent||benchmarks.some(h=>winPercent(h.attack,before.defense)-winPercent(h.attack,after.defense)>canary.maximumWinRateDropPoints))continue;
    const score=Math.abs(after.defense-target);
    if(!best||score<best.score-1e-8||Math.abs(score-best.score)<1e-8&&(cost<best.cost||cost===best.cost&&rate<best.rate))best={item,quantity,cost,rate,after,topup,score};
  }
  if(!best)return unchanged('No small affordable purchase passes every strength, matchup and upkeep bound');
  return {...base,status:'purchase' as const,reason:'Modest paid addition; no sales, points, member grants or refunds',
    purchases:[{itemId:best.item.id,quantity:best.quantity,gold:best.cost}],cost:best.cost,reserveTopup:best.topup,
    after:best.after,newRate:best.rate,netHourly:propertyNet-best.rate,finalGold:s.gold-best.cost-best.topup,finalReserve:s.reserve+best.topup};
}
export type CanaryPlan=ReturnType<typeof planCanary>;
export function applyCanarySnapshot(s:BotSnapshot,plan:CanaryPlan):BotSnapshot{
  if(plan.snapshotHash!==fingerprint(s)||digest(plan)!==digest(planCanary(s)))throw new Error('Reviewed canary plan mismatch');
  const after=structuredClone(s);
  for(const buy of plan.purchases){let h=after.inventory.find(i=>i.itemId===buy.itemId);if(!h){h={itemId:buy.itemId,quantity:0,lots:[]};after.inventory.push(h);}h.quantity+=buy.quantity;h.lots.push({quantity:buy.quantity,unitCost:alpha.items.find(i=>i.id===buy.itemId)!.price});}
  after.gold=plan.finalGold;after.reserve=plan.finalReserve;return after;
}
export function prepareManifest(snapshots:BotSnapshot[],createdAt:Date){
  if(!Number.isFinite(+createdAt)||snapshots.length!==18||new Set(snapshots.map(slotKey)).size!==18||new Set(snapshots.map(s=>s.id)).size!==18||new Set(snapshots.map(s=>s.accountId)).size!==18)throw new Error('Exactly eighteen distinct reviewed bot slots required');
  const entries=selectedSlots.map(slot=>{const before=snapshots.find(s=>slotKey(s)===slot);if(!before)throw new Error('Missing predetermined canary slot');const plan=planCanary(before);return {slot,botId:before.id,accountId:before.accountId,before,plan,after:applyCanarySnapshot(before,plan)};});
  if(entries.reduce((n,e)=>n+e.plan.cost,0)>canary.maximumTotalPurchaseGold||entries.reduce((n,e)=>n+e.plan.newRate-e.plan.oldRate,0)>canary.maximumTotalExtraUpkeepPerHour)throw new Error('Canary aggregate budget exceeds reviewed ceiling');
  return {policy:canary.id,productionAuthorized:false,createdAt:createdAt.toISOString(),expiresAt:new Date(+createdAt+canary.quoteSeconds*1000).toISOString(),entries};
}
export type CanaryManifest=ReturnType<typeof prepareManifest>;
export function economicIntentDigest(m:CanaryManifest){
  const holdings=(s:BotSnapshot)=>s.inventory.map(h=>({itemId:h.itemId,quantity:h.quantity,lots:h.lots})).sort((a,b)=>a.itemId.localeCompare(b.itemId));
  return digest(m.entries.map(e=>({slot:e.slot,calling:e.before.calling,members:e.plan.participants,training:[e.before.attackTraining,e.before.defenseTraining],points:e.before.skillPoints,
    status:e.plan.status,beforePower:e.plan.before,afterPower:e.plan.after,purchases:e.plan.purchases,cost:e.plan.cost,purse:[e.before.gold,e.after.gold],reserve:[e.before.reserve,e.after.reserve],
    upkeep:[e.plan.oldRate,e.plan.newRate],propertyNet:e.plan.propertyNet,beforeHoldings:holdings(e.before),afterHoldings:holdings(e.after)})));
}
export function verifyManifest(m:CanaryManifest,reviewedDigest:string){
  if(!/^[a-f0-9]{64}$/.test(reviewedDigest)||digest(m)!==reviewedDigest||m.productionAuthorized!==false||m.policy!==canary.id||digest(prepareManifest(m.entries.map(e=>e.before),new Date(m.createdAt)))!==reviewedDigest)throw new Error('Exact reviewed test manifest required');
}
