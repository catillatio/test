// Local benchmark boundary only. The checker, population, migrations and replay
// run unchanged; only its fixed private restore URL is redirected to loopback.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {appendFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {fixtureUrl} from '../../scripts/ci/isolation.mjs';

const local=fixtureUrl(process.env.FIXTURE_POSTGRES_URL),target=process.env.KINGDOM_RESTORE_TEST_DATABASE;
assert.match(target,/^kc_budget_[a-f0-9]{32}_restore_test$/);assert.equal(local.pathname,'/'+target);
const expected=new URL(process.env.KINGDOM_RESTORE_DATABASE_URL);expected.pathname='/'+target;
const trace=value=>appendFileSync(process.env.FIXTURE_TRACE,JSON.stringify(value)+'\n');
let pass=0;
function commitment(table){const value=createHash('sha256');if(!['rulesets','schema_migrations'].includes(table))value.update('kingdom-preservation-full-row-sha256-v1\0');return value;}
function observe(hash,row){if(row.row_sha256){assert.ok(Buffer.isBuffer(row.row_sha256)&&row.row_sha256.length===32);hash.update(row.row_sha256);}else hash.update(String(Buffer.byteLength(row.row))+':'+row.row);}
process.once('beforeExit',()=>trace({operation:'node-usage',maxRssKiB:process.resourceUsage().maxRSS,heapUsed:process.memoryUsage().heapUsed,cpu:process.cpuUsage()}));
globalThis.upgradeBudgetFixture={createDatabase(value){
 assert.equal(value,expected.href);
 const pool=new pg.Pool({connectionString:local.href,max:2,connectionTimeoutMillis:5000,application_name:'kr-local-recovery-budget'});
 return {query:(...args)=>pool.query(...args),async connect(){
  const raw=await pool.connect();
  await raw.query("LOAD 'auto_explain'; SET auto_explain.log_min_duration=0; SET auto_explain.log_analyze=on; SET auto_explain.log_buffers=on; SET auto_explain.log_wal=on; SET auto_explain.log_timing=on; SET auto_explain.log_format=json");
  let active,started,queries=0,digest,rows=0,maxBatch=0;
  async function finish(){if(active){trace({operation:'table',pass,table:active,durationMs:performance.now()-started,queries,rowCount:rows,maxBatch,sha256:digest.digest('hex')});active=undefined;}}
  return {connectionParameters:raw.connectionParameters,
   query(input,...args){
    if(typeof input!=='string'){
     const table=/ FROM public\."([a-z_]+)" t ORDER BY /.exec(input.text)?.[1];
     assert.ok(table);assert.equal(input.callback,undefined);const at=performance.now(),n=pass;
     const hash=commitment(table);input.on('row',row=>observe(hash,row));
     input.once('end',result=>trace({operation:'table',pass:n,table,durationMs:performance.now()-at,queries:1,rowCount:result.rowCount,retainedRows:result.rows.length,sha256:hash.digest('hex')}));
     return raw.query(input,...args);
    }
    return (async()=>{
     if(input==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'){pass++;trace({operation:'begin',pass});}
     const table=/^DECLARE preservation_rows .* FROM public\."([a-z_]+)" t ORDER BY /.exec(input)?.[1];
     if(table){active=table;started=performance.now();queries=0;digest=commitment(table);rows=0;maxBatch=0;}
     if(active)queries++;
     const result=await raw.query(input,...args);
     if(input==='FETCH FORWARD 500 FROM preservation_rows'){for(const row of result.rows)observe(digest,row);rows+=result.rows.length;maxBatch=Math.max(maxBatch,result.rows.length);}
     if(input==='CLOSE preservation_rows')await finish();
     if(input==='COMMIT'||input==='ROLLBACK')trace({operation:input.toLowerCase(),pass});
     return result;
    })();
   },release(){raw.release();}};
 },async end(){await pool.end();}};
}};
registerHooks({resolve(specifier,context,next){
 if(context.parentURL===process.env.FIXTURE_CHECKER_URL&&specifier==='../dist/db.js')return {url:'budget-fixture:db',shortCircuit:true};
 return next(specifier,context);
},load(url,context,next){if(url==='budget-fixture:db')return {format:'module',source:'export const createDatabase=(...args)=>globalThis.upgradeBudgetFixture.createDatabase(...args);',shortCircuit:true};return next(url,context);}});
