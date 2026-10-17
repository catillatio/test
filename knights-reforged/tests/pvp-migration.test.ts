import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {registerAccount,createSession} from '../src/auth.js';
import {provisionBots} from '../src/development.js';
import {testDatabaseUrl} from './helpers.js';

test('013 is additive and repeatable; upgrading registered rivals preserves real identities, all battles, bounties, holdings and sessions',{skip:!testDatabaseUrl},async()=>{
  const admin=createDatabase(testDatabaseUrl!),schema='pvp_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);const db=createDatabase(url.href);
  try{
    await migrate(db,{through:'012_refinements.sql'});
    const human=await registerAccount(db,{username:'existing_lord',name:'Existing Lord',password:randomUUID()}),
      rival=await registerAccount(db,{username:'existing_npc',name:'Office Rival',password:randomUUID()});
    const session=await createSession(db,human.accountId),at=new Date(),battle=randomUUID(),bounty=randomUUID(),holding=randomUUID();
    await db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[rival.accountId]);
    await db.query('UPDATE characters SET attained_level=25,health=0,health_updated_at=$2 WHERE id=$1',[rival.characterId,at]);
    await db.query("INSERT INTO development_bots(character_id,population_key,population_version,tier,refilled_at,recovered_at,ruleset_id) VALUES($1,'passive-rivals-3:25:green','passive-rivals-3','green',$2,$2,'refinements-0.1')",[rival.characterId,at]);
    await db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,created_at) VALUES($1,$2,$3,'alpha-0.3','attacker_win','{}',$4,$5)",[battle,human.characterId,rival.characterId,{attackerName:'Existing Lord',defenderName:'Office Rival',loot:7,defenderHealthBefore:20,defenderHealthAfter:0},at]);
    await db.query("INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at) VALUES($1,$2,$3,1,1,'active','refinements-0.1',$4,$5,$6)",[bounty,human.characterId,rival.characterId,randomUUID(),at,new Date(+at+86400000)]);
    await db.query("INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through) VALUES($1,$2,'smallholding','Inherited Fields','alpha-0.2',2,2,45,9,1,3600,$3,$3)",[holding,human.characterId,at]);
    // Match a fully initialized Phase 4.1 realm: its existing migration runner
    // already grants unclaimed level-milestone entitlements on startup.
    await migrate(db,{through:'012_refinements.sql'});
    const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name<>'schema_migrations' ORDER BY table_name",[schema])).rows.map(r=>r.table_name as string);
    const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows])));
    const before=await snapshot();await migrate(db);await migrate(db);assert.deepEqual(await snapshot(),before);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM pvp_loot_sequences')).rows[0]!.n,0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM vault_accounts')).rows[0]!.n,0);
    const priorHuman=(await db.query('SELECT * FROM characters WHERE id=$1',[human.characterId])).rows;
    const oldBattles=(await db.query('SELECT * FROM battles ORDER BY id')).rows,oldBounties=(await db.query('SELECT * FROM bounties ORDER BY id')).rows;
    const upgraded=await provisionBots(db,{nodeEnv:'test',allowProvisioning:true});assert.equal(upgraded.upgraded,1);assert.equal(upgraded.created,149);
    assert.deepEqual((await db.query('SELECT * FROM characters WHERE id=$1',[human.characterId])).rows,priorHuman);
    assert.deepEqual((await db.query('SELECT * FROM battles ORDER BY id')).rows,oldBattles);assert.deepEqual((await db.query('SELECT * FROM bounties ORDER BY id')).rows,oldBounties);
    const bot=(await db.query('SELECT * FROM characters WHERE id=$1',[rival.characterId])).rows[0]!;
    assert.equal(bot.account_id,rival.accountId);assert.equal(bot.health,0);assert.notEqual(bot.name,'Office Rival');
    assert.equal((await db.query('SELECT token_hash FROM sessions WHERE token_hash=$1',[session.session.token_hash])).rows.length,1);
    assert.deepEqual((await db.query('SELECT * FROM land_holdings WHERE id=$1',[holding])).rows,before.land_holdings);
    await migrate(db);assert.deepEqual((await db.query('SELECT * FROM bounties ORDER BY id')).rows,oldBounties);
  }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
