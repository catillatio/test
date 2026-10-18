import {randomUUID} from 'node:crypto';
import type {Sql} from './db.js';
import {GameError} from './errors.js';
import {ledger} from './economy.js';
import {pvp} from './pvp-rules.js';

// Caller holds both character locks. Failed/replayed commands roll this update
// back or return their original receipt, so they never advance the sequence.
export async function recordVictory(sql:Sql,attackerId:string,defenderId:string,now:Date,rulesetId=pvp.id){
  const row=(await sql.query(`INSERT INTO pvp_loot_sequences(attacker_id,defender_id,window_started_at,victories,ruleset_id)
    VALUES($1,$2,$3,1,$4) ON CONFLICT(attacker_id,defender_id) DO UPDATE SET
    victories=CASE WHEN pvp_loot_sequences.window_started_at<=$3::timestamptz-($5*interval '1 second') THEN 1 ELSE pvp_loot_sequences.victories+1 END,
    window_started_at=CASE WHEN pvp_loot_sequences.window_started_at<=$3::timestamptz-($5*interval '1 second') THEN $3 ELSE pvp_loot_sequences.window_started_at END,
    ruleset_id=EXCLUDED.ruleset_id RETURNING victories,window_started_at`,[attackerId,defenderId,now,rulesetId,pvp.loot.windowSeconds])).rows[0]!;
  return {victory:Number(row.victories),windowStartedAt:new Date(row.window_started_at).toISOString(),
    resetsAt:new Date(+new Date(row.window_started_at)+pvp.loot.windowSeconds*1000).toISOString()};
}
export async function vaultTransfer(sql:Sql,characterId:string,amount:number,deposit:boolean,commandId:string,now:Date){
  await sql.query('INSERT INTO vault_accounts(character_id) VALUES($1) ON CONFLICT DO NOTHING',[characterId]);
  const vault=(await sql.query('SELECT balance FROM vault_accounts WHERE character_id=$1 FOR UPDATE',[characterId])).rows[0]!.balance as number;
  const wallet=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[characterId])).rows[0]!.balance as number;
  if(!Number.isSafeInteger(amount)||amount<1)throw new GameError('VAULT_AMOUNT','Choose a positive whole amount.');
  if((deposit?wallet:vault)<amount)throw new GameError('INSUFFICIENT_GOLD',deposit?'Not enough unbanked gold.':'Not enough gold in your Vault.',409);
  if((deposit?vault:wallet)+amount>pvp.vault.maximumBalance)throw new GameError('VAULT_LIMIT','That transfer exceeds the destination balance limit. Choose a smaller amount.',409);
  const change=deposit?amount:-amount,reason=deposit?'deposit':'withdrawal';
  await ledger(sql,commandId,'vault_'+reason,[{characterId,amount:-change}],pvp.id);
  const after=(await sql.query('UPDATE vault_accounts SET balance=balance+$2 WHERE character_id=$1 RETURNING balance',[characterId,change])).rows[0]!.balance;
  await sql.query('INSERT INTO vault_entries(id,character_id,command_id,amount,balance_after,reason,ruleset_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),characterId,commandId,change,after,reason,pvp.id,now]);
  return {amount,balance:after,fee:0};
}
