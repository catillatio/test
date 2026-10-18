// Upgrade ONLY an already restored, separately named test database. Never connect
// to the live database to test migrations. No dump/restore/reset is performed here.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDatabase} from '../dist/db.js';
import {migrate} from '../dist/migrate.js';
import {requireRailwayOperator} from '../dist/operator.js';
requireRailwayOperator(process.env);
const target=process.env.KINGDOM_RESTORE_TEST_DATABASE;
const source=new URL(process.env.DATABASE_URL),url=new URL(source);
if(!target||!/^[a-z][a-z0-9_]*_restore_test$/.test(target)||target===decodeURIComponent(source.pathname.slice(1)))throw new Error('Set a distinct existing restored database name ending _restore_test. No live connection was opened.');
url.pathname='/'+target;
const db=createDatabase(url.href);
async function snapshot(){
 const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows;
 const data={};for(const {table_name:table} of tables){assert.match(table,/^[a-z_]+$/);data[table]=(await db.query('SELECT row_to_json(t)::text AS row FROM "'+table+'" t')).rows.map(row=>row.row).sort();}return data;
}
try{
 const counts=(await db.query('SELECT (SELECT count(*) FROM accounts)::int AS accounts,(SELECT count(*) FROM development_bots)::int AS bots')).rows[0];
 assert.equal(counts.bots,450,'The restored private-alpha copy must retain all 450 existing rivals.');
 assert.ok(counts.accounts>0,'The restored copy has no accounts; this is not a verified game backup.');
 const before=await snapshot();await migrate(db);const after=await snapshot();
 for(const [table,rows] of Object.entries(before)){
  if(['schema_migrations','rulesets'].includes(table)){const existing=new Set(after[table]);assert.ok(rows.every(row=>existing.has(row)),table+' rewrote an existing row');}
  else assert.deepEqual(after[table],rows,table+' changed existing data');
 }
 const stable=JSON.stringify(after);await migrate(db);assert.equal(JSON.stringify(await snapshot()),stable,'Migration replay changed data.');
 console.log(JSON.stringify({passed:true,restoredDatabase:target,accounts:counts.accounts,bots:counts.bots,existingTablesVerified:Object.keys(before).length,sha256:createHash('sha256').update(stable).digest('hex'),migrationReplay:'unchanged',liveDatabaseConnected:false},null,2));
}finally{await db.end();}
