// Explicit local synthetic benchmark. Never target Railway or a player account.
import assert from 'node:assert/strict';
import pg from 'pg';
import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {migrate} from '../../src/migrate.js';
import {writeFile,readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {realm} from '../../tests/helpers.js';
import {transaction,type Database,type Sql} from '../../src/db.js';
import {experienceView} from '../../src/experience.js';
import {reconcileAchievementGold} from '../../src/achievement-gold.js';
import {createApp} from '../../src/app.js';
import {loadConfig} from '../../src/config.js';
const url=new URL(process.env.TEST_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.ok(url.pathname.endsWith('_test')&&!url.search&&!url.hash);
// Identical synthetic rolls; never imported by the application or enabled on a live host.
crypto.randomInt=((min:number,max?:number)=>max===undefined?Math.floor(min/2):Math.floor((min+max-1)/2)) as typeof crypto.randomInt;syncBuiltinESMExports();
const output=process.env.LATENCY_BENCH_OUTPUT!;assert.ok(output?.startsWith('/dev/shm/'));
const mode=process.argv[2];
if(mode==='seed'){
 // Seed the same pre-index schema for both copies. Upgrade only the candidate
 // copy through migrate() before measuring it; never mutate the shared template.
 const r=await realm({migrationThrough:'054_account_erasure.sql'});try{
  const owner=await r.player('Synthetic Latency Knight'),target=await r.player('Synthetic Latency Rival'),noise=await r.player('Synthetic History');
  await r.prepare(owner,50000,30);await r.prepare(target,50000,30);
  for(let i=0;i<5;i++)await r.ok(owner,'/api/v1/quests/border-patrol/runs');
  await transaction(r.db,async sql=>{await sql.query('UPDATE characters SET attained_level=75,attack_training=20,defense_training=20 WHERE id=ANY($1::uuid[])',[[owner.id,target.id]]);await sql.query('UPDATE achievement_gold_state SET enabled=true');});
  await experienceView(r.db,owner.id);await experienceView(r.db,target.id);
  const n=Number(process.env.LATENCY_BENCH_ROWS??250000);assert.ok(Number.isSafeInteger(n)&&n>=1000&&n<=1000000);
  await transaction(r.db,async sql=>{
   await sql.query(`INSERT INTO treasury_retained_events(id,character_id,amount,balance_after,reason,command_id)
    SELECT md5('retained-'||n)::uuid,$1,1,n,'synthetic_history',md5('retained-command-'||n)::uuid FROM generate_series(1,$2::int)n`,[noise.id,n]);
   await sql.query('INSERT INTO land_accounts(character_id,pending_gold) VALUES($1,$2) ON CONFLICT(character_id) DO UPDATE SET pending_gold=land_accounts.pending_gold+$2',[noise.id,n]);
   await sql.query(`INSERT INTO economy_transactions(id,command_id,reason,ruleset_id) SELECT md5('transaction-'||n)::uuid,md5('command-'||n)::uuid,'synthetic_history','alpha-0.3' FROM generate_series(1,$1::int)n`,[n]);
   const balance=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[noise.id])).rows[0]!.balance;
   await sql.query(`INSERT INTO economy_entries(id,transaction_id,character_id,amount,balance_after) SELECT md5('entry-'||n)::uuid,md5('transaction-'||n)::uuid,$1,1,$3::int+n FROM generate_series(1,$2::int)n`,[noise.id,n,balance]);
   await sql.query('UPDATE wallets SET balance=balance+$2 WHERE character_id=$1',[noise.id,n]);
  });
  for(const table of ['treasury_retained_events','economy_transactions','economy_entries','achievement_gold_receipts'])await r.db.query('ANALYZE '+table);
  await writeFile(output,JSON.stringify({synthetic:true,owner,target,noise,rows:n},null,2));
  console.log(JSON.stringify({mode,rows:n,receipts:(await reconcileAchievementGold(r.db,owner.id)).length}));
 }finally{await r.close();}
}else if(mode==='measure'){
 const fixture=JSON.parse(await readFile(process.env.LATENCY_BENCH_FIXTURE!,'utf8'));assert.equal(fixture.synthetic,true);
 const pool=new pg.Pool({connectionString:url.href,max:12,application_name:'kr-local-latency'});
 let records:{kind:string;ms:number}[]=[],waits:number[]=[],maxWaiting=0;
 const category=(s:string)=>s.includes('AS credited')&&s.includes('treasury_retained_events')?'receipt totals':s.includes('FROM achievement_gold_receipts')?'receipt list':s.includes('INSERT INTO character_achievements')?'eligibility insert':s.includes('AS "landPurchased"')?'experience metrics':'other';
 const wrap=(sql:Sql):Sql=>({query:async(s,values)=>{const t=performance.now();maxWaiting=Math.max(maxWaiting,pool.waitingCount);try{return await sql.query(s,values)}finally{records.push({kind:category(s),ms:performance.now()-t})}}});
 const db:Database={...wrap(pool),connect:async()=>{const t=performance.now(),c=await pool.connect();waits.push(performance.now()-t);return {...wrap(c),release:()=>c.release()};},end:()=>pool.end()};
 const config=loadConfig({NODE_ENV:'production',APP_ORIGIN:'https://synthetic-latency.invalid',DATABASE_URL:url.href}),app=await createApp({db,config});
 const address=await app.listen({host:'127.0.0.1',port:0});const results:any[]=[];
 async function sample(name:string,run:()=>Promise<void>){records=[];waits=[];maxWaiting=0;const t=performance.now();await run();const grouped:Record<string,{queries:number;ms:number}>={};for(const x of records){const g=grouped[x.kind]??={queries:0,ms:0};g.queries++;g.ms+=x.ms;}results.push({name,ms:performance.now()-t,queries:records.length,sql:grouped,acquireCount:waits.length,maxAcquireMs:Math.max(0,...waits),maxWaiting});}
 try{
  // Warm one existing state path identically. Neither baseline nor candidate
  // changes pool settings or inserts synthetic delay into PostgreSQL calls.
  await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:fixture.owner.cookie}});
  for(let i=0;i<3;i++)await sample('reconcile',async()=>{await reconcileAchievementGold(db,fixture.owner.id)});
  for(const route of ['/api/v1/me','/game/home','/game/battle','/game/quests','/game/profile','/game/armory'])for(let i=0;i<3;i++)await sample('GET '+route,async()=>{const res=await fetch(address+route,{headers:{cookie:fixture.owner.cookie},redirect:'manual'});assert.equal(res.status,200);await res.arrayBuffer()});
  for(const kind of ['quest','attack'])for(let i=0;i<3;i++){
   await pool.query('UPDATE characters SET health=max_health,spirit=max_spirit,mana=max_mana WHERE id=ANY($1::uuid[])',[[fixture.owner.id,fixture.target.id]]);
   const body:Record<string,string>={csrf:fixture.owner.csrf,commandId:crypto.randomUUID()};if(kind==='attack')body.targetCharacterId=fixture.target.id;
   const path=kind==='attack'?'/game/battle/attack':'/game/quests/border-patrol/run';
   const response={location:''};
   await sample('POST '+kind,async()=>{const res=await fetch(address+path,{method:'POST',redirect:'manual',headers:{cookie:fixture.owner.cookie,origin:config.origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)});assert.equal(res.status,303,await res.text());response.location=res.headers.get('location')??'';});
   assert.ok(response.location.startsWith('/game/'));await sample('GET '+kind+' result',async()=>{const res=await fetch(address+response.location,{headers:{cookie:fixture.owner.cookie},redirect:'manual'});assert.equal(res.status,200);await res.arrayBuffer()});
  }
  const totals=(await pool.query('SELECT (SELECT count(*) FROM achievement_gold_receipts WHERE character_id=$1)::int AS receipts,(SELECT sum(amount)::text FROM achievement_gold_receipts WHERE character_id=$1) AS paid,(SELECT balance FROM wallets WHERE character_id=$1) AS wallet',[fixture.owner.id])).rows[0];
  const plans=(await pool.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT coalesce((SELECT sum(e.amount) FROM economy_transactions t JOIN economy_entries e ON e.transaction_id=t.id WHERE t.command_id=$2 AND t.reason='achievement_gold' AND t.ruleset_id=$3 AND e.character_id=$1),0)::text AS credited,coalesce((SELECT sum(amount) FROM treasury_retained_events WHERE character_id=$1 AND command_id=$2 AND reason='achievement_gold'),0)::text AS retained`,[fixture.owner.id,(await pool.query('SELECT command_id FROM achievement_gold_receipts WHERE character_id=$1 LIMIT 1',[fixture.owner.id])).rows[0].command_id,'achievement-gold-1'])).rows[0]['QUERY PLAN'];
  await writeFile(output,JSON.stringify({synthetic:true,rows:fixture.rows,results,totals,plans},null,2));console.log(JSON.stringify({samples:results.length,totals,output}));
 }finally{await app.close();await pool.end();}
}else throw Error('seed or measure only');
