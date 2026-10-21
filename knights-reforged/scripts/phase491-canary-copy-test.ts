// Two freshly restored synthetic databases. No production access or rollout CLI.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createDatabase,transaction,type Database,type Sql} from '../src/db.js';
import {migrate,reconcileLevelMilestones} from '../src/migrate.js';
import {provisionBots} from '../src/development.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {stateFrom,type CharacterRow} from '../src/game.js';
import {executeCommand} from '../src/commands.js';
import {settleDueBotIncome} from '../src/bot-income.js';
import {canary,digest,prepareManifest,selectedSlots,powers,economicIntentDigest,type CanaryManifest} from './experiments/bot-canary-model.js';
import {inspectCanary,applyTestCanary,type CanaryTestConsent} from './experiments/bot-canary-store.js';

if(!testDatabaseUrl||process.env.NODE_ENV==='production')throw new Error('Dedicated disposable test database required');
const url=new URL(testDatabaseUrl),container=process.env.TEST_POSTGRES_CONTAINER;
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.port!=='55593'||!/^\/[a-z0-9_]+_test$/.test(url.pathname)||container!=='kingdom-bot-canary-test')throw new Error('Dedicated loopback canary container required');
const docker=(...args:string[])=>execFileSync('docker',['exec',container!,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const initial=new Date('2035-01-01T00:00:00Z');let now=new Date(initial);
const r=await realm({isolated:true,clock:()=>now,developmentBotsEnabled:true});
const out='docs/phase491/canary',copies:{name:string;pool:Database;db:Database;url:string}[]=[];
const dump='/tmp/canary_'+randomUUID().replaceAll('-','')+'.dump',checks:string[]=[];
async function snapshot(db:Sql){
  const all:Record<string,string[]>={};
  for(const {table_name:t}of(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows){
    assert.match(t,/^[a-z_]+$/);all[t]=(await db.query('SELECT row_to_json(t)::text row FROM "'+t+'" t')).rows.map(r=>r.row).sort();
  }return all;
}
function unchanged(a:Record<string,string[]>,b:Record<string,string[]>,tables=Object.keys(b)){for(const t of tables)assert.equal(digest(a[t]),digest(b[t]),t+' changed');}
const wrap=(sql:Sql):Sql=>({query:(s,v)=>s==='SELECT clock_timestamp() AS now'?sql.query('SELECT $1::timestamptz AS now',[now.toISOString()]):sql.query(s,v)});
const consent=(copy:typeof copies[number],m?:CanaryManifest):CanaryTestConsent=>({mode:'test',allowLocalExperiment:true,databaseUrl:copy.url,manifestDigest:m?digest(m):'0'.repeat(64)});
async function reviewed(copy:typeof copies[number]){
  const ids=(await copy.db.query(`SELECT c.id,c.attained_level,b.tier,b.variant FROM characters c JOIN development_bots b ON b.character_id=c.id`)).rows;
  const snapshots=[];for(const slot of selectedSlots){const row=ids.find(r=>`${r.attained_level}:${r.tier}:${r.variant}`===slot);assert.ok(row);snapshots.push(await inspectCanary(copy.db,row.id,consent(copy)));}
  return prepareManifest(snapshots,now);
}
async function treasury(db:Sql,ids?:string[]){
  const rows=(await db.query(`SELECT w.balance,m.reserve_gold FROM wallets w JOIN maintenance_accounts m ON m.character_id=w.character_id
    WHERE ${ids?'w.character_id=ANY($1::uuid[])':'EXISTS(SELECT 1 FROM development_bots b WHERE b.character_id=w.character_id)'}`,ids?[ids]:[])).rows;
  return rows.reduce((n,r)=>n+BigInt(r.balance)+BigInt(r.reserve_gold),0n);
}
try{
  const a=await r.player('Canary Existing Human'),b=await r.player('Canary Existing Neighbor');
  const xp=Array.from({length:14},(_,i)=>levelRequirement(i+1)).reduce((n,v)=>n+v,0);
  for(const p of[a,b]){await r.prepare(p,100000,xp);await r.ok(p,'/api/v1/tutorial',{action:'skip'});for(let n=0;n<5;n++)await r.ok(p,'/api/v1/quests/border-patrol/runs');}
  for(const category of['weapon','armor','spell'])await r.ok(a,'/api/v1/inventory/purchases',{itemId:alpha.items.filter(i=>i.category===category&&i.level<=15).sort((a,b)=>b.attack-a.attack||b.defense-a.defense)[0]!.id,quantity:10});
  await r.legacyArmy(a,9);await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:3});await r.ok(a,'/api/v1/vault/deposits',{amount:1000});
  await r.ok(a,'/api/v1/settings/sound',{enabled:'1',volume:39});await r.ok(b,'/api/v1/settings/sound',{enabled:'0',volume:22});
  await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});await r.ok(a,'/api/v1/bounties/placements',{targetCharacterId:b.id,amount:100});await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id});
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});await transaction(r.db,reconcileLevelMilestones);await r.me(a);await r.me(b);
  const schema=(await r.db.query('SELECT current_schema() AS s')).rows[0]!.s;assert.match(schema,/^fixture_[a-f0-9]{32}$/);
  const source=await snapshot(r.db);assert.equal(source.accounts!.length,452);assert.equal(source.development_bots!.length,450);
  assert.equal((await r.db.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0]!.id,docker('psql','-U','postgres','-d',url.pathname.slice(1),'-Atc','SELECT system_identifier::text FROM pg_control_system()'));
  docker('pg_dump','-U','postgres','-Fc','--schema='+schema,'--file='+dump,url.pathname.slice(1));
  const archiveSha256=docker('sha256sum',dump).split(' ')[0]!;assert.match(archiveSha256,/^[a-f0-9]{64}$/);
  for(const label of['safety','main']){
    const name=`canary_${label}_${randomUUID().replaceAll('-','')}_test`;docker('createdb','-U','postgres',name);
    const u=new URL(url);u.pathname='/'+name;u.searchParams.set('options','-c search_path='+schema);
    const item={name,pool:createDatabase(u.href),db:undefined as unknown as Database,url:u.href};copies.push(item);
    docker('pg_restore','-U','postgres','--no-owner','--no-privileges','--exit-on-error','--single-transaction','-d',name,dump);
    item.db={query:(s,v)=>wrap(item.pool).query(s,v),connect:async()=>{const c=await item.pool.connect();return {...wrap(c),release:()=>c.release()};},end:()=>item.pool.end()};
    unchanged(await snapshot(item.db),source);await migrate(item.db);await migrate(item.db);unchanged(await snapshot(item.db),source);
  }
  checks.push('One checksummed custom archive restored into two fresh separate databases; all 66 tables, 452 accounts and 450 bots match; migrations replay without changes');
  const safety=copies[0]!,m=await reviewed(safety),p=consent(safety,m),first=m.entries.find(e=>e.plan.status==='purchase')!;assert.ok(first);
  const clean=await snapshot(safety.db);
  for(const bad of[{...p,mode:'production'},{...p,allowLocalExperiment:false},{...p,databaseUrl:safety.url.replace('127.0.0.1','private.invalid')},{...p,databaseUrl:safety.url.replace(safety.name,'kingdom_come')}])await assert.rejects(applyTestCanary(safety.db,bad as CanaryTestConsent,m,first.botId,randomUUID()));
  await assert.rejects(inspectCanary(safety.db,a.id,p),/identity/);await assert.rejects(applyTestCanary(safety.db,p,m,a.id,randomUUID()),/selected/);
  const tampered={...m,entries:m.entries.map(e=>e.botId===first.botId?{...e,plan:{...e.plan,cost:0}}:e)};
  await assert.rejects(applyTestCanary(safety.db,{...p,manifestDigest:digest(tampered)},tampered,first.botId,randomUUID()),/manifest/);
  now=new Date(+initial+canary.quoteSeconds*1000);await assert.rejects(applyTestCanary(safety.db,p,m,first.botId,randomUUID()),/expired/);
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;}),queuedPacket=structuredClone(m);
  const queuedDb:Database={...safety.db,connect:async()=>{await gate;return safety.db.connect();}};
  const queued=applyTestCanary(queuedDb,p,queuedPacket,first.botId,randomUUID());queuedPacket.expiresAt='2040-01-01T00:00:00Z';release();await assert.rejects(queued,/expired/);
  now=new Date(+initial-1);await assert.rejects(applyTestCanary(safety.db,p,m,first.botId,randomUUID()),/premature/);now=new Date(initial);unchanged(await snapshot(safety.db),clean);
  checks.push('Wrong consent, production/nonlocal targets, humans, missing selected identity, changed paid plans, edited queued packets and expired/premature quotes reject without mutation');
  const faulty:Database={...safety.db,connect:async()=>{const c=await safety.db.connect();return {release:()=>c.release(),query:async(s,v)=>{if(s==='UPDATE maintenance_accounts SET hourly_rate=$2 WHERE character_id=$1')throw new Error('Synthetic post-purchase rollback');return c.query(s,v);}};}};
  await assert.rejects(applyTestCanary(faulty,p,m,first.botId,randomUUID()),/rollback/);unchanged(await snapshot(safety.db),clean);
  checks.push('Failure after a real paid purchase rolls back inventory, paid lots, wallet, journals and every other table');
  const raced=m.entries.find(e=>e.before.level===15&&e.before.tier==='green')!;assert.equal(raced.plan.status,'purchase');
  const battle=await executeCommand(safety.db,a.accountId,randomUUID(),'attack',{targetCharacterId:raced.botId},{developmentBotsEnabled:true});
  assert.equal((await safety.db.query('SELECT outcome FROM battles WHERE id=$1',[battle.battleId])).rows[0]!.outcome,'attacker_win');
  const afterBattle=await snapshot(safety.db);await assert.rejects(applyTestCanary(safety.db,p,m,raced.botId,randomUUID()),/Stale/);unchanged(await snapshot(safety.db),afterBattle);
  checks.push('An actual ordinary battle invalidates the reviewed Health/wallet/version snapshot; stale calibration adds no mutation');
  const raceManifest=await reviewed(safety),raceEntry=raceManifest.entries.find(e=>e.botId===raced.botId)!,racePermission=consent(safety,raceManifest);
  const beforeRace=await treasury(safety.db,[a.id,raced.botId]);
  const raceResults=await Promise.allSettled([applyTestCanary(safety.db,racePermission,raceManifest,raced.botId,randomUUID()),executeCommand(safety.db,a.accountId,randomUUID(),'attack',{targetCharacterId:raced.botId},{developmentBotsEnabled:true})]);
  assert.equal(raceResults[1]!.status,'fulfilled');const calibration=raceResults[0]!;
  if(calibration.status==='rejected')assert.match(String(calibration.reason),/Stale/);
  assert.equal(await treasury(safety.db,[a.id,raced.botId]),beforeRace-BigInt(calibration.status==='fulfilled'?raceEntry.plan.cost:0));
  checks.push('Simultaneous normal PvP/calibration share character locks; transfers conserve the remaining purse and only a committed reviewed purchase is deducted');
  const foreign=randomUUID();await safety.db.query("INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,'attack','synthetic-foreign','{}')",[first.accountId,foreign]);
  const withForeign=await snapshot(safety.db);await assert.rejects(applyTestCanary(safety.db,p,m,first.botId,foreign),/Conflicting/);unchanged(await snapshot(safety.db),withForeign);
  checks.push('A command ID from another action cannot be reused as canary authorization');

  const main=copies[1]!,manifest=await reviewed(main),permission=consent(main,manifest),before=await snapshot(main.db);
  const originalTreasury=await treasury(main.db),firstMain=manifest.entries.find(e=>e.plan.status==='purchase')!,key=randomUUID();
  const once=await Promise.all([applyTestCanary(main.db,permission,manifest,firstMain.botId,key),applyTestCanary(main.db,permission,manifest,firstMain.botId,key),applyTestCanary(main.db,permission,manifest,firstMain.botId,randomUUID())]);
  assert.equal(once[0].commandId,once[1].commandId);assert.equal(once[0].commandId,once[2].commandId);
  const receipts=[once[0]],controls=[];
  for(const entry of manifest.entries){if(entry.botId===firstMain.botId)continue;const result=await applyTestCanary(main.db,permission,manifest,entry.botId,randomUUID());if(entry.plan.status==='purchase')receipts.push(result);else controls.push(entry.slot);}
  const after=await snapshot(main.db),changedIds=new Set(manifest.entries.filter(e=>e.plan.status==='purchase').map(e=>e.botId));
  assert.ok(receipts.length>0&&receipts.length<=18);assert.equal(receipts.length+controls.length,18);
  const cost=manifest.entries.reduce((n,e)=>n+e.plan.cost,0),topup=manifest.entries.reduce((n,e)=>n+e.plan.reserveTopup,0),extraUpkeep=manifest.entries.reduce((n,e)=>n+e.plan.newRate-e.plan.oldRate,0);
  assert.equal(await treasury(main.db),originalTreasury-BigInt(cost));
  const mutable=new Set(['characters','wallets','inventory_entries','inventory_lots','maintenance_accounts','command_receipts','inventory_transactions','economy_entries','economy_transactions','maintenance_events','maintenance_rate_events']);
  unchanged(after,before,Object.keys(before).filter(t=>!mutable.has(t)));
  for(const table of['inventory_lots','command_receipts','inventory_transactions','economy_entries','economy_transactions','maintenance_events','maintenance_rate_events'])for(const row of before[table]!)assert.ok(new Set(after[table]).has(row),'old '+table+' rewritten');
  for(const table of['characters','wallets','inventory_entries','maintenance_accounts']){
    const unrelated=(rows:string[])=>rows.map(r=>JSON.parse(r)).filter(r=>!changedIds.has(table==='characters'?r.id:r.character_id));
    assert.equal(digest(unrelated(after[table]!)),digest(unrelated(before[table]!)),'unrelated '+table);
  }
  for(const entry of manifest.entries){
    const old=before.characters!.map(r=>JSON.parse(r)).find(r=>r.id===entry.botId),actual=after.characters!.map(r=>JSON.parse(r)).find(r=>r.id===entry.botId);
    assert.equal(actual.state_version,old.state_version+(entry.plan.status==='purchase'?1:0));delete old.state_version;delete actual.state_version;assert.deepEqual(actual,old);
    const paid=await inspectCanary(main.db,entry.botId,permission);assert.equal(paid.gold,entry.plan.finalGold);assert.equal(paid.reserve,entry.plan.finalReserve);assert.deepEqual(powers(paid),entry.plan.after);
    const c=await main.db.connect();try{await c.query('BEGIN');const row=(await c.query<CharacterRow>('SELECT * FROM characters WHERE id=$1',[entry.botId])).rows[0]!;const live=await stateFrom(c,row,now);assert.equal(live.attack,entry.plan.after.attack);assert.equal(live.defense,entry.plan.after.defense);assert.equal(live.army.participants,entry.plan.participants);}finally{await c.query('ROLLBACK');c.release();}
  }
  const trades=after.inventory_transactions!.filter(r=>!new Set(before.inventory_transactions!).has(r)).map(r=>JSON.parse(r));assert.equal(trades.length,receipts.length);assert.ok(trades.every(t=>t.kind==='buy'));assert.equal(trades.reduce((n,t)=>n+t.gold_amount,0),cost);
  const entries=after.economy_entries!.filter(r=>!new Set(before.economy_entries!).has(r)).map(r=>JSON.parse(r));assert.ok(entries.every(e=>e.amount<=0));
  checks.push('Concurrent same/different-key retries apply once; all eighteen selected bots are recorded as paid changes or unchanged controls');
  checks.push('Exact catalog costs and only negative wallet entries; no sales, credit refunds, Vault movement, training or new members; actual runtime powers match the reviewed paid loadouts');
  checks.push('All 450 identities, both human records/sessions/holdings, 445 unmodified bots, properties, achievements/tutorial, rankings/rivalry source history and all old paid lots/financial receipts remain intact');
  const noReplay=await snapshot(main.db);now=new Date(+initial+canary.quoteSeconds*1000+1);await applyTestCanary(main.db,permission,manifest,firstMain.botId,key);unchanged(await snapshot(main.db),noReplay);now=new Date(initial);
  await main.pool.end();main.pool=createDatabase(main.url);await applyTestCanary(main.db,permission,manifest,firstMain.botId,key);unchanged(await snapshot(main.db),noReplay);
  checks.push('Completed exact receipts replay after quote expiry and a pool restart without another purchase, payment or audit entry');
  const beforeIncome=await treasury(main.db),net=(await main.db.query(`SELECT sum((SELECT sum(h.quantity*(h.hourly_income-h.hourly_upkeep)) FROM land_holdings h WHERE h.character_id=b.character_id)-m.hourly_rate)::text AS net FROM development_bots b JOIN maintenance_accounts m ON m.character_id=b.character_id`)).rows[0]!.net;
  now=new Date(+initial+3*3600000);await settleDueBotIncome(main.db,true);assert.equal(await treasury(main.db),beforeIncome+3n*BigInt(net));
  const incomeOnce=await snapshot(main.db);await main.pool.end();main.pool=createDatabase(main.url);await settleDueBotIncome(main.db,true);unchanged(await snapshot(main.db),incomeOnce);
  checks.push('Three hours of ordinary Land income minus all equipment upkeep conserve wallet plus reserve; repeated settlement after reconnect changes no rows');
  unchanged(await snapshot(r.db),source);checks.push('Populated source remains byte-for-byte unchanged; every experimental write occurred in the separate restored copies');
  await mkdir(out,{recursive:true});
  await writeFile(out+'/copy-manifest.json',JSON.stringify({syntheticOnly:true,manifestDigest:digest(manifest),manifest,transactions:receipts.map(r=>({botId:r.botId,commandId:r.commandId,childCommandId:r.childCommandId,manifestDigest:r.manifestDigest,cost:r.plan.cost,beforeGold:r.before.gold,afterGold:r.after.gold,reserveBefore:r.before.reserve,reserveAfter:r.after.reserve}))},null,2)+'\n');
  const result={passed:true,productionContacted:false,policyAdopted:false,policy:canary.id,manifestDigest:digest(manifest),economicIntentDigest:economicIntentDigest(manifest),archiveSha256,separateRestoredDatabases:2,tables:66,accounts:452,bots:450,selected:18,purchases:receipts.length,controls:controls.length,unchangedBots:450-receipts.length,cost,reserveTopup:topup,extraUpkeep,exposedGoldCredited:0,sales:0,pointsSpent:0,membersAdded:0,checks};
  await writeFile(out+'/copy-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{
  for(const c of copies){await c.pool.end().catch(()=>{});try{docker('dropdb','-U','postgres','--if-exists',c.name);}catch{}}
  await r.close();try{docker('rm','-f',dump);}catch{}
}
