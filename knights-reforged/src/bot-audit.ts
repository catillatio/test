import {type Database,transaction} from './db.js';
// Read-only, bounded by the existing passive population. No state materialization.
export async function auditBotEconomy(db:Database){
 return transaction(db,async sql=>{
  await sql.query('SET TRANSACTION READ ONLY');
  const bots=(await sql.query(`WITH estates AS (
   SELECT character_id,sum(quantity)::int plots,min(accrued_through) AS earliest_unpaid,sum(quantity*hourly_income)::bigint gross,
    sum(quantity*hourly_upkeep)::bigint property_upkeep FROM land_holdings WHERE quantity>0 AND character_id IN(SELECT character_id FROM development_bots) GROUP BY character_id
  ), payments AS (
   SELECT character_id,max(period_end_at) AS paid_through FROM (SELECT h.character_id,s.period_end_at FROM land_holdings h JOIN land_income_settlements s ON s.holding_id=h.id WHERE h.character_id IN(SELECT character_id FROM development_bots) UNION ALL SELECT h.character_id,s.period_end_at FROM land_holdings h JOIN land_partial_settlements s ON s.holding_id=h.id WHERE h.character_id IN(SELECT character_id FROM development_bots)) paid GROUP BY character_id
  ), events AS (SELECT character_id,max(boundary_at) AS last_funded,count(*)::int AS funding_events FROM bot_finance_events GROUP BY character_id)
  SELECT c.id,c.name,c.attained_level AS level,b.tier,b.variant,b.active,b.population_version,w.balance AS exposed_gold,
   COALESCE(v.balance,0) AS vault_gold,COALESCE(e.plots,0) AS plots,COALESCE(e.gross,0)::text AS gross,
   COALESCE(e.property_upkeep,0)::text AS property_upkeep,COALESCE(m.hourly_rate,0) AS equipment_upkeep,
   (COALESCE(e.gross,0)-COALESCE(e.property_upkeep,0)-COALESCE(m.hourly_rate,0))::text AS fully_funded_net,
   m.paused,m.reserve_gold,m.arrears_gold,COALESCE(la.pending_gold,0)::text AS pending_land_gold,m.settled_at AS maintenance_through,
   i.next_payment_at,(i.character_id IS NULL) AS missing_clock,GREATEST(0,floor(extract(epoch FROM(clock_timestamp()-COALESCE(i.next_payment_at,e.earliest_unpaid+interval '1 hour')))/3600)+1)::int AS due_hours,
   p.paid_through,f.last_funded,COALESCE(f.funding_events,0) AS funding_events
  FROM development_bots b JOIN characters c ON c.id=b.character_id JOIN wallets w ON w.character_id=c.id
  LEFT JOIN land_accounts la ON la.character_id=c.id LEFT JOIN estates e ON e.character_id=c.id LEFT JOIN vault_accounts v ON v.character_id=c.id
  LEFT JOIN maintenance_accounts m ON m.character_id=c.id LEFT JOIN income_cycles i ON i.character_id=c.id
  LEFT JOIN payments p ON p.character_id=c.id LEFT JOIN events f ON f.character_id=c.id
  ORDER BY c.attained_level,b.tier,b.variant,c.id LIMIT 1000`)).rows;
  return {readOnly:true,population:bots.length,dueBots:bots.filter(b=>b.due_hours>0).length,
   insufficientPortfolios:bots.filter(b=>b.plots<3||BigInt(b.fully_funded_net)<=0n).map(b=>b.id),bots};
 });
}
