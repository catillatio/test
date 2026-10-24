import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl,type Player} from './helpers.js';import {transaction,type Database} from '../src/db.js';
import {ledger} from '../src/economy.js';import {getState,lockCharacters} from '../src/game.js';import {alpha} from '../src/alpha-rules.js';
const skip=!testDatabaseUrl,start=new Date('2038-01-01T00:00:00Z');
type Fixture={income:number;rate:number;cash:number;reserve:number;arrears?:number;paused?:boolean};
async function saved(r:Awaited<ReturnType<typeof realm>>,p:Player,f:Fixture){
 await transaction(r.db,async sql=>{
  await lockCharacters(sql,[p.id]);const wallet=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[p.id])).rows[0]!.balance;
  await ledger(sql,null,'test_fixture',[{characterId:p.id,amount:f.cash-wallet}],alpha.id);
  await sql.query('UPDATE maintenance_accounts SET hourly_rate=$2,reserve_gold=$3,arrears_gold=$4,paused=$5,remainder=0,settled_at=$6 WHERE character_id=$1',[p.id,f.rate,f.reserve,f.arrears??0,!!f.paused,start]);
  await sql.query(`INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through)
   VALUES($1,$2,'smallholding','Saved historic holding','alpha-0.3',1,1,100,$3,0,3600,$4,$4)`,[randomUUID(),p.id,f.income,start]);
  await sql.query('INSERT INTO income_cycles(character_id,next_payment_at) VALUES($1,$2) ON CONFLICT(character_id) DO UPDATE SET next_payment_at=EXCLUDED.next_payment_at',[p.id,new Date(+start+3600000)]);
 });
}
async function snapshot(db:Database,id:string){const result:Record<string,unknown[]>={};
 for(const [table,column]of [['wallets','character_id'],['land_accounts','character_id'],['land_holdings','character_id'],['income_cycles','character_id'],['maintenance_accounts','character_id'],['maintenance_events','character_id'],['economy_entries','character_id']] as const)
  result[table]=(await db.query('SELECT row_to_json(t) AS row FROM '+table+' t WHERE '+column+'=$1 ORDER BY row_to_json(t)::text',[id])).rows.map(x=>x.row);
 return result;
}
for(const [label,f,hours,wallet,reserve,arrears,paused]of [
 ['surplus',{income:30,rate:10,cash:0,reserve:10},1,20,10,0,false],
 ['equal income',{income:10,rate:10,cash:0,reserve:10},1,0,10,0,false],
 ['insufficient income',{income:4,rate:10,cash:0,reserve:10},2,0,0,2,true],
 ['combined wallet',{income:4,rate:10,cash:20,reserve:0},1,4,10,0,false],
 ['paused arrears',{income:30,rate:10,cash:0,reserve:0,arrears:10,paused:true},1,10,10,0,false],
 ['existing reserve credit',{income:0,rate:10,cash:0,reserve:25,arrears:10,paused:true},1,0,15,0,false],
 ['offline catchup',{income:30,rate:10,cash:0,reserve:10},4,80,10,0,false],
] as const)test('shared settlement automatically funds upkeep conservatively: '+label,{skip},async()=>{
 let now=start;const r=await realm({isolated:true,clock:()=>now});try{
  const p=await r.player('Upkeep '+label.slice(0,20));await saved(r,p,f);
  const vaultBefore=(await r.db.query('SELECT * FROM vault_accounts WHERE character_id=$1',[p.id])).rows;
  now=new Date(+start+hours*3600000);const state=await r.me(p);
  assert.deepEqual([state.gold,state.maintenance.reserveGold,state.maintenance.arrearsGold,state.maintenance.paused],[wallet,String(reserve),String(arrears),paused]);
  const earned=BigInt((await r.db.query('SELECT COALESCE(sum(net_gold),0)::text AS n FROM land_income_settlements WHERE holding_id IN(SELECT id FROM land_holdings WHERE character_id=$1)',[p.id])).rows[0]!.n);
  assert.equal(earned,BigInt(f.income*hours));
  const expense=BigInt((await r.db.query('SELECT COALESCE(sum(charged_gold),0)::text AS n FROM maintenance_events WHERE character_id=$1',[p.id])).rows[0]!.n);
  assert.equal(BigInt(state.gold)+BigInt(state.maintenance.reserveGold),BigInt(f.cash+f.reserve)+earned-expense);
  assert.equal(BigInt((await r.db.query('SELECT sum(amount)::text AS n FROM economy_entries WHERE character_id=$1',[p.id])).rows[0]!.n),BigInt(state.gold));
  assert.deepEqual((await r.db.query('SELECT * FROM vault_accounts WHERE character_id=$1',[p.id])).rows,vaultBefore);
  const settled=await snapshot(r.db,p.id);await Promise.all([r.me(p),r.me(p),r.me(p)]);assert.deepEqual(await snapshot(r.db,p.id),settled);
 }finally{await r.close();}
});

test('paused liabilities are retained until actual funds cover arrears and the existing reserve requirement',{skip},async()=>{
 let now=start;const r=await realm({isolated:true,clock:()=>now});try{
  const p=await r.player('Paused Income');await saved(r,p,{income:10,rate:10,cash:0,reserve:0,arrears:10,paused:true});
  now=new Date(+start+3600000);let state=await r.me(p);assert.deepEqual([state.gold,state.maintenance.arrearsGold,state.maintenance.paused],[10,'10',true]);
  now=new Date(+start+7200000);state=await r.me(p);assert.deepEqual([state.gold,state.maintenance.arrearsGold,state.maintenance.reserveGold,state.maintenance.paused],[0,'0','10',false]);
  assert.equal((await r.db.query("SELECT count(*)::int n FROM maintenance_events WHERE character_id=$1 AND reason='fund'",[p.id])).rows[0]!.n,1);
 }finally{await r.close();}
});

test('raid before payment, concurrent settlement, inventory sale and replay preserve actual wallet/reserve accounting',{skip},async()=>{
 let now=start;const r=await realm({isolated:true,clock:()=>now});try{
  const p=await r.player('Raided Trader');await r.prepare(p,10000,2500);const item=alpha.items.find(i=>i.id==='ransackers-axe')!;
  await r.ok(p,'/api/v1/inventory/purchases',{itemId:item.id,quantity:1});
  // An explicit saved-world test fixture; all later spending/income uses real commands.
  const rate=(await r.me(p)).maintenance.hourlyRate;assert.ok(rate>0);
  await saved(r,p,{income:30,rate,cash:50,reserve:rate});
  await transaction(r.db,async sql=>{await lockCharacters(sql,[p.id]);await ledger(sql,null,'test_raid',[{characterId:p.id,amount:-50}],alpha.id);});
  const before=(await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[p.id])).rows[0]!.balance+rate;
  now=new Date(+start+3600000);const key=randomUUID();const results=await Promise.all([
   r.me(p),r.ok(p,'/api/v1/inventory/sales',{itemId:item.id,quantity:1},key),r.ok(p,'/api/v1/inventory/sales',{itemId:item.id,quantity:1},key),r.me(p)]);
  const sale=results[1],state=await r.me(p);assert.equal(state.maintenance.hourlyRate,0);assert.equal(state.gold,before+30-rate+sale.data.goldReceived);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM land_income_settlements WHERE holding_id IN(SELECT id FROM land_holdings WHERE character_id=$1)',[p.id])).rows[0]!.n,1);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM command_receipts WHERE account_id=$1 AND command_id=$2',[p.accountId,key])).rows[0]!.n,1);
 }finally{await r.close();}
});

test('next-payment forecast includes actual automatic reserve and arrears movements without counting them twice',{skip},async()=>{
 for(const f of [{income:30,rate:10,cash:0,reserve:10},{income:10,rate:10,cash:0,reserve:10},
  {income:4,rate:10,cash:20,reserve:0},{income:30,rate:10,cash:0,reserve:0,arrears:10,paused:true}]){
  let now=start;const r=await realm({isolated:true,clock:()=>now});try{
   const p=await r.player('Payment Forecast');await saved(r,p,f);const before=await r.me(p);
   now=new Date(+start+3600000);const after=await r.me(p);assert.equal(after.gold-before.gold,before.payment.gold);
   assert.equal(before.payment.automaticReserve,10);assert.equal(before.payment.arrearsPayment,f.arrears??0);
  }finally{await r.close();}
 }
});

test('an equipment purchase racing the hourly boundary charges the old rate once and survives state reconstruction',{skip},async()=>{
 let now=start;const r=await realm({isolated:true,clock:()=>now});try{
  const p=await r.player('Boundary Buyer');await r.prepare(p,10000,2500);const item=alpha.items.find(i=>i.id==='ransackers-axe')!;
  await r.ok(p,'/api/v1/inventory/purchases',{itemId:item.id,quantity:1});
  await saved(r,p,{income:30,rate:item.upkeep,cash:1000,reserve:item.upkeep});now=new Date(+start+3600000);
  const key=randomUUID();await Promise.all([r.me(p),r.ok(p,'/api/v1/inventory/purchases',{itemId:item.id,quantity:1},key),r.ok(p,'/api/v1/inventory/purchases',{itemId:item.id,quantity:1},key)]);
  const state=await r.me(p);assert.equal(state.inventory.find(i=>i.id===item.id)!.quantity,2);assert.equal(state.maintenance.hourlyRate,item.upkeep*2);
  assert.equal(state.gold+Number(state.maintenance.reserveGold),1000+30-item.price);
  assert.equal((await r.db.query('SELECT sum(charged_gold)::text n FROM maintenance_events WHERE character_id=$1 AND period_end_at>$2',[p.id,start])).rows[0]!.n,String(item.upkeep));
  const persisted=await snapshot(r.db,p.id);await getState(r.db,p.accountId);assert.deepEqual(await snapshot(r.db,p.id),persisted);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM command_receipts WHERE account_id=$1 AND command_id=$2',[p.accountId,key])).rows[0]!.n,1);
 }finally{await r.close();}
});

test('a capped purse retains overflow once and later releases only the legitimately earned remainder',{skip},async()=>{
 let now=start;const r=await realm({isolated:true,clock:()=>now});try{
  const p=await r.player('Retained Funding');await saved(r,p,{income:10,rate:10,cash:2147483647,reserve:10});now=new Date(+start+3600000);
  for(let n=0;n<4;n++){const state=await r.me(p);const retained=BigInt((await r.db.query('SELECT pending_gold FROM land_accounts WHERE character_id=$1',[p.id])).rows[0]!.pending_gold);
   assert.equal(BigInt(state.gold)+BigInt(state.maintenance.reserveGold)+retained,2147483657n);}
  assert.equal((await r.db.query('SELECT sum(net_gold)::text n FROM land_income_settlements WHERE holding_id IN(SELECT id FROM land_holdings WHERE character_id=$1)',[p.id])).rows[0]!.n,'10');
 }finally{await r.close();}
});

test('legitimate quest credit recovers paused gear once without a separate income or payment clock',{skip},async()=>{
 const r=await realm({isolated:true,clock:()=>start});try{
  const p=await r.player('Quest Recovery');await r.prepare(p,10000,2500);await r.ok(p,'/api/v1/inventory/purchases',{itemId:'ransackers-axe',quantity:1});
  await transaction(r.db,async sql=>{await lockCharacters(sql,[p.id]);const cash=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[p.id])).rows[0]!.balance;
   await ledger(sql,null,'test_fixture',[{characterId:p.id,amount:-cash}],alpha.id);await sql.query('UPDATE maintenance_accounts SET paused=true,reserve_gold=0,arrears_gold=1 WHERE character_id=$1',[p.id]);});
  const key=randomUUID(),result=await r.ok(p,'/api/v1/quests/border-patrol/runs',{},key),again=await r.ok(p,'/api/v1/quests/border-patrol/runs',{},key);
  assert.equal(result.commandId,again.commandId);const state=await r.me(p);assert.equal(state.gold,result.data.gold-2);assert.equal(state.maintenance.reserveGold,'1');assert.equal(state.maintenance.paused,false);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM income_cycles WHERE character_id=$1',[p.id])).rows[0]!.n,0);
 }finally{await r.close();}
});

test('a funding failure rolls back Land income, journals, cursors, reserves and wallet atomically',{skip},async()=>{
 let now=start;const r=await realm({isolated:true,clock:()=>now});try{
  const p=await r.player('Rollback Funding');await saved(r,p,{income:30,rate:10,cash:0,reserve:0,arrears:10,paused:true});const before=await snapshot(r.db,p.id);
  const failing:Database={query:(q,v)=>r.db.query(q,v),end:()=>Promise.resolve(),connect:async()=>{const c=await r.db.connect();return {release:()=>c.release(),query:async(q,v)=>{if(q.includes('INSERT INTO maintenance_events'))throw new Error('Synthetic funding interruption');return c.query(q,v);}};}};
  now=new Date(+start+3600000);await assert.rejects(getState(failing,p.accountId),/Synthetic funding interruption/);assert.deepEqual(await snapshot(r.db,p.id),before);
  const state=await r.me(p);assert.deepEqual([state.gold,state.maintenance.reserveGold,state.maintenance.arrearsGold],[10,'10','0']);
 }finally{await r.close();}
});
