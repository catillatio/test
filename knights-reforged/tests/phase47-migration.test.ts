import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createDatabase,transaction,type Database} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {testDatabaseUrl,realm} from './helpers.js';
import {initializePrivateAlpha} from '../src/development.js';
import {privateAlphaConfirmation} from '../src/private-alpha-policy.js';
import {registerAccount,createSession} from '../src/auth.js';
import {ledger} from '../src/economy.js';
import {grantExperience,allocateSkill} from '../src/progression.js';
import {purchaseItems} from '../src/inventory.js';
import {buyEstate} from '../src/estate.js';
import {placeBounty,claimBounty} from '../src/bounties.js';
import {vaultTransfer} from '../src/pvp-economy.js';
import {hallOfChampions,rivalryHistory} from '../src/competition.js';
const skip=!testDatabaseUrl;
async function snapshot(db:Database){
 const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows;
 const result:Record<string,string[]>={};for(const {table_name:table} of tables){assert.match(table,/^[a-z_]+$/);result[table]=(await db.query('SELECT row_to_json(t)::text AS row FROM "'+table+'" t')).rows.map(row=>row.row).sort();}return result;
}
test('020 preserves every populated Phase 4.6 business row, all 450 bots, sessions, rivalry, tutorial and immutable history',{skip},async()=>{
 const admin=createDatabase(testDatabaseUrl!),schema='upgrade47_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);
 const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);const db=createDatabase(url.href);
 try{
  await migrate(db,{through:'019_champions_and_rivalries.sql'});
  // Fixture-only: the deployed Phase 4.6 catalog must not already contain 4.7.
  await db.query("DELETE FROM rulesets WHERE id='game-feel-1'");
  await initializePrivateAlpha(db,{NODE_ENV:'production',DATABASE_URL:'postgres://fixture@postgres.railway.internal/railway',KINGDOM_PRIVATE_ALPHA:'1',RAILWAY_SERVICE_ID:randomUUID(),RAILWAY_ENVIRONMENT_ID:randomUUID(),KINGDOM_ALPHA_INITIALIZE:privateAlphaConfirmation,KINGDOM_DEV_PASSWORD:randomUUID()+'Aa1!'});
  const a=await registerAccount(db,{username:'old_champion',name:'Old Champion',password:randomUUID()+'Aa1!'}),b=await registerAccount(db,{username:'old_rival',name:'Old Rival',password:randomUUID()+'Aa1!'}),c=await registerAccount(db,{username:'old_hunter',name:'Old Hunter',password:randomUUID()+'Aa1!'});
  await createSession(db,a.accountId);await createSession(db,b.accountId);
  const now=new Date();
  await transaction(db,async sql=>{
   for(const owner of [a,b,c]){
    await ledger(sql,null,'historical_fixture',[{characterId:owner.characterId,amount:10000}]);await grantExperience(sql,owner.characterId,50,now);
    await purchaseItems(sql,owner.characterId,4,{'squires-blade':2},randomUUID(),now);await buyEstate(sql,owner.characterId,4,'smallholding',2,randomUUID(),now);
    await vaultTransfer(sql,owner.characterId,500,true,randomUUID(),now);
    await sql.query("INSERT INTO character_quest_progress(character_id,quest_id,completions) VALUES($1,'border-patrol',5)",[owner.characterId]);
    for(let i=0;i<5;i++)await sql.query("INSERT INTO quest_runs(id,character_id,quest_id,ruleset_id,energy_spent,gold_reward,xp_reward,created_at) VALUES($1,$2,'border-patrol','alpha-0.3',1,5,4,$3)",[randomUUID(),owner.characterId,now]);
    await sql.query("INSERT INTO character_achievements(character_id,achievement_id,ruleset_id,metric_at_unlock,earned_at,evidence) VALUES($1,'quests-1','player-experience-1',5,$2,'gameplay')",[owner.characterId,now]);
   }
   await sql.query("INSERT INTO player_preferences(character_id,tutorial_status) VALUES($1,'active'),($2,'skipped'),($3,'completed')",[a.characterId,b.characterId,c.characterId]);
   for(const owner of [a,c])for(const step of owner===c?['quest','rewards','equipment','automatic','attack','victory','land','skills']:['quest','rewards'])await sql.query('INSERT INTO tutorial_steps(character_id,step_id) VALUES($1,$2)',[owner.characterId,step]);
   await allocateSkill(sql,c.characterId,'attack',randomUUID(),now);
   async function battle(attacker:string,defender:string,outcome:string,loot:number,modern=true,finishing=false){
    const key=randomUUID(),id=randomUUID();if(loot)await ledger(sql,key,'battle_loot',[{characterId:defender,amount:-loot},{characterId:attacker,amount:loot}]);
    await sql.query(`INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,created_at) VALUES($1,$2,$3,'alpha-0.3',$4,$5,$6,$7)`,
     [id,attacker,defender,outcome,{attacker:{level:4},defender:{level:4}},{id,commandId:key,attackerName:'Historical Warrior',defenderName:'Historical Rival',loot,attackerXp:2,spiritSpent:1,defenderHealthBefore:20,defenderHealthAfter:finishing?0:10,attackEquipment:[],defenseEquipment:[],...modern?{pvpRulesetId:'gameplay-refinement-1'}:{}},now]);return {id,key};
   }
   await battle(a.characterId,b.characterId,'attacker_win',20);await battle(b.characterId,a.characterId,'attacker_win',5);await battle(a.characterId,b.characterId,'defender_win',0,false);
   await placeBounty(sql,a.characterId,b.characterId,100,randomUUID(),now);
   const finish=await battle(c.characterId,b.characterId,'attacker_win',10,true,true);assert.ok(await claimBounty(sql,c.characterId,b.characterId,finish.id,finish.key,now));
   await placeBounty(sql,b.characterId,a.characterId,20,randomUUID(),now);
   await sql.query(`INSERT INTO realm_messages(id,author_id,profile_id,channel,body,command_id,ruleset_id,created_at) VALUES($1,$2,$3,'comment','A saved greeting',$4,'community-0.1',$5),($6,$2,NULL,'broadcast','A saved proclamation',$7,'community-0.1',$5)`,[randomUUID(),a.characterId,b.characterId,randomUUID(),now,randomUUID(),randomUUID()]);
  });
  await db.query("INSERT INTO tutorial_guides(character_id,step_index,completed_at) VALUES($1,6,NULL),($2,4,NULL),($3,8,$4)",[a.characterId,b.characterId,c.characterId,now]);
  assert.equal((await db.query("SELECT count(*)::int n FROM rulesets WHERE id='game-feel-1'")).rows[0]!.n,0);
  const before=await snapshot(db);await migrate(db);const after=await snapshot(db);
  for(const [table,rows] of Object.entries(before)){
   if(['schema_migrations','rulesets'].includes(table)){const current=new Set(after[table]);assert.ok(rows.every(row=>current.has(row)),table);}
   else assert.deepEqual(after[table],rows,table);
  }
  assert.equal(after.development_bots!.length,450);assert.equal(after.accounts!.length,454);assert.equal(after.champion_standings!.length,454);assert.equal(after.tutorial_guides!.length,3);
  const head=(await db.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0]!.name;assert.equal(head,'021_player_attention.sql');
  assert.equal((await db.query("SELECT count(*)::int n FROM rulesets WHERE id='game-feel-1'")).rows[0]!.n,1);
  const aRivalry=(await rivalryHistory(db,a.characterId,b.characterId))!;assert.equal(aRivalry.wins,'1');assert.equal(aRivalry.losses,'2');assert.equal(aRivalry.goldTaken,'20');assert.equal(aRivalry.goldLost,'5');assert.equal(aRivalry.unrecordedGold,'1');
  const bountyHall=await hallOfChampions(db,c.characterId,'bounties');assert.equal(bountyHall.entries[0]!.id,c.characterId);assert.equal(bountyHall.own!.score,'1');
  const hunterRivalry=(await rivalryHistory(db,c.characterId,b.characterId))!;assert.equal(hunterRivalry.bountiesClaimed,'1');assert.equal(hunterRivalry.goldTaken,'10','Escrow principal must not enter ordinary stolen-gold totals.');
  await migrate(db);assert.deepEqual(await snapshot(db),after);
  await mkdir('test-results',{recursive:true});await writeFile('test-results/phase47-preservation.json',JSON.stringify({passed:true,base:'019_champions_and_rivalries.sql',target:head,existingTablesVerified:Object.keys(before).length,accounts:454,bots:450,oldBusinessRows:'unchanged',migrationReplay:'unchanged',preservedStandings:454,sha256:createHash('sha256').update(JSON.stringify(after)).digest('hex'),liveDatabaseConnected:false},null,2)+'\n');
 }finally{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
