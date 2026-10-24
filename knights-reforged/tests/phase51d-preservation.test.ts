import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';import {createDatabase,transaction,type Database} from '../src/db.js';
import {migrate,reconcileLevelMilestones} from '../src/migrate.js';import {registerAccount,createSession} from '../src/auth.js';
import {executeCommand} from '../src/commands.js';import {provisionBots} from '../src/development.js';
import {notificationSummary} from '../src/notifications.js';import {testDatabaseUrl} from './helpers.js';
async function snapshot(db:Database){const out:Record<string,string[]>={};
 for(const {table_name:t}of(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows){
  assert.match(t,/^[a-z_]+$/);out[t]=(await db.query('SELECT row_to_json(t)::text AS row FROM "'+t+'" t')).rows.map(r=>r.row).sort();
 }return out;
}
test('populated 021-to-022 upgrade preserves every old row and old read state, with no historical acceptance backlog',{skip:!testDatabaseUrl,timeout:180000},async()=>{
 const admin=createDatabase(testDatabaseUrl!),schema='foundations_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);
 const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);const db=createDatabase(url.href);
 try{
  await migrate(db,{through:'021_player_attention.sql'});
  const a=await registerAccount(db,{username:'foundation_a',name:'Existing Knight',password:'FoundationFixture!2026'}),b=await registerAccount(db,{username:'foundation_b',name:'Old Companion',password:'FoundationFixture!2026'});
  await registerAccount(db,{username:'development_fixture',name:'Development Knight',password:'FoundationFixture!2026'});await createSession(db,a.accountId);
  await executeCommand(db,a.accountId,randomUUID(),'buy',{itemId:'squires-blade',quantity:1});
  await executeCommand(db,a.accountId,randomUUID(),'invite',{targetCharacterId:b.characterId});await executeCommand(db,b.accountId,randomUUID(),'accept',{targetCharacterId:a.characterId});
  const historical=randomUUID();await db.query("INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$3,'comment','Old stored content: SH1T','community-0.1',$4,clock_timestamp())",[historical,b.characterId,a.characterId,randomUUID()]);
  await db.query("INSERT INTO notification_reads(character_id,kind,event_id) VALUES($1,'comment',$2)",[a.characterId,historical]);
  await db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,'alpha-0.3','attacker_win','{}','{}')",[randomUUID(),b.characterId,a.characterId]);
  await provisionBots(db,{nodeEnv:'test',allowProvisioning:true});await transaction(db,reconcileLevelMilestones);
  const before=await snapshot(db);await migrate(db);const after=await snapshot(db);
  for(const [table,rows]of Object.entries(before))if(['schema_migrations','rulesets'].includes(table))assert.ok(rows.every(row=>after[table]!.includes(row)),table);else assert.deepEqual(after[table],rows,table+' must remain byte-identical');
  assert.equal(after.accounts!.length,453);assert.equal(after.development_bots!.length,450);assert.equal(after.army_attention_starts!.length,453);assert.equal(after.content_policy_rejections!.length,0);
  assert.equal((await notificationSummary(db,a.characterId)).home,1,'only the existing unread attack; old acceptance is not new');
  assert.equal((await notificationSummary(db,b.characterId)).home,0,'acceptor does not notify themself');
  assert.equal((await db.query("SELECT character_maximum_length n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='characters' AND column_name='name'")).rows[0]!.n,96);
  await migrate(db);assert.deepEqual(await snapshot(db),after,'repeat migration changes nothing');
  await mkdir('test-results',{recursive:true});await writeFile('test-results/phase47-phase51d-preservation.json',JSON.stringify({passed:true,base:'021_player_attention.sql',head:'022_player_foundations.sql',accounts:453,bots:450,oldRowsUnchanged:true,oldReadStateUnchanged:true,noHistoricalAcceptanceBacklog:true,migrationReplay:'unchanged',productionContacted:false,
   beforeHashes:Object.fromEntries(Object.entries(before).map(([t,rows])=>[t,createHash('sha256').update(JSON.stringify(rows)).digest('hex')]))},null,2)+'\n');
 }finally{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
