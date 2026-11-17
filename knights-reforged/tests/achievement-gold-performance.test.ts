import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,type Player} from './helpers.js';
import {transaction,type Sql} from '../src/db.js';
import {ledger,recordRetained,creditGold} from '../src/economy.js';
import {reconcileAchievementGold} from '../src/achievement-gold.js';
import {achievementGold,achievementGoldPolicy} from '../src/achievement-gold-policy.js';
import {experienceRules} from '../src/experience-rules.js';
import {profileBusinessSnapshot} from './classic-profile-fixture.js';
import {migrate} from '../src/migrate.js';

type Realm=Awaited<ReturnType<typeof realm>>;
async function receipt(r:Realm,p:Player,achievement='level-5',credited=500,retained=0,command=randomUUID(),policy:string=achievementGoldPolicy.id){
 await r.db.query('INSERT INTO achievement_gold_receipts(character_id,achievement_id,reward_policy_id,command_id,amount,credited_gold,retained_gold,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())',[p.id,achievement,policy,command,credited+retained,credited,retained]);return command;
}
async function wallet(r:Realm,p:Player,command:string,amount:number,reason='achievement_gold',policy:string=achievementGoldPolicy.id){await transaction(r.db,sql=>ledger(sql,command,reason,[{characterId:p.id,amount}],policy));}
async function retained(r:Realm,p:Player,command:string,amount:number){await transaction(r.db,async sql=>{
 await sql.query('INSERT INTO land_accounts(character_id,pending_gold) VALUES($1,0) ON CONFLICT(character_id) DO NOTHING',[p.id]);await sql.query('UPDATE land_accounts SET pending_gold=pending_gold+$2 WHERE character_id=$1',[p.id,amount]);await recordRetained(sql,p.id,BigInt(amount),'achievement_gold',command);
});}
async function snapshot(r:Realm){const out=await profileBusinessSnapshot(r.db);for(const table of ['treasury_retained_events','achievement_gold_receipts','achievement_gold_state','character_achievements'])out[table]=(await r.db.query('SELECT row_to_json(t)::text AS row FROM '+table+' t ORDER BY row_to_json(t)::text')).rows.map(v=>v.row);return out;}
const counted=(sql:Sql)=>{let count=0;return {sql:{query:(...args:Parameters<Sql['query']>)=>{count++;return sql.query(...args)}} as Sql,read:()=>count};};

test('batched reconciliation remains per receipt, exact across split/negative journals and constant in query count',async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Batched Split'),b=await r.player('Foreign Wallet'),empty=await r.player('No Receipts');
  const q0=counted(r.db);assert.deepEqual(await reconcileAchievementGold(q0.sql,empty.id),[]);assert.equal(q0.read(),1);
  const start=(await r.me(a)).gold;await r.prepare(a,2147483647-start-300);
  const c=await receipt(r,a,'level-5',300,200);
  // Real ledger helpers preserve wallet bounds and signed adjustments. Each
  // journal has multiple rows: a raw join would incorrectly multiply totals.
  for(const n of [100,-50,250])await wallet(r,a,c,n);
  for(const n of [100,-50,150])await retained(r,a,c,n);
  await wallet(r,b,c,777);await wallet(r,a,c,-1,'other-reason');await wallet(r,a,c,1,'other-reason');
  const before=await snapshot(r),q1=counted(r.db);
  assert.equal((await reconcileAchievementGold(q1.sql,a.id)).length,1);assert.equal(q1.read(),2);assert.deepEqual(await snapshot(r),before);
  const all=await r.player('Many Awards');
  for(const def of experienceRules.achievements){const amount=achievementGold(def.rank),cmd=await receipt(r,all,def.id,amount);await wallet(r,all,cmd,amount);}
  const q2=counted(r.db);assert.equal((await reconcileAchievementGold(q2.sql,all.id)).length,experienceRules.achievements.length);assert.equal(q2.read(),2,'Queries must not grow with saved receipt count');
 }finally{await r.close();}
});

test('missing, extra, offsetting, wrong-character/reason/policy amounts and invalid receipts still fail closed',async t=>{
 const r=await realm({isolated:true});try{
  for(const kind of ['missing','extra','offsetting','foreign','reason','ledger-policy','unknown-achievement','receipt-policy','rank-amount','retained-missing','retained-extra'])await t.test(kind,async()=>{
   const a=await r.player('Integrity A'),b=await r.player('Integrity B');
   const def=kind==='unknown-achievement'?'unknown-reward':'level-5',policy=kind==='receipt-policy'?'unknown-policy':achievementGoldPolicy.id;
   const c=await receipt(r,a,def,kind==='rank-amount'?501:kind.startsWith('retained-')?0:500,kind.startsWith('retained-')?500:0,randomUUID(),policy);
   if(kind==='offsetting'){await wallet(r,a,c,499);const other=await receipt(r,a,'victories-1',500);await wallet(r,a,other,501);}
   else if(kind==='retained-extra')await retained(r,a,c,501);
   else if(kind==='retained-missing'||kind==='missing'){}
   else await wallet(r,kind==='foreign'?b:a,c,kind==='extra'?501:500,kind==='reason'?'other':'achievement_gold',kind==='ledger-policy'?'alpha-0.3':achievementGoldPolicy.id);
   const before=await snapshot(r);await assert.rejects(reconcileAchievementGold(r.db,a.id));assert.deepEqual(await snapshot(r),before,'A failed check must never repair or pay a receipt');
  });
 }finally{await r.close();}
});

test('054 to 055 adds only a selective index and migration receipt, preserving all business data and partial-overflow awards',async()=>{
 const r=await realm({isolated:true,migrationThrough:'054_account_erasure.sql'});try{
  const a=await r.player('Index Preservation'),b=await r.player('Large Unrelated History');
  const start=(await r.me(a)).gold;await r.prepare(a,2147483647-start-123);
  const command=randomUUID();await transaction(r.db,async sql=>{await creditGold(sql,a.id,500n,command,'achievement_gold',achievementGoldPolicy.id);});await receipt(r,a,'level-5',123,377,command);
  await r.db.query(`INSERT INTO treasury_retained_events(id,character_id,amount,balance_after,reason,command_id) SELECT md5('index-test-'||n)::uuid,$1,1,n,'unrelated-history',md5('index-command-'||n)::uuid FROM generate_series(1,5000)n`,[b.id]);
  const before=await snapshot(r);await migrate(r.db);const after=await snapshot(r);
  // The helper omits schema registries; all financial and character rows match.
  assert.deepEqual(after,before);assert.equal((await reconcileAchievementGold(r.db,a.id)).length,1);
  const index=(await r.db.query(`SELECT i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) AS definition,pg_get_expr(i.indpred,i.indrelid) AS predicate FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='achievement_gold_retained_lookup_idx' AND n.nspname=current_schema()`)).rows[0]!;
  assert.equal(index.indisvalid,true);assert.equal(index.indisready,true);assert.match(index.definition,/\(character_id, command_id\)/);assert.match(index.predicate,/reason = 'achievement_gold'/);
  await r.db.query('ANALYZE treasury_retained_events');
  const plan=JSON.stringify((await r.db.query("EXPLAIN (FORMAT JSON) SELECT sum(amount) FROM treasury_retained_events WHERE character_id=$1 AND command_id=$2 AND reason='achievement_gold'",[a.id,command])).rows);
  assert.ok(plan.includes('achievement_gold_retained_lookup_idx'),'The measured predicate should use its selective index with unrelated history');
  await migrate(r.db);assert.deepEqual(await snapshot(r),after);assert.equal((await r.db.query("SELECT max(name) head FROM schema_migrations")).rows[0]!.head,'055_achievement_gold_lookup.sql');
 }finally{await r.close();}
});
