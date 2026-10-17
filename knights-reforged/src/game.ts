import { type Database, transaction, type Sql } from './db.js';
import { GameError } from './errors.js';
import { rules, regenerate, powerFor, levelFor } from './rules.js';

export interface CharacterRow {
  id: string; account_id: string; name: string; xp: number; health: number; energy: number;
  health_updated_at: Date; energy_updated_at: Date; attack_ready_at: Date; state_version: number;
}
export interface CharacterState {
  id: string; name: string; xp: number; level: number; health: number; energy: number;
  gold: number; units: number; attack: number; defense: number; equipped: boolean;
  inventoryId: string | null; questsCompleted: number; stateVersion: number;
  attackReadyAt: string; serverTime: string; energyNextAt: string | null; healthNextAt: string | null;
}

// Sample current time after obtaining character locks, rather than using the
// transaction's earlier BEGIN timestamp after a potentially long lock wait.
export async function clock(sql: Sql) { return new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now); }
export async function lockCharacters(sql: Sql, ids: string[]) {
  const rows = (await sql.query<CharacterRow>('SELECT * FROM characters WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids])).rows;
  if (rows.length !== new Set(ids).size) throw new GameError('CHARACTER_NOT_FOUND', 'That warrior could not be found.', 404);
  return rows;
}

export async function materialize(sql: Sql, row: CharacterRow, now: Date): Promise<CharacterRow> {
  const hp = regenerate(row.health, rules.maxHealth, new Date(row.health_updated_at), now, rules.healthRegenSeconds, rules.healthRegenAmount);
  const en = regenerate(row.energy, rules.maxEnergy, new Date(row.energy_updated_at), now, rules.energyRegenSeconds);
  const changed = hp.value !== row.health || en.value !== row.energy;
  await sql.query(`UPDATE characters SET health=$2,energy=$3,health_updated_at=$4,energy_updated_at=$5,
    state_version=state_version+$6 WHERE id=$1`, [row.id, hp.value, en.value, hp.updated, en.updated, changed ? 1 : 0]);
  return { ...row, health: hp.value, energy: en.value, health_updated_at: hp.updated, energy_updated_at: en.updated,
    state_version: row.state_version + (changed ? 1 : 0) };
}

export async function stateFrom(sql: Sql, row: CharacterRow, now: Date): Promise<CharacterState> {
  const wallet = (await sql.query('SELECT balance FROM wallets WHERE character_id=$1', [row.id])).rows[0]!;
  const army = (await sql.query('SELECT quantity FROM army_stacks WHERE character_id=$1 AND unit_definition_id=$2', [row.id, rules.unit.id])).rows[0]!;
  const item = (await sql.query(`SELECT i.id,e.inventory_entry_id IS NOT NULL AS equipped FROM inventory_entries i
    LEFT JOIN equipment_slots e ON e.inventory_entry_id=i.id
    WHERE i.character_id=$1 AND i.item_definition_id=$2`, [row.id, rules.weapon.id])).rows[0];
  const progress = (await sql.query('SELECT completions FROM character_quest_progress WHERE character_id=$1 AND quest_id=$2', [row.id, rules.quest.id])).rows[0];
  const equipped = Boolean(item?.equipped);
  return { id: row.id, name: row.name, xp: row.xp, level: levelFor(row.xp), health: row.health, energy: row.energy,
    gold: wallet.balance, units: army.quantity, ...powerFor(row.xp, army.quantity, equipped), equipped,
    inventoryId: item?.id ?? null, questsCompleted: progress?.completions ?? 0, stateVersion: row.state_version,
    attackReadyAt: new Date(row.attack_ready_at).toISOString(), serverTime: now.toISOString(),
    energyNextAt: row.energy < rules.maxEnergy ? new Date(new Date(row.energy_updated_at).getTime()+rules.energyRegenSeconds*1000).toISOString() : null,
    healthNextAt: row.health < rules.maxHealth ? new Date(new Date(row.health_updated_at).getTime()+rules.healthRegenSeconds*1000).toISOString() : null };
}

export async function getState(db: Database, accountId: string): Promise<CharacterState> {
  return transaction(db, async client => {
    const char = (await client.query<CharacterRow>('SELECT * FROM characters WHERE account_id=$1 FOR UPDATE', [accountId])).rows[0];
    if (!char) throw new GameError('CHARACTER_NOT_FOUND', 'Your character could not be found.', 404);
    const now = await clock(client);
    return stateFrom(client, await materialize(client, char, now), now);
  });
}

export async function listOpponents(db: Database, characterId: string) {
  const result = await db.query(`SELECT c.id,c.name,c.xp,c.health,c.health_updated_at,
      COALESCE(a.quantity,0) AS units,c.created_at
    FROM characters c LEFT JOIN army_stacks a ON a.character_id=c.id AND a.unit_definition_id=$2
    WHERE c.id<>$1 ORDER BY c.created_at DESC LIMIT 50`, [characterId, rules.unit.id]);
  const now = await clock(db);
  return result.rows.map(row => ({ id: row.id as string, name: row.name as string, level: levelFor(row.xp), units: row.units as number,
    health: regenerate(row.health, rules.maxHealth, new Date(row.health_updated_at), now, rules.healthRegenSeconds, rules.healthRegenAmount).value }));
}

export async function recentBattles(db: Database, characterId: string) {
  return (await db.query(`SELECT id,result,created_at FROM battles WHERE attacker_id=$1 OR defender_id=$1
    ORDER BY created_at DESC,id DESC LIMIT 10`, [characterId])).rows;
}

export async function getBattle(db: Database, accountId: string, battleId: string) {
  const row = (await db.query(`SELECT b.id,b.result,b.ruleset_id,b.created_at FROM battles b
    JOIN characters c ON c.account_id=$1 WHERE b.id=$2 AND (b.attacker_id=c.id OR b.defender_id=c.id)`, [accountId, battleId])).rows[0];
  if (!row) throw new GameError('BATTLE_NOT_FOUND', 'This battle is unavailable to your character.', 404);
  return row;
}
