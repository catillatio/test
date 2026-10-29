import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {QueryResultRow} from 'pg';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realm,testDatabaseUrl} from './helpers.js';
import {type Database,type Sql,transaction} from '../src/db.js';
import {provisionBots} from '../src/development.js';
import {migrate,reconcileLevelMilestones} from '../src/migrate.js';
import {loadConfig} from '../src/config.js';
import {alpha} from '../src/alpha-rules.js';
import {botCombat} from '../src/bot-combat-rules.js';
import {levelRequirement} from '../src/alpha-rules.js';
import {activityFeed} from '../src/feeds.js';
import {livingEconomy,economyCandidates,economyCommand,economyWindow,decisionSlot,planEconomy,runBotEconomy,startBotEconomy,type EconomySnapshot} from '../src/bot-economy.js';

const base:EconomySnapshot={gold:10000,level:15,participants:3,propertyNet:500,rate:0,reserve:'0',arrears:'0',paused:false,inventory:[],holdings:{}};
test('deterministic bounded decisions spend exposed gold only and require ordinary legal, useful, sustainable acquisitions',()=>{
 let land=0,equipment=0,waiting=0;
 for(let i=0;i<200;i++){
  const seed='fixture-'+i,p=planEconomy(base,seed);assert.deepEqual(p,planEconomy(structuredClone(base),seed));
  if(p.kind==='wait'){waiting++;continue;}
  assert.ok(p.cost+p.topup<=500);assert.ok(p.cost+p.topup<=2*(base.propertyNet-base.rate));
  assert.ok(base.gold-p.cost-p.topup>=Math.max(base.gold*.9,p.newRate*4));
  if(p.kind==='land'){land++;const item=alpha.properties.find(a=>a.id===p.id)!;assert.ok(item.level<=base.level);assert.ok(item.hourlyIncome-item.hourlyUpkeep<=10);}
  else {equipment++;const item=alpha.items.find(a=>a.id===p.id)!;assert.equal(p.cost,item.price);assert.equal(p.topup,item.upkeep);assert.ok(item.level<=base.level);assert.ok(p.newRate<=base.propertyNet*.35);}
 }
 assert.ok(land&&equipment&&waiting);
 for(const s of[{...base,gold:0},{...base,paused:true},{...base,arrears:'1'},{...base,propertyNet:0}])for(let i=0;i<20;i++)assert.equal(planEconomy(s,'seed'+i).kind,'wait');
 const prepaid={...base,reserve:'1000000'};for(let i=0;i<40;i++)assert.notEqual(planEconomy(prepaid,'seed'+i).kind,'equipment','Prepaid credit cannot finance or be returned by autonomous gear purchases');
 const capped={...base,inventory:alpha.items.map(i=>({...i,quantity:alpha.limits.inventory,inventoryId:'fixture'})),holdings:Object.fromEntries(alpha.properties.map(p=>[p.id,alpha.limits.property]))};
 capped.rate=capped.inventory.reduce((n,i)=>n+i.quantity*i.upkeep,0);assert.equal(planEconomy(capped,'seed').kind,'wait');
 assert.equal(botCombat.fullXpPercent,65);assert.deepEqual(botCombat.victoryPercentages,[100,85,70,55,40]);
});

test('adversarial worker guards preserve inactive/login-enabled targets, paused reserves and empty purses; locks, forged receipts and PvP races fail safely',{skip:!testDatabaseUrl,timeout:90000},async()=>{
 let now=new Date('2051-01-01T00:00:00Z');const r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});
 try{
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  const all=(await r.db.query<{id:string}>('SELECT character_id AS id FROM development_bots ORDER BY character_id')).rows.map(row=>row.id);
  // The five-candidate cap is reranked every window, even for the same
  // twelve-hour slot. Select a fixture actor scheduled in all four windows;
  // otherwise the empty-purse assertion may inspect a decision never attempted.
  let window=economyWindow(now),id:string|undefined;
  for(let offset=0;offset<144&&!id;offset++,window++){
   id=economyCandidates(all,window).find(candidate=>[1,2,3].every(n=>economyCandidates(all,window+n*144).includes(candidate)));
   if(id)break;
  }
  assert.ok(id,'The fixture requires a candidate scheduled in each adversarial test window');
  const bot=(await r.db.query('SELECT c.*,w.balance FROM characters c JOIN wallets w ON w.character_id=c.id WHERE c.id=$1',[id])).rows[0]!;
  // Restrict this adversarial synthetic fixture to one active candidate. The
  // independent populated-preservation test above retains all 450 active bots.
  await r.db.query('UPDATE development_bots SET active=false WHERE character_id<>$1',[id]);
  const prepare=async()=>{
   now=new Date(window*livingEconomy.intervalMs+1000);
   await r.db.query('UPDATE income_cycles SET next_payment_at=$2 WHERE character_id=$1',[id,new Date(+now+3600000)]);
   await r.db.query('INSERT INTO bot_finance_cycles(character_id,last_boundary_at) VALUES($1,$2) ON CONFLICT(character_id) DO UPDATE SET last_boundary_at=EXCLUDED.last_boundary_at',[id,now]);
   await r.db.query('UPDATE maintenance_accounts SET settled_at=$2 WHERE character_id=$1',[id,now]);
  };
  await prepare();await r.db.query('UPDATE accounts SET login_disabled=false WHERE id=$1',[bot.account_id]);
  let before=await snapshot(r.db);await runBotEconomy(r.db,true);assert.deepEqual(await snapshot(r.db),before,'A login-enabled account cannot become an autonomous actor');
  await r.db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[bot.account_id]);await r.db.query('UPDATE development_bots SET active=false WHERE character_id=$1',[id]);
  before=await snapshot(r.db);await runBotEconomy(r.db,true);assert.deepEqual(await snapshot(r.db),before,'Inactive bots do nothing');await r.db.query('UPDATE development_bots SET active=true WHERE character_id=$1',[id]);
  const lock=await r.db.connect();try{await lock.query('BEGIN');await lock.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[id]);const result=await runBotEconomy(r.db,true);assert.ok(result.busy>0);assert.equal(result.purchased,0);}finally{await lock.query('ROLLBACK');lock.release();}
  await r.db.query('UPDATE maintenance_accounts SET paused=true,arrears_gold=1 WHERE character_id=$1',[id]);await runBotEconomy(r.db,true);
  let receipt=(await r.db.query('SELECT result FROM command_receipts WHERE account_id=$1 AND command_id=$2',[bot.account_id,economyCommand(id,window)])).rows[0]!.result;assert.equal(receipt.plan.kind,'wait');assert.equal(receipt.plan.reason,'upkeep_paused');
  window+=144;await prepare();await r.db.query('UPDATE maintenance_accounts SET paused=false,arrears_gold=0,reserve_gold=1000000 WHERE character_id=$1',[id]);await r.db.query('UPDATE wallets SET balance=0 WHERE character_id=$1',[id]);
  const reserves=(await r.db.query('SELECT reserve_gold FROM maintenance_accounts WHERE character_id=$1',[id])).rows[0]!.reserve_gold,vault=(await r.db.query('SELECT balance FROM vault_accounts WHERE character_id=$1',[id])).rows[0]!.balance;
  await runBotEconomy(r.db,true);receipt=(await r.db.query('SELECT result FROM command_receipts WHERE account_id=$1 AND command_id=$2',[bot.account_id,economyCommand(id,window)])).rows[0]!.result;assert.equal(receipt.plan.kind,'wait');assert.equal(receipt.goldAfter,0);assert.equal(receipt.reserveAfter,reserves);assert.equal((await r.db.query('SELECT balance FROM vault_accounts WHERE character_id=$1',[id])).rows[0]!.balance,vault);
  window+=144;await prepare();const key=economyCommand(id,window);
  await r.db.query("INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,'buy',$3,'{}')",[bot.account_id,key,'0'.repeat(64)]);before=await snapshot(r.db);
  await assert.rejects(runBotEconomy(r.db,true),/identity mismatch/);assert.deepEqual(await snapshot(r.db),before);
  // A real ordinary attack and autonomous decision share the character lock.
  window+=144;await prepare();await r.db.query('UPDATE wallets SET balance=$2 WHERE character_id=$1',[id,bot.balance]);await r.db.query('UPDATE maintenance_accounts SET reserve_gold=hourly_rate WHERE character_id=$1',[id]);
  const player=await r.player('Concurrent Human');await r.prepare(player,30000,Array.from({length:bot.attained_level-1},(_,i)=>levelRequirement(i+1)).reduce((n,x)=>n+x,0));
  const total=async()=>BigInt((await r.db.query('SELECT sum(balance)::text n FROM wallets')).rows[0]!.n)+BigInt((await r.db.query('SELECT sum(reserve_gold)::text n FROM maintenance_accounts')).rows[0]!.n);
  const pre=await total();const results=await Promise.all([runBotEconomy(r.db,true),r.ok(player,'/api/v1/battles',{targetCharacterId:id})]);
  const decision=(await r.db.query('SELECT result FROM command_receipts WHERE account_id=$1 AND command_id=$2',[bot.account_id,economyCommand(id,window)])).rows[0]?.result;
  const spent=decision&&decision.plan.kind!=='wait'?decision.plan.cost:0;assert.equal(await total(),pre-BigInt(spent),'Ordinary loot moves between wallets; only the paid acquisition sinks capital');
  assert.ok(results[1].battleId);assert.ok((await r.db.query('SELECT min(balance)::int AS n FROM wallets')).rows[0]!.n>=0);
  // A worker that lost the character lock to PvP may still complete its first
  // decision on a same-slot retry; subsequent completed retries are read-only.
  await runBotEconomy(r.db,true);const stable=await snapshot(r.db);await runBotEconomy(r.db,true);assert.deepEqual(await snapshot(r.db),stable);
 }finally{await r.close();}
});
test('fixed twelve-hour slots and five-candidate selection are global across workers, bounded and never catch up missed purchases',()=>{
 const ids=Array.from({length:450},()=>randomUUID()),window=economyWindow(new Date('2050-01-01T00:00:00Z'));
 const counts=new Map<string,number>();
 for(let w=window;w<window+288;w++){
  const selected=economyCandidates(ids,w);assert.ok(selected.length<=5);assert.deepEqual(economyCandidates([...ids].reverse(),w),selected);
  for(const id of selected){assert.equal(decisionSlot(id),w%144);counts.set(id,(counts.get(id)??0)+1);assert.equal(economyCommand(id,w),economyCommand(id,w));assert.notEqual(economyCommand(id,w),economyCommand(id,w+144));}
 }
 assert.ok([...counts.values()].every(n=>n<=2));assert.throws(()=>economyCandidates([...ids,randomUUID()],window));
 const key=economyCommand(ids[0]!,window);assert.match(key,/^[a-f0-9-]{14}4[a-f0-9-]{4}[89ab][a-f0-9-]+$/);
});
test('autonomy is opt-in, private-alpha controlled, disabled workers touch no SQL and no public activation path exists',async()=>{
 assert.equal(loadConfig({NODE_ENV:'test'}).livingBotEconomyEnabled,false);
 assert.equal(loadConfig({NODE_ENV:'test',ENABLE_DEV_BOTS:'1',ENABLE_LIVING_BOT_ECONOMY:'1'}).livingBotEconomyEnabled,true);
 for(const values of[{ENABLE_LIVING_BOT_ECONOMY:'yes'},{ENABLE_LIVING_BOT_ECONOMY:'1'},{NODE_ENV:'production',APP_ORIGIN:'https://fixture.invalid',ENABLE_DEV_BOTS:'1',ENABLE_LIVING_BOT_ECONOMY:'1'}])assert.throws(()=>loadConfig(values));
 const db={query:async()=>{throw new Error('Unexpected SQL');},connect:async()=>{throw new Error('Unexpected SQL');},end:async()=>{}};
 assert.deepEqual(await runBotEconomy(db,false),{considered:0,purchased:0,waiting:0,replayed:0,busy:0});await(await startBotEconomy(db,false,()=>assert.fail()))();
 const source=await readFile('src/app.ts','utf8');assert.doesNotMatch(source,/bot-economy|ENABLE_LIVING_BOT_ECONOMY/);
});

test('background scheduling starts without profile views, prevents overlapping ticks and drains cleanly on shutdown',async t=>{
 t.mock.timers.enable({apis:['setInterval']});let reads=0,release:(value:unknown)=>void=()=>{};
 const delayed=new Promise(resolve=>{release=resolve;});
 const db={query:async(text:string)=>{reads++;if(text==='SELECT clock_timestamp() AS now')return delayed;return {rows:[]};},connect:async()=>{throw new Error('No selected bot');},end:async()=>{}} as unknown as Database;
 const stop=startBotEconomy(db,true,()=>assert.fail('Unexpected scheduler error'));
 t.mock.timers.tick(livingEconomy.intervalMs*3);assert.equal(reads,1,'An in-flight tick cannot overlap itself');
 release({rows:[{now:new Date('2050-01-01T00:00:00Z')}]});await stop();assert.equal(reads,2);
 t.mock.timers.tick(livingEconomy.intervalMs*3);assert.equal(reads,2,'Shutdown clears the interval and drains the in-flight decision');
});

async function snapshot(sql:Sql){
 const data:Record<string,string[]>={};
 for(const {table_name:table}of(await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows){
  assert.match(table,/^[a-z_]+$/);data[table]=(await sql.query('SELECT row_to_json(t)::text AS row FROM "'+table+'" t')).rows.map(r=>r.row).sort();
 }
 return data;
}
function intercept(db:Database,after:(query:string,values?:unknown[])=>void):Database{
 const wrap=(sql:Sql):Sql=>({query:async<T extends QueryResultRow>(text:string,values?:unknown[])=>{const result=await sql.query<T>(text,values);after(text,values);return result;}});
 return {...wrap(db),end:()=>db.end(),connect:async()=>{const client=await db.connect();return {...wrap(client),release:()=>client.release()};}};
}
test('populated realm: real sparse purchases, paid lots/journals, shared income, multi-worker retries, rollback and process restart preserve all humans/450 identities',{skip:!testDatabaseUrl,timeout:240000},async()=>{
 let now=new Date('2050-05-01T00:00:00Z');const r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});
 try{
  const a=await r.player('Existing Human One'),b=await r.player('Existing Human Two');for(const p of[a,b])await r.prepare(p,30000,30);
  await r.ok(a,'/api/v1/settings/sound',{enabled:'1',volume:37});await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:2});await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:2});await r.ok(a,'/api/v1/vault/deposits',{amount:1000});await r.ok(a,'/api/v1/tutorial',{action:'skip'});await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});await r.me(a);await r.me(b);
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  await transaction(r.db,reconcileLevelMilestones);
  const initial=await snapshot(r.db);await migrate(r.db);await migrate(r.db);await runBotEconomy(r.db,false);assert.deepEqual(await snapshot(r.db),initial,'Installing/replaying with opt-in off changes no existing row');
  const ids=(await r.db.query<{id:string}>('SELECT character_id AS id FROM development_bots ORDER BY character_id')).rows.map(b=>b.id);assert.equal(ids.length,450);
  const humanRows=async()=>{
   const all=await snapshot(r.db);return Object.fromEntries(Object.entries(all).map(([table,rows])=>[table,rows.filter(text=>[a.id,b.id,a.accountId,b.accountId].some(id=>text.includes(id)))]));
  };
  const humans=await humanRows(),feed=await activityFeed(r.db,a.id,'all');
  const identities=(await r.db.query('SELECT c.*,b.* FROM development_bots b JOIN characters c ON c.id=b.character_id ORDER BY c.id')).rows.map(row=>({id:row.id,name:row.name,account:row.account_id,level:row.attained_level,xp:row.xp,armyFloor:row.legacy_army_floor,calling:row.profile_class,attack:row.attack_training,defense:row.defense_training,key:row.population_key}));
  const finances=async()=>{
   const x=(await r.db.query(`SELECT (SELECT sum(balance)::text FROM wallets) AS gold,
    (SELECT sum(reserve_gold)::text FROM maintenance_accounts) AS reserve,
    (SELECT COALESCE(sum(e.amount),0)::text FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE t.reason='land_income') AS income,
    (SELECT COALESCE(sum(charged_gold),0)::text FROM maintenance_events) AS upkeep,
    (SELECT COALESCE(-sum(e.amount),0)::text FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE t.reason IN ('land_purchase','equipment_purchase')) AS purchases`)).rows[0]!;
   return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,BigInt(v||0)])) as Record<string,bigint>;
  };
  const financialBefore=await finances();let land=0,gear=0,wait=0;
  // One real day of sparse decision slots, not combat/difficulty experiments.
  // The clock advances only in this synthetic PostgreSQL fixture.
  const start=economyWindow(now);
  for(let w=start;w<start+288;w++){
   now=new Date(w*livingEconomy.intervalMs+1000);
   const results=await Promise.all(Array.from({length:w%7===0?3:1},()=>runBotEconomy(r.db,true)));assert.ok(results.every(result=>result.considered<=5));
   const committed=(await r.db.query("SELECT result FROM command_receipts WHERE kind='bot_economy' AND result->>'window'=$1",[String(w)])).rows;
   assert.ok(committed.length<=5);
   for(const {result:record}of committed){
    assert.equal(record.goldAfter,record.goldBefore-(record.plan.kind==='wait'?0:record.plan.cost+record.plan.topup));
    if(record.plan.kind==='land')land++;else if(record.plan.kind==='equipment')gear++;else wait++;
   }
  }
  assert.ok(land>0&&gear>0&&wait>0,JSON.stringify({land,gear,wait}));
  const financialAfter=await finances();
  assert.equal(financialAfter.gold!+financialAfter.reserve!-financialBefore.gold!-financialBefore.reserve!,financialAfter.income!-financialBefore.income!-(financialAfter.upkeep!-financialBefore.upkeep!)-(financialAfter.purchases!-financialBefore.purchases!));
  const repeatBefore=await snapshot(r.db);await Promise.all(Array.from({length:4},()=>runBotEconomy(r.db,true)));assert.deepEqual(await snapshot(r.db),repeatBefore,'Concurrent same-window retries do not alter rows or pay twice');
  const purchases=(await r.db.query("SELECT account_id,command_id,result FROM command_receipts WHERE kind='bot_economy' AND result->'plan'->>'kind'<>'wait'")).rows;
  for(const {account_id,command_id,result:record}of purchases){
   assert.equal(record.policy,livingEconomy.id);assert.ok(record.plan.cost+record.plan.topup<=Math.min(5000,Math.floor(record.goldBefore*.05),2*(record.propertyNetBefore-record.upkeepBefore)));
   if(record.plan.kind==='equipment'){
    const lot=(await r.db.query('SELECT acquired_quantity,remaining_quantity,unit_cost FROM inventory_lots WHERE character_id=$1 AND command_id=$2',[record.botId,command_id])).rows;assert.equal(lot.length,1);assert.equal(lot[0]!.acquired_quantity,1);assert.equal(lot[0]!.remaining_quantity,1);assert.equal(lot[0]!.unit_cost,record.plan.cost);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM inventory_transactions WHERE character_id=$1 AND command_id=$2 AND kind=\'buy\'',[record.botId,command_id])).rows[0]!.n,1);
   }else{
    const holding=(await r.db.query('SELECT * FROM land_holdings WHERE id=$1',[record.acquiredId])).rows[0]!;assert.equal(holding.unit_price,record.plan.cost);assert.equal(holding.quantity,1);assert.equal(holding.character_id,record.botId);
   }
   assert.equal((await r.db.query('SELECT login_disabled FROM accounts WHERE id=$1',[account_id])).rows[0]!.login_disabled,true);
  }
  // Inject a fault after a real purchase; all ordinary ledgers, lots, upkeep,
  // income settlement and the decision receipt must roll back together.
  let rollbackChecked=false;
  for(let n=0;n<30&&!rollbackChecked;n++){
   now=new Date(+now+livingEconomy.intervalMs);const before=await snapshot(r.db);let injected=false,failedId='';
   const failing=intercept(r.db,(text,values)=>{if(!injected&&(text.startsWith('INSERT INTO inventory_transactions')||text.startsWith('INSERT INTO land_holdings'))){injected=true;failedId=values![1] as string;throw new Error('Synthetic post-purchase failure');}});
   try{await runBotEconomy(failing,true);}catch(error){assert.match(String(error),/Synthetic post-purchase failure/);rollbackChecked=true;}
   if(injected){
    // Earlier independent bots in the same bounded tick may commit. Every row
    // belonging to the failing target (including its receipt) must roll back.
    const account=identities.find(i=>i.id===failedId)!.account as string,after=await snapshot(r.db);
    for(const table of Object.keys(before))assert.deepEqual(after[table]!.filter(text=>text.includes(failedId)||text.includes(account)),before[table]!.filter(text=>text.includes(failedId)||text.includes(account)),table+' failed target rollback');
    const first=await runBotEconomy(r.db,true);assert.ok(first.purchased>0);const stable=await snapshot(r.db);await runBotEconomy(r.db,true);assert.deepEqual(await snapshot(r.db),stable);
   }else assert.ok(before.accounts!.length===452);
  }
  assert.ok(rollbackChecked);
  // Fresh compiled worker processes reconnect to the same synthetic realm.
  const schema=(await r.db.query('SELECT current_schema() AS name')).rows[0]!.name as string,url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);
  now=new Date(+now+144*livingEconomy.intervalMs);
  const code=`const {createDatabase}=await import(${JSON.stringify(new URL('../dist/db.js',import.meta.url).href)});const {runBotEconomy}=await import(${JSON.stringify(new URL('../dist/bot-economy.js',import.meta.url).href)});
   const db=createDatabase(process.env.TEST_DATABASE_URL),at=process.env.FIXTURE_CLOCK;
   const wrap=sql=>({query:(q,v)=>q==='SELECT clock_timestamp() AS now'?sql.query('SELECT $1::timestamptz AS now',[at]):sql.query(q,v)});
   const fixed={...wrap(db),connect:async()=>{const c=await db.connect();return {...wrap(c),release:()=>c.release()};},end:()=>db.end()};
   try{console.log(JSON.stringify(await runBotEconomy(fixed,true)));}finally{await db.end();}`;
  const child=()=>promisify(execFile)(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TEST_DATABASE_URL:url.href,FIXTURE_CLOCK:now.toISOString()},timeout:30000});
  await child();const restarted=await snapshot(r.db);const replay=JSON.parse((await child()).stdout);assert.equal(replay.purchased,0);assert.deepEqual(await snapshot(r.db),restarted);
  assert.deepEqual(await humanRows(),humans,'No human account, balance, inventory, Land, session, army or history changed');assert.deepEqual(await activityFeed(r.db,a.id,'all'),feed,'Autonomous transactions do not enter personal Recent Activity');
  assert.deepEqual((await r.db.query('SELECT c.*,b.* FROM development_bots b JOIN characters c ON c.id=b.character_id ORDER BY c.id')).rows.map(row=>({id:row.id,name:row.name,account:row.account_id,level:row.attained_level,xp:row.xp,armyFloor:row.legacy_army_floor,calling:row.profile_class,attack:row.attack_training,defense:row.defense_training,key:row.population_key})),identities);
  const after=await snapshot(r.db);
  for(const table of['accounts','sessions','vault_accounts','army_stacks','army_links','battles','bounties','realm_messages','development_bots','development_bot_estates','rulesets','schema_migrations'])assert.deepEqual(after[table],initial[table],table+' remains unchanged');
  for(const row of initial.land_holdings!){
   const old=JSON.parse(row),current=after.land_holdings!.map(text=>JSON.parse(text)).find(h=>h.id===old.id);assert.ok(current,'Every original holding persists');
   for(const key of Object.keys(old).filter(k=>!['accrued_through','income_remainder','upkeep_remainder'].includes(k)))assert.deepEqual(current[key],old[key],'Original holding '+key);
  }
  for(const table of['economy_transactions','economy_entries','inventory_transactions','command_receipts','maintenance_events','maintenance_rate_events','land_income_settlements','land_partial_settlements','treasury_retained_events','bot_finance_events']){
   const saved=new Set(after[table]);for(const row of initial[table]!)assert.ok(saved.has(row),table+' historical row retained');
  }
  for(const table of['inventory_lots','inventory_entries'])for(const old of initial[table]!){const a=JSON.parse(old),b=after[table]!.map(s=>JSON.parse(s)).find(row=>row.id===a.id);assert.ok(b);if(table==='inventory_lots')assert.deepEqual(b,a);else assert.ok(b.quantity>=a.quantity);}
  const examples=[];for(const level of[5,15,25,40,50])for(const kind of['land','equipment']){
   const purchase=purchases.find(p=>identities.find(i=>i.id===p.result.botId)?.level===level&&p.result.plan.kind===kind);
   if(purchase){const identity=identities.find(i=>i.id===purchase.result.botId)!;examples.push({name:identity.name,level,...purchase.result});}
  }
  await mkdir('test-results',{recursive:true});await writeFile('test-results/phase5-bot-economy.json',JSON.stringify({passed:true,policy:livingEconomy.id,population:450,humans:2,slots:288,landPurchases:land,equipmentPurchases:gear,waiting:wait,maximumPerSlot:5,scheduledSlotsPerBotPerDay:2,balancesConserved:true,humanRowsUnchanged:true,originalInventoryAndLandRetained:true,personalFeedUnchanged:true,concurrentReplay:true,rollback:true,compiledProcessRestart:true,newMigrations:0,productionContacted:false,financialBefore:Object.fromEntries(Object.entries(financialBefore).map(([k,v])=>[k,String(v)])),financialAfter:Object.fromEntries(Object.entries(financialAfter).map(([k,v])=>[k,String(v)])),addedNetHourlyIncome:purchases.reduce((n,p)=>n+p.result.plan.netIncrease,0),examples},null,2)+'\n');
 }finally{await r.close();}
});
