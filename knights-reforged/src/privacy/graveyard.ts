import assert from 'node:assert/strict';
import type {Sql} from '../db.js';
import {privacyColumns} from './schema.js';

// Transaction-local only: the predecessor/successor pair is never put into a
// application receipt, journal, returned result or application log. Provider
// SQL/WAL records and timing still need independent privacy review. This is separation of identities,
// NOT a mathematical/legal guarantee against estate fingerprinting.
export async function verifyNewEstate(sql:Sql,subject:string,world:string,started:Date){
 const row=(await sql.query(`SELECT n.*,'abandoned' AS identity_kind,
  (SELECT balance FROM wallets WHERE character_id=n.id) AS wallet,
  (SELECT balance FROM vault_accounts WHERE character_id=n.id) AS vault,
  (SELECT pending_gold::text FROM land_accounts WHERE character_id=n.id) AS pending,
  (SELECT next_payment_at FROM income_cycles WHERE character_id=n.id) AS next_payment,
  (SELECT hourly_rate FROM maintenance_accounts WHERE character_id=n.id) AS maintenance_rate,
  (SELECT eligible FROM champion_standings WHERE character_id=n.id) AS champion_eligible,
  (SELECT row(health,energy,max_health,mana,max_mana,spirit,max_spirit,attained_level,legacy_army_floor,profile_class,attack_training,defense_training)
   FROM characters WHERE id=$1)=row(n.health,n.energy,n.max_health,n.mana,n.max_mana,n.spirit,n.max_spirit,n.attained_level,n.legacy_army_floor,n.profile_class,n.attack_training,n.defense_training) AS strength_matches
  FROM characters n JOIN abandoned_kingdoms k ON k.character_id=n.id WHERE n.id=$2`,[subject,world])).rows[0];
 assert.ok(row);assert.equal(row.account_id,null);assert.equal(row.identity_kind,'abandoned');assert.equal(row.name,'Abandoned Kingdom');
 assert.equal(row.strength_matches,true);assert.equal(row.champion_eligible,false);
 for(const field of ['wallet','vault','xp','level_xp','skill_points','maintenance_rate'])assert.equal(row[field],0,'Unexpected initial estate resource.');
 assert.equal(row.pending,'0');assert.equal(row.calling_changed_at,null);assert.equal(row.state_version,1);
 assert.ok(+row.created_at>=+started&&+row.created_at<=Date.now()+30000);
 for(const field of ['health_updated_at','energy_updated_at','mana_updated_at','spirit_updated_at','attack_ready_at'])assert.equal(+row[field],+row.created_at,'No inherited player clock.');
 assert.equal(+row.next_payment,+row.created_at+3600000,'No backdated income.');
 // Exact current asset counts/rates, without copying lot IDs, acquisition prices
 // into saleable lots, settlements, historical clocks or source relationships.
 const projections={
  inventory_entries:"SELECT item_definition_id,ruleset_id,quantity FROM inventory_entries WHERE character_id=$1 AND quantity>0",
  army_stacks:"SELECT unit_definition_id,quantity FROM army_stacks WHERE character_id=$1",
  land_holdings:"SELECT property_id,property_name,ruleset_id,unit_price,hourly_income,hourly_upkeep,interval_seconds,sum(quantity)::integer AS quantity FROM land_holdings WHERE character_id=$1 AND quantity>0 GROUP BY property_id,property_name,ruleset_id,unit_price,hourly_income,hourly_upkeep,interval_seconds"
 };
 for(const query of Object.values(projections)){
  const equal=(await sql.query(`WITH original AS (${query}),independent AS (${query.replaceAll('$1','$2')})
   SELECT NOT EXISTS((TABLE original EXCEPT ALL TABLE independent) UNION ALL (TABLE independent EXCEPT ALL TABLE original)) AS same`,[subject,world])).rows[0]!.same;
  assert.equal(equal,true,'Estate projection mismatch.');
 }
 const clean=(await sql.query(`SELECT NOT EXISTS(SELECT 1 FROM land_holdings WHERE character_id=$1 AND
  (acquired_at<>(SELECT created_at FROM characters WHERE id=$1) OR accrued_through<>(SELECT created_at FROM characters WHERE id=$1) OR original_quantity<>quantity OR closed_at IS NOT NULL OR income_remainder<>0 OR upkeep_remainder<>0))
  AND NOT EXISTS(SELECT 1 FROM inventory_entries WHERE character_id=$1 AND acquired_at<>(SELECT created_at FROM characters WHERE id=$1))
  AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=$1) AS same`,[world])).rows[0]!.same;
 assert.equal(clean,true,'Inherited private clock or login identity.');
 const allowed=new Set(['abandoned_kingdoms','characters','wallets','vault_accounts','land_accounts','income_cycles','maintenance_accounts',
  'inventory_entries','army_stacks','land_holdings','champion_standings','competitive_statistics']);
 for(const [table,columns] of Object.entries(privacyColumns)){
  if(allowed.has(table)||!columns.split('|').some(c=>c.startsWith('character_id:')))continue;
  assert.match(table,/^[a-z_]+$/);
  assert.equal((await sql.query(`SELECT 1 FROM "${table}" WHERE character_id=$1 LIMIT 1`,[world])).rowCount,0,'Unexpected inherited record: '+table);
 }
}
