import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {mkdir,writeFile} from 'node:fs/promises';
import {createDatabase,transaction,type Database} from '../src/db.js';import {migrate,reconcileLevelMilestones} from '../src/migrate.js';
import {registerAccount,createSession} from '../src/auth.js';import {executeCommand} from '../src/commands.js';import {provisionBots} from '../src/development.js';
import {createApp} from '../src/app.js';import {loadConfig} from '../src/config.js';import {notificationSummary} from '../src/notifications.js';import {listOpponents} from '../src/game.js';import {activityFeed} from '../src/feeds.js';import {testDatabaseUrl} from './helpers.js';
async function snapshot(db:Database){const result:Record<string,unknown[]>={};for(const {table_name:t} of(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows){assert.match(t,/^[a-z_]+$/);result[t]=(await db.query('SELECT row_to_json(t)::text row FROM "'+t+'" t')).rows.map(x=>x.row).sort();}return result;}
test('populated 5.1B upgrade adds attention state without modifying 452 accounts, 450 bots, finances, sessions or saved history',{skip:!testDatabaseUrl,timeout:180000},async()=>{
 const admin=createDatabase(testDatabaseUrl!),schema='attention_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);const db=createDatabase(url.href);
 try{
  await migrate(db,{through:'020_game_feel.sql'});const a=await registerAccount(db,{username:'prior_a',password:'Phase51cFixture!2026',name:'Previous Knight'}),b=await registerAccount(db,{username:'prior_b',password:'Phase51cFixture!2026',name:'Previous Rival'});
  const session=await createSession(db,a.accountId);await executeCommand(db,a.accountId,randomUUID(),'buy',{itemId:'squires-blade',quantity:1});
  await executeCommand(db,b.accountId,randomUUID(),'comment',{profileId:a.characterId,body:'Old personal comment'});await executeCommand(db,b.accountId,randomUUID(),'attack',{targetCharacterId:a.characterId});
  await provisionBots(db,{nodeEnv:'test',allowProvisioning:true});await transaction(db,reconcileLevelMilestones);
  const pair=(await db.query('SELECT character_id FROM development_bots ORDER BY character_id LIMIT 2')).rows,duel=randomUUID();
  await db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,'alpha-0.3','attacker_win','{}','{}')",[duel,pair[0]!.character_id,pair[1]!.character_id]);
  assert.ok(!(await activityFeed(db,a.characterId,'all')).entries.some(e=>e.id===duel));
  const before=await snapshot(db);await migrate(db);const after=await snapshot(db);
  for(const [table,rows]of Object.entries(before)){if(table==='schema_migrations')assert.ok(rows.every(row=>after[table]!.includes(row)));else assert.deepEqual(after[table],rows,table);}
  assert.equal(after.development_bots!.length,450);assert.equal(after.accounts!.length,452);assert.equal(after.notification_state!.length,452);
  assert.deepEqual(await notificationSummary(db,a.characterId),{home:0,army:0,events:[]},'historical events are not a new unread backlog');
  await migrate(db);assert.deepEqual(await snapshot(db),after);
  const app=await createApp({db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000'})});try{const response=await app.inject({url:'/api/v1/notifications',headers:{cookie:'kr_session='+session.token}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().home,0);}finally{await app.close();}
  assert.deepEqual(await snapshot(db),after);
  const disabled=await listOpponents(db,a.characterId,undefined,false);assert.ok(disabled.opponents.every(p=>!p.botTier));
  let cursor:string|undefined,total=0;const seen=new Set<string>();do{const page=await listOpponents(db,a.characterId,cursor,true);for(const p of page.opponents){assert.ok(!seen.has(p.id));seen.add(p.id);if(p.botTier)total++;}cursor=page.nextCursor??undefined;}while(cursor);assert.ok(total>0);
  const tableHashes=Object.fromEntries(Object.entries(before).map(([table,rows])=>[table,createHash('sha256').update(JSON.stringify(rows)).digest('hex')]));
  await mkdir('test-results',{recursive:true});await writeFile('test-results/phase47-phase51c-preservation.json',JSON.stringify({passed:true,accounts:452,bots:450,oldRowsUnchanged:true,noHistoricalUnreadBacklog:true,replayedMigrationUnchanged:true,botRivalPaginationChecked:true,tableHashes,productionContacted:false},null,2)+'\n');
 }finally{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
