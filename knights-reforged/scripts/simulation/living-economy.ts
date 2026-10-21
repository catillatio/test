// Nonproduction only: unchanged runtime worker, hourly settlement and combat.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createHash,randomUUID} from 'node:crypto';
import type {QueryResultRow} from 'pg';
import {realm,testDatabaseUrl} from '../../tests/helpers.js';
import {transaction,type Database,type Sql} from '../../src/db.js';
import {provisionBots} from '../../src/development.js';
import {reconcileLevelMilestones} from '../../src/migrate.js';
import {alpha,activeArmy,levelRequirement,selectEquipment} from '../../src/alpha-rules.js';
import {refinements} from '../../src/refinement-rules.js';
import {livingEconomy,decisionSlot,economyCommand,economyCandidates,economyWindow,runBotEconomy} from '../../src/bot-economy.js';
import {settleDueBotIncome} from '../../src/bot-income.js';
import {executeCommand} from '../../src/commands.js';
import {GameError} from '../../src/errors.js';

export type Scenario='quiet'|'attacked'|'interrupted';
export function offlineSlot(slot:number){return [2,14].some(day=>slot>=day*288+24&&slot<(day+1)*288+24);}
export function distribution(values:number[]){
 const sorted=[...values].sort((a,b)=>a-b),at=(p:number)=>sorted[Math.floor((sorted.length-1)*p)]??0;
 return {min:at(0),p10:at(.1),median:at(.5),p90:at(.9),max:at(1),sum:values.reduce((a,b)=>a+b,0)};
}
interface Count{queries:number;transactions:number;milliseconds:number;}
function measured(db:Database){
 let lane='observation';const counts:Record<string,Count>={};
 const wrap=(sql:Sql):Sql=>({query:async<T extends QueryResultRow>(q:string,v?:unknown[])=>{
  const c=counts[lane]??={queries:0,transactions:0,milliseconds:0};c.queries++;if(q==='BEGIN')c.transactions++;
  const started=performance.now();try{return await sql.query<T>(q,v);}finally{c.milliseconds+=performance.now()-started;}
 }});
 return {db:{...wrap(db),connect:async()=>{const c=await db.connect();return {...wrap(c),release:()=>c.release()};},end:()=>db.end()} as Database,
  counts,async inLane<T>(name:string,fn:()=>Promise<T>){lane=name;try{return await fn();}finally{lane='observation';}}};
}
async function snapshot(db:Database){
 const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(r=>String(r.table_name));
 const data:Record<string,unknown[]>={};for(const table of tables){assert.match(table,/^[a-z_]+$/);data[table]=(await db.query('SELECT row_to_json(t) AS row FROM "'+table+'" t')).rows.map(r=>r.row);}
 return {data,sequence:(await db.query('SELECT last_value,is_called FROM land_purchase_sequence')).rows[0]!};
}
async function restoreFixture(db:Database,fixture:Awaited<ReturnType<typeof snapshot>>){
 // Identical local test snapshot for paired scenarios. Trigger suspension is
 // confined to this fixture-copy transaction, never simulated gameplay.
 await transaction(db,async sql=>{
  await sql.query('SET LOCAL session_replication_role=replica');
  const tables=Object.keys(fixture.data);await sql.query('TRUNCATE '+tables.map(t=>'"'+t+'"').join(',')+' CASCADE');
  for(const table of tables)if(fixture.data[table]!.length)await sql.query('INSERT INTO "'+table+'" SELECT * FROM json_populate_recordset(NULL::"'+table+'",$1)',[JSON.stringify(fixture.data[table])]);
  await sql.query("SELECT setval('land_purchase_sequence',$1,$2)",[fixture.sequence.last_value,fixture.sequence.is_called]);
 });
 assert.equal((await db.query('SHOW session_replication_role')).rows[0]!.session_replication_role,'origin');
 const actual=await snapshot(db);
 for(const table of Object.keys(fixture.data))assert.deepEqual(actual.data[table]!.map(r=>JSON.stringify(r)).sort(),fixture.data[table]!.map(r=>JSON.stringify(r)).sort(),table+' identical source');
 assert.deepEqual(actual.sequence,fixture.sequence);
}
export async function botStates(db:Database){
 const rows=(await db.query(`SELECT c.*,b.tier,b.variant,w.balance AS gold,v.balance AS vault,m.hourly_rate,m.reserve_gold,m.arrears_gold,m.paused,
  COALESCE((SELECT sum(quantity) FROM army_stacks a WHERE a.character_id=c.id),0)::int AS units
  FROM characters c JOIN development_bots b ON b.character_id=c.id JOIN wallets w ON w.character_id=c.id
  JOIN vault_accounts v ON v.character_id=c.id JOIN maintenance_accounts m ON m.character_id=c.id ORDER BY c.attained_level,b.tier,b.variant`)).rows;
 const inventories=(await db.query('SELECT i.character_id,i.item_definition_id AS id,i.id AS "inventoryId",i.quantity FROM inventory_entries i JOIN development_bots b ON b.character_id=i.character_id')).rows;
 const holdings=(await db.query(`SELECT h.character_id,h.property_id,sum(h.quantity)::int AS quantity,sum(h.quantity*(h.hourly_income-h.hourly_upkeep))::int AS net
  FROM land_holdings h JOIN development_bots b ON b.character_id=h.character_id WHERE h.quantity>0 GROUP BY h.character_id,h.property_id`)).rows;
 return rows.map(r=>{
  const inventory=inventories.filter(i=>i.character_id===r.id).map(i=>({...alpha.items.find(a=>a.id===i.id)!,inventoryId:String(i.inventoryId),quantity:Number(i.quantity)}));
  const land=holdings.filter(h=>h.character_id===r.id),propertyNet=land.reduce((n,h)=>n+Number(h.net),0);
  const participants=Math.min(refinements.bots.armyCap,activeArmy(r.attained_level,Math.min(r.units,refinements.bots.armyCap-1),0,Math.min(r.legacy_army_floor,refinements.bots.armyCap)).participants);
  const attack=selectEquipment(inventory,participants,'attack',!r.paused),defense=selectEquipment(inventory,participants,'defense',!r.paused);
  return {id:String(r.id),name:String(r.name),accountId:String(r.account_id),level:Number(r.attained_level),tier:String(r.tier),variant:Number(r.variant),
   gold:Number(r.gold),vault:Number(r.vault),reserve:String(r.reserve_gold),rate:Number(r.hourly_rate),arrears:String(r.arrears_gold),paused:Boolean(r.paused),
   participants,propertyNet,net:propertyNet-Number(r.hourly_rate),inventory,holdings:Object.fromEntries(land.map(h=>[h.property_id,Number(h.quantity)])) as Record<string,number>,
   equipmentAttack:attack.attack,equipmentDefense:defense.defense};
 });
}
async function finance(db:Database){
 const r=(await db.query(`SELECT (SELECT sum(balance)::text FROM wallets) AS gold,(SELECT sum(reserve_gold)::text FROM maintenance_accounts) AS reserve,
  (SELECT COALESCE(sum(pending_gold),0)::text FROM land_accounts) AS retained,
  (SELECT COALESCE(sum(e.amount),0)::text FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE t.reason='land_income') AS income,
  (SELECT COALESCE(sum(charged_gold),0)::text FROM maintenance_events WHERE reason='accrual') AS upkeep,
  (SELECT COALESCE(-sum(e.amount),0)::text FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE t.reason IN('land_purchase','equipment_purchase')) AS purchases`)).rows[0]!;
 return Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Number(v)])) as Record<string,number>;
}
export function requireLocalSimulationDatabase(value:string|undefined){
 if(!value)throw new Error('A local disposable TEST_DATABASE_URL is required.');
 const u=new URL(value);
 if(!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!u.pathname.endsWith('_test')||[...u.searchParams].some(([k,v])=>k!=='host'||v!=='/tmp/kingdom-phase5-pg-socket'))throw new Error('Only a local disposable *_test database is accepted.');
}
export async function runLongTerm(options:{days:number;scenarios:Scenario[];onProgress?:(s:string)=>void;onCheckpoint?:(scenario:Scenario,checkpoint:unknown)=>Promise<void>}){
 requireLocalSimulationDatabase(testDatabaseUrl);
 assert.ok(Number.isInteger(options.days)&&options.days>=1&&options.days<=30);
 let now=new Date('2052-05-01T00:00:00Z');const start=+now,r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});
 try{
  const witness=await r.player('Uninvolved Existing Human');await r.prepare(witness,30000,30);
  await r.ok(witness,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:2});await r.ok(witness,'/api/v1/vault/deposits',{amount:1000});await r.ok(witness,'/api/v1/tutorial',{action:'skip'});
  const attackers=[];
  for(const level of[5,10,20,30,40,50]){
   const p=await r.player('Synthetic Attacker '+level),xp=Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0);
   await r.prepare(p,250000,xp);await r.legacyArmy(p,3);
   for(const category of['weapon','armor','spell']){const item=alpha.items.filter(i=>i.category===category&&i.level<=level).sort((a,b)=>b.attack-a.attack||b.defense-a.defense)[0]!;await r.ok(p,'/api/v1/inventory/purchases',{itemId:item.id,quantity:4});}
   attackers.push(p);
  }
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});await transaction(r.db,reconcileLevelMilestones);
  // Optional local test storage placement; no row or economic rule changes.
  const tablespace=process.env.PHASE5_TEST_TABLESPACE;
  if(tablespace){
   assert.match(tablespace,/^phase5_[a-z_]+$/);
   for(const table of['land_income_settlements','land_partial_settlements','economy_entries','economy_transactions','maintenance_events','treasury_retained_events','bot_finance_events'])await r.db.query('ALTER TABLE '+table+' SET TABLESPACE '+tablespace);
  }
  const fixture=await snapshot(r.db),initial=await botStates(r.db),initialFinance=await finance(r.db),ids=initial.map(b=>b.id);
  assert.equal(ids.length,450);const baseWindow=economyWindow(now),reports=[];
  for(const scenario of options.scenarios){
   now=new Date(start);await restoreFixture(r.db,fixture);const measuredDb=measured(r.db),db=measuredDb.db;
   const attacks={attempted:0,wins:0,losses:0,gold:0,xp:0,levelUps:0,spiritSpent:0,blocked:{} as Record<string,number>};
   let missedCandidates=0,capacityMisses=0,parallelTicks=0,replayChecks=0,maxReceiptsPerSlot=0,restartCatchups=0;
   const checkpoints=[],began=performance.now();let wasOffline=false;
   for(let slot=0;slot<options.days*288;slot++){
    now=new Date(start+slot*livingEconomy.intervalMs);const window=baseWindow+slot,candidates=economyCandidates(ids,window);
    capacityMisses+=ids.filter(id=>decisionSlot(id)===window%144).length-candidates.length;
    if(scenario==='interrupted'&&offlineSlot(slot)){missedCandidates+=candidates.length;wasOffline=true;continue;}
    if(slot%12===0||wasOffline){
     await measuredDb.inLane('income',()=>Promise.all(Array.from({length:12},()=>settleDueBotIncome(db,true))));
     if(wasOffline){assert.equal((await measuredDb.inLane('income_replay',()=>settleDueBotIncome(db,true))).settled,0);restartCatchups++;wasOffline=false;}
    }
    const parallel=scenario==='interrupted'&&slot%12===0;
    await measuredDb.inLane('economy',()=>Promise.all(Array.from({length:parallel?3:1},()=>runBotEconomy(db,true))));if(parallel)parallelTicks++;
    if(parallel){
     const committed=(await db.query("SELECT count(*)::int AS n FROM command_receipts WHERE kind='bot_economy' AND command_id=ANY($1::uuid[])",[candidates.map(id=>economyCommand(id,window))])).rows[0]!.n as number;
     assert.ok(committed<=5);maxReceiptsPerSlot=Math.max(maxReceiptsPerSlot,committed);
     assert.equal((await measuredDb.inLane('economy_replay',()=>runBotEconomy(db,true))).purchased,0);replayChecks++;
    }
    // Six funded humans, 2h/day, one attempt per 5min. Half repeat a fixed
    // opponent, half rotate. No resource resets, heals, grants or forced wins.
    if(scenario==='attacked'&&slot%288>=120&&slot%288<144){
     for(const [index,p]of attackers.entries()){
      const level=(await db.query('SELECT attained_level FROM characters WHERE id=$1',[p.id])).rows[0]!.attained_level as number;
      const pool=initial.filter(b=>Math.abs(b.level-level)<=2);if(!pool.length){attacks.blocked.no_nearby_catalog=(attacks.blocked.no_nearby_catalog??0)+1;continue;}
      const target=pool[(slot%2?index:slot+index)%pool.length]!;attacks.attempted++;
      try{
       const result=await measuredDb.inLane('attacks',()=>executeCommand(db,p.accountId,randomUUID(),'attack',{targetCharacterId:target.id},{developmentBotsEnabled:true}));
       const b=(await db.query('SELECT result FROM battles WHERE id=$1',[result.battleId])).rows[0]!.result;
       if(b.outcome==='attacker_win')attacks.wins++;else attacks.losses++;
       attacks.gold+=b.loot;attacks.xp+=b.attackerXp;attacks.levelUps+=b.levelGained;attacks.spiritSpent+=b.spiritSpent;
      }catch(error){if(!(error instanceof GameError))throw error;attacks.blocked[error.code]=(attacks.blocked[error.code]??0)+1;}
     }
    }
    if((slot+1)%288===0){
     const day=(slot+1)/288;
     if([1,7,30,options.days].includes(day)){
      now=new Date(start+day*86400000);await measuredDb.inLane('income',()=>Promise.all(Array.from({length:12},()=>settleDueBotIncome(db,true))));
      const states=await botStates(db),f=await finance(db),delta=Object.fromEntries(Object.entries(f).map(([k,v])=>[k,v-initialFinance[k]!]));
      assert.equal(delta.gold!+delta.reserve!,delta.income!-delta.upkeep!-delta.purchases!,'Wallet/reserve conservation: actual Land credits minus upkeep and acquisitions; combat is a transfer');assert.equal(delta.retained,0);
      const decisions=(await db.query(`SELECT result->'plan'->>'kind' AS kind,result->'plan'->>'reason' AS reason,count(*)::int AS count,
       COALESCE(sum((result->'plan'->>'cost')::bigint),0)::text AS cost,COALESCE(sum((result->'plan'->>'topup')::bigint),0)::text AS topup
       FROM command_receipts WHERE kind='bot_economy' GROUP BY 1,2 ORDER BY 1,2`)).rows;
      const improved=states.filter(b=>{const a=initial.find(a=>a.id===b.id)!;return b.equipmentAttack>a.equipmentAttack||b.equipmentDefense>a.equipmentDefense;});
      const cohorts=([['1–10',1,10],['11–25',11,25],['26–50',26,50]] as const).map(([band,lo,hi])=>{
       const bots=states.filter(b=>b.level>=lo&&b.level<=hi),old=initial.filter(b=>b.level>=lo&&b.level<=hi);
       return {band,bots:bots.length,gold:distribution(bots.map(b=>b.gold)),initialGold:distribution(old.map(b=>b.gold)),netIncome:distribution(bots.map(b=>b.net)),initialNetIncome:distribution(old.map(b=>b.net)),improvedEquipment:bots.filter(b=>improved.some(a=>a.id===b.id)).length,
        medianEquipmentPowerGainPercent:distribution(bots.map(b=>{const a=initial.find(i=>i.id===b.id)!;return Math.round(10000*((b.equipmentAttack+b.equipmentDefense)/(a.equipmentAttack+a.equipmentDefense||1)-1))/100;})).median};
      });
      const examples=[5,15,25,40,50].map(level=>{
       const b=states.find(b=>b.level===level&&b.tier==='seasoned'&&b.variant===0)!,a=initial.find(a=>a.id===b.id)!;
       const view=(x:typeof b)=>({gold:x.gold,netHourly:x.net,land:Object.values(x.holdings).reduce((a,b)=>a+b,0),gear:x.inventory.reduce((n,i)=>n+i.quantity,0),equipmentAttack:x.equipmentAttack,equipmentDefense:x.equipmentDefense,reserve:x.reserve});
       return {name:b.name,level,before:view(a),after:view(b),holdings:b.holdings};
      });
      const usefulGear=states.map(b=>({bot:b,candidates:alpha.items.filter(item=>{
       const old=b.inventory.find(i=>i.id===item.id);if(item.level>b.level||(old?.quantity??0)>=alpha.limits.inventory)return false;
       const inventory=b.inventory.filter(i=>i.id!==item.id).concat({...item,inventoryId:old?.inventoryId??'planned',quantity:(old?.quantity??0)+1});
       return selectEquipment(inventory,b.participants,'attack').attack+selectEquipment(inventory,b.participants,'defense').defense>b.equipmentAttack+b.equipmentDefense;
      })}));
      const stalled=(await db.query(`SELECT count(*)::int n FROM (SELECT result->>'botId',bool_and(result->'plan'->>'kind'='wait') AS waiting FROM command_receipts
       WHERE kind='bot_economy' AND created_at>=$1 GROUP BY 1) q WHERE waiting`,[new Date(+now-Math.min(day,7)*86400000)])).rows[0]!.n;
      const perBot=(await db.query(`SELECT result->>'botId' AS id,count(*)::int AS decisions,
       count(*) FILTER(WHERE result->'plan'->>'kind'='land')::int AS land,
       count(*) FILTER(WHERE result->'plan'->>'kind'='equipment')::int AS gear FROM command_receipts WHERE kind='bot_economy' GROUP BY 1`)).rows;
      const phases=(await db.query(`SELECT CASE WHEN created_at<$1::timestamptz+interval '2 days' THEN 'days 1–2' WHEN created_at<$1::timestamptz+interval '7 days' THEN 'days 3–7' ELSE 'days 8–30' END phase,
       result->'plan'->>'kind' AS kind,count(*)::int n FROM command_receipts WHERE kind='bot_economy' GROUP BY 1,2 ORDER BY 1,2`,[new Date(start)])).rows;
      const journalRows=(await db.query(`SELECT (SELECT count(*)::int FROM land_income_settlements) full_settlements,
       (SELECT count(*)::int FROM land_partial_settlements) partial_settlements,(SELECT count(*)::int FROM land_holdings) holdings,
       (SELECT count(*)::int FROM maintenance_events) maintenance_events,(SELECT count(*)::int FROM bot_finance_events) bot_finance_events`)).rows[0]!;
      const maxPerSlot=(await db.query(`SELECT max(n)::int n FROM (SELECT count(*) n FROM command_receipts WHERE kind='bot_economy' GROUP BY result->>'window') q`)).rows[0]!.n;
      assert.ok(maxPerSlot<=5);
      assert.equal((await db.query(`SELECT count(*)::int n FROM command_receipts WHERE kind='bot_economy' AND result->'plan'->>'kind'<>'wait'
       AND ((result->>'goldAfter')::bigint<>(result->>'goldBefore')::bigint-(result->'plan'->>'cost')::bigint-(result->'plan'->>'topup')::bigint
        OR (result->'plan'->>'cost')::bigint+(result->'plan'->>'topup')::bigint>least(5000,floor((result->>'goldBefore')::numeric*.05),2*((result->>'propertyNetBefore')::bigint-(result->>'upkeepBefore')::bigint)))`)).rows[0]!.n,0);
      assert.ok((await db.query('SELECT min(balance)::int n FROM wallets')).rows[0]!.n>=0);
      const purchaseDistribution={decisions:distribution(ids.map(id=>Number(perBot.find(p=>p.id===id)?.decisions??0))),land:distribution(ids.map(id=>Number(perBot.find(p=>p.id===id)?.land??0))),gear:distribution(ids.map(id=>Number(perBot.find(p=>p.id===id)?.gear??0))),botsWithoutAnyPurchase:ids.filter(id=>{const b=perBot.find(p=>p.id===id);return !b||b.land+b.gear===0;}).length};
      const checkpoint={day,purchaseDistribution,phases,journalRows,maximumCommittedDecisionsPerSlot:maxPerSlot,finance:delta,decisions,gold:distribution(states.map(b=>b.gold)),netHourly:distribution(states.map(b=>b.net)),equipmentImprovedBots:improved.length,
       hardOwnershipCappedBots:states.filter(b=>Object.values(b.holdings).some(n=>n>=alpha.limits.property)||b.inventory.some(i=>i.quantity>=alpha.limits.inventory)).length,
       botsWithOnlyWaitsInLastSevenDays:stalled,botsAtBestUnlockedEquipment:usefulGear.filter(g=>!g.candidates.length).length,
       botsWhoseUsefulGearAllCostsAbove5000:usefulGear.filter(g=>g.candidates.length&&g.candidates.every(i=>i.price>5000)).length,
       maximumOwnedProperty:Math.max(...states.flatMap(b=>Object.values(b.holdings))),maximumOwnedEquipment:Math.max(...states.flatMap(b=>b.inventory.map(i=>i.quantity))),
       pausedBots:states.filter(b=>b.paused||BigInt(b.arrears)>0n).length,cohorts,examples,attacks:structuredClone(attacks),scheduling:{missedCandidates,capacityMisses,parallelTicks,replayChecks,maxReceiptsPerSlot,restartCatchups},workload:structuredClone(measuredDb.counts),elapsedSeconds:Math.round((performance.now()-began)/1000)};
      checkpoints.push(checkpoint);await options.onCheckpoint?.(scenario,checkpoint);options.onProgress?.(scenario+' day '+day+': '+JSON.stringify({decisions,gold:checkpoint.gold.sum,improved:improved.length,seconds:checkpoint.elapsedSeconds}));
     }else options.onProgress?.(scenario+' day '+day+' complete');
    }
   }
   for(const table of['accounts','sessions','vault_accounts','development_bots','development_bot_estates','army_stacks','army_links','bounties','realm_messages','rulesets','schema_migrations']){
    const current=(await r.db.query('SELECT row_to_json(t) AS row FROM "'+table+'" t')).rows.map(x=>x.row);
    assert.deepEqual(current.map(x=>JSON.stringify(x)).sort(),fixture.data[table]!.map(x=>JSON.stringify(x)).sort(),table+' preserved');
   }
   for(const table of['economy_transactions','economy_entries','inventory_lots','land_income_settlements','land_partial_settlements','inventory_transactions','maintenance_events','maintenance_rate_events','command_receipts','battles']){
    if(!fixture.data[table]!.length)continue;
    assert.equal((await r.db.query('SELECT count(*)::int n FROM (SELECT * FROM json_populate_recordset(NULL::"'+table+'",$1) EXCEPT SELECT * FROM "'+table+'") old',[JSON.stringify(fixture.data[table])])).rows[0]!.n,0,table+' original records retained');
   }
   const final=await botStates(r.db);assert.deepEqual(final.map(b=>[b.id,b.name,b.level,b.participants,b.vault]),initial.map(b=>[b.id,b.name,b.level,b.participants,b.vault]));
   for(const table of['characters','wallets','inventory_entries','land_holdings','maintenance_accounts']){
    const rows=(await r.db.query('SELECT row_to_json(t) row FROM "'+table+'" t WHERE '+(table==='characters'?'id':'character_id')+'=$1',[witness.id])).rows.map(r=>r.row);
    assert.deepEqual(rows,fixture.data[table]!.filter((r:any)=>(table==='characters'?r.id:r.character_id)===witness.id),table+' uninvolved human preserved');
   }
   reports.push({scenario,checkpoints,preservation:true,initialFixtureHash:createHash('sha256').update(JSON.stringify(fixture)).digest('hex')});
  }
  return {policy:livingEconomy,days:options.days,population:450,humans:7,engine:'Real PostgreSQL worker, hourly income via 12 cooperating sweepers and actual combat commands',productionContacted:false,initial:{gold:distribution(initial.map(b=>b.gold)),netHourly:distribution(initial.map(b=>b.net)),finance:initialFinance},reports};
 }finally{await r.close();}
}
