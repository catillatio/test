import {populationEvidence} from '../dist/expansion-population.js';
import {checkPopulationEvidence} from './release/protocol.mjs';
// Upgrade ONLY an already restored, separately named test database. Never connect
// to the live database to test migrations. No dump/restore/reset is performed here.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createDatabase} from '../dist/db.js';
import {migrate} from '../dist/migrate.js';
import {requireRailwayOperator} from '../dist/operator.js';
requireRailwayOperator(process.env);
const target=process.env.KINGDOM_RESTORE_TEST_DATABASE;
const source=new URL(process.env.DATABASE_URL);
let url=new URL(source);
if(!target||!/^[a-z][a-z0-9_]*_restore_test$/.test(target)||target===decodeURIComponent(source.pathname.slice(1)))throw new Error('Set a distinct existing restored database name ending _restore_test. No live connection was opened.');
if(process.env.KINGDOM_RESTORE_DATABASE_URL){
 const {privateDatabase}=await import('./release/protocol.mjs');
 url=privateDatabase(process.env.KINGDOM_RESTORE_DATABASE_URL).url;
 assert.notEqual(url.hostname,source.hostname,'Automated restore testing requires a separate private PostgreSQL service.');
}
url.pathname='/'+target;
const db=createDatabase(url.href);
export let upgradeReport;
const progressStarted=performance.now();let progressElapsed=0;
function progress(phase,event){
 progressElapsed=Math.max(progressElapsed,Math.floor(performance.now()-progressStarted));
 console.error('UPGRADE_PROGRESS: '+JSON.stringify({phase,event,elapsed_ms:progressElapsed}));
}
// Keep one ordering plan for each table across all three snapshots. In particular,
// adding a primary key during migration must not reorder an unchanged baseline.
const snapshotOrders=new Map();
const snapshotTablesSql=`SELECT t.table_name,p.key_columns
 FROM information_schema.tables t
 LEFT JOIN (
  SELECT n.nspname,c.relname,array_agg(a.attname::text ORDER BY k.ordinality) AS key_columns
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum,ordinality)
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
  WHERE n.nspname='public' AND i.indisprimary AND i.indisunique AND i.indisvalid AND i.indisready
   AND k.ordinality<=i.indnkeyatts
  GROUP BY n.nspname,c.relname,i.indexrelid,i.indnkeyatts
  HAVING count(*)=i.indnkeyatts
   AND bool_and(coalesce(a.attnum>0 AND NOT a.attisdropped AND a.attnotnull,false))
 ) p ON p.nspname=t.table_schema AND p.relname=t.table_name
 WHERE t.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY t.table_name`;
const quoteIdentifier=value=>'"'+value.replaceAll('"','""')+'"';
async function snapshot(){
 const sql=await db.connect();
 try{
  await sql.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables=(await sql.query(snapshotTablesSql)).rows;
  const data={};
  for(const {table_name:table,key_columns:keys} of tables){
   assert.match(table,/^[a-z_]+$/);
   // Only the small append-only migration registries need their original rows.
   // PostgreSQL hashes every complete UTF-8 business row before transfer; only
   // fixed-size digests stream to Node, never historical battle payloads.
   const append=['schema_migrations','rulesets'].includes(table),rows=[],digest=createHash('sha256');let count=0;
   if(!append)digest.update('kingdom-preservation-full-row-sha256-v1\0');
   if(!snapshotOrders.has(table)){
    assert.ok(keys===null||Array.isArray(keys)&&keys.length>0&&keys.every(key=>typeof key==='string'&&key.length>0),'Invalid preservation primary-key metadata');
    // A real, valid non-null primary key supplies a total row order without
    // sorting large JSON histories. Every complete row is still hashed, with
    // count and digest order retained. Unkeyed tables keep full-JSON ordering.
    snapshotOrders.set(table,!append&&keys?keys.map(key=>'t.'+quoteIdentifier(key)).join(','):'row_to_json(t)::text');
   }
   const projection=append?'row_to_json(t)::text AS row':"pg_catalog.sha256(pg_catalog.convert_to(row_to_json(t)::text,'UTF8')) AS row_sha256";
   await sql.query('DECLARE preservation_rows NO SCROLL CURSOR FOR SELECT '+projection+' FROM public.'+quoteIdentifier(table)+' t ORDER BY '+snapshotOrders.get(table));
   for(;;){const batch=(await sql.query('FETCH FORWARD 500 FROM preservation_rows')).rows;if(!batch.length)break;
    for(const {row,row_sha256:rowDigest} of batch){
     if(append){digest.update(String(Buffer.byteLength(row))+':'+row);rows.push(row);}
     else{assert.ok(Buffer.isBuffer(rowDigest)&&rowDigest.length===32,'Invalid preservation row digest');digest.update(rowDigest);}
     count++;
    }
   }
   await sql.query('CLOSE preservation_rows');
   data[table]=append?rows:{count,sha256:digest.digest('hex')};
  }
  await sql.query('COMMIT');return data;
 }catch(error){await sql.query('ROLLBACK').catch(()=>{});throw error;}finally{sql.release();}
}
try{
 progress('population','start');
 const counts=(await db.query('SELECT (SELECT count(*) FROM accounts)::int AS accounts,(SELECT count(*) FROM development_bots)::int AS bots')).rows[0];
 const population=await populationEvidence(db);assert.equal(counts.bots,checkPopulationEvidence(population),'The exact original and registered bot identities must be retained.');
 assert.ok(counts.accounts>0,'The restored copy has no accounts; this is not a verified game backup.');
 progress('population','complete');
 progress('snapshot-before','start');const before=await snapshot();progress('snapshot-before','complete');
 progress('migrate','start');await migrate(db);progress('migrate','complete');
 progress('snapshot-after','start');const after=await snapshot();progress('snapshot-after','complete');
 progress('preservation-compare','start');
 for(const [table,rows] of Object.entries(before)){
  if(['schema_migrations','rulesets'].includes(table)){const existing=new Set(after[table]);assert.ok(rows.every(row=>existing.has(row)),table+' rewrote an existing row');}
  else assert.deepEqual(after[table],rows,table+' changed existing data');
 }
 progress('preservation-compare','complete');
 const stable=JSON.stringify(after);
 progress('migrate-replay','start');await migrate(db);progress('migrate-replay','complete');
 progress('snapshot-replay','start');const replay=await snapshot();progress('snapshot-replay','complete');
 progress('replay-compare','start');assert.equal(JSON.stringify(replay),stable,'Migration replay changed data.');progress('replay-compare','complete');
 upgradeReport={passed:true,restoredDatabase:target,restoredHost:url.hostname,accounts:counts.accounts,bots:counts.bots,population,existingTablesVerified:Object.keys(before).length,sha256:createHash('sha256').update(stable).digest('hex'),migrationReplay:'unchanged',liveDatabaseConnected:false};
 console.log(JSON.stringify(upgradeReport,null,2));
}finally{await db.end();}
