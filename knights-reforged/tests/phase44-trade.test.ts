import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {createTradeQuote} from '../src/trade.js';
const skip=!testDatabaseUrl;
test('retained legacy Land quotes remain owner-bound, exact, single-use and idempotent under concurrent submissions',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player(),b=await r.player();await r.prepare(a,5000);await r.prepare(b,5000);
  const before=await r.me(a),quote=await createTradeQuote(r.db,a.accountId,'land_buy','smallholding',5);
  assert.equal((await r.me(a)).gold,before.gold);assert.equal(quote.amount,quote.state.land.properties.find(p=>p.id==='smallholding')!.priceSteps.slice(0,5).reduce((n,p)=>n+p,0));
  assert.equal(quote.projectedNet,35);
  const payload={propertyId:'smallholding',quantity:5,quoteId:quote.id};
  assert.equal((await r.command(b,'/api/v1/land/purchases',payload)).statusCode,409);
  const key=randomUUID();const [one,replay]=await Promise.all([r.command(a,'/api/v1/land/purchases',payload,key),r.command(a,'/api/v1/land/purchases',payload,key)]);
  assert.equal(one.statusCode,200,one.body);assert.equal(replay.statusCode,200,replay.body);
  assert.equal((await r.me(a)).gold,before.gold-quote.amount);assert.equal((await r.me(a)).land.properties.find(p=>p.id==='smallholding')!.owned,5);
  assert.equal((await r.command(a,'/api/v1/land/purchases',payload)).json().error.code,'QUOTE_USED');
  const sale=await createTradeQuote(r.db,a.accountId,'land_sell','smallholding',5),state=await r.me(a);
  assert.equal(sale.amount,state.land.properties.find(p=>p.id==='smallholding')!.saleRefundSteps[4]);assert.equal(sale.projectedNet,0);
  await r.ok(a,'/api/v1/land/sales',{propertyId:'smallholding',quantity:5,quoteId:sale.id});
  const sold=await r.me(a);assert.equal(sold.land.hourlyIncome,0);assert.ok(sold.gold>=before.gold-quote.amount+sale.amount);
  assert.equal((await r.db.query('SELECT next_payment_at FROM income_cycles WHERE character_id=$1',[a.id])).rows[0]!.next_payment_at.toISOString(),state.land.nextPaymentAt);
 }finally{await r.close();}
});
test('sale previews use saved legacy costs/rates and expired or stale quotes cannot charge a player',{skip},async()=>{
 let now=new Date('2035-01-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now});try{
  const a=await r.player();await r.prepare(a,5000);
  const expired=await createTradeQuote(r.db,a.accountId,'land_buy','smallholding',1);
  // createTradeQuote and commands both use the fixture server clock.
  now=new Date(+now+301000);const before=await r.me(a);
  assert.equal((await r.command(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1,quoteId:expired.id})).json().error.code,'QUOTE_EXPIRED');
  assert.equal((await r.me(a)).gold,before.gold);
  await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:2});
  await r.db.query('UPDATE land_holdings SET unit_price=301,hourly_income=77,hourly_upkeep=7 WHERE character_id=$1',[a.id]);
  const quote=await createTradeQuote(r.db,a.accountId,'land_sell','smallholding',1);assert.equal(quote.amount,150);assert.equal(quote.projectedNet,70);
  const stale=await createTradeQuote(r.db,a.accountId,'land_buy','smallholding',1);await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});
  assert.equal((await r.command(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1,quoteId:stale.id})).json().error.code,'QUOTE_CHANGED');
 }finally{await r.close();}
});
