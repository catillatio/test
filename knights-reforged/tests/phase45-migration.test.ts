import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase,transaction,type Database} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {testDatabaseUrl} from './helpers.js';
import {initializePrivateAlpha} from '../src/development.js';
import {privateAlphaConfirmation} from '../src/private-alpha-policy.js';
import {registerAccount,createSession} from '../src/auth.js';
import {purchaseItems} from '../src/inventory.js';
import {buyEstate} from '../src/estate.js';
import {grantExperience} from '../src/progression.js';
import {ledger} from '../src/economy.js';
import {vaultTransfer} from '../src/pvp-economy.js';
import {executeCommand} from '../src/commands.js';
import {placeBounty} from '../src/bounties.js';
import {postMessage} from '../src/community.js';
async function snapshot(db:Database){
 const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows;
 const map:Record<string,string[]>={};for(const {table_name:table} of tables){assert.match(table,/^[a-z_]+$/);map[table]=(await db.query('SELECT row_to_json(t)::text AS row FROM "'+table+'" t')).rows.map(r=>r.row).sort();}return map;
}
test('populated Phase 4.4 migration preserves every business row, 450 bots, sessions, awards, tutorial, journals and legacy completed recruitment receipts',{skip:!testDatabaseUrl},async()=>{
 const admin=createDatabase(testDatabaseUrl!),schema='upgrade45_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);
 const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);const db=createDatabase(url.href);
 try{
  await migrate(db,{through:'017_security_and_operator_grants.sql'});
  await initializePrivateAlpha(db,{NODE_ENV:'production',DATABASE_URL:'postgres://fixture@postgres.railway.internal/railway',KINGDOM_PRIVATE_ALPHA:'1',RAILWAY_SERVICE_ID:randomUUID(),RAILWAY_ENVIRONMENT_ID:randomUUID(),KINGDOM_ALPHA_INITIALIZE:privateAlphaConfirmation,KINGDOM_DEV_PASSWORD:randomUUID()+'Aa1!'});
  const a=await registerAccount(db,{username:'existing_player',name:'Existing Realm Keeper',password:randomUUID()+'Aa1!'});await createSession(db,a.accountId);
  const b=await registerAccount(db,{username:'existing_neighbor',name:'Existing Neighbor',password:randomUUID()+'Aa1!'});await createSession(db,b.accountId);
  await transaction(db,async sql=>{
   await ledger(sql,null,'historical_fixture',[{characterId:a.characterId,amount:10000}]);
   await purchaseItems(sql,a.characterId,1,{'squires-blade':2},randomUUID(),new Date());
   await buyEstate(sql,a.characterId,1,'smallholding',2,randomUUID(),new Date());
   await vaultTransfer(sql,a.characterId,500,true,randomUUID(),new Date());
   await grantExperience(sql,a.characterId,30,new Date());await grantExperience(sql,b.characterId,30,new Date());
  });
  // Construct genuine pre-019 journal/evidence rows using the legacy service
  // functions. The current tutorial UI needs 019 and must not run on this 017 fixture.
  await transaction(db,async sql=>{
   await sql.query("INSERT INTO player_preferences(character_id,tutorial_status) VALUES($1,'active')",[a.characterId]);
   for(const owner of [a,b]){
    await sql.query("INSERT INTO character_quest_progress(character_id,quest_id,completions) VALUES($1,'border-patrol',5)",[owner.characterId]);
    for(let i=0;i<5;i++)await sql.query("INSERT INTO quest_runs(id,character_id,quest_id,ruleset_id,energy_spent,gold_reward,xp_reward) VALUES($1,$2,'border-patrol','alpha-0.3',1,5,4)",[randomUUID(),owner.characterId]);
    await ledger(sql,null,'quest_reward',[{characterId:owner.characterId,amount:25}]);await grantExperience(sql,owner.characterId,20,new Date());
    await sql.query("INSERT INTO character_achievements(character_id,achievement_id,ruleset_id,metric_at_unlock,evidence) VALUES($1,'quests-1','player-experience-1',5,'gameplay')",[owner.characterId]);
   }
   for(const step of ['quest','rewards','equipment','automatic'])await sql.query('INSERT INTO tutorial_steps(character_id,step_id) VALUES($1,$2)',[a.characterId,step]);
   await placeBounty(sql,a.characterId,b.characterId,100,randomUUID(),new Date());
   await postMessage(sql,a.characterId,b.characterId,'An enduring greeting from Phase 4.4.',randomUUID(),new Date(),4,5);
  });
  const key=randomUUID(),intent={unitId:'militia',quantity:2},oldResult={commandId:key,kind:'recruit',message:'Historical troops recruited.',data:{quantity:2,goldSpent:24}};
  await db.query('UPDATE army_stacks SET quantity=2 WHERE character_id=$1',[a.characterId]);
  await db.query('INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,$3,$4,$5)',[a.accountId,key,'recruit',createHash('sha256').update(JSON.stringify({kind:'recruit',intent})).digest('hex'),oldResult]);
  // Representative durable Phase 4.4 combat record; migration must not reprice it.
  const battleId=randomUUID();await db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,'alpha-0.3','attacker_win',$4,$5)",[battleId,a.characterId,b.characterId,{attacker:{id:a.characterId},defender:{id:b.characterId}},{id:battleId,attackerId:a.characterId,defenderId:b.characterId,attackerName:'Existing Realm Keeper',defenderName:'Existing Neighbor',loot:2,attackerXp:5,pvpRulesetId:'pvp-economy-0.1',progressionRulesetId:'progression-economy-0.2'}]);
  await db.query("DELETE FROM rulesets WHERE id='gameplay-refinement-1'");
  const before=await snapshot(db);await migrate(db);const after=await snapshot(db);
  for(const [table,rows] of Object.entries(before)){
   if(['rulesets','schema_migrations'].includes(table)){const current=new Set(after[table]);assert.ok(rows.every(row=>current.has(row)),table);}
   else assert.deepEqual(after[table],rows,table);
  }
  assert.equal(after.health_restorations!.length,0);assert.equal(after.bot_finance_events!.length,0);assert.equal(after.bot_finance_cycles!.length,0);
  assert.equal(after.development_bots!.length,450);assert.equal(after.accounts!.length,453);assert.ok(after.sessions!.length>=2);assert.ok(after.character_achievements!.length>0);assert.equal(after.bounties!.length,1);assert.ok(after.bounty_events!.length>0);
  assert.equal(after.authorized_gold_grants!.length,0,'Upgrade must not regrant gray or any human.');
  await migrate(db);assert.deepEqual(await snapshot(db),after);
  const replay=await executeCommand(db,a.accountId,key,'recruit',intent);assert.deepEqual(replay,oldResult);assert.deepEqual(await snapshot(db),after);
  await assert.rejects(executeCommand(db,a.accountId,randomUUID(),'recruit',intent),/Invite allies/);assert.deepEqual(await snapshot(db),after);
 }finally{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
