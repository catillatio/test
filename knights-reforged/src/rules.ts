import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from './config.js';

export interface Rules {
  id: string; provenance: string; startingGold: number; maxHealth: number; maxEnergy: number;
  energyRegenSeconds: number; healthRegenSeconds: number; healthRegenAmount: number;
  xpPerLevel: number; baseAttack: number; baseDefense: number; attackPerLevel: number;
  defensePerLevel: number; armyCapacity: number;
  quest: { id: string; name: string; description: string; energyCost: number; goldReward: number; xpReward: number };
  unit: { id: string; name: string; description: string; goldCost: number; attack: number; defense: number };
  weapon: { id: string; name: string; description: string; goldCost: number; attack: number; defense: number; slot: string };
  combat: { energyCost: number; cooldownSeconds: number; maxRoll: number; winnerDamageMin: number;
    loserDamageMin: number; loserDamageMax: number; maxLoot: number; attackerXp: number };
}
export const rules = JSON.parse(readFileSync(join(projectRoot, 'rulesets/recreation-0.1/rules.json'), 'utf8')) as Rules;

export function levelFor(xp: number): number { return Math.floor(xp / rules.xpPerLevel) + 1; }
export function powerFor(xp: number, units: number, equipped: boolean) {
  const level = levelFor(xp);
  return {
    attack: rules.baseAttack + (level - 1) * rules.attackPerLevel + units * rules.unit.attack + (equipped ? rules.weapon.attack : 0),
    defense: rules.baseDefense + (level - 1) * rules.defensePerLevel + units * rules.unit.defense + (equipped ? rules.weapon.defense : 0),
  };
}
export function regenerate(value: number, maximum: number, updated: Date, now: Date, seconds: number, amount = 1) {
  if (value >= maximum) return { value: maximum, updated: now };
  const ticks = Math.max(0, Math.floor((now.getTime() - updated.getTime()) / (seconds * 1000)));
  const next = Math.min(maximum, value + ticks * amount);
  return { value: next, updated: next === maximum ? now : new Date(updated.getTime() + ticks * seconds * 1000) };
}

export interface Combatant { health: number; attack: number; defense: number; gold: number; }
export function resolveCombat(attacker: Combatant, defender: Combatant, attackRoll: number, defenseRoll: number) {
  for (const roll of [attackRoll, defenseRoll]) {
    if (!Number.isInteger(roll) || roll < 0 || roll > rules.combat.maxRoll) throw new Error('Invalid combat roll.');
  }
  const attackPower = attacker.attack + attackRoll;
  const defensePower = defender.defense + defenseRoll;
  const attackerWins = attackPower > defensePower;
  const gap = Math.abs(attackPower - defensePower);
  const loserDamage = Math.min(rules.combat.loserDamageMax, rules.combat.loserDamageMin + Math.floor(gap / 2));
  const attackerDamage = attackerWins ? rules.combat.winnerDamageMin : loserDamage;
  const defenderDamage = attackerWins ? loserDamage : rules.combat.winnerDamageMin;
  const loot = Math.min(rules.combat.maxLoot, attackerWins ? defender.gold : attacker.gold);
  return {
    outcome: attackerWins ? 'attacker_win' as const : 'defender_win' as const,
    attackRoll, defenseRoll, attackPower, defensePower, attackerDamage, defenderDamage,
    attackerHealthAfter: Math.max(0, attacker.health - attackerDamage),
    defenderHealthAfter: Math.max(0, defender.health - defenderDamage),
    loot,
  };
}
