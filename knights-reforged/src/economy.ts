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

export async function recordRetained(sql: Sql, characterId: string, amount: bigint, reason: string, commandId: string | null = null) {
  if (!amount) return;
  const account = (await sql.query('SELECT pending_gold FROM land_accounts WHERE character_id=$1',[characterId])).rows[0]!;
  await sql.query('INSERT INTO treasury_retained_events(id,character_id,amount,balance_after,reason,command_id) VALUES($1,$2,$3,$4,$5,$6)',
    [randomUUID(),characterId,amount.toString(),account.pending_gold,reason,commandId]);
}

// All callers hold the character lock. Positive credits never overflow or get
// discarded, including sales at a full treasury. The existing ledger continues
// to reconcile the spendable wallet; retained movements have their own journal.
export async function creditGold(sql: Sql,characterId:string,amount:bigint,commandId:string|null,reason:string,rulesetId:string) {
  if (amount<0n) throw new RangeError('A credit must be nonnegative.');
  const wallet=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[characterId])).rows[0]!;
  const room=BigInt(2147483647-wallet.balance);
  const credited=amount<room?amount:room;
  if (credited) await ledger(sql,commandId,reason,[{characterId,amount:Number(credited)}],rulesetId);
  const retained=amount-credited;
  if (retained) {
    await sql.query('INSERT INTO land_accounts(character_id,pending_gold) VALUES($1,$2) ON CONFLICT(character_id) DO UPDATE SET pending_gold=land_accounts.pending_gold+EXCLUDED.pending_gold',[characterId,retained.toString()]);
    await recordRetained(sql,characterId,retained,reason,commandId);
  }
}
