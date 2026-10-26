import { readFileSync } from 'node:fs';
import {resolveArmy,armyPolicy,safeCount,compatibility,type ArmyPolicy} from './compatibility-rules.js';

export type Category = 'weapon' | 'armor' | 'spell';
export interface Illustration { atlas:'weapons'|'armor'|'spells'|'properties';column:number;row:number; }
export interface ItemDefinition { presentationId?:string; id: string; name: string; category: Category; description: string; price: number; attack: number; defense: number; upkeep: number; level: number; art: string;tier?:string;illustration?:Illustration;acquisition?:'quest-exclusive'; }
export interface QuestDefinition { id: string; name: string; area: string; description: string; level: number; mana: number; goldMin: number; goldMax: number; xp: number; army: number; items: Record<string, number>; requiresLoot?: string; loot?: { id: string; name: string; chance: number; firstGuaranteed: boolean }; }
export interface PropertyDefinition { id: string; name: string; description: string; price: number; hourlyIncome: number; hourlyUpkeep: number; level: number; art: string;tier?:string;illustration?:Illustration; }
export interface AlphaRules {
  id: string; provenance: string; startingGold: number;
  resources: { health: number; mana: number; spirit: number; healthSeconds: number; healthAmount: number; manaSeconds: number; spiritSeconds: number; maxHealth: number; maxMana: number; maxSpirit: number };
  progression: { thresholds: number[]; laterBase: number; laterStep: number; pointsPerLevel: number;milestones?:{id:string;level:number;points:number}[] };
  content?:{maxContentLevel:number;propertyHorizon:number;areas:{id:string;name:string;level:number;description:string}[]};
  limits: { inventory: number; transaction: number; property: number; landTransaction: number; mercenaries: number; participants: number };
  combat: { spiritCost: number; minimumHealth: number; cooldownSeconds: number; variation: number; winnerDamage: number; loserDamageMin: number; loserDamageMax: number; lootPercent: number; lootCap: number; xp: number; rewardedPerTarget: number; rewardWindowSeconds: number };
  maintenance: { policy: string; hourMilliseconds: number };
  combatSkills:{pointsPerRating:number;percentPerRating:number;maxRating:number;powerPrecision:number};
  items: ItemDefinition[]; quests: QuestDefinition[]; properties: PropertyDefinition[];
}
export const previousAlpha = JSON.parse(readFileSync(new URL('../rulesets/alpha-0.1/rules.json', import.meta.url), 'utf8')) as AlphaRules;
export const phase35Catalog = JSON.parse(readFileSync(new URL('../rulesets/alpha-0.2/rules.json', import.meta.url), 'utf8')) as AlphaRules;
export const alpha = JSON.parse(readFileSync(new URL('../rulesets/alpha-0.3/rules.json', import.meta.url), 'utf8')) as AlphaRules;
export const alphaCatalogs=[previousAlpha,phase35Catalog,alpha];
export const itemById = new Map(alpha.items.map(item => [item.id, item]));
export const questById = new Map(alpha.quests.map(quest => [quest.id, quest]));
export const propertyById = new Map(alpha.properties.map(property => [property.id, property]));
export const lootById = new Map(alpha.quests.filter(quest=>quest.loot).map(quest=>[quest.loot!.id,quest.loot!]));
const safe = (value: number, min = 0, max = 2147483647) => Number.isSafeInteger(value) && value >= min && value <= max;
if (alpha.id !== 'alpha-0.3' || !alpha.provenance || alpha.items.length !== itemById.size || alpha.quests.length !== questById.size || alpha.properties.length !== propertyById.size) throw new Error('Invalid alpha catalog identity.');
if(alpha.combatSkills.maxRating!==25||alpha.combatSkills.percentPerRating!==1||alpha.combatSkills.pointsPerRating!==1||alpha.combatSkills.powerPrecision!==100)throw new Error('Training changes require an explicit schema and balance review.');
for (const item of alpha.items) {
  if (!/^[a-z0-9-]+$/.test(item.id) || !['weapon','armor','spell'].includes(item.category) || !safe(item.price,1) || !safe(item.attack) || !safe(item.defense) || !safe(item.upkeep) || !safe(item.level,1)) throw new Error('Invalid alpha item.');
}
for (const quest of alpha.quests) {
  if (!safe(quest.level,1) || !safe(quest.mana,1,alpha.resources.mana) || !safe(quest.xp,1,1000000) || !safe(quest.goldMin) || !safe(quest.goldMax,quest.goldMin) || !safe(quest.army,1,21) ||
      Object.entries(quest.items).some(([id,n]) => !itemById.has(id) || !safe(n,1,alpha.limits.transaction) || itemById.get(id)!.level>quest.level) ||
      quest.requiresLoot&&!lootById.has(quest.requiresLoot)) throw new Error('Invalid alpha quest: '+quest.id);
}
for(const property of alpha.properties)if(!safe(property.price,1,140000)||!safe(property.hourlyIncome,1)||!safe(property.hourlyUpkeep)||property.hourlyIncome<property.hourlyUpkeep||!safe(property.level,1))throw new Error('Invalid alpha property.');
// Existing progression is a persistent entitlement. This expansion must not
// silently reinterpret any attained level or in-level XP amount.
for(const key of ['thresholds','laterBase','laterStep','pointsPerLevel'] as const)if(JSON.stringify(alpha.progression[key])!==JSON.stringify(previousAlpha.progression[key]))throw new Error('XP curve changes require an explicit compatibility migration.');

export function levelRequirement(level: number): number {
  if (!safe(level,1,42949673)) throw new RangeError('Invalid level.');
  return level < alpha.progression.thresholds.length ? alpha.progression.thresholds[level]! - alpha.progression.thresholds[level-1]! : alpha.progression.laterBase + (level-alpha.progression.thresholds.length)*alpha.progression.laterStep;
}
export function advanceLevel(level: number, progress: number, award: number) {
  if (!safe(progress) || !safe(award,0,1000000) || progress >= levelRequirement(level)) throw new RangeError('Invalid progression.');
  let remaining = progress + award; const before = level;
  while (remaining >= levelRequirement(level)) { remaining -= levelRequirement(level); level++; }
  return { level, progress: remaining, points: (level-before)*alpha.progression.pointsPerLevel, gained: level-before };
}
export interface OwnedItem extends ItemDefinition {resaleSteps?:number[];maxSell?:number; inventoryId: string; quantity: number;effectiveUpkeep?:number;maintenanceExempt?:boolean; }
export interface SelectedItem { presentationId?:string; itemId: string; name: string; category: Category; quantity: number; attack: number; defense: number; }
export function selectEquipment(inventory: OwnedItem[], participants: number, mode: 'attack' | 'defense', maintained = true, policy:ArmyPolicy=compatibility.active.army) {
  if (!safe(participants,1,armyPolicy(policy).selectionLimit)) throw new RangeError('Invalid army participation.');
  const secondary = mode === 'attack' ? 'defense' : 'attack';
  const selected: SelectedItem[] = [];
  for (const category of ['weapon','armor','spell'] as const) {
    let left = participants;
    const candidates = inventory.filter(item => item.category === category && item.quantity > 0 && (maintained || item.upkeep === 0 || item.maintenanceExempt===true))
      .sort((a,b) => b[mode]-a[mode] || b[secondary]-a[secondary] || a.upkeep-b.upkeep || a.id.localeCompare(b.id));
    for (const item of candidates) {
      const quantity = Math.min(left,item.quantity); if (!quantity) break;
      selected.push({ ...(item.presentationId?{presentationId:item.presentationId}:{}),itemId:item.id,name:item.name,category,quantity,attack:item.attack,defense:item.defense }); left -= quantity;
    }
  }
  return { selected, attack: safeCount(selected.reduce((n,item) => n+item.attack*item.quantity,0)), defense: safeCount(selected.reduce((n,item) => n+item.defense*item.quantity,0)) };
}
export function activeArmy(level: number, militia: number, allies: number, legacyFloor = 1) {
  return resolveArmy(level,militia,allies,legacyFloor);
}
export function rivalRange(level: number) { return Math.max(2,Math.ceil(level*0.2)); }
export function areRivals(a: number,b: number) { return Math.abs(a-b) <= Math.min(rivalRange(a),rivalRange(b)); }
export function propertyPrice(base: number, owned: number): number {
  if (!safe(base,1) || !safe(owned,0,alpha.limits.property)) throw new RangeError('Invalid property quote.');
  const denominator = 10n**BigInt(owned);
  const price = (BigInt(base)*11n**BigInt(owned)+denominator-1n)/denominator;
  if (price > 2147483647n) throw new RangeError('Property price exceeds treasury bounds.');
  return Number(price);
}
export function propertyQuote(base: number,owned: number,quantity: number) {
  if (!safe(quantity,1,alpha.limits.landTransaction) || owned+quantity > alpha.limits.property) throw new RangeError('Invalid property quantity.');
  return Array.from({length:quantity},(_,index) => propertyPrice(base,owned+index));
}
export function maintenanceBill(rate: number,from: Date,now: Date,remainder: bigint,credit: bigint,wallet: number) {
  if (!safe(rate) || !safe(wallet) || credit < 0n || remainder < 0n || remainder >= 3600000n || !Number.isFinite(from.getTime()) || !Number.isFinite(now.getTime())) throw new RangeError('Invalid maintenance state.');
  const elapsed = BigInt(Math.max(0,now.getTime()-from.getTime()));
  const numerator = elapsed*BigInt(rate)+remainder;
  const due = numerator/3600000n;
  const available = credit+BigInt(wallet);
  const paid = due < available ? due : available;
  const fromCredit = paid < credit ? paid : credit;
  const missing = due-paid;
  return { due, paid, fromCredit, fromWallet: Number(paid-fromCredit), credit:credit-fromCredit,
    arrears: missing > BigInt(rate) ? BigInt(rate) : missing, paused:missing>0n,
    remainder:missing>0n ? 0n : numerator%3600000n, throughAt:now < from ? from : now };
}

export function resolveAlphaCombat(attacker: { attack:number; health:number; maxHealth:number; gold:number },defender: { defense:number; health:number; maxHealth:number; gold:number },attackRoll:number,defenseRoll:number,rewarded=true) {
  const c = alpha.combat;
  if (![attackRoll,defenseRoll].every(n => Number.isInteger(n) && n >= -c.variation && n <= c.variation)) throw new RangeError('Invalid combat roll.');
  const attackPower = Math.round(attacker.attack*(100+attackRoll)); const defensePower = Math.round(defender.defense*(100+defenseRoll));
  const win = attackPower > defensePower;
  const gap = Math.abs(attackPower-defensePower)/100;
  const damage = Math.min(c.loserDamageMax,c.loserDamageMin+Math.floor(gap/2));
  const attackerDamage = win ? c.winnerDamage : damage; const defenderDamage = win ? damage : c.winnerDamage;
  const loserGold = win ? defender.gold : attacker.gold;
  return { outcome:win ? 'attacker_win' as const : 'defender_win' as const, attackRoll,defenseRoll,attackPower,defensePower,
    attackerDamage,defenderDamage,attackerHealthAfter:Math.max(0,attacker.health-attackerDamage),defenderHealthAfter:Math.max(0,defender.health-defenderDamage),
    loot:rewarded ? Math.min(c.lootCap,Math.floor(loserGold*c.lootPercent/100)) : 0, attackerXp:rewarded && win ? c.xp : 0 };
}

// Keep hundredths so each +1% point contributes even to small early armies.
// Zero training reproduces all pre-training integer powers exactly.
export function trainedPower(base:number,rating:number) {
  if(!Number.isSafeInteger(base)||base<1||!safe(rating,0,alpha.combatSkills.maxRating))throw new RangeError('Invalid combat training.');
  const precision=alpha.combatSkills.powerPrecision;
  return Math.round(base*(100+rating*alpha.combatSkills.percentPerRating)*precision/100)/precision;
}
