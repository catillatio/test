import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const folder=mkdtempSync(join(tmpdir(),'upgrade-progress-'));after(()=>rmSync(folder,{recursive:true,force:true}));
const checker=new URL('../deployment/check-upgrade.mjs',import.meta.url),preload=fileURLToPath(new URL('./fixtures/release-upgrade.mjs',import.meta.url));
const phases=['population','snapshot-before','migrate','snapshot-after','preservation-compare','migrate-replay','snapshot-replay','replay-compare'];
const env={PATH:process.env.PATH,NODE_NO_WARNINGS:'1',NODE_ENV:'production',KINGDOM_PRIVATE_ALPHA:'1',
 RAILWAY_SERVICE_ID:'11111111-1111-4111-8111-111111111111',RAILWAY_ENVIRONMENT_ID:'22222222-2222-4222-8222-222222222222',
 DATABASE_URL:'postgres://fixture:PRIVATE_SOURCE_PASSWORD@source.railway.internal/Railway',KINGDOM_RESTORE_DATABASE_URL:'postgres://fixture:PRIVATE_RESTORE_PASSWORD@restore.railway.internal/Railway',
 KINGDOM_RESTORE_TEST_DATABASE:'kc_private_fixture_restore_test'};
let number=0;
function run(mode='success',overrides={}){
 const trace=join(folder,'trace-'+number++),forbidden=trace+'-forbidden';writeFileSync(trace,'');
 const result=spawnSync(process.execPath,['--import',preload,fileURLToPath(checker)],{env:{...env,FIXTURE_MODE:mode,FIXTURE_TRACE:trace,FIXTURE_FORBIDDEN:forbidden,FIXTURE_CHECKER_URL:checker.href,...overrides},encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
 assert.equal(result.error,undefined,'Offline checker must complete');assert.equal(existsSync(forbidden),false,'No real network, worker or unexpected external operation is allowed');
 const progress=result.stderr.split('\n').filter(line=>line.startsWith('UPGRADE_PROGRESS: ')).map(line=>JSON.parse(line.slice('UPGRADE_PROGRESS: '.length)));
 let elapsed=0;
 for(const event of progress){assert.deepEqual(Object.keys(event),['phase','event','elapsed_ms']);assert.ok(phases.includes(event.phase));assert.ok(['start','complete'].includes(event.event));assert.ok(Number.isSafeInteger(event.elapsed_ms)&&event.elapsed_ms>=elapsed);elapsed=event.elapsed_ms;}
 assert.doesNotMatch(JSON.stringify(progress),/PRIVATE_|UNSAFE_|accounts|battles|rulesets|schema_migrations|postgres|SELECT|sha256/);
 return {...result,progress,trace:readFileSync(trace,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))};
}
const events=phaseList=>phaseList.flatMap(phase=>[{phase,event:'start'},{phase,event:'complete'}]);
const labels=result=>result.progress.map(({phase,event})=>({phase,event}));

test('checker reports only fixed monotonic phase metadata while retaining all snapshots, comparisons and stdout proof',()=>{
 const result=run();assert.equal(result.status,0,result.stderr);assert.deepEqual(labels(result),events(phases));
 assert.equal(result.stderr.trim().split('\n').length,16,'Successful stderr contains only fixed progress records');
 const operations=result.trace.map(x=>x.op);assert.equal(operations.filter(x=>x==='begin').length,3);assert.equal(operations.filter(x=>x==='commit').length,3);assert.equal(operations.filter(x=>x==='migrate').length,2);assert.equal(operations.filter(x=>x==='release').length,3);assert.equal(operations.filter(x=>x==='rollback').length,0);assert.equal(operations.at(-1),'end');
 for(const pass of [1,2,3])assert.deepEqual(result.trace.filter(x=>x.op==='fetch'&&x.pass===pass&&x.table==='battles').map(x=>x.offset),[0,500,1000,1002]);
 assert.equal(result.trace.filter(x=>x.op==='tables').length,3,'One bulk key inventory is read inside each snapshot transaction');
 for(const entry of result.trace.filter(x=>x.op==='declare')){
  const registry=['rulesets','schema_migrations'].includes(entry.table);
  assert.equal(entry.order,registry?'row_to_json(t)::text':'t."id"');
  assert.equal(entry.projection,registry?'row_to_json(t)::text AS row':"pg_catalog.sha256(pg_catalog.convert_to(row_to_json(t)::text,'UTF8')) AS row_sha256");
 }
 const report=JSON.parse(result.stdout),sha=value=>createHash('sha256').update(value).digest('hex');
 const tableRows={accounts:[JSON.stringify({id:'PRIVATE_ACCOUNT_ID',name:'PRIVATE_ROW_CONTENT'})],battles:Array.from({length:1002},(_,i)=>JSON.stringify({id:String(i).padStart(4,'0'),snapshot:'PRIVATE_ROW_CONTENT_雪'})),development_bots:Array.from({length:450},(_,i)=>JSON.stringify({id:String(i).padStart(4,'0')})),rulesets:[JSON.stringify({id:'existing-rule'}),JSON.stringify({id:'new-rule'})],schema_migrations:[JSON.stringify({name:'existing-migration'}),JSON.stringify({name:'new-migration'})]};
 const after=Object.fromEntries(Object.entries(tableRows).map(([table,values])=>{
  const rows=values.sort(),digest=createHash('sha256').update('kingdom-preservation-full-row-sha256-v1\0');
  for(const row of rows)digest.update(createHash('sha256').update(row,'utf8').digest());
  return [table,['rulesets','schema_migrations'].includes(table)?rows:{count:rows.length,sha256:digest.digest('hex')}];
 }));
 assert.deepEqual(report,{passed:true,restoredDatabase:env.KINGDOM_RESTORE_TEST_DATABASE,restoredHost:'restore.railway.internal',accounts:1,bots:450,population:null,existingTablesVerified:5,sha256:sha(JSON.stringify(after)),migrationReplay:'unchanged',liveDatabaseConnected:false});
 assert.doesNotMatch(result.stdout,/PRIVATE_SOURCE_PASSWORD|PRIVATE_RESTORE_PASSWORD|PRIVATE_ROW_CONTENT|PRIVATE_ACCOUNT_ID/);
});

test('primary-key order streams and hashes complete rows without sorting the wide JSON representation',()=>{
 const result=run('primary-order');assert.equal(result.status,0,result.stderr);
 const rows=[JSON.stringify({snapshot:'b',id:1}),JSON.stringify({snapshot:'z',id:2}),JSON.stringify({snapshot:'a',id:10})];
 assert.notDeepEqual(rows,rows.slice().sort(),'Native key order intentionally differs from full-JSON text order');
 const declarations=result.trace.filter(x=>x.op==='declare'&&x.table==='battles');
 assert.deepEqual(declarations.map(x=>x.order),Array(3).fill('t."id"'));
 assert.equal(JSON.parse(result.stdout).passed,true);
 assert.deepEqual(labels(result),events(phases));
});

test('composite keys retain ordinal order and quote unusual column identifiers',()=>{
 const result=run('composite-order');assert.equal(result.status,0,result.stderr);
 assert.deepEqual(result.trace.filter(x=>x.op==='declare'&&x.table==='composite_records').map(x=>x.order),Array(3).fill('t."tenant",t."odd""key"'));
 assert.equal(JSON.parse(result.stdout).existingTablesVerified,6);
});

test('baseline ordering remains fixed when a migration adds or changes a primary key',()=>{
 for(const [mode,expected]of[['key-added','row_to_json(t)::text'],['key-changed','t."id"']]){
  const result=run(mode);assert.equal(result.status,0,result.stderr);
  assert.deepEqual(result.trace.filter(x=>x.op==='declare'&&x.table==='battles').map(x=>x.order),Array(3).fill(expected));
 }
 const added=run('new-table');assert.equal(added.status,0,added.stderr);
 assert.deepEqual(added.trace.filter(x=>x.op==='declare'&&x.table==='new_records').map(({pass,order})=>({pass,order})),[{pass:2,order:'t."id"'},{pass:3,order:'t."id"'}]);
});

test('unkeyed tables retain full-row sorting and duplicate-row multiplicity protection',()=>{
 const success=run('unkeyed-duplicates');assert.equal(success.status,0,success.stderr);
 assert.deepEqual(success.trace.filter(x=>x.op==='declare'&&x.table==='battles').map(x=>x.order),Array(3).fill('row_to_json(t)::text'));
 const changed=run('unkeyed-delete');assert.equal(changed.status,1);assert.equal(changed.stdout,'');
 assert.deepEqual(labels(changed).at(-1),{phase:'preservation-compare',event:'start'});
});

test('malformed key metadata fails before opening the table cursor',()=>{
 const result=run('invalid-keys');assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.trace.filter(x=>x.op==='declare'&&x.table==='battles').length,0);
 assert.equal(result.trace.filter(x=>x.op==='rollback').length,1);assert.equal(result.trace.at(-1).op,'end');
});

test('missing, malformed or text-encoded row digests cannot certify preservation',()=>{
 for(const mode of ['malformed-rowhash','string-rowhash','missing-rowhash']){
  const result=run(mode);assert.equal(result.status,1);assert.equal(result.stdout,'');
  assert.deepEqual(labels(result).at(-1),{phase:'snapshot-before',event:'start'});
  assert.equal(result.trace.filter(x=>x.op==='rollback').length,1);assert.equal(result.trace.at(-1).op,'end');
 }
});

for(const phase of phases)test('failure in '+phase+' never reports that phase complete or reaches later operations',()=>{
 const result=run(phase);assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.deepEqual(labels(result),[...events(phases.slice(0,phases.indexOf(phase))),{phase,event:'start'}]);
 assert.equal(result.trace.at(-1).op,'end');
 const migrations=result.trace.filter(x=>x.op==='migrate').length;
 assert.equal(migrations,phases.indexOf(phase)<2?0:phases.indexOf(phase)<5?1:2);
 if(phase.startsWith('snapshot-'))assert.equal(result.trace.filter(x=>x.op==='rollback').length,1,'Snapshot exceptions retain rollback and release');
});

test('existing registry rows and population identities still fail closed',()=>{
 for(const [mode,phase]of[['registry-rewrite','preservation-compare'],['population-mismatch','population']]){
  const result=run(mode);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.deepEqual(labels(result).at(-1),{phase,event:'start'});assert.equal(result.trace.at(-1).op,'end');
 }
});

test('operator, distinct-copy and independent private-host guards fail before any database operation or progress',()=>{
 for(const overrides of [{KINGDOM_PRIVATE_ALPHA:'0'},{NODE_ENV:'test'},{RAILWAY_SERVICE_ID:undefined},{CODESPACES:'true'},
  {KINGDOM_RESTORE_TEST_DATABASE:'Railway'},{KINGDOM_RESTORE_TEST_DATABASE:'bad_copy'},
  {DATABASE_URL:env.DATABASE_URL.replace('/Railway','/'+env.KINGDOM_RESTORE_TEST_DATABASE)},
  {KINGDOM_RESTORE_DATABASE_URL:env.DATABASE_URL},{KINGDOM_RESTORE_DATABASE_URL:'postgres://fixture:PRIVATE_PASSWORD@public.example/Railway'},
  {DATABASE_URL:env.DATABASE_URL+'?options=unsafe'}]){
  const result=run('success',overrides);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.deepEqual(result.progress,[]);assert.deepEqual(result.trace,[]);
 }
});
