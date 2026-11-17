// Only the dedicated local regression child; no production/operator endpoint.
import assert from 'node:assert/strict';
import pg from 'pg';
import {performance} from 'node:perf_hooks';
import {fixtureUrl} from '../../scripts/ci/isolation.mjs';
import {migrate} from '../../src/migrate.js';

const url=fixtureUrl(process.env.TEST_DATABASE_URL),schema=process.env.FIXTURE_INDEX_SCHEMA;
assert.match(schema,/^fixture_[a-f0-9]{32}$/);
const pool=new pg.Pool({connectionString:url.href,max:1}),client=await pool.connect();
await client.query('SET search_path="'+schema+'"');
let attempts=0,receiptInsertedBeforeStall=false,fatal,rejectStall,timer;
client.on('error',error=>{fatal??=error;rejectStall?.(fatal);});
const db={query:(...args)=>client.query(...args),async connect(){return {async query(sql,values){
 if(sql==='BEGIN')attempts++;
 const result=await client.query(sql,values);
 if(sql==='INSERT INTO schema_migrations(name) VALUES($1)'&&values?.[0]==='055_achievement_gold_lookup.sql'){
  receiptInsertedBeforeStall=true;
  await new Promise((resolve,reject)=>{rejectStall=reject;timer=setTimeout(resolve,20000);if(fatal)reject(fatal);});
 }
 return result;
 },release(){}};},async end(){}};
const started=performance.now();
try{await migrate(db);console.log(JSON.stringify({result:'UNEXPECTED_SUCCESS',attempts}));}
catch(error){console.log(JSON.stringify({result:'STOP',code:(fatal??error).code??null,attempts,receiptInsertedBeforeStall,elapsedMs:performance.now()-started}));process.exitCode=1;}
finally{clearTimeout(timer);client.release();await pool.end();}
