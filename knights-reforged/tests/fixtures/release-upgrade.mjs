// Offline boundaries for the actual upgrade checker. No PostgreSQL or provider
// connection is allowed; the checker, SQL/cursor loop and comparisons still run.
import assert from 'node:assert/strict';
import {registerHooks,syncBuiltinESMExports,stripTypeScriptTypes} from 'node:module';
import {readFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import http from 'node:http';import https from 'node:https';
import net from 'node:net';import tls from 'node:tls';
import dns from 'node:dns';import dgram from 'node:dgram';
import child from 'node:child_process';import workers from 'node:worker_threads';

const mode=process.env.FIXTURE_MODE,secret='UNSAFE_UPGRADE_EXCEPTION_CONTENT';
const record=value=>appendFileSync(process.env.FIXTURE_TRACE,JSON.stringify(value)+'\n');
const fail=()=>{throw new Error(secret);};
const block=()=>{appendFileSync(process.env.FIXTURE_FORBIDDEN,'blocked\n');fail();};
for(const [module,names]of[[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],
 [tls,['connect']],[dns,['lookup','resolve']],[dns.promises,['lookup','resolve']],[dgram,['createSocket']],
 [child,['spawn','exec','execFile','fork','spawnSync','execSync','execFileSync']],[workers,['Worker']]])for(const name of names)module[name]=block;
syncBuiltinESMExports();globalThis.fetch=block;

const tables=['accounts','battles','development_bots','rulesets','schema_migrations'];
const original={
 accounts:[JSON.stringify({id:'PRIVATE_ACCOUNT_ID',name:'PRIVATE_ROW_CONTENT'})],
 battles:Array.from({length:1002},(_,i)=>JSON.stringify({id:String(i).padStart(4,'0'),snapshot:'PRIVATE_ROW_CONTENT_雪'})),
 development_bots:Array.from({length:450},(_,i)=>JSON.stringify({id:String(i).padStart(4,'0')})),
 rulesets:[JSON.stringify({id:'existing-rule'})],schema_migrations:[JSON.stringify({name:'existing-migration'})]
};
if(mode==='primary-order')original.battles=[JSON.stringify({snapshot:'z',id:2}),JSON.stringify({snapshot:'a',id:10}),JSON.stringify({snapshot:'b',id:1})];
if(mode==='composite-order'){
 tables.push('composite_records');tables.sort();
 original.composite_records=[JSON.stringify({tenant:2,'odd"key':'a',value:'first'}),JSON.stringify({tenant:1,'odd"key':'z',value:'second'}),JSON.stringify({tenant:1,'odd"key':'a',value:'third'})];
}
if(mode==='unkeyed-duplicates'||mode==='unkeyed-delete')original.battles.push(original.battles[0]);
let pass=0,migrations=0,currentTable,currentOrder,currentProjection,offset=0,inTransaction=false;
function tableInventory(){
 const names=mode==='new-table'&&migrations?[...tables,'new_records'].sort():tables;
 return names.map(table_name=>({table_name,key_columns:table_name==='rulesets'||table_name==='schema_migrations'?['id']:
  table_name==='composite_records'?['tenant','odd"key']:
  table_name==='battles'&&((mode==='key-added'&&pass===1)||mode==='unkeyed-duplicates'||mode==='unkeyed-delete')?null:
  table_name==='battles'&&mode==='key-changed'&&pass>1?['snapshot']:
  table_name==='new_records'&&pass===3?null:mode==='invalid-keys'&&table_name==='battles'?[]:['id']}));
}
function rows(table){
 const values=table==='new_records'?[JSON.stringify({id:2,value:'new-table-second'}),JSON.stringify({id:1,value:'new-table-first'})]:original[table].slice();
 if(migrations&&table==='rulesets')values.push(JSON.stringify({id:'new-rule'}));
 if(migrations&&table==='schema_migrations')values.push(JSON.stringify({name:'new-migration'}));
 if((mode==='preservation-compare'&&pass===2||mode==='replay-compare'&&pass===3)&&table==='accounts')values[0]=JSON.stringify({id:'PRIVATE_ACCOUNT_ID',name:'changed'});
 if(mode==='registry-rewrite'&&pass===2&&table==='rulesets')values[0]=JSON.stringify({id:'rewritten-existing-rule'});
 if(mode==='unkeyed-delete'&&pass===2&&table==='battles')values.pop();
 if(currentOrder==='row_to_json(t)::text')return values.sort();
 const keys=[...currentOrder.matchAll(/t\."((?:[^"]|"")+)"/g)].map(match=>match[1].replaceAll('""','"'));
 assert.ok(keys.length>0);
 return values.sort((a,b)=>{a=JSON.parse(a);b=JSON.parse(b);for(const key of keys){if(a[key]<b[key])return -1;if(a[key]>b[key])return 1;}return 0;});
}
const snapshotPhase=()=>pass===1?'snapshot-before':pass===2?'snapshot-after':'snapshot-replay';
const client={async query(sql){
 if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'){assert.equal(inTransaction,false);inTransaction=true;pass++;record({op:'begin',pass});return {rows:[]};}
 if(sql.startsWith('SELECT t.table_name,p.key_columns\n')){
  assert.equal(inTransaction,true);
  for(const condition of ['i.indisprimary','i.indisunique','i.indisvalid','i.indisready','a.attnotnull','NOT a.attisdropped','k.ordinality<=i.indnkeyatts',"t.table_schema='public'", "t.table_type='BASE TABLE'"] )assert.ok(sql.includes(condition));
  record({op:'tables',pass});return {rows:tableInventory()};
 }
 const declare=/^DECLARE preservation_rows NO SCROLL CURSOR FOR SELECT (row_to_json\(t\)::text AS row|pg_catalog\.sha256\(pg_catalog\.convert_to\(row_to_json\(t\)::text,'UTF8'\)\) AS row_sha256) FROM public\."([a-z_]+)" t ORDER BY (row_to_json\(t\)::text|t\."(?:[^"]|"")+"(?:,t\."(?:[^"]|"")+")*)$/.exec(sql);
 if(declare){assert.equal(inTransaction,true);assert.ok(tableInventory().some(row=>row.table_name===declare[2]));currentProjection=declare[1];currentTable=declare[2];currentOrder=declare[3];offset=0;record({op:'declare',pass,table:currentTable,order:currentOrder,projection:currentProjection});return {rows:[]};}
 if(sql==='FETCH FORWARD 500 FROM preservation_rows'){
  assert.equal(inTransaction,true);assert.ok(currentTable);record({op:'fetch',pass,table:currentTable,offset});
  if(mode===snapshotPhase()&&currentTable==='battles')fail();
  const batch=rows(currentTable).slice(offset,offset+500);offset+=batch.length;
  return {rows:batch.map(row=>currentProjection.endsWith(' AS row')?{row}:{row_sha256:
   mode==='malformed-rowhash'&&currentTable==='battles'?Buffer.alloc(31):
   mode==='string-rowhash'&&currentTable==='battles'?'0'.repeat(64):
   mode==='missing-rowhash'&&currentTable==='battles'?undefined:createHash('sha256').update(row,'utf8').digest()})};
 }
 if(sql==='CLOSE preservation_rows'){assert.ok(currentTable);record({op:'cursor-close',pass,table:currentTable});currentTable=undefined;return {rows:[]};}
 if(sql==='COMMIT'||sql==='ROLLBACK'){assert.equal(inTransaction,true);inTransaction=false;currentTable=undefined;record({op:sql.toLowerCase(),pass});return {rows:[]};}
 return block();
 },release(){assert.equal(inTransaction,false);record({op:'release',pass});}};
const db={async query(sql){
 assert.equal(sql,'SELECT (SELECT count(*) FROM accounts)::int AS accounts,(SELECT count(*) FROM development_bots)::int AS bots');
 record({op:'counts'});if(mode==='population')fail();return {rows:[{accounts:1,bots:mode==='population-mismatch'?449:450}]};
 },async connect(){record({op:'connect'});return client;},async end(){record({op:'end'});}};
globalThis.upgradeFixture={createDatabase(value){
 const expected=new URL(process.env.KINGDOM_RESTORE_DATABASE_URL);expected.pathname='/'+process.env.KINGDOM_RESTORE_TEST_DATABASE;
 assert.equal(value,expected.href);record({op:'pool'});return db;
 },async populationEvidence(){record({op:'population'});return null;},async migrate(value){
 assert.equal(value,db);assert.equal(inTransaction,false);migrations++;record({op:'migrate',number:migrations});
 if(mode===(migrations===1?'migrate':'migrate-replay'))fail();
 },block};

const source=name=>stripTypeScriptTypes(readFileSync(new URL('../../src/'+name+'.ts',import.meta.url),'utf8'));
const sources=new Map([
 ['upgrade-fixture:db','export const createDatabase=(...args)=>globalThis.upgradeFixture.createDatabase(...args);'],
 ['upgrade-fixture:migrate','export const migrate=(...args)=>globalThis.upgradeFixture.migrate(...args);'],
 ['upgrade-fixture:population','export const populationEvidence=(...args)=>globalThis.upgradeFixture.populationEvidence(...args);'],
 // Execute the real operator authorization and private-alpha policy. Only its
 // unused administrative dependencies are replaced by hard-failing stubs.
 ['upgrade-fixture:operator',source('operator')],['upgrade-fixture:private-alpha',source('private-alpha-policy')],
 ['upgrade-fixture:operator-db','export const transaction=(...args)=>globalThis.upgradeFixture.block(...args);'],
 ['upgrade-fixture:operator-ledger','export const ledger=(...args)=>globalThis.upgradeFixture.block(...args);'],
 ['upgrade-fixture:operator-errors','export class GameError extends Error {}'],
 ['upgrade-fixture:operator-experience',"export const experienceRules={id:'unused-offline-fixture'};"]
]);
const entryMocks={'../dist/db.js':'db','../dist/migrate.js':'migrate','../dist/expansion-population.js':'population','../dist/operator.js':'operator'};
const operatorMocks={'./db.js':'operator-db','./economy.js':'operator-ledger','./errors.js':'operator-errors','./experience-rules.js':'operator-experience','./private-alpha-policy.js':'private-alpha'};
registerHooks({
 resolve(specifier,context,next){
  const mocks=context.parentURL===process.env.FIXTURE_CHECKER_URL?entryMocks:context.parentURL==='upgrade-fixture:operator'?operatorMocks:null;
  if(mocks&&Object.hasOwn(mocks,specifier))return {url:'upgrade-fixture:'+mocks[specifier],shortCircuit:true};
  return next(specifier,context);
 },load(url,context,next){if(sources.has(url))return {format:'module',source:sources.get(url),shortCircuit:true};return next(url,context);}
});
