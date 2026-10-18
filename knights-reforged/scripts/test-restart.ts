// Verifies the compiled production entrypoint across a real process restart.
// Uses only an explicitly designated disposable PostgreSQL database.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {projectRoot} from '../src/config.js';
import {testDatabaseUrl} from '../tests/helpers.js';
import {createDatabase} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {provisionBots} from '../src/development.js';
import {alpha} from '../src/alpha-rules.js';

if(!testDatabaseUrl)throw new Error('TEST_DATABASE_URL must designate a disposable *_test database. Build before running this check.');
const db=createDatabase(testDatabaseUrl);await migrate(db);
await provisionBots(db,{nodeEnv:'test',allowProvisioning:true});
const restartBot=(await db.query("SELECT b.character_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=1 AND b.tier='green' AND b.variant=0")).rows[0]!.character_id as string;
await db.end();
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
const port=(socket.address() as {port:number}).port;await new Promise<void>(resolve=>socket.close(()=>resolve()));
const origin='http://127.0.0.1:'+port;
let child:ChildProcess|undefined,output='';
async function start(){
  // This fixture intentionally exercises loopback HTTP. Do not inherit the
  // current Codespace's provider origin into its isolated child process.
  const env={...process.env};delete env.CODESPACE_NAME;delete env.CODESPACES;delete env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  child=spawn(process.execPath,[join(projectRoot,'dist/server.js')],{cwd:projectRoot,env:{...env,DATABASE_URL:testDatabaseUrl,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:origin,ENABLE_DEV_BOTS:'1'},stdio:['ignore','pipe','pipe']});
  child.stdout!.on('data',chunk=>{output=(output+chunk).slice(-4000);});child.stderr!.on('data',chunk=>{output=(output+chunk).slice(-4000);});
  for(let i=0;i<80;i++){
    if(child.exitCode!==null)throw new Error('Compiled server exited: '+output);
    if(await fetch(origin+'/healthz').then(r=>r.ok).catch(()=>false))return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Compiled server did not become ready: '+output);
}
async function stop(){
  if(!child||child.exitCode!==null)return;
  const closed=once(child,'exit'),watchdog=setTimeout(()=>child?.kill('SIGKILL'),5000);
  child.kill('SIGTERM');await closed;clearTimeout(watchdog);
}
async function player(suffix:string){
  const form=await fetch(origin+'/register'),html=await form.text();assert.equal(form.status,200);
  const anonymous=form.headers.getSetCookie().find(line=>line.startsWith('kr_session='))!.split(';')[0]!;
  const csrf=/name="csrf" value="([a-f0-9]{64})"/.exec(html)![1]!;
  const registered=await fetch(origin+'/register',{method:'POST',redirect:'manual',headers:{cookie:anonymous,origin,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({csrf,username:'restart_'+randomUUID().replaceAll('-','').slice(0,12),name:'Restart '+suffix,password:randomUUID()+'!aA1'})});
  assert.equal(registered.status,303);
  const cookie=registered.headers.getSetCookie().find(line=>line.startsWith('kr_session='))!.split(';')[0]!;
  const me=await fetch(origin+'/api/v1/me',{headers:{cookie}}).then(r=>r.json());
  return {cookie,csrf:me.csrfToken,id:me.state.id};
}
try{
  await start();const a=await player('Attacker'),b=await player('Defender');
  const command=async(url:string,body:Record<string,unknown>)=>{
    const response=await fetch(origin+url,{method:'POST',headers:{cookie:a.cookie,origin,'content-type':'application/json','x-csrf-token':a.csrf,'idempotency-key':randomUUID()},body:JSON.stringify(body)});
    assert.equal(response.status,200,await response.clone().text());return response.json();
  };
  for(let i=0;i<3;i++)await command('/api/v1/quests/border-patrol/runs',{});await command('/api/v1/skills',{resource:'attack'});await command('/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});
  await command('/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});const battle=await command('/api/v1/battles',{targetCharacterId:b.id});
  // Fund the 100-gold escrow plus fee through quests after buying Land/gear.
  for(let i=0;i<12;i++)await command('/api/v1/quests/border-patrol/runs',{});
  for(let i=0;i<8;i++){
    const response=await fetch(origin+'/api/v1/quests/border-patrol/runs',{method:'POST',headers:{cookie:b.cookie,origin,'content-type':'application/json','x-csrf-token':b.csrf,'idempotency-key':randomUUID()},body:'{}'});
    assert.equal(response.status,200,await response.clone().text());
  }
  await command('/api/v1/profile',{className:'Warden'});
  const bounty=await command('/api/v1/bounties/placements',{targetCharacterId:b.id,amount:100});
  const comment=await command('/api/v1/comments',{profileId:b.id,body:'Our banners hold across restarts.'});
  const broadcast=await command('/api/v1/broadcasts',{body:'A new alliance seeks the dawn.'});
  const rivalState=(await fetch(origin+'/api/v1/me',{headers:{cookie:b.cookie}}).then(r=>r.json())).state;
  await command('/api/v1/army/code-invitations',{code:rivalState.invitationCode});
  await command('/api/v1/vault/deposits',{amount:1});
  await command('/api/v1/tutorial',{action:'start'});
  const chosenArea=alpha.content!.areas[0]!.id;
  await fetch(origin+'/game/quests?area='+encodeURIComponent(chosenArea),{headers:{cookie:a.cookie}});
  const experienceBefore=await fetch(origin+'/api/v1/achievements',{headers:{cookie:a.cookie}}).then(r=>r.json());
  assert.ok(experienceBefore.achievements.some((award:{earnedAt:string|null})=>award.earnedAt));
  assert.equal(experienceBefore.tutorial.status,'completed');
  assert.equal(experienceBefore.tutorial.completed,8);
  assert.equal(experienceBefore.region,chosenArea);
  const championsBefore=await fetch(origin+'/api/v1/champions?category=victories',{headers:{cookie:a.cookie}}).then(r=>r.json());
  const rivalBefore=(await fetch(origin+'/game/players/'+b.id,{headers:{cookie:a.cookie}}).then(r=>r.text())).match(/<dl class="rivalry-stats">([\s\S]*?)<\/dl>/)?.[1];assert.ok(rivalBefore);
  const before=(await fetch(origin+'/api/v1/me',{headers:{cookie:a.cookie}}).then(r=>r.json())).state;
  await stop();await start();
  const restored=await fetch(origin+'/api/v1/me',{headers:{cookie:a.cookie}});assert.equal(restored.status,200);
  const after=(await restored.json()).state;
  for(const key of ['id','gold','bankedGold','xp','level','mana','spirit','health','inventory','questsCompleted','land','training','skillPoints','maxMana','className','calling','invitationCode','army'])assert.deepEqual(after[key],before[key],key);
  const experienceAfter=await fetch(origin+'/api/v1/achievements',{headers:{cookie:a.cookie}}).then(r=>r.json());
  assert.deepEqual(experienceAfter,experienceBefore,'Achievement earned dates, unlocked status, tutorial facts and region survive a process restart.');
  assert.deepEqual(await fetch(origin+'/api/v1/champions?category=victories',{headers:{cookie:a.cookie}}).then(r=>r.json()),championsBefore,'Lifetime ranks survive a process restart.');
  const rivalAfter=(await fetch(origin+'/game/players/'+b.id,{headers:{cookie:a.cookie}}).then(r=>r.text())).match(/<dl class="rivalry-stats">([\s\S]*?)<\/dl>/)?.[1];assert.equal(rivalAfter,rivalBefore,'Head-to-head win, gold and bounty totals survive a process restart.');
  const contracts=await fetch(origin+'/api/v1/bounties',{headers:{cookie:a.cookie}}).then(response=>response.json());
  assert.equal(contracts.history.find((record:{id:string})=>record.id===bounty.data.bountyId).status,'active');
  for(const owner of [a,b]){
    const report=await fetch(origin+'/api/v1/battles/'+battle.battleId,{headers:{cookie:owner.cookie}});assert.equal(report.status,200);
    assert.equal((await report.json()).battle.id,battle.battleId);
  }
  const social=await fetch(origin+'/api/v1/feed?feed=all',{headers:{cookie:a.cookie}}).then(r=>r.json());
  assert.ok(social.entries.some((entry:{id:string})=>entry.id===comment.data.messageId));
  assert.ok(social.entries.some((entry:{id:string})=>entry.id===broadcast.data.messageId));
  assert.equal((await fetch(origin+'/game/profile',{headers:{cookie:a.cookie}})).status,200);
  const sequenceDb=createDatabase(testDatabaseUrl!);try{assert.ok((await sequenceDb.query('SELECT victories FROM pvp_loot_sequences WHERE attacker_id=$1 AND defender_id=$2',[a.id,b.id])).rows.length===1);}finally{await sequenceDb.end();}
  // Persisted shared clocks, not JavaScript timers, own offline income.
  await fetch(origin+'/api/v1/players/'+restartBot,{headers:{cookie:a.cookie}});
  await stop();const offlineDb=createDatabase(testDatabaseUrl!);
  const botBefore=(await offlineDb.query(`SELECT w.balance,v.balance AS banked,(SELECT sum(quantity*(hourly_income-hourly_upkeep))::int FROM land_holdings WHERE character_id=w.character_id AND quantity>0) AS property_net FROM wallets w JOIN vault_accounts v ON v.character_id=w.character_id WHERE w.character_id=$1`,[restartBot])).rows[0]!;
  try{
    await offlineDb.query(`WITH t AS (SELECT clock_timestamp()-interval '3 hours 20 minutes' AS at)
      UPDATE land_holdings SET acquired_at=t.at,accrued_through=t.at FROM t WHERE character_id=$1`,[a.id]);
    await offlineDb.query('DELETE FROM income_cycles WHERE character_id=$1',[a.id]);
    await offlineDb.query(`WITH t AS (SELECT clock_timestamp()-interval '3 hours 20 minutes' AS at)
      UPDATE land_holdings SET acquired_at=t.at,accrued_through=t.at FROM t WHERE character_id=$1`,[restartBot]);
    await offlineDb.query('DELETE FROM income_cycles WHERE character_id=$1',[restartBot]);
  }finally{await offlineDb.end();}
  await start();
  const offline=(await fetch(origin+'/api/v1/me',{headers:{cookie:a.cookie}}).then(r=>r.json())).state;
  assert.equal(offline.gold,after.gold+3*7);
  const replayed=(await fetch(origin+'/api/v1/me',{headers:{cookie:a.cookie}}).then(r=>r.json())).state;
  assert.equal(replayed.gold,offline.gold);assert.equal(replayed.land.nextPaymentAt,offline.land.nextPaymentAt);
  const botProfile=await fetch(origin+'/api/v1/players/'+restartBot,{headers:{cookie:a.cookie}});assert.equal(botProfile.status,200);
  await fetch(origin+'/api/v1/players/'+restartBot,{headers:{cookie:a.cookie}});
  const botDb=createDatabase(testDatabaseUrl!);try{
    const botAfter=(await botDb.query('SELECT w.balance,v.balance AS banked FROM wallets w JOIN vault_accounts v ON v.character_id=w.character_id WHERE w.character_id=$1',[restartBot])).rows[0]!;
    assert.equal(botAfter.balance,botBefore.balance+3*botBefore.property_net);assert.equal(botAfter.banked,botBefore.banked);
  }finally{await botDb.end();}
  console.log('PASS: compiled server restarted; lifetime standings, rivalry totals, tutorial cursor/completion, achievement earned dates, tutorial progress, region filter, Vault, PvP sequence, sessions, progression, inventory, Land, Calling, funded bounty, comments, broadcasts, invitation codes, pending allies and both players’ private battle access survived. A second process restart settled exactly three offline shared cycles, and repeated reads paid nothing twice. A passive rival also received exactly three offline property periods after restart, with unchanged Vault savings and no duplicate payment on repeated profile views.');
}finally{await stop();}
