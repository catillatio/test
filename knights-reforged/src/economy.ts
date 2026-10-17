import { randomUUID } from 'node:crypto';
import { type Sql } from './db.js';
import { GameError } from './errors.js';
import { rules } from './rules.js';

// Existing command ledger, shared with Land. Caller holds the affected
// character locks and wraps all changes in the same database transaction.
export async function ledger(sql: Sql, commandId: string | null, reason: string,
  changes: { characterId: string; amount: number }[], rulesetId = rules.id) {
  const effective = changes.filter(c => c.amount !== 0);
  if (!effective.length) return;
  const transactionId = randomUUID();
  await sql.query('INSERT INTO economy_transactions(id,command_id,reason,ruleset_id) VALUES($1,$2,$3,$4)', [transactionId, commandId, reason, rulesetId]);
  for (const change of effective) {
    const row = (await sql.query(`UPDATE wallets SET balance=balance+$2
      WHERE character_id=$1 AND balance+$2>=0 RETURNING balance`, [change.characterId, change.amount])).rows[0];
    if (!row) throw new GameError('INSUFFICIENT_GOLD', 'You do not have enough gold for that action.', 409);
    await sql.query('INSERT INTO economy_entries(id,transaction_id,character_id,amount,balance_after) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), transactionId, change.characterId, change.amount, row.balance]);
  }
}
