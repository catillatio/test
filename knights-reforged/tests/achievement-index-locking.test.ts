import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {realm} from './helpers.js';
import {migrate} from '../src/migrate.js';
import type {Database,Connection} from '../src/db.js';
import type {QueryResultRow} from 'pg';

type Realm=Awaited<ReturnType<typeof realm>>;
async function state(r:Realm){return (await r.db.query(`SELECT
 (SELECT jsonb_agg(t ORDER BY name) FROM schema_migrations t) AS migrations,
 (SELECT count(*)::int FROM economy_entries) AS entries,
 (SELECT count(*)::int FROM treasury_retained_events) AS retained,
 (SELECT sum(balance)::text FROM wallets) AS gold,
 to_regclass('achievement_gold_retained_lookup_idx')::text AS index_name`)).rows[0]!;}
function bound(client:Connection,onIndex:(value:string)=>void):Database{
 return {query:client.query.bind(client),async connect(){return {query:async<T extends QueryResultRow>(sql:string,values?:unknown[])=>{
  const result=await client.query<T>(sql,values);
  if(sql.includes('CREATE INDEX achievement_gold_retained_lookup_idx'))onIndex((await client.query('SHOW statement_timeout')).rows[0]!.statement_timeout);
  return result;
 },release(){}};},async end(){}};
}
async function slowIndex(r:Realm){
 const name='kr_index_'+randomUUID().replaceAll('-','');
 // This trigger exists only in this disposable fixture database and only
 // delays this fixture schema's index DDL. It never enters a shipped migration.
 const schema=(await r.db.query('SELECT current_schema() AS name')).rows[0]!.name;
 assert.match(schema,/^fixture_[a-f0-9]{32}$/);
 await r.db.query(`CREATE FUNCTION "${schema}".slow_index() RETURNS event_trigger LANGUAGE plpgsql AS $$
 BEGIN IF current_schema()='${schema}' THEN PERFORM pg_sleep(11); END IF; END $$`);
 await r.db.query(`REVOKE ALL ON FUNCTION "${schema}".slow_index() FROM PUBLIC`);
 await r.db.query(`CREATE EVENT TRIGGER "${name}" ON ddl_command_start WHEN TAG IN ('CREATE INDEX') EXECUTE FUNCTION "${schema}".slow_index()`);
 return async()=>{await r.db.query(`DROP EVENT TRIGGER "${name}"`);};
}

test('index migration refuses an existing writer immediately and rolls back without a migration receipt',async()=>{
 const r=await realm({isolated:true,migrationThrough:'054_account_erasure.sql'}),writer=await r.db.connect();
 try{
  const before=await state(r);await writer.query('BEGIN');await writer.query('LOCK TABLE treasury_retained_events IN ROW EXCLUSIVE MODE');
  const started=performance.now();await assert.rejects(migrate(r.db),(e:any)=>e.code==='55P03');
  assert.ok(performance.now()-started<2000,'NOWAIT must not queue behind the writer');assert.deepEqual(await state(r),before);
 }finally{await writer.query('ROLLBACK');writer.release();await r.close();}
});

test('index DDL has a real ten-second cancellation bound and restores session settings on rollback',{timeout:20000},async()=>{
 const r=await realm({isolated:true,migrationThrough:'054_account_erasure.sql'}),client=await r.db.connect();let remove:undefined|(()=>Promise<void>);
 try{
  remove=await slowIndex(r);const before=await state(r);await client.query("SET statement_timeout='0'");
  const started=performance.now();await assert.rejects(migrate(bound(client,()=>{})),(e:any)=>e.code==='57014');const elapsed=performance.now()-started;
  assert.ok(elapsed>=9500&&elapsed<15000,'The configured statement deadline must cancel the slow DDL');assert.deepEqual(await state(r),before);
  assert.equal((await client.query('SHOW statement_timeout')).rows[0]!.statement_timeout,'0');
 }finally{await remove?.();client.release();await r.close();}
});

test('index DDL never raises a stricter existing timeout and leaves every business row unchanged',{timeout:10000},async()=>{
 const r=await realm({isolated:true,migrationThrough:'054_account_erasure.sql'}),client=await r.db.connect();let remove:undefined|(()=>Promise<void>);
 try{
  remove=await slowIndex(r);const before=await state(r);await client.query("SET statement_timeout='100ms'");
  const started=performance.now();await assert.rejects(migrate(bound(client,()=>{})),(e:any)=>e.code==='57014');
  assert.ok(performance.now()-started<2000);assert.deepEqual(await state(r),before);assert.equal((await client.query('SHOW statement_timeout')).rows[0]!.statement_timeout,'100ms');
 }finally{await remove?.();await client.query("SET statement_timeout='0'");client.release();await r.close();}
});

test('successful index installation preserves a stricter timeout and resets transaction-local settings',async()=>{
 const r=await realm({isolated:true,migrationThrough:'054_account_erasure.sql'}),client=await r.db.connect();
 try{
  await client.query("SET statement_timeout='1s'");const limits:string[]=[];await migrate(bound(client,value=>limits.push(value)));
  assert.deepEqual(limits,['1s']);assert.equal((await client.query('SHOW statement_timeout')).rows[0]!.statement_timeout,'1s');
  assert.ok((await state(r)).index_name);await migrate(bound(client,()=>assert.fail('Index DDL must not replay')));
 }finally{await client.query("SET statement_timeout='0'");client.release();await r.close();}
});
