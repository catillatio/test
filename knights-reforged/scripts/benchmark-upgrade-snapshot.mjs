// Explicitly invoked, disposable LOCAL PostgreSQL benchmark; never a release gate.
// Compare legacy full-row framing, key ordering and the checker's full-row SHA
// commitments. No strategy samples, truncates or omits historical rows.
import assert from 'node:assert/strict';
import pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {fixtureUrl} from './ci/isolation.mjs';

const base=fixtureUrl(process.env.TEST_DATABASE_URL);
const mode=process.argv[2];
const select=order=>'SELECT row_to_json(t)::text AS row FROM public.battles t ORDER BY '+order;
const digestDomain='kingdom-preservation-full-row-sha256-v1\0';
const digestSelect='SELECT pg_catalog.sha256(pg_catalog.convert_to(row_to_json(t)::text,\'UTF8\')) AS row_sha256 FROM public.battles t ORDER BY t."id"';
if(mode==='--stream'){
 assert.match(base.pathname,/^\/kc_snapshot_benchmark_[a-f0-9]+_test$/);
 const order=process.argv[3];assert.ok(['legacy','primary','row-digest','audit'].includes(order));
 const client=new pg.Client({connectionString:base.href});await client.connect();
 try{
  await client.query("SET work_mem='4MB'; SET jit=off");
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const started=performance.now(),hash=createHash('sha256');let count=0,bytes=0,maxBatch=0;
  if(order==='row-digest'||order==='audit')hash.update(digestDomain);
  await client.query('DECLARE preservation_rows NO SCROLL CURSOR FOR '+(order==='row-digest'?digestSelect:select(order==='legacy'?'row_to_json(t)::text':'t."id"')));
  for(;;){
   const rows=(await client.query('FETCH FORWARD 500 FROM preservation_rows')).rows;
   if(!rows.length)break;maxBatch=Math.max(maxBatch,rows.length);
   for(const record of rows){
    if(order==='row-digest'){assert.ok(Buffer.isBuffer(record.row_sha256)&&record.row_sha256.length===32);hash.update(record.row_sha256);bytes+=32;}
    else{const {row}=record,length=Buffer.byteLength(row);bytes+=length;if(order==='audit')hash.update(createHash('sha256').update(row).digest());else hash.update(String(length)+':'+row);}
    count++;
   }
  }
  await client.query('CLOSE preservation_rows');await client.query('COMMIT');
  console.log(JSON.stringify({order,elapsed_ms:Math.round(performance.now()-started),count,bytes,maxBatch,sha256:hash.digest('hex'),max_rss_kib:process.resourceUsage().maxRSS}));
 }finally{await client.end();}
}else{
 assert.equal(mode,undefined,'No unrecognized arguments');
 const count=Number(process.env.SNAPSHOT_BENCHMARK_ROWS??25000);assert.ok(Number.isSafeInteger(count)&&count>=1000&&count<=100000);
 const name='kc_snapshot_benchmark_'+randomUUID().replaceAll('-','')+'_test';
 const root=new pg.Client({connectionString:base.href});await root.connect();
 let client,created=false;
 try{
  await root.query('CREATE DATABASE "'+name+'"');created=true;
  const url=new URL(base);url.pathname='/'+name;client=new pg.Client({connectionString:url.href});await client.connect();
  await client.query('CREATE TABLE battles(id uuid PRIMARY KEY,attacker_id uuid NOT NULL,defender_id uuid NOT NULL,ruleset_id text NOT NULL,outcome text NOT NULL,snapshot jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL)');
  // Wide, varied battle equipment/history rather than a compressible repeated blob.
  await client.query(`INSERT INTO battles SELECT md5(n::text)::uuid,md5(('attacker-'||n))::uuid,md5(('defender-'||n))::uuid,'synthetic-only','attacker_win',
   jsonb_build_object('equipment',(SELECT jsonb_agg(jsonb_build_object('id',md5(n||':'||s),'name','Synthetic equipment '||s,'attack',s*17,'defense',s*11,'owned',s+1)) FROM generate_series(1,48)s),'army',n%500),
   jsonb_build_object('loot',n*3,'xp',n%100,'damage',n%1000,'history',md5(('history-'||n))),timestamp '2026-01-01'+n*interval '1 second'
   FROM generate_series(1,$1::integer)n ORDER BY md5(('physical-'||n))`,[count]);
  await client.query('ANALYZE battles');
  const size=(await client.query("SELECT pg_total_relation_size('battles')::text AS stored_bytes,version() AS version")).rows[0];
  const results=[];
  for(const order of ['legacy','primary','row-digest','row-digest','primary','legacy','legacy','row-digest','primary','audit']){
   const result=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--max-old-space-size=128',fileURLToPath(import.meta.url),'--stream',order],{env:{PATH:process.env.PATH,TEST_DATABASE_URL:url.href},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
    const timer=setTimeout(()=>child.kill('SIGTERM'),180000);
    child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve(JSON.parse(stdout)):reject(new Error('Synthetic benchmark child failed: '+stderr));});
   });results.push(result);
  }
  // id is first in this representative schema, so legacy and PK order produce
  // byte-identical complete streams. Integration tests also cover other orders.
  const audit=results.find(x=>x.order==='audit');
  for(const result of results){assert.equal(result.count,count);assert.equal(result.maxBatch,500);assert.equal(result.sha256,result.order==='row-digest'||result.order==='audit'?audit.sha256:results[0].sha256);assert.equal(result.bytes,result.order==='row-digest'?count*32:results[0].bytes);}
  const plans={};
  await client.query("SET work_mem='4MB'; SET jit=off");
  for(const [key,query]of [['legacy',select('row_to_json(t)::text')],['primary',select('t."id"')],['row-digest',digestSelect]]){
   // EXPLAIN the actual DECLARE form: SELECT's full-result planner can choose a
   // different plan from the cursor, so its timings would be misleading here.
   const plan=(await client.query('EXPLAIN (FORMAT JSON) DECLARE preservation_rows NO SCROLL CURSOR FOR '+query)).rows[0]['QUERY PLAN'][0];
   const nodes=[];function walk(p){nodes.push({node:p['Node Type'],index:p['Index Name']??null});for(const c of p.Plans??[])walk(c);}walk(plan.Plan);
   plans[key]={nodes};
  }
  const med=order=>results.filter(x=>x.order===order).map(x=>x.elapsed_ms).sort((a,b)=>a-b)[1];
  console.log(JSON.stringify({synthetic:true,productionConnected:false,rows:count,...size,work_mem:'4MB',fetchRows:500,nodeOldSpaceMiB:128,independentNodeRowDigestMatches:true,results,cursorPlans:plans,median_speedup:Number((med('legacy')/med('row-digest')).toFixed(2))},null,2));
 }finally{
  await client?.end();if(created)await root.query('DROP DATABASE "'+name+'"');await root.end();
 }
}
