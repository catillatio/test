import {randomUUID} from 'node:crypto';
import type {Sql} from './db.js';
import {fundMaintenance} from './maintenance.js';
import {gameplay} from './gameplay-rules.js';
// Caller holds the bot's character lock and has settled ordinary Land/upkeep.
// Adopt its saved clock without a starting grant; at most one real-cost funding
// attempt occurs for a newly settled boundary, even after repeated profile reads.
export async function settleBotFinance(sql:Sql,id:string,now:Date){
 // Historical migration fixtures and first-launch provisioning can run before 018.
 if(!(await sql.query("SELECT to_regclass('bot_finance_cycles') AS installed")).rows[0]?.installed)return false;
 const cycle=(await sql.query('SELECT next_payment_at FROM income_cycles WHERE character_id=$1',[id])).rows[0];if(!cycle)return false;
 const boundary=new Date(+new Date(cycle.next_payment_at)-3600000);
 const fresh=await sql.query('INSERT INTO bot_finance_cycles(character_id,last_boundary_at) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING character_id',[id,boundary]);
 if(fresh.rows.length)return false;
 const prior=(await sql.query('SELECT last_boundary_at FROM bot_finance_cycles WHERE character_id=$1 FOR UPDATE',[id])).rows[0]!;if(+new Date(prior.last_boundary_at)>=+boundary)return false;
 const before=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[id])).rows[0]!.balance;
 const funded=await fundMaintenance(sql,id,randomUUID(),now,true);
 const after=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[id])).rows[0]!.balance;
 await sql.query('UPDATE bot_finance_cycles SET last_boundary_at=$2 WHERE character_id=$1',[id,boundary]);
 await sql.query('INSERT INTO bot_finance_events(character_id,boundary_at,gold_charged,status,ruleset_id,created_at) VALUES($1,$2,$3,$4,$5,$6)',[id,boundary,before-after,funded?'funded':'waiting',gameplay.id,now]);
 return before!==after;
}
