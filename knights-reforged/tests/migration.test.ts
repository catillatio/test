import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/db.js';
import { migrate,assertInstalledRulesets } from '../src/migrate.js';
import { getState } from '../src/game.js';
import { executeCommand } from '../src/commands.js';
import { testDatabaseUrl } from './helpers.js';

const url = testDatabaseUrl;
if (url && !new URL(url).pathname.endsWith('_test')) throw new Error('Migration fixtures require a disposable *_test database.');

test('populated legacy migration preserves records, identity, holding clocks and attained progression', { skip:!url }, async () => {
  const admin=createDatabase(url!);const schema='migration_'+randomUUID().replaceAll('-','');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const scoped=new URL(url!);scoped.searchParams.set('options','-c search_path='+schema);
  const db=createDatabase(scoped.href);
  try {
    await migrate(db,{through:'002_land.sql'});
    const a=randomUUID(),b=randomUUID(),accountA=randomUUID(),accountB=randomUUID(),item=randomUUID(),holding=randomUUID(),battle=randomUUID(),receipt=randomUUID(),quest=randomUUID();
    await db.query('INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3),($4,$5,$3)',[accountA,'old_a','fixture_hash',accountB,'old_b']);
    await db.query(`INSERT INTO characters(id,account_id,name,xp,health,energy,health_updated_at,energy_updated_at)
      VALUES($1,$2,'Old Warrior',275,42,3,clock_timestamp()-interval '45 seconds',clock_timestamp()-interval '45 seconds'),
      ($3,$4,'Old Rival',0,100,10,clock_timestamp(),clock_timestamp())`,[a,accountA,b,accountB]);
    await db.query('INSERT INTO wallets(character_id,balance) VALUES($1,123),($2,60)',[a,b]);
    await db.query("INSERT INTO army_stacks(character_id,unit_definition_id,quantity) VALUES($1,'militia',20),($2,'militia',0)",[a,b]);
    await db.query("INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id) VALUES($1,$2,'iron-sword','recreation-0.1')",[item,a]);
    await db.query("INSERT INTO equipment_slots(character_id,slot,inventory_entry_id) VALUES($1,'weapon',$2)",[a,item]);
    await db.query(`INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through)
      VALUES($1,$2,'smallholding','Old Name','land-provisional-0.1',2,45,8,1,3600,'2026-01-01T00:00:00Z','2026-01-01T01:00:00Z')`,[holding,a]);
    await db.query("INSERT INTO land_accounts(character_id,pending_gold) VALUES($1,10000000000000000)",[a]);
    await db.query(`INSERT INTO land_income_settlements(holding_id,period_start_at,period_end_at,interval_count,gross_gold,upkeep_gold,net_gold)
      VALUES($1,'2026-01-01T00:00:00Z','2026-01-01T01:00:00Z',1,16,2,14)`,[holding]);
    await db.query("INSERT INTO character_quest_progress(character_id,quest_id,completions) VALUES($1,'border-patrol',10)",[a]);
    await db.query("INSERT INTO quest_runs(id,character_id,quest_id,ruleset_id,energy_spent,gold_reward,xp_reward) VALUES($1,$2,'border-patrol','recreation-0.1',1,25,10)",[quest,a]);
    const oldResult={commandId:receipt,kind:'quest',message:'Historical receipt'};
    await db.query("INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,'quest',$3,$4)",[accountA,receipt,'a'.repeat(64),oldResult]);
    const oldBattle={id:battle,attackerName:'Old Warrior',defenderName:'Old Rival',winnerId:a,loot:10};
    await db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,'recreation-0.1','attacker_win',$4,$5)",[battle,a,b,{old:true},oldBattle]);
    const before=(await db.query('SELECT * FROM land_holdings WHERE id=$1',[holding])).rows[0]!;
    await migrate(db);await migrate(db);
    const character=(await db.query('SELECT * FROM characters WHERE id=$1',[a])).rows[0]!;
    assert.equal(character.xp,275);assert.equal(character.attained_level,6);assert.equal(character.level_xp,40);
    assert.equal(character.skill_points,7);assert.equal(character.legacy_army_floor,21);
    assert.equal(character.mana,14);assert.equal(character.health,44);
    assert.equal((await db.query('SELECT balance FROM wallets WHERE character_id=$1',[a])).rows[0]!.balance,123);
    const after=(await db.query('SELECT * FROM land_holdings WHERE id=$1',[holding])).rows[0]!;
    for (const key of Object.keys(before)) assert.deepEqual(after[key],before[key],key);
    assert.equal(after.original_quantity,2);
    assert.equal((await db.query('SELECT pending_gold FROM land_accounts WHERE character_id=$1',[a])).rows[0]!.pending_gold,'10000000000000000');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM land_income_settlements WHERE holding_id=$1',[holding])).rows[0]!.n,1);
    const lot=(await db.query('SELECT * FROM inventory_lots WHERE inventory_entry_id=$1',[item])).rows[0]!;
    assert.equal(lot.unit_cost,40);assert.equal(lot.remaining_quantity,1);assert.equal(lot.id,item);
    assert.equal((await db.query('SELECT inventory_entry_id FROM equipment_slots WHERE character_id=$1',[a])).rows[0]!.inventory_entry_id,item);
    assert.deepEqual((await db.query('SELECT result FROM command_receipts WHERE command_id=$1',[receipt])).rows[0]!.result,oldResult);
    assert.deepEqual((await db.query('SELECT result FROM battles WHERE id=$1',[battle])).rows[0]!.result,oldBattle);
    assert.equal((await db.query('SELECT gold_reward FROM quest_runs WHERE id=$1',[quest])).rows[0]!.gold_reward,25);
    await db.query("UPDATE rulesets SET definition=jsonb_set(definition,'{startingGold}','61') WHERE id='alpha-0.1'");
    await assert.rejects(assertInstalledRulesets(db),/immutable/);
    await assert.rejects(migrate(db),/immutable/);
  } finally { await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end(); }
});

test('legacy boundaries, unequipped inventory and mixed-phase rate snapshots remain playable after cutover', {skip:!url}, async()=>{
  const admin=createDatabase(url!),schema='migration_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
  const scoped=new URL(url!);scoped.searchParams.set('options','-c search_path='+schema);const db=createDatabase(scoped.href);
  try{
    await migrate(db,{through:'002_land.sql'});
    const account=randomUUID(),owner=randomUUID(),near=randomUUID(),high=randomUUID(),oldItem=randomUUID(),first=randomUUID(),second=randomUUID();
    await db.query('INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3),($4,$5,$3),($6,$7,$3)',[account,'old_main','fixture_hash',randomUUID(),'old_near',randomUUID(),'old_high']);
    const accounts=(await db.query('SELECT id,username FROM accounts ORDER BY username')).rows;
    await db.query(`INSERT INTO characters(id,account_id,name,xp,energy,health) VALUES($1,$2,'Boundary Main',50,10,100),($3,$4,'Boundary Near',49,0,0),($5,$6,'Boundary High',2147483647,10,100)`,
      [owner,account,near,accounts.find(a=>a.username==='old_near')!.id,high,accounts.find(a=>a.username==='old_high')!.id]);
    await db.query('INSERT INTO wallets(character_id,balance) SELECT id,60 FROM characters');
    await db.query("INSERT INTO army_stacks(character_id,unit_definition_id,quantity) SELECT id,'militia',0 FROM characters");
    await db.query("INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id) VALUES($1,$2,'iron-sword','recreation-0.1')",[oldItem,owner]);
    await db.query(`INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through)
      VALUES($1,$2,'smallholding','Legacy Fields','land-provisional-0.1',2,45,8,1,3600,clock_timestamp()-interval '3 hours 20 minutes',clock_timestamp()-interval '3 hours 20 minutes'),
      ($3,$2,'woodland','Legacy Grove','land-provisional-0.1',1,90,30,2,3600,clock_timestamp()-interval '30 minutes',clock_timestamp()-interval '30 minutes')`,[first,owner,second]);
    await migrate(db);
    const boundary=(await db.query('SELECT * FROM characters WHERE id=$1',[near])).rows[0]!;assert.equal(boundary.attained_level,1);assert.equal(boundary.level_xp,11);
    const extreme=(await db.query('SELECT * FROM characters WHERE id=$1',[high])).rows[0]!;assert.equal(extreme.xp,2147483647);assert.equal(extreme.attained_level,42949673);
    const initial=await getState(db,account);assert.equal(initial.level,2);assert.equal(initial.levelXp,0);assert.equal(initial.gold,102);
    assert.equal(initial.inventoryId,oldItem);assert.equal(initial.attackEquipment.selected[0]!.itemId,'iron-sword');
    assert.equal(initial.land.hourlyIncome,46);assert.equal(initial.land.hourlyUpkeep,4);
    assert.equal((await getState(db,account)).gold,102);
    await executeCommand(db,account,randomUUID(),'land_sell',{propertyId:'smallholding',quantity:1});
    const after=await getState(db,account);assert.equal(after.gold,124);assert.equal(after.land.hourlyIncome,38);assert.equal(after.land.hourlyUpkeep,3);
    assert.equal(after.land.holdings.find(h=>h.id===first)!.nextPaymentAt,initial.land.holdings.find(h=>h.id===first)!.nextPaymentAt);
    assert.equal((await db.query('SELECT quantity,original_quantity FROM land_holdings WHERE id=$1',[first])).rows[0]!.original_quantity,2);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM equipment_slots')).rows[0]!.n,0);
  }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});

test('unsupported legacy inventory stops migration atomically without changing original data', {skip:!url}, async()=>{
  const admin=createDatabase(url!),schema='migration_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
  const scoped=new URL(url!);scoped.searchParams.set('options','-c search_path='+schema);const db=createDatabase(scoped.href);
  try{
    await migrate(db,{through:'002_land.sql'});const account=randomUUID(),owner=randomUUID(),item=randomUUID();
    await db.query("INSERT INTO accounts(id,username,password_hash) VALUES($1,'unsupported','fixture_hash')",[account]);
    await db.query("INSERT INTO characters(id,account_id,name,xp) VALUES($1,$2,'Preserved Warrior',49)",[owner,account]);
    await db.query("INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id) VALUES($1,$2,'unknown-legacy-item','recreation-0.1')",[item,owner]);
    await assert.rejects(migrate(db),/verified acquisition-price mapping/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name='characters' AND column_name='mana'",[schema])).rows[0]!.n,0);
    assert.equal((await db.query('SELECT xp FROM characters WHERE id=$1',[owner])).rows[0]!.xp,49);
    assert.equal((await db.query('SELECT item_definition_id FROM inventory_entries WHERE id=$1',[item])).rows[0]!.item_definition_id,'unknown-legacy-item');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE name='003_alpha.sql'")).rows[0]!.n,0);
  }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
