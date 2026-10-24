import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {mkdir,writeFile} from 'node:fs/promises';
import type {QueryResultRow} from 'pg';import {createDatabase,transaction,type Database} from '../src/db.js';
import {migrate,reconcileLevelMilestones} from '../src/migrate.js';import {registerAccount,createSession} from '../src/auth.js';
import {executeCommand} from '../src/commands.js';import {provisionBots} from '../src/development.js';import {testDatabaseUrl} from './helpers.js';
import {grantExperience} from '../src/progression.js';import {ledger} from '../src/economy.js';import {purchaseItems} from '../src/inventory.js';
import {buyEstate} from '../src/estate.js';import {vaultTransfer} from '../src/pvp-economy.js';import {placeBounty} from '../src/bounties.js';
import {createApp} from '../src/app.js';import {loadConfig} from '../src/config.js';
async function snapshot(db:Database){const rows:Record<string,string[]>={};for(const {table_name:t}of(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows){assert.match(t,/^[a-z_]+$/);rows[t]=(await db.query('SELECT row_to_json(t)::text AS row FROM "'+t+'" t')).rows.map(r=>r.row).sort();}return rows;}
test('E2a populated 022-to-023 rollback, upgrade, replay and restart preserve every business row and 450 bot identities',{skip:!testDatabaseUrl,timeout:180000},async()=>{
 const admin=createDatabase(testDatabaseUrl!),schema='compat_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);
 const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);const db=createDatabase(url.href);
 try{
  await migrate(db,{through:'022_player_foundations.sql'});
  const a=await registerAccount(db,{username:'compat_a',name:'Existing Champion',password:'CompatibilityFixture2026!'}),b=await registerAccount(db,{username:'compat_b',name:'Old Companion',password:'CompatibilityFixture2026!'});
  await registerAccount(db,{username:'compat_development',name:'Development Knight',password:'CompatibilityFixture2026!'});
  const session=await createSession(db,a.accountId);await createSession(db,b.accountId);
  await transaction(db,async sql=>{for(const p of[a,b]){
   await ledger(sql,null,'synthetic_preservation',[{characterId:p.characterId,amount:10000}]);await grantExperience(sql,p.characterId,100,new Date());
   await purchaseItems(sql,p.characterId,4,{'squires-blade':3},randomUUID(),new Date());await buyEstate(sql,p.characterId,4,'smallholding',2,randomUUID(),new Date());await vaultTransfer(sql,p.characterId,100,true,randomUUID(),new Date());
   await sql.query("INSERT INTO character_quest_progress(character_id,quest_id,completions) VALUES($1,'border-patrol',5)",[p.characterId]);
   for(let n=0;n<5;n++)await sql.query("INSERT INTO quest_runs(id,character_id,quest_id,ruleset_id,energy_spent,gold_reward,xp_reward) VALUES($1,$2,'border-patrol','alpha-0.3',1,5,4)",[randomUUID(),p.characterId]);
  }
   await placeBounty(sql,a.characterId,b.characterId,100,randomUUID(),new Date());
   await sql.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,'alpha-0.3','attacker_win','{}','{}')",[randomUUID(),a.characterId,b.characterId]);
   await sql.query("INSERT INTO player_preferences(character_id,tutorial_status) VALUES($1,'completed'),($2,'skipped')",[a.characterId,b.characterId]);
   await sql.query('INSERT INTO tutorial_guides(character_id,step_index,completed_at) VALUES($1,8,clock_timestamp()),($2,4,NULL)',[a.characterId,b.characterId]);
   await sql.query("INSERT INTO character_achievements(character_id,achievement_id,ruleset_id,metric_at_unlock,evidence) VALUES($1,'quests-1','player-experience-1',5,'gameplay')",[a.characterId]);
  });
  await executeCommand(db,a.accountId,randomUUID(),'invite',{targetCharacterId:b.characterId});await executeCommand(db,b.accountId,randomUUID(),'accept',{targetCharacterId:a.characterId});
  await provisionBots(db,{nodeEnv:'test',allowProvisioning:true});await transaction(db,reconcileLevelMilestones);
  // Reconstruct the old installed registry rather than pre-installing E2a.
  await db.query("DELETE FROM rulesets WHERE id='expansion-compatibility-1'");
  const before=await snapshot(db),botIds=(await db.query('SELECT character_id FROM development_bots ORDER BY character_id')).rows;
  const fault:Database={query:db.query.bind(db),end:()=>Promise.resolve(),connect:async()=>{const c=await db.connect();return {release:()=>c.release(),query:async<T extends QueryResultRow>(statement:string,values?:unknown[])=>{const result=await c.query<T>(statement,values);if(statement.includes('CREATE TABLE character_progression_epochs'))throw new Error('synthetic migration interruption');return result;}};}};
  await assert.rejects(migrate(fault),/synthetic migration interruption/);assert.deepEqual(await snapshot(db),before,'DDL and all rows roll back together');
  assert.match((await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='inventory_entries'::regclass AND conname='inventory_entries_quantity_check'")).rows[0]!.definition,/1000/);
  await migrate(db);const after=await snapshot(db);
  for(const [table,rows]of Object.entries(before))if(['schema_migrations','rulesets'].includes(table))assert.ok(rows.every(row=>after[table]!.includes(row)),table);else assert.deepEqual(after[table],rows,table+' remains byte-identical');
  assert.equal(after.accounts!.length,453);assert.equal(after.development_bots!.length,450);assert.deepEqual((await db.query('SELECT character_id FROM development_bots ORDER BY character_id')).rows,botIds);
  assert.equal(after.character_progression_epochs!.length,0);assert.equal((await db.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0]!.name,'023_expansion_compatibility.sql');
  assert.match((await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='inventory_entries'::regclass AND conname='inventory_entries_quantity_check'")).rows[0]!.definition,/5000/);
  await migrate(db);assert.deepEqual(await snapshot(db),after,'migration replay is unchanged');
  const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',DATABASE_URL:url.href});
  const first=await createApp({db,config});await first.close();const restarted=await createApp({db,config});
  try{const response=await restarted.inject({method:'GET',url:'/api/v1/me',headers:{cookie:'kr_session='+session.token}});assert.equal(response.statusCode,200);assert.equal(response.json().state.id,a.characterId);assert.equal(response.json().state.army.capacity,9);assert.equal(response.json().state.levelRequirement,45);}
  finally{await restarted.close();}
  assert.equal((await db.query('SELECT count(*)::int n FROM character_progression_epochs')).rows[0]!.n,0,'ordinary login does not activate an epoch');
  await mkdir('test-results',{recursive:true});await writeFile('test-results/phase47-e2a-preservation.json',JSON.stringify({passed:true,base:'022_player_foundations.sql',head:'023_expansion_compatibility.sql',accounts:453,bots:450,oldRowsUnchanged:true,botIdentitiesUnchanged:true,migrationRollback:'unchanged',migrationReplay:'unchanged',restartSessionPreserved:true,futureEpochs:0,productionContacted:false,beforeHashes:Object.fromEntries(Object.entries(before).map(([t,rows])=>[t,createHash('sha256').update(JSON.stringify(rows)).digest('hex')]))},null,2)+'\n');
 }finally{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
