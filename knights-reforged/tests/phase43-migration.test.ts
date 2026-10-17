import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {registerAccount,createSession} from '../src/auth.js';
import {getState} from '../src/game.js';
import {provisionBots} from '../src/development.js';
import {phase42BotCatalog} from '../src/strategy-rules.js';
import {testDatabaseUrl} from './helpers.js';

test('014 preserves every Phase 4.2 column and historical journal, archives knockout counters and upgrades v4 identities without resetting humans',{skip:!testDatabaseUrl},async()=>{
 const admin=createDatabase(testDatabaseUrl!),schema='phase43_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);const db=createDatabase(url.href);
 try{
  await migrate(db,{through:'013_pvp_economy.sql'});
  const a=await registerAccount(db,{username:'preserved_lord',name:'Preserved Lord',password:randomUUID()}),b=await registerAccount(db,{username:'preserved_target',name:'Preserved Target',password:randomUUID()}),npc=await registerAccount(db,{username:'_npc_1_green',name:phase42BotCatalog.identities['1:green'],password:randomUUID()});
  await createSession(db,a.accountId);const at=new Date(),battle=randomUUID();
  await db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[npc.accountId]);
  await db.query("INSERT INTO development_bots(character_id,population_key,population_version,tier,refilled_at,recovered_at,ruleset_id) VALUES($1,'passive-rivals-4:1:green','passive-rivals-4','green',$2,$2,'pvp-economy-0.1')",[npc.characterId,at]);
  await db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,created_at) VALUES($1,$2,$3,'alpha-0.3','attacker_win','{}',$4,$5)",[battle,a.characterId,b.characterId,{attackerName:'Preserved Lord',defenderName:'Preserved Target',loot:0,defenderHealthBefore:20,defenderHealthAfter:0},at]);
  await db.query("INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through) VALUES($1,$2,'smallholding','Saved estate','alpha-0.3',3,3,45,8,1,3600,$3,$3)",[randomUUID(),a.characterId,at]);
  const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name NOT IN ('schema_migrations') ORDER BY table_name",[schema])).rows.map(r=>r.table_name as string);
  const columns=new Map<string,string[]>();for(const table of tables)columns.set(table,(await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',[schema,table])).rows.map(r=>r.column_name));
  const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.query(`SELECT ${columns.get(table)!.map(c=>'"'+c+'"').join(',')} FROM ${table} ORDER BY 1,2`)).rows])));
  const before=await snapshot();await migrate(db);await migrate(db);assert.deepEqual(await snapshot(),before);
  const archive=(await db.query('SELECT * FROM legacy_casualty_statistics WHERE character_id=$1',[b.characterId])).rows[0]!;assert.equal(archive.historical_knockouts,1);assert.equal(archive.historical_bounty_deaths,0);
  assert.equal((await getState(db,b.accountId)).battleStats.deaths,0);
  const priorHuman=(await db.query('SELECT * FROM characters WHERE id=$1',[a.characterId])).rows;
  const result=await provisionBots(db,{nodeEnv:'test',allowProvisioning:true});assert.equal(result.active,450);assert.equal(result.created,449);assert.equal(result.upgraded,1);
  assert.deepEqual((await db.query('SELECT * FROM characters WHERE id=$1',[a.characterId])).rows,priorHuman);
  assert.equal((await db.query('SELECT name,account_id FROM characters WHERE id=$1',[npc.characterId])).rows[0]!.name,phase42BotCatalog.identities['1:green']);
  assert.equal((await db.query('SELECT account_id FROM characters WHERE id=$1',[npc.characterId])).rows[0]!.account_id,npc.accountId);
  assert.deepEqual((await db.query('SELECT * FROM battles ORDER BY 1,2')).rows,before.battles);
  const grants=(await db.query('SELECT count(*)::int AS n FROM economy_entries')).rows[0]!.n;
  const holdings=(await db.query('SELECT count(*)::int AS n FROM land_holdings')).rows[0]!.n;
  const again=await provisionBots(db,{nodeEnv:'test',allowProvisioning:true});assert.equal(again.created,0);assert.equal(again.upgraded,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM economy_entries')).rows[0]!.n,grants);assert.equal((await db.query('SELECT count(*)::int AS n FROM land_holdings')).rows[0]!.n,holdings);
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
