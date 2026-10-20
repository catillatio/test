import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {realm,testDatabaseUrl} from './helpers.js';
import {provisionBots} from '../src/development.js';
import {migrate,reconcileLevelMilestones,assertInstalledRulesets} from '../src/migrate.js';
import {transaction} from '../src/db.js';
import {grantExperience} from '../src/progression.js';
import {syncExperience} from '../src/experience.js';
import {executeCommand} from '../src/commands.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {botCombat} from '../src/bot-combat-rules.js';

test('populated Phase 4.8 upgrade adds only one immutable ruleset, retaining all 450 bots, old zero-reward receipts, finance and sessions',{skip:!testDatabaseUrl},async()=>{
 const now=new Date('2049-03-01T00:00:00Z'),r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});try{
  const a=await r.player('Existing Alpha Ruler'),b=await r.player('Existing Alpha Neighbor');
  for(const p of[a,b]){await r.prepare(p,20000,30);for(let i=0;i<5;i++)await r.ok(p,'/api/v1/quests/border-patrol/runs');}
  await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:3});await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:3});
  await r.ok(a,'/api/v1/vault/deposits',{amount:1000});await r.ok(a,'/api/v1/tutorial',{action:'start'});await r.ok(a,'/api/v1/settings/sound',{enabled:'0',volume:27});
  await r.ok(a,'/api/v1/bounties/placements',{targetCharacterId:b.id,amount:100});
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});await transaction(r.db,reconcileLevelMilestones);
  const target=(await r.db.query("SELECT c.id FROM characters c JOIN development_bots d ON d.character_id=c.id WHERE c.attained_level=3 AND d.tier='green' AND d.variant=0")).rows[0]!.id;
  const key=randomUUID(),battleId=randomUUID(),intent={targetCharacterId:target},oldResult={commandId:key,kind:'attack',battleId,message:'A saved Phase 4.8 zero-reward victory.',data:{}};
  await transaction(r.db,async sql=>{
   // Explicit synthetic historical fixture: the old exhausted-budget shape is
   // retained exactly. The upgrade never infers/recalculates an earlier reward.
   await grantExperience(sql,a.id,1,now);
   await sql.query(`INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,rewarded,created_at)
    VALUES($1,$2,$3,'alpha-0.3','attacker_win',$4,$5,false,$6)`,[battleId,a.id,target,{attacker:{level:3},defender:{level:3}},
    {id:battleId,commandId:key,outcome:'attacker_win',attackerId:a.id,defenderId:target,winnerId:a.id,attackerName:'Old Display Name',defenderName:'Old Rival Name',loot:0,attackerXp:1,rewarded:false,temporaryRival:true,botRewardEligibilityPolicy:'victories-only-1',pvpRulesetId:'gameplay-refinement-1',progressionRulesetId:'game-feel-1',lootDetails:{multiplier:10,botRewardAvailable:false},xpDetails:{reason:'repeat_budget'},spiritSpent:1,attackEquipment:[],defenseEquipment:[],createdAt:now.toISOString()},now]);
   await sql.query('INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,$3,$4,$5)',[a.accountId,key,'attack',createHash('sha256').update(JSON.stringify({kind:'attack',intent})).digest('hex'),oldResult]);
   await sql.query('INSERT INTO pvp_loot_sequences(attacker_id,defender_id,window_started_at,victories,ruleset_id) VALUES($1,$2,$3,7,$4)',[a.id,target,now,'gameplay-refinement-1']);
   await syncExperience(sql,a.id,now,'gameplay');
  });
  await r.me(a);await r.me(b);
  // Reconstruct the pre-upgrade registry; no new-policy battle exists yet.
  await r.db.query('DELETE FROM rulesets WHERE id=$1',[botCombat.id]);
  await assert.rejects(assertInstalledRulesets(r.db),/not installed/);
  async function snapshot(){const out:Record<string,string[]>={};for(const {table_name:t} of(await r.db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows){assert.match(t,/^[a-z_]+$/);out[t]=(await r.db.query('SELECT row_to_json(t)::text row FROM "'+t+'" t')).rows.map(x=>x.row).sort();}return out;}
  const before=await snapshot();await migrate(r.db);await assertInstalledRulesets(r.db);const after=await snapshot();
  assert.deepEqual(Object.keys(after),Object.keys(before));
  for(const [table,rows] of Object.entries(before)){if(table==='rulesets'){assert.equal(after[table]!.length,rows.length+1);assert.ok(rows.every(row=>after[table]!.includes(row)));}else assert.deepEqual(after[table],rows,table);}
  assert.equal(after.development_bots!.length,450);assert.equal(after.accounts!.length,452);assert.ok(after.battles!.length>0);assert.ok(after.bounties!.length>0);assert.ok(after.character_achievements!.length>0);
  await migrate(r.db);assert.deepEqual(await snapshot(),after);
  assert.deepEqual(await executeCommand(r.db,a.accountId,key,'attack',intent,{developmentBotsEnabled:true}),oldResult);assert.deepEqual(await snapshot(),after);
  const app=await createApp({db:r.db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',ENABLE_DEV_BOTS:'1'})});
  try{const response=await app.inject({url:'/api/v1/me',headers:{cookie:a.cookie}});assert.equal(response.statusCode,200);assert.equal(response.json().state.id,a.id);assert.deepEqual(response.json().sound,{enabled:false,volume:27});
   const report=await app.inject({url:'/game/battles/'+battleId,headers:{cookie:a.cookie}});assert.equal(report.statusCode,200);assert.match(report.body,/Old Rival Name/);
  }finally{await app.close();}
  const preserved=await snapshot();for(const table of['accounts','sessions','wallets','vault_accounts','inventory_entries','inventory_lots','land_holdings','army_stacks','development_bots','battles','bounties','bounty_events','command_receipts','character_achievements','tutorial_guides','sound_preferences','pvp_loot_sequences'])assert.deepEqual(preserved[table],after[table],table);
  await mkdir('test-results',{recursive:true});await writeFile('test-results/phase49-preservation.json',JSON.stringify({passed:true,fixture:'Populated synthetic Phase 4.8 / 020 schema',tablesVerified:Object.keys(before).length,accounts:452,bots:450,schemaMigrationsAdded:0,rulesetsAdded:[botCombat.id],businessRowsChanged:0,historicalReceiptReplayedUnchanged:true,savedSessionSurvived:true,productionContacted:false},null,2)+'\n');
 }finally{await r.close();}
});
