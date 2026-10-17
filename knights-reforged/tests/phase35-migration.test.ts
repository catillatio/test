import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createDatabase} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {createSession} from '../src/auth.js';
import {executeCommand} from '../src/commands.js';
import {levelRequirement} from '../src/alpha-rules.js';
import {testDatabaseUrl} from './helpers.js';

test('populated Phase 3 upgrade preserves accounts, progression, inventory, Land clocks, sessions and all financial history', {skip:!testDatabaseUrl}, async()=>{
  const admin=createDatabase(testDatabaseUrl!),schema='phase35_'+randomUUID().replaceAll('-','');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const scoped=new URL(testDatabaseUrl!);scoped.searchParams.set('options','-c search_path='+schema);
  const db=createDatabase(scoped.href);
  try{
    await migrate(db,{through:'005_maintenance_audit.sql'});
    // This isolated fixture represents a realm whose only alpha catalog was 0.1.
    await db.query("DELETE FROM rulesets WHERE id='alpha-0.2'");
    const account=randomUUID(),rivalAccount=randomUUID(),owner=randomUUID(),rival=randomUUID(),iron=randomUUID(),glaive=randomUUID(),first=randomUUID(),second=randomUUID(),receipt=randomUUID(),battleId=randomUUID(),fund=randomUUID();
    await db.query('INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3),($4,$5,$3)',[account,'phase3_owner','retained_password_hash',rivalAccount,'phase3_rival']);
    const xp=Array.from({length:19},(_,i)=>levelRequirement(i+1)).reduce((n,value)=>n+value,100);
    await db.query(`INSERT INTO characters(id,account_id,name,xp,attained_level,level_xp,skill_points,health,max_health,mana,max_mana,spirit,max_spirit,legacy_army_floor,profile_class)
      VALUES($1,$2,'Established Warden',$3,20,100,3,67,140,11,25,2,4,21,'Warden'),($4,$5,'Old Rival',0,1,0,0,100,100,20,20,3,3,1,'Freeblade')`,[owner,account,xp,rival,rivalAccount]);
    await db.query('INSERT INTO wallets(character_id,balance) VALUES($1,700),($2,60)',[owner,rival]);
    await db.query("INSERT INTO army_stacks(character_id,unit_definition_id,quantity) VALUES($1,'militia',20),($2,'militia',0)",[owner,rival]);
    await db.query("INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity) VALUES($1,$2,'iron-sword','recreation-0.1',1),($3,$2,'sunsteel-glaive','alpha-0.1',2)",[iron,owner,glaive]);
    for(const [entry,cost,quantity,ruleset] of [[iron,40,1,'recreation-0.1'],[glaive,150,2,'alpha-0.1']] as const){
      await db.query('INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,acquired_at) VALUES($1,$2,$3,$4,$5,$5,$6,clock_timestamp())',[randomUUID(),entry,owner,ruleset,quantity,cost]);
    }
    await db.query("INSERT INTO equipment_slots(character_id,slot,inventory_entry_id) VALUES($1,'weapon',$2)",[owner,iron]);
    await db.query(`INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through)
      VALUES($1,$2,'smallholding','Early Fields','land-provisional-0.1',2,2,45,8,1,3600,clock_timestamp()-interval '90 minutes',clock_timestamp()-interval '30 minutes'),
      ($3,$2,'woodland','Old Grove','alpha-0.1',1,2,99,20,4,3600,clock_timestamp()-interval '15 minutes',clock_timestamp()-interval '15 minutes')`,[first,owner,second]);
    await db.query('INSERT INTO land_accounts(character_id,pending_gold) VALUES($1,12345678901234567)',[owner]);
    await db.query('INSERT INTO land_income_settlements(holding_id,period_start_at,period_end_at,interval_count,gross_gold,upkeep_gold,net_gold) SELECT id,acquired_at,accrued_through,1,16,2,14 FROM land_holdings WHERE id=$1',[first]);
    await db.query("INSERT INTO land_sales(id,holding_id,character_id,quantity,unit_refund,ruleset_id,command_id,created_at) VALUES($1,$2,$3,1,49,'alpha-0.1',$4,clock_timestamp())",[randomUUID(),second,owner,randomUUID()]);
    await db.query("INSERT INTO maintenance_accounts(character_id,hourly_rate,reserve_gold,remainder,settled_at) VALUES($1,6,5,123456,clock_timestamp()-interval '15 seconds'),($2,0,0,0,clock_timestamp())",[owner,rival]);
    await db.query("INSERT INTO maintenance_events(id,character_id,reason,period_start_at,period_end_at,charged_gold,reserve_after,arrears_after,command_id,hourly_rate,ruleset_id) VALUES($1,$2,'fund',now(),now(),6,6,0,$3,6,'alpha-0.1')",[randomUUID(),owner,fund]);
    await db.query("INSERT INTO maintenance_rate_events(id,character_id,previous_rate,hourly_rate,paused_after,reserve_after,ruleset_id,command_id,created_at) VALUES($1,$2,0,6,false,6,'alpha-0.1',$3,now())",[randomUUID(),owner,fund]);
    await db.query("INSERT INTO progression_awards(character_id,award_id,points) VALUES($1,'level-5',1)",[owner]);
    await db.query("INSERT INTO skill_allocations(id,character_id,command_id,resource,points,capacity_added,capacity_after) VALUES($1,$2,$3,'mana',5,5,25)",[randomUUID(),owner,randomUUID()]);
    await db.query("INSERT INTO character_loot(character_id,loot_id,name,source_quest,ruleset_id) VALUES($1,'watchtower-map','Watchtower Map','search-ruins','alpha-0.1')",[owner]);
    await db.query("INSERT INTO character_quest_progress(character_id,quest_id,completions) VALUES($1,'border-patrol',9)",[owner]);
    await db.query("INSERT INTO quest_runs(id,character_id,quest_id,ruleset_id,energy_spent,gold_reward,xp_reward,reward_details) VALUES($1,$2,'border-patrol','alpha-0.1',2,8,4,$3)",[randomUUID(),owner,{legacy:true}]);
    await db.query("INSERT INTO inventory_transactions(id,character_id,item_id,kind,quantity,gold_amount,ruleset_id,command_id) VALUES($1,$2,'sunsteel-glaive','buy',2,300,'alpha-0.1',$3)",[randomUUID(),owner,randomUUID()]);
    const tx=randomUUID();await db.query("INSERT INTO economy_transactions(id,reason,ruleset_id) VALUES($1,'phase3_opening','alpha-0.1')",[tx]);
    await db.query('INSERT INTO economy_entries(id,transaction_id,character_id,amount,balance_after) VALUES($1,$2,$3,700,700)',[randomUUID(),tx,owner]);
    await db.query("INSERT INTO treasury_retained_events(id,character_id,amount,balance_after,reason) VALUES($1,$2,12345678901234567,12345678901234567,'old_retained')",[randomUUID(),owner]);
    const [low,high]=[owner,rival].sort();await db.query("INSERT INTO army_links(low_id,high_id,inviter_id,status) VALUES($1,$2,$3,'accepted')",[low,high,owner]);
    const oldResult={commandId:receipt,kind:'buy' as const,message:'Historical two-copy receipt',data:{goldSpent:300}};
    const hash=createHash('sha256').update(JSON.stringify({kind:'buy',intent:{itemId:'sunsteel-glaive',quantity:2}})).digest('hex');
    await db.query("INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,'buy',$3,$4)",[account,receipt,hash,oldResult]);
    const oldBattle={id:battleId,rulesetId:'alpha-0.1',attackerId:owner,defenderId:rival,attackerName:'Established Warden',defenderName:'Old Rival',winnerName:'Established Warden',winnerId:owner,
      loot:3,attackPower:2100,defensePower:1400,attackRoll:2,defenseRoll:1,attackerDamage:3,defenderDamage:12,attackerHealthAfter:67,defenderHealthAfter:88,
      attackerXp:5,createdAt:new Date().toISOString(),attackerArmy:21,defenderArmy:1,attackerMaxHealth:140,defenderMaxHealth:100,spiritSpent:1,rewarded:true,attackEquipment:[],defenseEquipment:[]};
    await db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,'alpha-0.1','attacker_win',$4,$5)",[battleId,owner,rival,{old:true},oldBattle]);
    const session=await createSession(db,account);
    const tables=['accounts','characters','sessions','wallets','army_stacks','inventory_entries','inventory_lots','equipment_slots','land_holdings','land_accounts','land_income_settlements','land_sales',
      'maintenance_accounts','maintenance_events','maintenance_rate_events','skill_allocations','character_loot','character_quest_progress','quest_runs','inventory_transactions',
      'economy_transactions','economy_entries','treasury_retained_events','army_links','command_receipts','battles'];
    const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows])));
    const before=await snapshot();const oldCatalog=(await db.query("SELECT * FROM rulesets WHERE id='alpha-0.1'")).rows;
    await migrate(db);await migrate(db);
    const after=await snapshot();
    // Only the new level-10 and level-20 entitlements add two unspent points.
    for(const row of after.characters)if(row.id===owner){assert.equal(row.skill_points,5);row.skill_points=3;}
    for(const row of after.land_holdings){assert.ok(BigInt(row.purchase_order)>0n);delete row.purchase_order;}
    assert.deepEqual(after,before);
    assert.deepEqual((await db.query("SELECT * FROM rulesets WHERE id='alpha-0.1'")).rows,oldCatalog);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE name IN ('006_fantasy_progression.sql','007_maintenance_event_identity.sql','008_land_purchase_order.sql')")).rows[0]!.n,3);
    assert.deepEqual(await executeCommand(db,account,receipt,'buy',{itemId:'sunsteel-glaive',quantity:2}),oldResult);
    const app=await createApp({db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',DATABASE_URL:scoped.href})});
    try{
      const cookie='kr_session='+session.token;
      const profile=await app.inject({method:'GET',url:'/game/profile',headers:{cookie}});assert.equal(profile.statusCode,200,profile.body);assert.match(profile.body,/Established Warden/);
      const report=await app.inject({method:'GET',url:'/game/battles/'+battleId,headers:{cookie}});assert.equal(report.statusCode,200,report.body);assert.match(report.body,/21\.0/);assert.ok(!report.body.includes('>2100<'));
      assert.deepEqual((await db.query('SELECT result FROM battles WHERE id=$1',[battleId])).rows[0]!.result,oldBattle);
    }finally{await app.close();}
  }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
