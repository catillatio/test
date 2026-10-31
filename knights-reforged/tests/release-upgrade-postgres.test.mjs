import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {fixtureUrl} from '../scripts/ci/isolation.mjs';

test('actual PostgreSQL preservation snapshots retain every full row across migrations and replay',{skip:!process.env.TEST_DATABASE_URL,timeout:120000},async t=>{
 const source=fixtureUrl(process.env.TEST_DATABASE_URL),name='kc_snapshot_'+randomUUID().replaceAll('-','')+'_restore_test';
 const admin=new pg.Client({connectionString:source.href});await admin.connect();
 const target=new URL(source);target.pathname='/'+name;
 const directory=await mkdtemp(join(tmpdir(),'upgrade-postgres-'));let created=false,db;
 const checker=new URL('../deployment/check-upgrade.mjs',import.meta.url),preload=fileURLToPath(new URL('./fixtures/release-upgrade-postgres.mjs',import.meta.url));
 try{
  // This randomly named database is created here, never adopted from another run.
  await admin.query('CREATE DATABASE "'+name+'" TEMPLATE template0');created=true;
  db=new pg.Client({connectionString:target.href});await db.connect();
  async function run(mode){
   await db.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    CREATE TABLE accounts(id integer PRIMARY KEY,label text NOT NULL);
    INSERT INTO accounts VALUES(1,'original-account');
    CREATE TABLE development_bots(id integer PRIMARY KEY);
    INSERT INTO development_bots SELECT i FROM generate_series(1,450)i;
    CREATE TABLE battles(id integer PRIMARY KEY,snapshot jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL);
    INSERT INTO battles SELECT i,jsonb_build_object('army',i,'equipment',repeat(md5(i::text),8),'label','雪 👑'),jsonb_build_object('gold',i),'2026-01-01'::timestamptz FROM generate_series(1002,1,-1)i;
    CREATE TABLE rulesets(id text PRIMARY KEY,definition jsonb NOT NULL);
    INSERT INTO rulesets VALUES('existing','{"version":1}');
    CREATE TABLE schema_migrations(name text PRIMARY KEY,sha text NOT NULL);
    INSERT INTO schema_migrations VALUES('existing','original-sha');
    CREATE TABLE heap_history(k integer,payload jsonb);
    INSERT INTO heap_history VALUES(1,'{"same":true}'),(1,'{"same":true}'),(2,'{"unicode":"雪"}');
    CREATE TABLE composite_history("zone""code" text,sequence integer,payload jsonb,PRIMARY KEY("zone""code",sequence));
    INSERT INTO composite_history VALUES('west',2,'{"value":2}'),('west',1,'{"value":1}'),('east',1,'{"value":3}');
    CREATE TABLE numeric_keys(id integer PRIMARY KEY,payload text NOT NULL UNIQUE);
    INSERT INTO numeric_keys VALUES(10,'a'),(2,'b'),(1,'c');
    CREATE TABLE key_later(id integer NOT NULL,payload text);
    INSERT INTO key_later VALUES(10,'a'),(2,'b'),(1,'c');
    CREATE TABLE included_history(id integer NOT NULL,payload text,PRIMARY KEY(id) INCLUDE(payload));
    INSERT INTO included_history VALUES(2,'b'),(1,'a');
    CREATE TABLE nullable_unique(id integer UNIQUE,payload text);
    INSERT INTO nullable_unique VALUES(NULL,'a'),(NULL,'b'),(1,'c');`);
   const trace=join(directory,'trace.jsonl');await writeFile(trace,'');
   const result=spawnSync(process.execPath,['--import',preload,fileURLToPath(checker)],{encoding:'utf8',timeout:25000,maxBuffer:1024*1024,env:{
    PATH:process.env.PATH,NODE_NO_WARNINGS:'1',NODE_ENV:'production',KINGDOM_PRIVATE_ALPHA:'1',
    RAILWAY_SERVICE_ID:'11111111-1111-4111-8111-111111111111',RAILWAY_ENVIRONMENT_ID:'22222222-2222-4222-8222-222222222222',
    DATABASE_URL:'postgres://fixture:synthetic@source.railway.internal/Railway',KINGDOM_RESTORE_DATABASE_URL:'postgres://fixture:synthetic@restore.railway.internal/Railway',
    KINGDOM_RESTORE_TEST_DATABASE:name,FIXTURE_POSTGRES_URL:target.href,FIXTURE_MODE:mode,FIXTURE_TRACE:trace,FIXTURE_CHECKER_URL:checker.href
   }});
   assert.equal(result.error,undefined,'Isolated checker must finish within its test bound');
   const operations=(await readFile(trace,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
   const progress=result.stderr.split('\n').filter(line=>line.startsWith('UPGRADE_PROGRESS: ')).map(line=>JSON.parse(line.slice('UPGRADE_PROGRESS: '.length)));
   assert.equal(operations.at(-1)?.operation,'end',result.stderr);
   return {...result,operations,progress};
  }
  async function independentlyHashFullRows(){
   // Read the original JSON bytes, not the server's row digest. Independently
   // reproduce the aggregate from Node SHA-256 so a wrong SQL projection,
   // encoding, framing, omission or domain cannot satisfy the report check.
   const order={accounts:'t.id',battles:'t.id',composite_history:'t."zone""code",t.sequence',development_bots:'t.id',
    heap_history:'row_to_json(t)::text',included_history:'t.id',key_later:'row_to_json(t)::text',
    nullable_unique:'row_to_json(t)::text',numeric_keys:'t.id',rulesets:'row_to_json(t)::text',schema_migrations:'row_to_json(t)::text'};
   const saved={};
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   try{
    const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(r=>r.table_name);
    assert.deepEqual(tables,Object.keys(order));
    for(const table of tables){
     const append=['rulesets','schema_migrations'].includes(table),rows=[],digest=createHash('sha256');let count=0;
     if(!append)digest.update('kingdom-preservation-full-row-sha256-v1\0');
     await db.query('DECLARE independently_hashed_rows NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS row FROM public."'+table+'" t ORDER BY '+order[table]);
     for(;;){
      const batch=(await db.query('FETCH FORWARD 500 FROM independently_hashed_rows')).rows;
      if(!batch.length)break;
      for(const {row}of batch){count++;if(append)rows.push(row);else digest.update(createHash('sha256').update(Buffer.from(row,'utf8')).digest());}
     }
     await db.query('CLOSE independently_hashed_rows');
     saved[table]=append?rows:{count,sha256:digest.digest('hex')};
    }
    await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}
   return createHash('sha256').update(JSON.stringify(saved)).digest('hex');
  }
  await t.test('keyed, composite and duplicate unkeyed tables preserve complete data; registries append',async()=>{
   const r=await run('success');assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);
   assert.equal(report.passed,true);assert.equal(report.existingTablesVerified,11);assert.equal(report.migrationReplay,'unchanged');assert.equal(report.liveDatabaseConnected,false);
   assert.equal(r.operations.filter(x=>x.operation==='commit').length,3);
   const queries=r.operations.filter(x=>x.operation==='declare').map(x=>x.sql);
   assert.equal(queries.filter(q=>q.includes('FROM public."battles" t ORDER BY t."id"')).length,3);
   assert.equal(queries.filter(q=>q.includes('FROM public."composite_history" t ORDER BY t."zone""code",t."sequence"')).length,3);
   assert.equal(queries.filter(q=>q.endsWith('FROM public."included_history" t ORDER BY t."id"')).length,3,'INCLUDE columns are not primary-key ordering columns');
   for(const table of ['heap_history','nullable_unique','rulesets','schema_migrations'])assert.equal(queries.filter(q=>q.includes('FROM public."'+table+'" t ORDER BY row_to_json(t)::text')).length,3);
   assert.equal(report.sha256,await independentlyHashFullRows(),'The report must cover the SHA-256 of every complete UTF-8 JSON row');
   const vectors=(await db.query("SELECT row_to_json(t)::text AS original,pg_catalog.sha256(pg_catalog.convert_to(row_to_json(t)::text,'UTF8')) AS digest FROM public.heap_history t")).rows;
   assert.ok(vectors.some(v=>v.original.includes('雪')));
   for(const v of vectors)assert.deepEqual(v.digest,createHash('sha256').update(Buffer.from(v.original,'utf8')).digest(),'PostgreSQL hashes the same complete UTF-8 bytes as Node');
  });
  for(const mode of ['update','insert','delete','heap-update','heap-delete-duplicate','composite-update','registry-rewrite'])await t.test(mode+' cannot pass preservation comparison',async()=>{
   const r=await run(mode);assert.equal(r.status,1);assert.equal(r.stdout,'');
   assert.deepEqual(r.progress.at(-1),{...r.progress.at(-1),phase:'preservation-compare',event:'start'});
   assert.equal(r.operations.filter(x=>x.operation==='migrate').length,1);
  });
  for(const mode of ['physical-reorder','add-primary','replace-primary','new-table'])await t.test(mode+' preserves the baseline ordering across all snapshots',async()=>{
   const r=await run(mode);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).migrationReplay,'unchanged');
   if(mode==='add-primary')assert.equal(r.operations.filter(x=>x.operation==='declare'&&x.sql.includes('FROM public."key_later" t ORDER BY row_to_json(t)::text')).length,3);
   if(mode==='replace-primary')assert.equal(r.operations.filter(x=>x.operation==='declare'&&x.sql.includes('FROM public."numeric_keys" t ORDER BY t."id"')).length,3);
  });
  await t.test('dropping a baseline ordering column fails and rolls back the snapshot',async()=>{
   const r=await run('drop-ordered-column');assert.equal(r.status,1);assert.equal(r.stdout,'');
   assert.equal(r.progress.at(-1).phase,'snapshot-after');assert.equal(r.progress.at(-1).event,'start');
   assert.equal(r.operations.filter(x=>x.operation==='rollback').length,1);
   assert.equal(r.operations.filter(x=>x.operation==='release').length,2);
  });
  await t.test('a second migration that changes history still fails replay equality',async()=>{
   const r=await run('replay-update');assert.equal(r.status,1);assert.equal(r.stdout,'');
   assert.equal(r.progress.at(-1).phase,'replay-compare');assert.equal(r.progress.at(-1).event,'start');
   assert.equal(r.operations.filter(x=>x.operation==='migrate').length,2);
  });
 }finally{
  await db?.end().catch(()=>{});
  if(created)await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');
  await admin.end();await rm(directory,{recursive:true,force:true});
 }
});
