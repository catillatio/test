import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {registerAccount,createSession} from '../src/auth.js';
import {provisionDevelopmentAccount} from '../src/development.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {testDatabaseUrl} from './helpers.js';

test('strategy migration preserves complete Phase 3.5 player records, sessions, catalogs and unmanaged dev identity',
  {skip:!testDatabaseUrl},async()=>{
  const admin=createDatabase(testDatabaseUrl!),schema='strategy_'+randomUUID().replaceAll('-','');
  await admin.query(`CREATE SCHEMA ${schema}`);const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);
  const db=createDatabase(url.href);
  try{
    await migrate(db,{through:'009_combat_training.sql'});
    const password=randomUUID()+'Aa1!',owner=await registerAccount(db,{username:'dev',name:'Existing Dev Player',password});
    const session=await createSession(db,owner.accountId);
    await db.query("UPDATE characters SET profile_class='Warden',attained_level=10,xp=650,level_xp=0,skill_points=7,max_mana=23,mana=19,attack_training=4,defense_training=8 WHERE id=$1",[owner.characterId]);
    await db.query("INSERT INTO progression_awards(character_id,award_id,points) VALUES($1,'level-5',1),($1,'level-10',1)",[owner.characterId]);
    const entry=randomUUID();await db.query("INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity) VALUES($1,$2,'iron-sword','alpha-0.2',3)",[entry,owner.characterId]);
    await db.query("INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,acquired_at) VALUES($1,$2,$3,'alpha-0.2',3,3,40,now())",[randomUUID(),entry,owner.characterId]);
    await db.query("INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through) VALUES($1,$2,'smallholding','Established Fields','alpha-0.2',2,2,45,8,1,3600,now()-interval '10 minutes',now()-interval '10 minutes')",[randomUUID(),owner.characterId]);
    const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name NOT IN ('rulesets','schema_migrations') ORDER BY table_name",[schema])).rows.map(row=>String(row.table_name));
    const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows])));
    const before=await snapshot(),catalogs=(await db.query('SELECT * FROM rulesets ORDER BY id')).rows;
    await migrate(db);await migrate(db);const after=await snapshot();
    for(const account of after.accounts){assert.equal(account.login_disabled,false);delete account.login_disabled;}
    for(const character of after.characters){assert.equal(character.calling_changed_at,null);delete character.calling_changed_at;}
    assert.deepEqual(after,before);assert.deepEqual((await db.query('SELECT * FROM rulesets ORDER BY id')).rows,catalogs);
    await assert.rejects(provisionDevelopmentAccount(db,{nodeEnv:'test',allowProvisioning:true},randomUUID()),/unmanaged account/);
    const app=await createApp({db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000'})});
    try{
      const response=await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:'kr_session='+session.token}});assert.equal(response.statusCode,200,response.body);
      assert.equal(response.json().state.id,owner.characterId);assert.equal(response.json().state.className,'Warden');assert.equal(response.json().state.skillPoints,7);
      assert.equal(response.json().state.training.attack,4);assert.equal(response.json().state.training.defense,8);
      assert.equal((await db.query('SELECT password_hash FROM accounts WHERE id=$1',[owner.accountId])).rows[0]!.password_hash,before.accounts[0].password_hash);
    }finally{await app.close();}
  }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
