// Production-shaped synthetic history only. Called by the explicit local benchmark.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {fixtureUrl} from '../../scripts/ci/isolation.mjs';
import {createDatabase,transaction} from '../../dist/db.js';
import {migrate} from '../../dist/migrate.js';
import {initializePrivateAlpha} from '../../dist/development.js';
export async function seedSnapshotBudgetFixture(value){
 const url=fixtureUrl(value);assert.match(url.pathname,/^\/kc_budget_[a-f0-9]{32}_restore_test$/);
 const db=createDatabase(url.href),tables=['battles','economy_entries','economy_transactions','treasury_retained_events'];
 try{

 const started=performance.now();
 await migrate(db,{through:'054_account_erasure.sql'});
 // Explicit synthetic policy metadata only; the DB handle above has already
 // been bound to loopback and no connection is made to this dummy URL.
 const env={NODE_ENV:'production',KINGDOM_PRIVATE_ALPHA:'1',KINGDOM_ALPHA_INITIALIZE:'INITIALIZE_EMPTY_PRIVATE_ALPHA',DATABASE_URL:'postgres://synthetic:synthetic@fixture.railway.internal/fixture',RAILWAY_SERVICE_ID:'11111111-1111-4111-8111-111111111111',RAILWAY_ENVIRONMENT_ID:'22222222-2222-4222-8222-222222222222',KINGDOM_DEV_PASSWORD:'SyntheticOnly!2026Readiness'};
 await initializePrivateAlpha(db,env);
 const actors=(await db.query('SELECT id FROM characters ORDER BY id LIMIT 2')).rows.map(x=>x.id);
 const rule=(await db.query('SELECT id FROM rulesets ORDER BY id LIMIT 1')).rows[0].id;

 for(const [table,sql,args] of [
  ['economy_transactions',`INSERT INTO economy_transactions(id,command_id,reason,ruleset_id,created_at) SELECT md5('snapshot-tx-'||n)::uuid,md5('snapshot-cmd-'||n)::uuid,'synthetic_snapshot_fixture',$2,timestamp '2026-01-01'+n*interval '1 millisecond' FROM generate_series(1,$1::int)n`,[1360000,rule]],
  ['economy_entries',`INSERT INTO economy_entries(id,transaction_id,character_id,amount,balance_after) SELECT md5('snapshot-entry-'||n)::uuid,md5('snapshot-tx-'||n)::uuid,$2,1,$3::int+n FROM generate_series(1,$1::int)n`,[1360000,actors[0],(await db.query('SELECT balance FROM wallets WHERE character_id=$1',[actors[0]])).rows[0].balance]],
  ['treasury_retained_events',`INSERT INTO treasury_retained_events(id,character_id,amount,balance_after,reason,command_id,created_at) SELECT md5('snapshot-retained-'||n)::uuid,$2,1,n,'synthetic_snapshot_fixture',md5('snapshot-retained-cmd-'||n)::uuid,timestamp '2026-01-01'+n*interval '1 millisecond' FROM generate_series(1,$1::int)n`,[1110000,actors[0]]],
  ['battles',`INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,created_at)
   SELECT md5('snapshot-battle-'||n)::uuid,$2,$3,$4,'attacker_win',
    jsonb_build_object('equipment',(SELECT jsonb_agg(jsonb_build_object('id',md5(n||':'||s),'name','Synthetic equipment '||s,'attack',s*17,'defense',s*11,'owned',s+1)) FROM generate_series(1,1024)s),'army',n%500),
    jsonb_build_object('loot',n*3,'xp',n%100,'damage',n%1000,'history',md5('history-'||n)),timestamp '2026-01-01'+n*interval '1 second'
   FROM generate_series(1,$1::int)n`,[26018,...actors,rule]]
 ]){
  const t=performance.now();await transaction(db,async c=>{await c.query(sql,args);if(table==='economy_entries')await c.query('UPDATE wallets SET balance=balance+$2 WHERE character_id=$1',[actors[0],1360000]);if(table==='treasury_retained_events')await c.query('INSERT INTO land_accounts(character_id,pending_gold) VALUES($1,$2) ON CONFLICT(character_id) DO UPDATE SET pending_gold=land_accounts.pending_gold+$2',[actors[0],1110000]);});
  await db.query('ANALYZE '+table);
 }
 return {seedMs:performance.now()-started,tables:(await db.query("SELECT c.relname,c.reltuples,pg_total_relation_size(c.oid)::text AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[tables])).rows};
 }finally{await db.end();}
}
