import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {databaseLease,fixtureUrl} from '../scripts/ci/isolation.mjs';
test('parallel test databases isolate rows, advisory locks and failures; only owned fixtures are removed',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const base=fixtureUrl(process.env.TEST_DATABASE_URL).href,pool=new pg.Pool({connectionString:base,max:2}),leases=[];
  try {
    leases.push(...await Promise.all([databaseLease(pool,base),databaseLease(pool,base)]));
    assert.notEqual(leases[0].url,leases[1].url);
    const clients=leases.map(l=>new pg.Client({connectionString:l.url}));
    await Promise.all(clients.map(c=>c.connect()));
    try {
      for(const c of clients)await c.query('CREATE TABLE isolated(value text)');
      await clients[0].query("INSERT INTO isolated VALUES ('private fixture')");
      assert.equal((await clients[1].query('SELECT count(*)::int AS n FROM isolated')).rows[0].n,0);
      await clients[0].query('SELECT pg_advisory_lock(61824004)');
      assert.equal((await clients[1].query('SELECT pg_try_advisory_lock(61824004) AS locked')).rows[0].locked,true);
      await clients[0].query('BEGIN');await clients[0].query('INSERT INTO isolated VALUES ($1)',[randomUUID()]);await clients[0].query('ROLLBACK');
      assert.equal((await clients[0].query('SELECT count(*)::int AS n FROM isolated')).rows[0].n,1);
      const nonce=new URL(leases[0].url).pathname.slice('/kc_ci_'.length,-'_test'.length);
      await assert.rejects(databaseLease(pool,base,nonce));
      assert.equal((await clients[0].query('SELECT count(*)::int AS n FROM isolated')).rows[0].n,1);
    } finally {await Promise.all(clients.map(c=>c.end()));}
    await Promise.all(leases.map(l=>l.close()));
    const remaining=await pool.query('SELECT datname FROM pg_database WHERE datname=ANY($1::text[])',[leases.map(l=>new URL(l.url).pathname.slice(1))]);
    assert.equal(remaining.rowCount,0);
  }finally{await Promise.all(leases.map(l=>l.close()));await pool.end();}
});
test('interrupted runner terminates descendants, removes its fixture and records failure',{skip:!process.env.TEST_DATABASE_URL,timeout:20000},async()=>{
  const pool=new pg.Pool({connectionString:fixtureUrl(process.env.TEST_DATABASE_URL).href}),label='interrupted-'+randomUUID().replaceAll('-','');
  const names=async()=>new Set((await pool.query("SELECT datname FROM pg_database WHERE datname LIKE 'kc_ci_%_test'")).rows.map(r=>r.datname));
  const before=await names();let child;
  try {
    child=spawn(process.execPath,['scripts/ci/run-tests.mjs','--files=tests/migration.test.ts','--workers=1'],{env:{...process.env,CI_BENCHMARK_LABEL:label},stdio:['ignore','pipe','pipe']});
    let startup='';const capture=bytes=>{startup=(startup+bytes).slice(-65536);};child.stdout.on('data',capture);child.stderr.on('data',capture);
    const closed=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve(code));});
    let created=false;
    for(let i=0;i<100;i++) {if([...await names()].some(n=>!before.has(n))){created=true;break;}await new Promise(r=>setTimeout(r,50));}
    assert.equal(created,true,'Nested runner did not expose its fixture before interruption: '+startup);child.kill('SIGTERM');assert.equal(await closed,1);
    assert.deepEqual([...await names()].sort(),[...before].sort());
    const report=JSON.parse(await readFile('test-results/ci-'+label+'/timings.json','utf8'));
    assert.equal(report.interrupted,true);
  }finally{if(child?.exitCode===null)child.kill('SIGTERM');await pool.end();}
});
