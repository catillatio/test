import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {performance} from 'node:perf_hooks';
import type {QueryResultRow} from 'pg';
import {realm,testDatabaseUrl} from './helpers.js';
import {transaction,type Database,type Sql} from '../src/db.js';
import {provisionBots} from '../src/development.js';
import {migrate,reconcileLevelMilestones} from '../src/migrate.js';
import {loadConfig} from '../src/config.js';
import {alpha,areRivals,levelRequirement,resolveAlphaCombat} from '../src/alpha-rules.js';
import {ledger} from '../src/economy.js';
import {lockCharacters,materialize,stateFrom} from '../src/game.js';
import {botVictoryRewards} from '../src/bot-combat-rules.js';
import {livingEconomy,decisionSlot,economyCandidates,economyCommand,runBotEconomy} from '../src/bot-economy.js';
import {livingCombat,duelWindow,duelSlot,duelCandidates,duelCommand,duelPressureAllows,attemptBotDuel,runBotCombat,startBotCombat} from '../src/bot-combat.js';
import {settleDueBotIncome} from '../src/bot-income.js';
import {activityFeed} from '../src/feeds.js';
import {botStates,requireLocalSimulationDatabase} from '../scripts/simulation/living-economy.js';

const hour=3600000,hash=(s:string)=>createHash('sha256').update(s).digest().readUInt32BE(0);
test('shared scheduling preserves economy v1 exactly; duel slots, receipt namespaces and target pressure are bounded',()=>{
 const ids=Array.from({length:450},()=>randomUUID()),start=duelWindow(new Date('2054-01-01Z')),counts=new Map<string,number>();
 for(let w=start;w<start+288;w++){
  const old=ids.filter(id=>hash(id)%144===w%144).sort((a,b)=>hash(a+':'+w)-hash(b+':'+w)||a.localeCompare(b)).slice(0,5);
  assert.deepEqual(economyCandidates(ids,w),old);
  const selected=duelCandidates(ids,w);assert.ok(selected.length<=5);assert.deepEqual(selected,duelCandidates([...ids].reverse(),w));
  for(const id of selected){counts.set(id,(counts.get(id)??0)+1);assert.equal(duelSlot(id),w%144);assert.notEqual(duelCommand(id,w),economyCommand(id,w));assert.equal(decisionSlot(id),hash(id)%144);}
 }
 assert.ok([...counts.values()].every(n=>n<=2));assert.throws(()=>duelCandidates([...ids,randomUUID()],start));
 assert.ok(duelPressureAllows({initiated:1,targeted:3,recent:0}));
 for(const p of[{initiated:2,targeted:0,recent:0},{initiated:0,targeted:4,recent:0},{initiated:0,targeted:0,recent:1},{initiated:NaN,targeted:0,recent:0}])assert.equal(duelPressureAllows(p),false);
 assert.equal(livingEconomy.id,'living-bot-economy-1');
});
test('duels are default OFF, privately controlled and disabled code does not read SQL or start a timer',async()=>{
 assert.equal(loadConfig({NODE_ENV:'test'}).livingBotCombatEnabled,false);assert.equal(loadConfig({NODE_ENV:'test'}).livingBotEconomyEnabled,false);
 for(const env of[{ENABLE_LIVING_BOT_COMBAT:'yes'},{ENABLE_LIVING_BOT_COMBAT:'1'},{NODE_ENV:'production',APP_ORIGIN:'https://example.test',ENABLE_DEV_BOTS:'1',ENABLE_LIVING_BOT_COMBAT:'1'}])assert.throws(()=>loadConfig(env));
 assert.equal(loadConfig({NODE_ENV:'test',ENABLE_DEV_BOTS:'1',ENABLE_LIVING_BOT_COMBAT:'1'}).livingBotCombatEnabled,true);
 const production=loadConfig({NODE_ENV:'production',APP_ORIGIN:'https://fixture.invalid',DATABASE_URL:'postgresql://fixture@postgres.railway.internal/realm',RAILWAY_SERVICE_ID:randomUUID(),RAILWAY_ENVIRONMENT_ID:randomUUID(),KINGDOM_PRIVATE_ALPHA:'1',ENABLE_DEV_BOTS:'1',ENABLE_LIVING_BOT_COMBAT:'1'});assert.equal(production.livingBotCombatEnabled,true);assert.equal(production.livingBotEconomyEnabled,false);
 const app=await readFile('src/app.ts','utf8');assert.doesNotMatch(app,/bot-combat|ENABLE_LIVING_BOT_COMBAT|bot_duel/);
 const db={query:()=>{throw new Error('SQL is forbidden');},connect:()=>{throw new Error('SQL is forbidden');}} as unknown as Database;
 assert.equal((await attemptBotDuel(db,false,'invalid',0)).status,'disabled');assert.equal((await runBotCombat(db,false)).considered,0);await(await startBotCombat(db,false,()=>assert.fail()))();
});

test('duel timer shares non-overlap and graceful-drain scheduling',async t=>{
 t.mock.timers.enable({apis:['setInterval']});let reads=0,release:(value:any)=>void=()=>{};
 const pending=new Promise(resolve=>{release=resolve;}),db={query:async(q:string)=>{reads++;if(q==='SELECT clock_timestamp() AS now')return pending;return {rows:[]};}} as unknown as Database;
 const stop=startBotCombat(db,true,()=>assert.fail());assert.equal(reads,1);t.mock.timers.tick(livingCombat.intervalMs*3);assert.equal(reads,1);
 release({rows:[{now:new Date('2054-01-01Z')}]});await stop();assert.equal(reads,2);t.mock.timers.tick(livingCombat.intervalMs);assert.equal(reads,2);
});

async function snapshot(sql:Sql){
 const result:Record<string,string[]>={};
 for(const {table_name:table}of(await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows){
  assert.match(table,/^[a-z_]+$/);result[table]=(await sql.query('SELECT row_to_json(t)::text AS row FROM "'+table+'" t')).rows.map(r=>r.row).sort();
 }
 return result;
}
function intercept(db:Database,after:(q:string,v?:unknown[])=>void):Database{
 const wrap=(sql:Sql):Sql=>({query:async<T extends QueryResultRow>(q:string,v?:unknown[])=>{const value=await sql.query<T>(q,v);after(q,v);return value;}});
 return {...wrap(db),end:()=>db.end(),connect:async()=>{const c=await db.connect();return {...wrap(c),release:()=>c.release()};}};
}
async function funds(db:Database){
 const row=(await db.query(`SELECT (SELECT sum(balance)::text FROM wallets) AS wallet,
  (SELECT sum(reserve_gold)::text FROM maintenance_accounts) AS reserve,(SELECT COALESCE(sum(pending_gold),0)::text FROM land_accounts) AS retained,
  ((SELECT COALESCE(sum(net_gold),0) FROM land_income_settlements)+(SELECT COALESCE(sum(net_gold),0) FROM land_partial_settlements))::text AS income,
  (SELECT COALESCE(sum(charged_gold),0)::text FROM maintenance_events) AS upkeep,
  (SELECT COALESCE(-sum(amount),0)::text FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE t.reason IN('land_purchase','equipment_purchase')) AS purchases`)).rows[0]!;
 return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,BigInt(v)])) as Record<string,bigint>;
}

test('real bot duels: identity/escrow/resource rejection, wallet and XP conservation, concurrency, crash/restart, bounded activity and populated preservation',
 {skip:!testDatabaseUrl,timeout:240000},async()=>{
 if(process.env.RUN_PHASE5_DUEL_MODEL==='1')requireLocalSimulationDatabase(testDatabaseUrl);
 let now=new Date('2054-06-01T00:00:00Z');const r=await realm({isolated:true,developmentBotsEnabled:true,developmentBotBountiesEnabled:true,clock:()=>now});
 try{
  const owner=await r.player('Existing Human'),witness=await r.player('Uninvolved Human');
  for(const p of[owner,witness])await r.prepare(p,50000,Array.from({length:4},(_,i)=>levelRequirement(i+1)).reduce((n,v)=>n+v,0));
  for(let n=0;n<5;n++)await r.ok(owner,'/api/v1/quests/border-patrol/runs');
  await r.ok(witness,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:2});await r.ok(witness,'/api/v1/vault/deposits',{amount:1000});await r.ok(witness,'/api/v1/tutorial',{action:'skip'});
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});await transaction(r.db,reconcileLevelMilestones);
  const bots=(await r.db.query('SELECT c.id,c.account_id,c.attained_level AS level,b.tier FROM characters c JOIN development_bots b ON b.character_id=c.id ORDER BY c.id')).rows,ids=bots.map(b=>String(b.id));
  const actor=bots.find(b=>b.level===5&&b.tier==='elite')!,target=bots.find(b=>b.level===5&&b.tier==='green')!;
  function nextWindow(id:string,at=+now){let w=duelWindow(new Date(at));for(let n=0;n<144*30;n++,w++)if(duelCandidates(ids,w).includes(id))return w;throw new Error('No bounded fixture slot');}
  let window=nextWindow(actor.id);now=new Date(window*livingCombat.intervalMs+1000);
  // All negative paths preserve every table, not just the wallet.
  const unchanged=async(fn:()=>Promise<unknown>)=>{const before=await snapshot(r.db);await fn();assert.deepEqual(await snapshot(r.db),before);};
  for(const [a,t]of[[owner.id,target.id],[actor.id,owner.id],[actor.id,actor.id],[actor.id,randomUUID()]])await unchanged(async()=>assert.notEqual((await attemptBotDuel(r.db,true,a,window,t)).status,'battled'));
  for(const [table,column,id,value]of[['development_bots','active',target.id,false],['accounts','login_disabled',target.account_id,false]] as const){
   const key=table==='accounts'?'id':'character_id';await r.db.query(`UPDATE ${table} SET ${column}=$2 WHERE ${key}=$1`,[id,value]);await unchanged(async()=>assert.notEqual((await attemptBotDuel(r.db,true,actor.id,window,target.id)).status,'battled'));await r.db.query(`UPDATE ${table} SET ${column}=true WHERE ${key}=$1`,[id]);
  }
  const lock=await r.db.connect();try{
   await lock.query('BEGIN');await lock.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[target.id]);await unchanged(async()=>assert.equal((await attemptBotDuel(r.db,true,actor.id,window,target.id)).status,'busy'));
  }finally{await lock.query('ROLLBACK');lock.release();}
  const escrow=await r.db.connect();try{
   await escrow.query('BEGIN');await escrow.query('SELECT pg_advisory_xact_lock(61824005)');await unchanged(async()=>assert.equal((await attemptBotDuel(r.db,true,actor.id,window,target.id)).status,'busy'));
  }finally{await escrow.query('ROLLBACK');escrow.release();}
  const placed=await r.ok(owner,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000});
  await unchanged(async()=>assert.equal((await attemptBotDuel(r.db,true,actor.id,window,target.id)).reason,'bounty'));
  now=new Date(+now+hour);await r.ok(owner,'/api/v1/bounties/cancellations',{bountyId:placed.data.bountyId});
  window=nextWindow(actor.id);now=new Date(window*livingCombat.intervalMs+1000);
  // No recovery loophole: after ordinary regeneration the actor still lacks
  // Spirit. A failed battle rolls back income/resource settlement and receipt.
  const saved=(await r.db.query('SELECT spirit,spirit_updated_at FROM characters WHERE id=$1',[actor.id])).rows[0]!;
  await r.db.query('UPDATE characters SET spirit=0,spirit_updated_at=$2 WHERE id=$1',[actor.id,now]);await unchanged(async()=>assert.equal((await attemptBotDuel(r.db,true,actor.id,window,target.id)).reason,'INSUFFICIENT_SPIRIT'));
  await r.db.query('UPDATE characters SET spirit=$2,spirit_updated_at=$3 WHERE id=$1',[actor.id,saved.spirit,saved.spirit_updated_at]);
  for(const [id,reason]of[[actor.id,'NEEDS_RECOVERY'],[target.id,'OPPONENT_DEFEATED']]){
   const old=(await r.db.query('SELECT health,health_updated_at FROM characters WHERE id=$1',[id])).rows[0]!;await r.db.query('UPDATE characters SET health=0,health_updated_at=$2 WHERE id=$1',[id,now]);
   await unchanged(async()=>assert.equal((await attemptBotDuel(r.db,true,actor.id,window,target.id)).reason,reason));await r.db.query('UPDATE characters SET health=$2,health_updated_at=$3 WHERE id=$1',[id,old.health,old.health_updated_at]);
  }
  const key=duelCommand(actor.id,window);
  await r.db.query("INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,'bot_duel',$3,'{}')",[actor.account_id,key,'0'.repeat(64)]);
  await unchanged(async()=>assert.rejects(attemptBotDuel(r.db,true,actor.id,window,target.id),/receipt identity mismatch/));await r.db.query('DELETE FROM command_receipts WHERE account_id=$1 AND command_id=$2',[actor.account_id,key]);
  // Real post-write failures have no committed battle, XP, income or charge.
  for(const point of['INSERT INTO battles','INSERT INTO economy_entries','UPDATE command_receipts SET result']){
   let fired=false;const db=intercept(r.db,q=>{if(q.startsWith(point)){fired=true;throw new Error('Synthetic duel write failure');}});
   await unchanged(async()=>assert.rejects(attemptBotDuel(db,true,actor.id,window,target.id),/Synthetic duel write failure/));assert.ok(fired);
  }
  // Put selected fixture progress just below a legitimate level threshold;
  // no rewards or resources are granted by autonomous runtime code.
  await r.db.query('UPDATE characters SET level_xp=$2,xp=$3 WHERE id=$1',[actor.id,levelRequirement(5)-1,Array.from({length:5},(_,i)=>levelRequirement(i+1)).reduce((n,v)=>n+v,0)-1]);
  await transaction(r.db,async sql=>{
   const locked=await lockCharacters(sql,[actor.id,target.id]);const states=[];for(const row of locked)states.push(await stateFrom(sql,await materialize(sql,row,now),now));
   const a=states.find(s=>s.id===actor.id)!,t=states.find(s=>s.id===target.id)!;assert.ok(a.attack*(100-alpha.combat.variation)>t.defense*(100+alpha.combat.variation),'real elite/green fixture must guarantee the crash/retry win without changing combat');
   if(t.gold)await ledger(sql,null,'test_fixture_depletion',[{characterId:target.id,amount:-t.gold}],alpha.id);
  });
  const schema=(await r.db.query('SELECT current_schema() AS name')).rows[0]!.name,url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);
  const code=`const {createDatabase}=await import(${JSON.stringify(new URL('../dist/db.js',import.meta.url).href)});const {attemptBotDuel}=await import(${JSON.stringify(new URL('../dist/bot-combat.js',import.meta.url).href)});
   const pool=createDatabase(process.env.TEST_DATABASE_URL),crash=process.env.FIXTURE_CRASH==='1';
   const wrap=sql=>({query:async(q,v)=>{const value=await(q==='SELECT clock_timestamp() AS now'?sql.query('SELECT $1::timestamptz AS now',[process.env.FIXTURE_CLOCK]):sql.query(q,v));if(crash&&q.startsWith('INSERT INTO battles'))process.kill(process.pid,'SIGKILL');return value;}});
   const db={...wrap(pool),connect:async()=>{const c=await pool.connect();return {...wrap(c),release:()=>c.release()};},end:()=>pool.end()};
   try{console.log(JSON.stringify(await attemptBotDuel(db,true,process.env.FIXTURE_ACTOR,Number(process.env.FIXTURE_WINDOW),process.env.FIXTURE_TARGET)));}finally{await db.end();}`;
  const child=(crash=false)=>promisify(execFile)(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TEST_DATABASE_URL:url.href,FIXTURE_CLOCK:now.toISOString(),FIXTURE_ACTOR:actor.id,FIXTURE_TARGET:target.id,FIXTURE_WINDOW:String(window),FIXTURE_CRASH:crash?'1':'0'},timeout:30000});
  const beforeCrash=await snapshot(r.db);await assert.rejects(child(true),(e:any)=>e.signal==='SIGKILL');await transaction(r.db,sql=>lockCharacters(sql,[actor.id,target.id]));assert.deepEqual(await snapshot(r.db),beforeCrash,'abrupt worker death rolls back all writes');
  const first=JSON.parse((await child()).stdout);assert.equal(first.status,'battled');
  const poor=(await r.db.query('SELECT result FROM battles WHERE id=$1',[first.battleId])).rows[0]!.result;assert.equal(poor.loot,0);assert.ok(poor.attackerXp>=1);assert.ok(poor.levelGained>0);assert.equal(poor.attackerHealthAfter,poor.attackerMaxHealth);
  const restoredResources=(await r.db.query('SELECT spirit,max_spirit FROM characters WHERE id=$1',[actor.id])).rows[0]!;assert.equal(restoredResources.spirit,restoredResources.max_spirit);
  const persisted=await snapshot(r.db);assert.equal(JSON.parse((await child()).stdout).status,'replayed');assert.deepEqual(await snapshot(r.db),persisted,'fresh-process receipt replay is read-only');
  await unchanged(async()=>assert.rejects(attemptBotDuel(r.db,true,actor.id,window,bots.find(b=>b.id!==target.id&&b.id!==actor.id)!.id),/receipt identity mismatch/));
  // Next valid opportunity: two competing bot workers and an ordinary human
  // attack/purchase share existing locks, escrow and wallet accounting.
  window=nextWindow(actor.id,+now+livingCombat.intervalMs);now=new Date(window*livingCombat.intervalMs+1000);
  const outcomes=await Promise.all([attemptBotDuel(r.db,true,actor.id,window,target.id),attemptBotDuel(r.db,true,actor.id,window,target.id),runBotEconomy(r.db,true),settleDueBotIncome(r.db,true),r.command(owner,'/api/v1/battles',{targetCharacterId:target.id,actorCharacterId:actor.id,autonomousPolicy:livingCombat.id})]);
  const humanAttack=outcomes[4];assert.equal(humanAttack.statusCode,200,humanAttack.body);const humanBattle=(await r.db.query('SELECT attacker_id,result FROM battles WHERE id=$1',[humanAttack.json().battleId])).rows[0]!;assert.equal(humanBattle.attacker_id,owner.id);assert.equal(humanBattle.result.botDuelPolicyId,undefined);
  await attemptBotDuel(r.db,true,actor.id,window,target.id);
  const complete=await snapshot(r.db);await attemptBotDuel(r.db,true,actor.id,window,target.id);assert.deepEqual(await snapshot(r.db),complete);
  // A bounded 24-hour run, including hourly housekeeping, paid purchases and
  // cooperating workers. No resupply, damage reset, new gear grant or seed.
  const humans=await snapshot(r.db),humanRows=(s:Record<string,string[]>)=>Object.fromEntries(Object.entries(s).map(([t,rows])=>[t,rows.filter(row=>[owner.id,owner.accountId,witness.id,witness.accountId].some(id=>row.includes(id)))]));
  const initialXp=(await r.db.query('SELECT id,xp FROM characters WHERE id=ANY($1::uuid[])',[ids])).rows;
  const humanBefore=humanRows(humans),feeds=await Promise.all(['all','battles'].map(c=>activityFeed(r.db,witness.id,c as 'all'|'battles'))),initial=await botStates(r.db),fundsBefore=await funds(r.db);
  const modelHours=process.env.RUN_PHASE5_DUEL_MODEL==='1'?24:2;
  let queries=0;const db=intercept(r.db,()=>{queries++;}),start=+now+livingCombat.intervalMs,started=performance.now();
  const ticks={considered:0,battled:0,replayed:0,busy:0,ineligible:0};let purchases=0;
  for(let slot=0;slot<modelHours*12;slot++){
   now=new Date(start+slot*livingCombat.intervalMs);
   if(slot%12===0)await settleDueBotIncome(db,true);
   purchases+=(await runBotEconomy(db,true)).purchased;
   const runs=await Promise.all(Array.from({length:slot%12===0?3:1},()=>runBotCombat(db,true)));
   for(const result of runs)for(const k of Object.keys(ticks) as (keyof typeof ticks)[])ticks[k]+=result[k];
  }
  now=new Date(start+modelHours*hour);await settleDueBotIncome(db,true);
  const milliseconds=performance.now()-started,afterFunds=await funds(r.db),final=await botStates(r.db),all=await snapshot(r.db);
  assert.equal((afterFunds.wallet!+afterFunds.reserve!+afterFunds.retained!)-(fundsBefore.wallet!+fundsBefore.reserve!+fundsBefore.retained!),(afterFunds.income!-fundsBefore.income!)-(afterFunds.upkeep!-fundsBefore.upkeep!)-(afterFunds.purchases!-fundsBefore.purchases!));
  assert.deepEqual(humanRows(all),humanBefore,'all human rows stay untouched by autonomy');
  assert.deepEqual(await Promise.all(['all','battles'].map(c=>activityFeed(r.db,witness.id,c as 'all'|'battles'))),feeds,'personal feeds exclude all unrelated bot activity');
  for(const table of['accounts','sessions','vault_accounts','army_stacks','army_links','development_bots','development_bot_estates','bounties','bounty_events','bounty_kills','realm_messages','rulesets','schema_migrations','rivalry_totals'])assert.deepEqual(all[table],humans[table],table+' preserved');
  for(const table of['battles','command_receipts','economy_transactions','economy_entries','land_income_settlements','land_partial_settlements','inventory_transactions','maintenance_events','treasury_retained_events']){const rows=new Set(all[table]);for(const value of humans[table]!)assert.ok(rows.has(value),table+' history preserved');}
  const identity=(rows:typeof initial)=>rows.map(b=>[b.id,b.name,b.accountId,b.vault,b.participants]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  assert.deepEqual(identity(final),identity(initial));
  for(const b of final)assert.ok(b.level>=initial.find(i=>i.id===b.id)!.level,'earned leveling cannot reset a bot');
  const battles=(await r.db.query("SELECT snapshot,result,created_at FROM battles WHERE result ? 'botDuelPolicyId' ORDER BY created_at,id")).rows;
  const transfers=(await r.db.query("SELECT t.command_id,e.character_id,e.amount FROM economy_transactions t JOIN economy_entries e ON e.transaction_id=t.id WHERE t.reason='battle_loot'")).rows;
  let wins=0,losses=0,gold=0,xp=0,levels=0,modelXp=0;
  const targetTimes=new Map<string,number[]>(),daily=new Map<string,number>();
  for(const row of battles){const b=row.result,s=row.snapshot,computed=resolveAlphaCombat(s.attacker,s.defender,b.attackRoll,b.defenseRoll);
   assert.equal(b.outcome,computed.outcome);assert.equal(b.attackerDamage,computed.attackerDamage);assert.equal(b.defenderDamage,computed.defenderDamage);
   assert.deepEqual(b.attackEquipment,s.attacker.attackEquipment.selected);assert.deepEqual(b.defenseEquipment,s.defender.defenseEquipment.selected);assert.equal(b.attackerArmy,s.attacker.army.participants);assert.equal(b.defenderArmy,s.defender.army.participants);
   assert.equal(b.bountyClaim,null);assert.equal(b.defenderXp,0);assert.equal(b.spiritSpent,alpha.combat.spiritCost);
   if(b.outcome==='attacker_win'){wins++;const reward=botVictoryRewards(s.defender.gold,s.attacker.level,s.defender.level,b.lootDetails.victory,s.attacker.attack,s.defender.defense);assert.equal(b.loot,reward.loot.amount);assert.equal(b.attackerXp,reward.xp.amount);}else{losses++;assert.equal(b.loot,0);assert.equal(b.attackerXp,0);}
   const actual=transfers.filter(t=>t.command_id===b.commandId).map(t=>[t.character_id,t.amount]).sort();assert.deepEqual(actual,b.loot?[[b.attackerId,b.loot],[b.defenderId,-b.loot]].sort():[]);
   if(+new Date(row.created_at)>=start)modelXp+=b.attackerXp;
   gold+=b.loot;xp+=b.attackerXp;levels+=b.levelGained;
   const day=new Date(row.created_at).toISOString().slice(0,10);for(const [key,limit]of[['a:'+b.attackerId+day,2],['d:'+b.defenderId+day,4]] as const){daily.set(key,(daily.get(key)??0)+1);assert.ok(daily.get(key)!<=limit);}
   const times=targetTimes.get(b.defenderId)??[];if(times.length)assert.ok(+new Date(row.created_at)-times.at(-1)!>=hour);times.push(+new Date(row.created_at));targetTimes.set(b.defenderId,times);
  }
  assert.ok(wins>0&&losses>0);assert.ok(xp>0&&gold>0);
  const finalXp=(await r.db.query('SELECT id,xp FROM characters WHERE id=ANY($1::uuid[])',[ids])).rows;assert.equal(finalXp.reduce((n,c)=>n+c.xp-initialXp.find(i=>i.id===c.id)!.xp,0),modelXp,'awarded XP equals actual saved XP growth');
  assert.equal((await r.db.query("SELECT count(*)::int AS n FROM (SELECT floor(extract(epoch FROM created_at)/300) FROM battles WHERE result ? 'botDuelPolicyId' GROUP BY 1 HAVING count(*)>5) q")).rows[0]!.n,0);
  assert.equal((await r.db.query("SELECT count(*)::int AS n FROM (SELECT result->>'commandId' FROM battles WHERE result ? 'botDuelPolicyId' GROUP BY 1 HAVING count(*)>1) q")).rows[0]!.n,0);
  const preMigration=await snapshot(r.db);await migrate(r.db);assert.deepEqual(await snapshot(r.db),preMigration,'ordinary upgrade preserves the progressed realm');
  await mkdir('test-results',{recursive:true});await writeFile('test-results/phase5-bot-duels.json',JSON.stringify({policy:livingCombat,simulation:{hours:modelHours,bots:450,queries,milliseconds,ticks,purchases},battles:{count:battles.length,wins,losses,goldTransferred:gold,xp,levels},examples:[5,15,25,40,50].map(level=>{const before=initial.find(b=>b.level===level)!;return {level,before:{name:before.name,gold:before.gold,net:before.net,level:before.level},after:final.filter(b=>b.id===before.id).map(b=>({name:b.name,gold:b.gold,net:b.net,level:b.level}))};}),preservation:'PASS',conservation:'PASS',abruptCrash:'PASS',processReplay:'PASS'},null,2)+'\n');
 }finally{await r.close();}
});
