import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {createSession} from '../src/auth.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {testDatabaseUrl} from './helpers.js';

test('the rename/training migration preserves existing Phase 3.5 allocations, points, holdings, history and session', {skip:!testDatabaseUrl}, async()=>{
  const admin=createDatabase(testDatabaseUrl!),schema='training_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);const db=createDatabase(url.href);
  try{
    await migrate(db,{through:'008_land_purchase_order.sql'});
    const account=randomUUID(),owner=randomUUID(),holding=randomUUID(),item=randomUUID();
    await db.query("INSERT INTO accounts(id,username,password_hash,created_at) VALUES($1,'established','unchanged_password_hash',clock_timestamp()-interval '73 days')",[account]);
    await db.query(`INSERT INTO characters(id,account_id,name,xp,attained_level,level_xp,skill_points,max_health,health,max_mana,mana,max_spirit,spirit,profile_class)
      VALUES($1,$2,'Established Knight',650,10,0,4,130,113,23,19,4,2,'Warden')`,[owner,account]);
    await db.query('INSERT INTO wallets(character_id,balance) VALUES($1,700)',[owner]);
    await db.query("INSERT INTO army_stacks(character_id,unit_definition_id,quantity) VALUES($1,'militia',2)",[owner]);
    await db.query("INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity) VALUES($1,$2,'iron-sword','alpha-0.2',2)",[item,owner]);
    await db.query("INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,acquired_at) VALUES($1,$2,$3,'alpha-0.2',2,2,40,now())",[randomUUID(),item,owner]);
    await db.query(`INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through)
      VALUES($1,$2,'smallholding','Old Fields','alpha-0.2',1,1,45,8,1,3600,clock_timestamp()-interval '20 minutes',clock_timestamp()-interval '20 minutes')`,[holding,owner]);
    await db.query("INSERT INTO progression_awards(character_id,award_id,points) VALUES($1,'level-through-10',9),($1,'level-5',1),($1,'level-10',1),($1,'quests-10',1)",[owner]);
    for(const [resource,points,delta,capacity] of [['health',3,30,130],['mana',3,3,23],['spirit',2,1,4]])await db.query('INSERT INTO skill_allocations(id,character_id,command_id,resource,points,capacity_added,capacity_after) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),owner,randomUUID(),resource,points,delta,capacity]);
    const session=await createSession(db,account);
    const tables=['accounts','characters','wallets','sessions','skill_allocations','progression_awards','inventory_entries','inventory_lots','land_holdings'];
    const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows])));
    const before=await snapshot(),catalog=(await db.query("SELECT * FROM rulesets WHERE id='alpha-0.2'")).rows;
    await migrate(db);await migrate(db);const after=await snapshot();
    for(const row of after.characters){assert.equal(row.attack_training,0);assert.equal(row.defense_training,0);delete row.attack_training;delete row.defense_training;}
    for(const row of after.skill_allocations){assert.equal(row.ruleset_id,null);delete row.ruleset_id;}
    assert.deepEqual(after,before);assert.deepEqual((await db.query("SELECT * FROM rulesets WHERE id='alpha-0.2'")).rows,catalog);
    const app=await createApp({db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',DATABASE_URL:url.href})});
    try{
      const cookie='kr_session='+session.token;
      const me=await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie}});assert.equal(me.statusCode,200,me.body);
      const state=me.json().state;assert.equal(state.skillPoints,4);assert.equal(state.maxHealth,130);assert.equal(state.maxMana,23);assert.equal(state.maxSpirit,4);assert.equal(state.training.attack,0);assert.equal(state.training.defense,0);assert.equal(state.attack,state.training.untrainedAttack);assert.equal(state.defense,state.training.untrainedDefense);
      const skills=await app.inject({method:'GET',url:'/game/profile?tab=skills',headers:{cookie}});assert.equal(skills.statusCode,200);assert.match(skills.body,/Kingdom Come/);
      const allocated=await app.inject({method:'POST',url:'/api/v1/skills',headers:{cookie,origin:'http://localhost:3000','x-csrf-token':session.session.csrf_token,'idempotency-key':randomUUID()},payload:{resource:'defense'}});assert.equal(allocated.statusCode,200,allocated.body);assert.equal(allocated.json().state.skillPoints,3);assert.equal(allocated.json().state.training.defense,1);
      const allocations=(await db.query('SELECT * FROM skill_allocations WHERE character_id=$1',[owner])).rows;assert.equal(allocations.length,4);assert.equal(allocations.find(row=>row.resource==='defense')!.ruleset_id,'alpha-0.3');
    }finally{await app.close();}
  }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
