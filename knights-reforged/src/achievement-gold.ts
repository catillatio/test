import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import type {Sql} from './db.js';
import {creditGold} from './economy.js';
import {achievementGold,achievementGoldPolicy} from './achievement-gold-policy.js';
import {expansionAchievement} from './expansion-content.js';
import {experienceRules,type AchievementDefinition} from './experience-rules.js';
export async function achievementGoldEnabled(sql:Sql){return !!(await sql.query("SELECT to_regclass('achievement_gold_state') AS t")).rows[0]?.t&&!!(await sql.query('SELECT enabled FROM achievement_gold_state WHERE singleton')).rows[0]?.enabled;}
export async function reconcileAchievementGold(sql:Sql,id:string){
 const receipts=(await sql.query('SELECT * FROM achievement_gold_receipts WHERE character_id=$1',[id])).rows;
 for(const r of receipts){
  const definition=[...experienceRules.achievements,...expansionAchievement.achievements].find(a=>a.id===r.achievement_id);
  assert.ok(definition,'Unknown achievement reward receipt');assert.equal(r.reward_policy_id,achievementGoldPolicy.id,'Unknown achievement Gold policy');assert.equal(BigInt(r.amount),BigInt(achievementGold(definition.rank)),'Achievement reward amount mismatch');
  const totals=(await sql.query(`SELECT coalesce((SELECT sum(e.amount) FROM economy_transactions t JOIN economy_entries e ON e.transaction_id=t.id WHERE t.command_id=$2 AND t.reason='achievement_gold' AND t.ruleset_id=$3 AND e.character_id=$1),0)::text AS credited,coalesce((SELECT sum(amount) FROM treasury_retained_events WHERE character_id=$1 AND command_id=$2 AND reason='achievement_gold'),0)::text AS retained`,[id,r.command_id,r.reward_policy_id])).rows[0]!;
  assert.equal(BigInt(totals.credited),BigInt(r.credited_gold),'Achievement wallet receipt mismatch');assert.equal(BigInt(totals.retained),BigInt(r.retained_gold),'Achievement retained receipt mismatch');assert.equal(BigInt(r.amount),BigInt(r.credited_gold)+BigInt(r.retained_gold));
 }
 return receipts;
}
export async function syncAchievementGold(sql:Sql,id:string,definitions:AchievementDefinition[],now:Date){
 if(!await achievementGoldEnabled(sql))return [];
 const human=(await sql.query('SELECT c.id FROM characters c JOIN accounts a ON a.id=c.account_id WHERE c.id=$1 AND NOT a.login_disabled AND NOT EXISTS(SELECT 1 FROM development_bots b WHERE b.character_id=c.id) FOR UPDATE OF c',[id])).rows[0];
 if(!human)return [];
 const receipts=await reconcileAchievementGold(sql,id),paid=new Set(receipts.map(r=>r.achievement_id));const newlyPaid:string[]=[];
 const earned=new Set((await sql.query('SELECT achievement_id FROM character_achievements WHERE character_id=$1',[id])).rows.map(r=>r.achievement_id));
 for(const definition of definitions){if(!earned.has(definition.id)||paid.has(definition.id))continue;
  const amount=achievementGold(definition.rank),command=randomUUID();const balance=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[id])).rows[0]!.balance as number;
  const credited=Math.min(amount,2147483647-balance),retained=amount-credited;
  await creditGold(sql,id,BigInt(amount),command,'achievement_gold',achievementGoldPolicy.id);
  await sql.query('INSERT INTO achievement_gold_receipts(character_id,achievement_id,reward_policy_id,command_id,amount,credited_gold,retained_gold,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,definition.id,achievementGoldPolicy.id,command,amount,credited,retained,now]);newlyPaid.push(definition.id);
 }
 return newlyPaid;
}
