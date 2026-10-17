import { createHash, randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type Database, transaction } from './db.js';
import { GameError } from './errors.js';
import { rules, resolveCombat } from './rules.js';
import { clock, lockCharacters, materialize, stateFrom, type CharacterRow } from './game.js';
import { ledger } from './economy.js';
import { landRules } from './land-rules.js';
import { purchaseLand } from './land.js';

const uuid = z.string().uuid();
const intents = {
  quest: z.object({ questId: z.literal(rules.quest.id) }),
  recruit: z.object({ unitId: z.literal(rules.unit.id), quantity: z.coerce.number().int().min(1).max(rules.armyCapacity) }),
  buy: z.object({ itemId: z.literal(rules.weapon.id) }),
  equip: z.object({ inventoryEntryId: uuid }),
  attack: z.object({ targetCharacterId: uuid }),
  land_buy: z.object({ propertyId: z.string().min(1).max(64), quantity: z.union([
    z.number().int().min(1).max(landRules.maxPurchaseQuantity),
    z.string().max(16).regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().min(1).max(landRules.maxPurchaseQuantity)),
  ]) }),
};
export type CommandKind = keyof typeof intents;
export interface CommandResult { commandId: string; kind: CommandKind; message: string; battleId?: string; inventoryEntryId?: string; holdingId?: string; }

export async function executeCommand(db: Database, accountId: string, commandId: unknown, kind: CommandKind, raw: unknown): Promise<CommandResult> {
  if (!uuid.safeParse(commandId).success) throw new GameError('INVALID_COMMAND_ID', 'Reload the page and try again with a new command ID.');
  const parsed = intents[kind].safeParse(raw);
  if (!parsed.success) throw new GameError('INVALID_INTENT', parsed.error.issues[0]?.message ?? 'Invalid action.');
  // Only normalized intent fields affect the fingerprint. Extra client prices,
  // rewards, actor IDs, damage, balances, and XP are never read.
  const intent = parsed.data as Record<string, unknown>;
  const fingerprint = createHash('sha256').update(JSON.stringify({ kind, intent })).digest('hex');
  const id = commandId as string;
  return transaction(db, async client => {
    const inserted = await client.query(`INSERT INTO command_receipts(account_id,command_id,kind,intent_hash)
      VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING command_id`, [accountId, id, kind, fingerprint]);
    if (!inserted.rows.length) {
      const receipt = (await client.query('SELECT intent_hash,result FROM command_receipts WHERE account_id=$1 AND command_id=$2', [accountId, id])).rows[0]!;
      if (receipt.intent_hash !== fingerprint) throw new GameError('COMMAND_CONFLICT', 'That command ID already belongs to a different action.', 409);
      if (!receipt.result) throw new GameError('COMMAND_PENDING', 'That action is still being processed. Try again.', 409);
      return receipt.result as CommandResult;
    }
    const actorId = (await client.query('SELECT id FROM characters WHERE account_id=$1', [accountId])).rows[0]?.id as string | undefined;
    if (!actorId) throw new GameError('CHARACTER_NOT_FOUND', 'Your warrior could not be found.', 404);
    if (kind === 'attack' && intent.targetCharacterId === actorId) throw new GameError('SELF_ATTACK', 'Choose another warrior to challenge.');
    const ids = kind === 'attack' ? [actorId, intent.targetCharacterId as string] : [actorId];
    const locked = await lockCharacters(client, ids);
    const now = await clock(client);
    const rows: CharacterRow[] = [];
    for (const row of locked) rows.push(await materialize(client, row, now));
    const actor = rows.find(row => row.id === actorId)!;
    const state = await stateFrom(client, actor, now);
    const result: CommandResult = { commandId: id, kind, message: '' };

    if (kind === 'quest') {
      if (actor.health <= 0) throw new GameError('NEEDS_RECOVERY', 'Rest until you have recovered some health before questing.', 409);
      if (actor.energy < rules.quest.energyCost) throw new GameError('INSUFFICIENT_ENERGY', 'You need more energy. It returns automatically every 30 seconds.', 409);
      await client.query(`UPDATE characters SET energy=energy-$2,xp=xp+$3,
        energy_updated_at=CASE WHEN energy=$4 THEN $5 ELSE energy_updated_at END WHERE id=$1`,
        [actorId, rules.quest.energyCost, rules.quest.xpReward, rules.maxEnergy, now]);
      await ledger(client, id, 'quest_reward', [{ characterId: actorId, amount: rules.quest.goldReward }]);
      await client.query('INSERT INTO quest_runs(id,character_id,quest_id,ruleset_id,energy_spent,gold_reward,xp_reward) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(), actorId, rules.quest.id, rules.id, rules.quest.energyCost, rules.quest.goldReward, rules.quest.xpReward]);
      await client.query(`INSERT INTO character_quest_progress(character_id,quest_id,completions) VALUES($1,$2,1)
        ON CONFLICT(character_id,quest_id) DO UPDATE SET completions=character_quest_progress.completions+1`, [actorId, rules.quest.id]);
      result.message = `Patrol complete. You earned ${rules.quest.goldReward} gold and ${rules.quest.xpReward} experience.`;
    } else if (kind === 'recruit') {
      const quantity = intent.quantity as number;
      if (state.units + quantity > rules.armyCapacity) throw new GameError('ARMY_FULL', `Your army can hold ${rules.armyCapacity} militia.`, 409);
      await ledger(client, id, 'recruitment', [{ characterId: actorId, amount: -quantity * rules.unit.goldCost }]);
      await client.query('UPDATE army_stacks SET quantity=quantity+$3 WHERE character_id=$1 AND unit_definition_id=$2', [actorId, rules.unit.id, quantity]);
      result.message = `${quantity} ${quantity === 1 ? 'soldier has' : 'soldiers have'} joined your banner.`;
    } else if (kind === 'buy') {
      if (state.inventoryId) throw new GameError('ALREADY_OWNED', 'You already own this sword. Equip it below.', 409);
      await ledger(client, id, 'equipment_purchase', [{ characterId: actorId, amount: -rules.weapon.goldCost }]);
      result.inventoryEntryId = randomUUID();
      await client.query('INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id) VALUES($1,$2,$3,$4)',
        [result.inventoryEntryId, actorId, rules.weapon.id, rules.id]);
      result.message = 'The iron sword is yours. Equip it to gain its bonuses.';
    } else if (kind === 'equip') {
      if (state.inventoryId !== intent.inventoryEntryId) throw new GameError('ITEM_NOT_OWNED', 'You can only equip your own item.', 403);
      await client.query(`INSERT INTO equipment_slots(character_id,slot,inventory_entry_id) VALUES($1,'weapon',$2)
        ON CONFLICT(character_id,slot) DO UPDATE SET inventory_entry_id=EXCLUDED.inventory_entry_id`, [actorId, intent.inventoryEntryId]);
      result.message = 'Iron sword equipped. Your battle strength has increased.';
    } else if (kind === 'land_buy') {
      result.holdingId = await purchaseLand(client, actorId, id, intent.propertyId as string, intent.quantity as number, now);
      result.message = `${intent.quantity} ${intent.quantity === 1 ? 'property purchased' : 'properties purchased'}. Each batch begins earning after a full hour.`;
    } else {
      const defender = rows.find(row => row.id !== actorId)!;
      if (actor.health <= 0 || defender.health <= 0) throw new GameError('NEEDS_RECOVERY', 'Both warriors need some health before a challenge.', 409);
      if (actor.energy < rules.combat.energyCost) throw new GameError('INSUFFICIENT_ENERGY', 'You need two energy to challenge another warrior.', 409);
      if (new Date(actor.attack_ready_at).getTime() > now.getTime()) throw new GameError('ATTACK_COOLDOWN', 'Catch your breath. You can attack once every ten seconds.', 409);
      const target = await stateFrom(client, defender, now);
      const combat = resolveCombat(state, target, randomInt(rules.combat.maxRoll + 1), randomInt(rules.combat.maxRoll + 1));
      result.battleId = randomUUID();
      const winnerId = combat.outcome === 'attacker_win' ? actorId : defender.id;
      const loserId = combat.outcome === 'attacker_win' ? defender.id : actorId;
      await ledger(client, id, 'battle_loot', [{ characterId: loserId, amount: -combat.loot }, { characterId: winnerId, amount: combat.loot }]);
      await client.query(`UPDATE characters SET health=$2,health_updated_at=$3,energy=energy-$4,
        energy_updated_at=CASE WHEN energy=$5 THEN $3 ELSE energy_updated_at END,
        xp=xp+$6,attack_ready_at=$7 WHERE id=$1`,
        [actorId, combat.attackerHealthAfter, now, rules.combat.energyCost, rules.maxEnergy, rules.combat.attackerXp,
          new Date(now.getTime() + rules.combat.cooldownSeconds * 1000)]);
      await client.query('UPDATE characters SET health=$2,health_updated_at=$3,state_version=state_version+1 WHERE id=$1', [defender.id, combat.defenderHealthAfter, now]);
      const battle = { ...combat, id: result.battleId, rulesetId: rules.id, attackerId: actorId, defenderId: defender.id,
        attackerName: actor.name, defenderName: defender.name, attackerHealthBefore: actor.health, defenderHealthBefore: defender.health,
        winnerId, winnerName: winnerId === actorId ? actor.name : defender.name, attackerXp: rules.combat.attackerXp,
        createdAt: now.toISOString() };
      await client.query('INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [result.battleId, actorId, defender.id, rules.id, combat.outcome, { attacker: state, defender: target }, battle]);
      result.message = `${battle.winnerName} won the challenge.`;
    }
    await client.query('UPDATE characters SET state_version=state_version+1 WHERE id=$1', [actorId]);
    await client.query('UPDATE command_receipts SET result=$3 WHERE account_id=$1 AND command_id=$2', [accountId, id, result]);
    return result;
  });
}
