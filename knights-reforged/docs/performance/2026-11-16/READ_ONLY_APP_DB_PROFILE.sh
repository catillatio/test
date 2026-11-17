#!/usr/bin/env bash
(
set +x
set -euo pipefail
cd /app
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import pg from 'pg';
const expected={project:'41a664f1-06bb-492e-90ef-cfd9635fc67f',environment:'8ced8aef-352e-4ea9-931d-8963ff352c1c',service:'47a56e8e-aa72-40df-a5c4-0e5feb0f5cdd',deployment:'2520649d-7b52-4841-b853-8eb7cefa5165',sha:'59f6f75ebc832f3ba421ee5e15cf73d9331fe309'};
const result={kind:'KR_REQUEST_DB_PROFILE',readOnly:true,mutations:false,consoleEnvironmentOnly:true,runningProcessEnvironmentRead:false};
let client,stage='CONSOLE_IDENTITY';
try{
 for(const [name,value] of Object.entries({RAILWAY_PROJECT_ID:expected.project,RAILWAY_ENVIRONMENT_ID:expected.environment,RAILWAY_SERVICE_ID:expected.service,RAILWAY_DEPLOYMENT_ID:expected.deployment,KINGDOM_RELEASE_SHA:expected.sha}))assert.equal(process.env[name],value);
 const u=new URL(process.env.DATABASE_URL);assert.ok(['postgres:','postgresql:'].includes(u.protocol));assert.equal(u.hostname,'postgres.railway.internal');assert.ok(!u.pathname.endsWith('_restore_test'));
 u.searchParams.set('options','-c default_transaction_read_only=on -c statement_timeout=3000 -c lock_timeout=500');
 client=new pg.Client({connectionString:u.href,application_name:'kr-readonly-request-latency',connectionTimeoutMillis:3000});
 stage='CONNECT';let t=performance.now();await client.connect();result.connectionMs=performance.now()-t;
 assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
 stage='ROUND_TRIPS';const trips=[];for(let i=0;i<5;i++){t=performance.now();await client.query('SELECT 1');trips.push(performance.now()-t)}result.warmSelect1Ms=trips;
 stage='CATALOG';result.database=(await client.query(`SELECT current_database() AS name,version(),(SELECT max(name) FROM schema_migrations) AS schema_head,(SELECT enabled FROM achievement_gold_state WHERE singleton) AS achievement_gold_enabled`)).rows[0];
 result.tables=(await client.query(`SELECT c.relname,c.reltuples AS estimated_rows,pg_total_relation_size(c.oid)::text AS total_bytes,s.seq_scan,s.seq_tup_read,s.idx_scan,s.idx_tup_fetch,s.n_live_tup,s.last_analyze,s.last_autoanalyze FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[['treasury_retained_events','economy_transactions','economy_entries','achievement_gold_receipts','character_achievements','battles']])).rows;
 result.indexes=(await client.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1::text[])`,[['treasury_retained_events','economy_transactions','economy_entries','achievement_gold_receipts']])).rows;
 result.receiptCounts=(await client.query('SELECT count(*)::int AS characters,count(*) FILTER(WHERE n>0)::int AS with_receipts,coalesce(max(n),0)::int AS maximum_per_character,coalesce(sum(n),0)::int AS total_receipts FROM (SELECT character_id,count(*) n FROM achievement_gold_receipts GROUP BY character_id) x')).rows[0];
 stage='ACTIVITY';result.activity=[];
 for(let i=0;i<3;i++){
  result.activity.push({at:new Date().toISOString(),groups:(await client.query(`SELECT application_name,backend_type,state,wait_event_type,wait_event,count(*)::int AS connections,max(extract(epoch FROM clock_timestamp()-query_start)) FILTER(WHERE state='active') AS oldest_active_seconds FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY application_name,backend_type,state,wait_event_type,wait_event`)).rows});
  if(i<2)await new Promise(r=>setTimeout(r,500));
 }
 stage='QUERY_STATS';const installed=(await client.query("SELECT to_regclass('pg_stat_statements') AS installed")).rows[0].installed;
 result.statementStatisticsAvailable=!!installed;
 if(installed)result.statementGroups=(await client.query(`SELECT CASE
 WHEN query ILIKE '%AS credited%' AND query ILIKE '%treasury_retained_events%' THEN 'achievement receipt totals'
 WHEN query ILIKE '%SELECT * FROM achievement_gold_receipts%' THEN 'achievement receipt list'
 WHEN query ILIKE '%INSERT INTO character_achievements%' THEN 'achievement eligibility insert'
 WHEN query ILIKE '%champion_standings%' AND query ILIKE '%landPurchased%' THEN 'experience metrics'
 WHEN query ILIKE '%treasury_retained_events%' THEN 'other retained ledger'
 ELSE 'other' END AS category,sum(calls)::text AS calls,sum(total_exec_time) AS execution_ms,sum(rows)::text AS rows,sum(shared_blks_read)::text AS shared_blocks_read,sum(shared_blks_hit)::text AS shared_blocks_hit
 FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query NOT ILIKE '%pg_stat_statements%' AND query NOT ILIKE 'EXPLAIN%' GROUP BY category ORDER BY execution_ms DESC`)).rows;
 stage='PLAN_ONLY';result.planContext='EXPLAIN only, synthetic zero IDs; not an actual player execution or per-player timing';
 result.receiptPlan=(await client.query(`EXPLAIN (FORMAT JSON) SELECT coalesce((SELECT sum(e.amount) FROM economy_transactions t JOIN economy_entries e ON e.transaction_id=t.id WHERE t.command_id=$2 AND t.reason='achievement_gold' AND t.ruleset_id=$3 AND e.character_id=$1),0)::text AS credited,coalesce((SELECT sum(amount) FROM treasury_retained_events WHERE character_id=$1 AND command_id=$2 AND reason='achievement_gold'),0)::text AS retained`,['00000000-0000-4000-8000-000000000000','00000000-0000-4000-8000-000000000001','achievement-gold-1'])).rows[0]['QUERY PLAN'];
 result.result='OBSERVED';
}catch(error){result.result='STOP';result.stage=stage;result.code=typeof error.code==='string'?error.code:'CHECK_FAILED';}
finally{await client?.end().catch(()=>{});console.log(JSON.stringify(result));}
NODE
)
