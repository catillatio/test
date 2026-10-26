import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import type {QueryResultRow} from 'pg';
import {realm,testDatabaseUrl} from './helpers.js';
import {transaction,type Database,type Sql} from '../src/db.js';
import {settleLand,accrueHolding,type HoldingRow} from '../src/land.js';
import {legacySettleLand,legacyAccrueHolding} from './fixtures/phase5-legacy-settlement.js';
import {provisionBots} from '../src/development.js';
import {lockCharacters} from '../src/game.js';
import {buyEstate,sellEstate} from '../src/estate.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {settleDueBotIncome} from '../src/bot-income.js';
import {executeCommand} from '../src/commands.js';
import {GameError} from '../src/errors.js';
import {activityFeed} from '../src/feeds.js';

const epoch=new Date('2053-06-01T00:00:00Z'),hour=3600000;
const fakeHolding=(overrides:Partial<HoldingRow>={}):HoldingRow=>({id:randomUUID(),character_id:randomUUID(),property_id:'smallholding',property_name:'Saved property',ruleset_id:alpha.id,quantity:1,unit_price:60,hourly_income:8,hourly_upkeep:1,interval_seconds:3600,acquired_at:epoch,accrued_through:epoch,...overrides});

test('batched accrual preserves exact integers, zero/future cursors and fails closed on a missing cursor update',async()=>{
 const calls:{text:string;rows:any[]}[]=[];
 const sql:Sql={query:async<T extends QueryResultRow>(text:string,values?:unknown[])=>{
  const rows=JSON.parse(String(values![0]));calls.push({text,rows});return {rows:[],rowCount:rows.length,command:'UPDATE',oid:0,fields:[]} as any;
 }};
 const b=fakeHolding({quantity:1000000,hourly_income:1000000,income_remainder:'3599999',upkeep_remainder:'17'});
 const net=await accrueHolding(sql,b,new Date(+epoch+100000*hour+12345),'shared_cycle');
 assert.equal(net,(999999n*1000000n*BigInt(100000*hour+12345)+3599999n)/3600000n);
 assert.equal(calls.length,2);assert.match(calls[0]!.text,/INSERT INTO land_partial_settlements/);
 assert.equal(calls[0]!.rows[0]!.net_gold,net.toString());
 const count=calls.length;assert.equal(await accrueHolding(sql,b,epoch,'sale'),0n);assert.equal(await accrueHolding(sql,b,new Date(+epoch-1),'shared_cycle'),0n);assert.equal(calls.length,count);
 const broken:Sql={query:async()=>({rows:[],rowCount:0,command:'UPDATE',oid:0,fields:[]})};
 await assert.rejects(accrueHolding(broken,fakeHolding(),new Date(+epoch+hour),'shared_cycle'),/cursor mismatch/);
});

test('income sweep rechecks a stale joined candidate snapshot under its locks; a failed recheck rolls back without materialization',async()=>{
 const id=randomUUID();let fail=false;const calls:string[]=[];
 const query:Sql['query']=async<T extends QueryResultRow>(q:string,values?:unknown[])=>{
  calls.push(q);let rows:QueryResultRow[]=[];
  if(q==='SELECT clock_timestamp() AS now')rows=[{now:epoch}];
  else if(q.includes('JOIN development_bots'))rows=[{id}];
  else if(q.includes('WHERE c.id=ANY')){assert.deepEqual(values![1],[id]);if(fail)throw new Error('Synthetic eligibility read failure');}
  else assert.ok(['BEGIN','COMMIT','ROLLBACK','SELECT pg_advisory_xact_lock_shared($1)',"SELECT set_config('kingdom.expansion_writer',$1,true),set_config('kingdom.population_writer','level100-cohort-engine-1',true)"].includes(q),'stale candidates must not reach materialization or any write');
  return {rows:rows as T[],rowCount:rows.length,command:'SELECT',oid:0,fields:[]};
 };
 const db:Database={query,connect:async()=>({query,release:()=>{}}),end:async()=>{}};
 assert.equal((await settleDueBotIncome(db,true)).settled,0);assert.equal(calls.filter(q=>q.includes('WHERE c.id=ANY')).length,1);assert.equal(calls.at(-1),'COMMIT');
 calls.length=0;fail=true;await assert.rejects(settleDueBotIncome(db,true),/eligibility read failure/);assert.equal(calls.at(-1),'ROLLBACK');
});

async function snapshot(sql:Sql){
 const result:Record<string,string[]>={};
 for(const {table_name:table} of(await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows){
  assert.match(table,/^[a-z_]+$/);result[table]=(await sql.query('SELECT row_to_json(t)::text AS row FROM "'+table+'" t')).rows.map(r=>r.row).sort();
 }
 return result;
}
async function normalized(sql:Sql){
 const result:Record<string,unknown[]>={};
 for(const table of['land_holdings','income_cycles','land_accounts','wallets'])result[table]=(await sql.query('SELECT to_jsonb(t) AS row FROM '+table+' t')).rows.map(r=>JSON.stringify(r.row)).sort();
 for(const table of['land_income_settlements','land_partial_settlements'])result[table]=(await sql.query("SELECT to_jsonb(t)-'created_at' AS row FROM "+table+' t')).rows.map(r=>JSON.stringify(r.row)).sort();
 result.transactions=(await sql.query('SELECT command_id,reason,ruleset_id FROM economy_transactions')).rows.map(r=>JSON.stringify(r)).sort();
 result.entries=(await sql.query('SELECT e.character_id,e.amount,e.balance_after,t.reason,t.ruleset_id,t.command_id FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id')).rows.map(r=>JSON.stringify(r)).sort();
 result.retained=(await sql.query("SELECT to_jsonb(t)-'id'-'created_at' AS row FROM treasury_retained_events t")).rows.map(r=>JSON.stringify(r.row)).sort();
 return result;
}

test('populated Land settlement differential: exact receipts, cents/remainders, overflow, bounded writes, rollback, concurrency and preservation',
 {skip:!testDatabaseUrl,timeout:180000},async()=>{
 let now=new Date(epoch);const r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});
 try{
  const human=await r.player('Existing Land Owner'),witness=await r.player('Uninvolved Account');
  await r.prepare(human,1000000000,Array.from({length:49},(_,i)=>levelRequirement(i+1)).reduce((n,x)=>n+x,0));
  await r.prepare(witness,30000,30);await r.ok(witness,'/api/v1/vault/deposits',{amount:1000});await r.ok(witness,'/api/v1/settings/sound',{enabled:'1',volume:37});
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  const ids=(await r.db.query<{id:string}>('SELECT character_id AS id FROM development_bots ORDER BY character_id')).rows.map(r=>r.id);
  // Preparation boundary for Milestone 2: the browser/player command path
  // still rejects registered bot actors, regardless of the rival flag. No
  // login-enabling shortcut or autonomous attack path is introduced here.
  const guarded=await snapshot(r.db),botAccount=(await r.db.query('SELECT account_id FROM characters WHERE id=$1',[ids[0]])).rows[0]!.account_id;
  for(const enabled of[false,true])await assert.rejects(executeCommand(r.db,botAccount,randomUUID(),'attack',{targetCharacterId:ids[1]},{developmentBotsEnabled:enabled}),(e:unknown)=>e instanceof GameError&&e.code==='CHARACTER_NOT_FOUND');
  assert.deepEqual(await snapshot(r.db),guarded,'bot actor rejection rolls back even its command receipt');
  const durability=(await r.db.query("SELECT current_setting('fsync') AS fsync,current_setting('synchronous_commit') AS synchronous_commit,current_setting('full_page_writes') AS full_page_writes")).rows[0]!;
  const results:any[]=[];
  async function compare(label:string,at:Date,characters:string[]){
   const prior=await normalized(r.db),existingReceipts=prior.land_income_settlements!.length+prior.land_partial_settlements!.length;
   const variants:{name:string;trial:number;queries:number;settlementInserts:number;cursorUpdates:number;maxPayload:number;rows:number;durableRows:Record<string,number>;holdingRowsUpdated:number;milliseconds:number}[]=[];let expected:Awaited<ReturnType<typeof normalized>>|null=null;
   for(let trial=0;trial<3;trial++)for(const [name,settler]of[['legacy',legacySettleLand],['batched',settleLand]] as const){
    const client=await r.db.connect();let calls=0,settlementInserts=0,cursorUpdates=0,holdingRowsUpdated=0,maxPayload=0;
    const measured:Sql={query:async<T extends QueryResultRow>(q:string,v?:unknown[])=>{
     calls++;if(q.startsWith('INSERT INTO land_income_settlements')||q.startsWith('INSERT INTO land_partial_settlements'))settlementInserts++;
     if(q.startsWith('UPDATE land_holdings'))cursorUpdates++;
     if(q.includes('jsonb_to_recordset'))maxPayload=Math.max(maxPayload,JSON.parse(String(v![0])).length);
     const value=await client.query<T>(q,v);if(q.startsWith('UPDATE land_holdings'))holdingRowsUpdated+=value.rowCount??0;return value;
    }};
    try{
     await client.query('BEGIN');const started=performance.now();
     for(const id of characters){await lockCharacters(measured,[id]);await settler(measured,id,at);}
     const milliseconds=performance.now()-started,actual=await normalized(client);
     if(expected)assert.deepEqual(actual,expected,label+' exact financial state and every full/partial receipt');else expected=actual;
     const receipts=actual.land_income_settlements!.length+actual.land_partial_settlements!.length-existingReceipts;
     variants.push({name,trial,queries:calls,settlementInserts,cursorUpdates,maxPayload,rows:receipts,holdingRowsUpdated,durableRows:{settlements:receipts,ledgerTransactions:actual.transactions!.length-prior.transactions!.length,ledgerEntries:actual.entries!.length-prior.entries!.length,retainedEvents:actual.retained!.length-prior.retained!.length},milliseconds});
     if(name==='batched'){assert.ok(maxPayload<=250);assert.ok(calls<(variants.find(v=>v.name==='legacy')!.queries));}
    }finally{await client.query('ROLLBACK');client.release();}
   }
   const summarize=(name:string)=>{const rows=variants.filter(v=>v.name===name);return {...rows[0]!,milliseconds:rows.map(v=>v.milliseconds).sort((a,b)=>a-b)[1]!,samples:rows.map(v=>v.milliseconds)};};
   const before=summarize('legacy'),after=summarize('batched');assert.equal(before.rows,after.rows);assert.deepEqual(before.durableRows,after.durableRows);assert.equal(before.holdingRowsUpdated,after.holdingRowsUpdated);
   results.push({label,characters:characters.length,before,after,sqlReductionPercent:100*(1-after.queries/before.queries),latencyReductionPercent:100*(1-after.milliseconds/before.milliseconds)});
  }
  await compare('450 original bot portfolios, first hour',new Date(+epoch+hour),ids);
  // Real paid acquisitions form a larger saved-lot fixture. These test-only
  // purchases use the normal catalog, affordability, ledger and limits. They
  // do not change the autonomous policy or grant resources during the test.
  for(const minute of[1,30,59])await transaction(r.db,async sql=>{
   const at=new Date(+epoch+minute*60000);
   for(const row of await lockCharacters(sql,ids))await buyEstate(sql,row.id,row.attained_level,'smallholding',3,randomUUID(),at);
  });
  // One human has >250 real acquisition lots to exercise bounded chunks and
  // quantities at the ordinary property limit. Keep the saved payment clock.
  await transaction(r.db,async sql=>{
   await lockCharacters(sql,[human.id]);
   for(const property of alpha.properties.slice(0,6))for(let n=0;n<2;n++)await buyEstate(sql,human.id,50,property.id,25,randomUUID(),epoch);
  });
  // Retain a genuine earlier payment from the frozen implementation. The
  // optimized path must append the next ranges without rewriting these rows.
  await transaction(r.db,async sql=>{for(const row of await lockCharacters(sql,ids))await legacySettleLand(sql,row.id,new Date(+epoch+hour));});
  // Genuine legacy multi-unit lot, fractional remainders, a cursor in the
  // future, and near-full wallet exercise compatibility rather than reseeding.
  await r.db.query('UPDATE land_holdings SET quantity=3,original_quantity=3,income_remainder=123456,upkeep_remainder=234567 WHERE id=(SELECT id FROM land_holdings WHERE character_id=$1 LIMIT 1)',[human.id]);
  await r.db.query('UPDATE land_holdings SET accrued_through=$2 WHERE id=(SELECT id FROM land_holdings WHERE character_id=$1 ORDER BY id LIMIT 1)',[ids[0],new Date(+epoch+8*24*hour)]);
  await r.db.query('UPDATE wallets SET balance=2147483640 WHERE character_id=$1',[human.id]);
  await r.db.query("UPDATE land_holdings SET accrued_through=accrued_through+interval '123 microseconds' WHERE id=(SELECT id FROM land_holdings WHERE character_id=$1 ORDER BY id LIMIT 1)",[human.id]);
  await compare('mature paid lots, 1/30/59 minute purchases and seven-day downtime',new Date(+epoch+7*24*hour),[...ids,human.id]);
  const before=await snapshot(r.db),feed=await activityFeed(r.db,witness.id,'all');
  // A failure at any write stage rolls back receipts, cursors, retained gold
  // and ledger together. Also test failure after a real wallet credit.
  for(const point of['INSERT INTO land_income_settlements','INSERT INTO land_partial_settlements','UPDATE land_holdings','INSERT INTO economy_entries','cursor_mismatch']){
   let injected=false;
   await assert.rejects(transaction(r.db,async sql=>{
    await lockCharacters(sql,[ids[1]!]);const failing:Sql={query:async<T extends QueryResultRow>(q:string,v?:unknown[])=>{const value=await sql.query<T>(q,v);if(point==='cursor_mismatch'&&q.startsWith('UPDATE land_holdings')){injected=true;return {...value,rowCount:0};}if(q.startsWith(point)){injected=true;throw new Error('Synthetic settlement write failure');}return value;}};
    await settleLand(failing,ids[1]!,new Date(+epoch+7*24*hour));
   }),/Synthetic settlement write failure|cursor mismatch/);assert.ok(injected);assert.deepEqual(await snapshot(r.db),before);
  }
  // The singleton sale path uses identical arithmetic and still records each
  // partial lot; no automatic hourly payment is invented by a sale.
  const holding=(await r.db.query<HoldingRow>('SELECT * FROM land_holdings WHERE character_id=$1 AND quantity>0 ORDER BY acquired_at,purchase_order,id LIMIT 1',[human.id])).rows[0]!;
  let saleExpected:Awaited<ReturnType<typeof normalized>>|null=null;
  for(const accrue of[legacyAccrueHolding,accrueHolding]){
   const c=await r.db.connect();try{await c.query('BEGIN');await lockCharacters(c,[human.id]);await c.query('SELECT id FROM land_holdings WHERE id=$1 FOR UPDATE',[holding.id]);await accrue(c,holding,new Date(+epoch+30*60000),'sale');const value=await normalized(c);if(saleExpected)assert.deepEqual(value,saleExpected);saleExpected=value;}finally{await c.query('ROLLBACK');c.release();}
  }
  now=new Date(+epoch+7*24*hour);
  const sweeps=await Promise.all(Array.from({length:3},()=>settleDueBotIncome(r.db,true)));
  assert.equal(sweeps.reduce((n,s)=>n+s.settled,0),450);
  const paid=await snapshot(r.db);assert.equal((await settleDueBotIncome(r.db,true)).settled,0);assert.deepEqual(await snapshot(r.db),paid,'income replay is read-only');
  for(const table of['accounts','sessions','vault_accounts','army_stacks','army_links','inventory_entries','battles','bounties','realm_messages','development_bots','rulesets','schema_migrations'])assert.deepEqual(paid[table],before[table],table+' preserved');
  for(const table of['economy_transactions','economy_entries','land_income_settlements','land_partial_settlements','maintenance_events','treasury_retained_events']){const saved=new Set(paid[table]);for(const row of before[table]!)assert.ok(saved.has(row),table+' historical row preserved');}
  const humanRows=(data:Record<string,string[]>)=>Object.fromEntries(Object.entries(data).map(([t,rows])=>[t,rows.filter(row=>[human.id,human.accountId,witness.id,witness.accountId].some(id=>row.includes(id)))]));
  assert.deepEqual(humanRows(paid),humanRows(before),'bot sweep preserves both humans, including nearly full treasury and 300 paid lots');
  assert.deepEqual(await activityFeed(r.db,witness.id,'all'),feed);
  // Actual buy/sell still preserves FIFO recorded prices and fractional pay.
  await transaction(r.db,async sql=>{await lockCharacters(sql,[human.id]);await settleLand(sql,human.id,now);await sellEstate(sql,human.id,'smallholding',1,randomUUID(),now);});
  assert.ok(BigInt((await r.db.query('SELECT pending_gold FROM land_accounts WHERE character_id=$1',[human.id])).rows[0]!.pending_gold)>0n);
  assert.equal((await r.me(witness)).id,witness.id,'existing authenticated session works');
  await mkdir('test-results',{recursive:true});await writeFile('test-results/phase5-settlement.json',JSON.stringify({postgres:'18',durability,trials:3,method:'same populated fixture; rollback each benchmark; median settlement execution wall time excludes COMMIT and observation; no transport-delay injection',results,preservation:'PASS',rollbackStages:5,multiWorkerBots:450},null,2)+'\n');
 }finally{await r.close();}
});
