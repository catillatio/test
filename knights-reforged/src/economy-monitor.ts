import {transaction,type Database} from './db.js';
import {expansionBots,expansionBotEconomy,installedCohort} from './expansion-bot-rules.js';
import {definitionDigest} from './expansion-content.js';
// Aggregates only. No materialization, income credit, purchase, character detail
// or automation state change occurs during monitoring.
export async function inspectExpansionEconomy(db:Database){
 return transaction(db,async sql=>{
  const cohort=await installedCohort(sql),now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
  const bands=(await sql.query(`SELECT (c.attained_level/10)*10 AS level_band,d.tier,count(*)::int AS bots,
   sum(w.balance)::text AS wallet_gold,sum(m.reserve_gold)::text AS prepaid_gold,
   sum(m.hourly_rate)::text AS equipment_upkeep,count(*) FILTER(WHERE m.paused)::int AS paused_upkeep,
   sum((SELECT COALESCE(sum(h.quantity::bigint*(h.hourly_income-h.hourly_upkeep)),0) FROM land_holdings h WHERE h.character_id=c.id))::text AS property_net
   FROM expansion_bot_members e JOIN characters c ON c.id=e.character_id JOIN development_bots d ON d.character_id=c.id
   JOIN wallets w ON w.character_id=c.id JOIN maintenance_accounts m ON m.character_id=c.id
   WHERE e.manifest_id=$1 GROUP BY 1,2 ORDER BY 1,2`,[expansionBots.id])).rows;
  const decisions=(await sql.query(`SELECT result->'plan'->>'kind' AS kind,result->'plan'->>'reason' AS reason,count(*)::int AS decisions,
   COALESCE(sum((result->'plan'->>'cost')::bigint),0)::text AS spent,
   count(*) FILTER(WHERE result IS NULL OR (result->>'goldBefore')::numeric-(result->>'goldAfter')::numeric <>
    COALESCE((result->'plan'->>'cost')::numeric,0)+COALESCE((result->'plan'->>'topup')::numeric,0))::int AS funding_mismatches
   FROM command_receipts r JOIN expansion_bot_members e ON e.account_id=r.account_id
   WHERE r.kind='bot_economy' AND r.created_at>=$1 AND result->>'policy'=$2 GROUP BY 1,2 ORDER BY 1,2`,[new Date(+now-86400000),expansionBotEconomy.id])).rows;
  const flows=(await sql.query(`SELECT t.reason,sum(e.amount::bigint)::text AS wallet_movement,count(*)::text AS entries
   FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id JOIN expansion_bot_members m ON m.character_id=e.character_id
   WHERE t.created_at>=$1 GROUP BY t.reason ORDER BY t.reason`,[new Date(+now-86400000)])).rows;
  const storage=(await sql.query(`SELECT pg_database_size(current_database())::text AS database_bytes,
   (SELECT COALESCE(sum(pg_total_relation_size(c.oid)),0)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=current_schema() AND c.relkind='r') AS schema_bytes`)).rows[0];
  return {observedAt:now.toISOString(),manifest:expansionBots.id,manifestDigest:definitionDigest(expansionBots),mode:cohort?.autonomyMode??'paused',bands,decisions,flows,storage,
   readOnly:true,notSettledIncome:'Saved balances only; observation does not force offline settlement.',
   approval:'Purchases-only requires separately approved inspect-autonomy / set-autonomy. This report changes nothing.'};
 },{mode:'repeatable-read-only'});
}
