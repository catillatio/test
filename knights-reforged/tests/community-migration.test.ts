import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {registerAccount,createSession} from '../src/auth.js';
import {testDatabaseUrl} from './helpers.js';

test('community migration preserves all existing strategy records byte-for-byte, backfills unique codes once and keeps immutable catalogs',{skip:!testDatabaseUrl},async()=>{
  const admin=createDatabase(testDatabaseUrl!),schema='community_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);const db=createDatabase(url.href);
  try{
    await migrate(db,{through:'010_strategy_and_bounties.sql'});
    const a=await registerAccount(db,{username:'established',name:'Established Knight',password:randomUUID()}),b=await registerAccount(db,{username:'old_ally',name:'Existing Ally',password:randomUUID()});await createSession(db,a.accountId);
    const pair=[a.characterId,b.characterId].sort();await db.query("INSERT INTO army_links(low_id,high_id,inviter_id,status) VALUES($1,$2,$3,'accepted')",[pair[0],pair[1],a.characterId]);
    await db.query("INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through) VALUES($1,$2,'smallholding','Older Estate','alpha-0.3',2,2,45,8,1,3600,now(),now())",[randomUUID(),a.characterId]);
    const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name NOT IN ('schema_migrations') ORDER BY table_name",[schema])).rows.map(r=>r.table_name);
    const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async(table:string)=>[table,(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows])));
    const before=await snapshot();await migrate(db);const codes=(await db.query('SELECT * FROM army_invitation_codes ORDER BY character_id')).rows;await migrate(db);
    assert.deepEqual(await snapshot(),before);assert.equal(codes.length,2);assert.notEqual(codes[0]!.code,codes[1]!.code);assert.deepEqual((await db.query('SELECT * FROM army_invitation_codes ORDER BY character_id')).rows,codes);
    const count=(await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE name='011_community.sql'")).rows[0]!.n;assert.equal(count,1);
  }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
