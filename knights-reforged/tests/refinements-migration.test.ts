import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {registerAccount,createSession} from '../src/auth.js';
import {getState} from '../src/game.js';
import {testDatabaseUrl} from './helpers.js';

test('Phase 4.1 migration preserves every Phase 4 business row and archives knockout history while crediting historical bounty claims once',{skip:!testDatabaseUrl},async()=>{
  const admin=createDatabase(testDatabaseUrl!),schema='refinements_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);const db=createDatabase(url.href);
  try{
    await migrate(db,{through:'011_community.sql'});
    const a=await registerAccount(db,{username:'old_hunter',name:'Old Hunter',password:randomUUID()}),
      b=await registerAccount(db,{username:'old_target',name:'Old Target',password:randomUUID()}),
      sponsor=await registerAccount(db,{username:'old_sponsor',name:'Old Sponsor',password:randomUUID()});
    const session=await createSession(db,a.accountId),ko=randomUUID(),claim=randomUUID(),bounty=randomUUID(),at=new Date();
    await db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,created_at) VALUES($1,$2,$3,'alpha-0.3','attacker_win','{}',$4,$5)",[ko,a.characterId,b.characterId,{defenderHealthAfter:0,attackerHealthAfterDamage:95},at]);
    await db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,created_at) VALUES($1,$2,$3,'alpha-0.3','attacker_win','{}',$4,$5)",[claim,a.characterId,b.characterId,{defenderHealthAfter:80,attackerHealthAfterDamage:90,bountyClaim:{id:bounty,reward:100}},at]);
    await db.query(`INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at,settled_at,claimant_id,battle_id)
      VALUES($1,$2,$3,100,10,'claimed','strategy-0.2',$4,$5,$6,$5,$7,$8)`,[bounty,sponsor.characterId,b.characterId,randomUUID(),at,new Date(+at+86400000),a.characterId,claim]);
    await db.query("INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through) VALUES($1,$2,'smallholding','Inherited Fields','alpha-0.2',2,2,45,9,1,3600,$3,$3)",[randomUUID(),a.characterId,at]);
    const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name<>'schema_migrations' ORDER BY table_name",[schema])).rows.map(row=>row.table_name);
    const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async(table:string)=>[table,(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows.map(({income_remainder,upkeep_remainder,variant,...legacy})=>legacy)])));
    const before=await snapshot();await migrate(db);assert.deepEqual(await snapshot(),before);
    const archive=(await db.query('SELECT health_knockouts FROM legacy_field_statistics WHERE character_id=$1',[a.characterId])).rows[0]!;assert.equal(archive.health_knockouts,1);
    const kills=(await db.query('SELECT * FROM bounty_kills')).rows;assert.equal(kills.length,1);assert.equal(kills[0]!.source,'legacy_claim');assert.equal(kills[0]!.battle_id,claim);assert.equal(kills[0]!.ruleset_id,'strategy-0.2');
    await migrate(db);assert.deepEqual(await snapshot(),before);assert.deepEqual((await db.query('SELECT * FROM bounty_kills')).rows,kills);
    assert.equal((await db.query('SELECT token_hash FROM sessions WHERE token_hash=$1',[session.session.token_hash])).rows.length,1);
    const state=await getState(db,a.accountId);assert.equal(state.battleStats.kills,1);assert.equal(state.battleStats.legacyKnockouts,1);assert.equal(state.land.holdings[0]!.hourlyIncome,18);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE name='012_refinements.sql'")).rows[0]!.n,1);
  }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
