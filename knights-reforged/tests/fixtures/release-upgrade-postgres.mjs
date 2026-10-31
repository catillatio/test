// Execute the actual checker and cursor SQL against an owned, local PostgreSQL
// fixture. Only population evidence and migration contents are synthetic.
import assert from 'node:assert/strict';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {readFileSync,appendFileSync} from 'node:fs';
import pg from 'pg';
import {fixtureUrl} from '../../scripts/ci/isolation.mjs';

const local=fixtureUrl(process.env.FIXTURE_POSTGRES_URL),target=process.env.KINGDOM_RESTORE_TEST_DATABASE;
assert.match(target,/^kc_snapshot_[a-f0-9]{32}_restore_test$/);
assert.equal(local.pathname,'/'+target);
const expected=new URL(process.env.KINGDOM_RESTORE_DATABASE_URL);expected.pathname='/'+target;
const trace=value=>appendFileSync(process.env.FIXTURE_TRACE,JSON.stringify(value)+'\n');
let pool,migrations=0;
globalThis.upgradePostgresFixture={
 createDatabase(url){
  assert.equal(url,expected.href);
  // Only the DB factory boundary redirects the separately authenticated private
  // restore identity to this explicitly validated, local disposable database.
  pool=new pg.Pool({connectionString:local.href,max:2,connectionTimeoutMillis:5000,statement_timeout:10000});
  return {query:(...args)=>pool.query(...args),async connect(){
   const client=await pool.connect();
   return {async query(sql,...args){
    const result=await client.query(sql,...args);
    if(sql.startsWith('BEGIN '))trace({operation:'begin'});
    if(sql==='COMMIT'||sql==='ROLLBACK')trace({operation:sql.toLowerCase()});
    if(sql.startsWith('DECLARE preservation_rows '))trace({operation:'declare',sql});
    return result;
   },release(){trace({operation:'release'});client.release();}};
  },async end(){trace({operation:'end'});await pool.end();}};
 },async populationEvidence(){return null;},
 async migrate(){
  migrations++;trace({operation:'migrate',number:migrations});
  const mode=process.env.FIXTURE_MODE;
  if(migrations===1){
   await pool.query("INSERT INTO rulesets VALUES ('new', '{\"version\":2}'); INSERT INTO schema_migrations VALUES ('new','new-sha')");
   const statements={
    update:"UPDATE battles SET result=jsonb_set(result,'{gold}','999') WHERE id=1002",
    insert:"INSERT INTO battles SELECT 2000,snapshot,result,created_at FROM battles WHERE id=2",
    delete:'DELETE FROM battles WHERE id=2',
    'heap-update':"UPDATE heap_history SET payload='{\"changed\":true}' WHERE k=2",
    'heap-delete-duplicate':"DELETE FROM heap_history WHERE ctid=(SELECT ctid FROM heap_history WHERE k=1 LIMIT 1)",
    'composite-update':"UPDATE composite_history SET payload='{\"changed\":true}' WHERE \"zone\"\"code\"='west' AND sequence=2",
    'registry-rewrite':"UPDATE rulesets SET definition='{\"rewritten\":true}' WHERE id='existing'",
    'physical-reorder':'CLUSTER battles USING battles_pkey; CLUSTER numeric_keys USING numeric_keys_pkey',
    'add-primary':'ALTER TABLE key_later ADD PRIMARY KEY(id)',
    'replace-primary':'ALTER TABLE numeric_keys DROP CONSTRAINT numeric_keys_pkey; ALTER TABLE numeric_keys ADD PRIMARY KEY(payload)',
    'drop-ordered-column':'ALTER TABLE numeric_keys DROP COLUMN id',
    'new-table':'CREATE TABLE new_history(id integer PRIMARY KEY,payload text); INSERT INTO new_history VALUES(2,\'second\'),(1,\'first\')'
   };
   if(Object.hasOwn(statements,mode))await pool.query(statements[mode]);
  }else if(mode==='replay-update')await pool.query("UPDATE battles SET snapshot=jsonb_set(snapshot,'{army}','777') WHERE id=2");
 }
};
const sourceCode=name=>stripTypeScriptTypes(readFileSync(new URL('../../src/'+name+'.ts',import.meta.url),'utf8'));
const sources=new Map([
 ['postgres-upgrade:db','export const createDatabase=(...args)=>globalThis.upgradePostgresFixture.createDatabase(...args);'],
 ['postgres-upgrade:migrate','export const migrate=(...args)=>globalThis.upgradePostgresFixture.migrate(...args);'],
 ['postgres-upgrade:population','export const populationEvidence=(...args)=>globalThis.upgradePostgresFixture.populationEvidence(...args);'],
 ['postgres-upgrade:operator',sourceCode('operator')],['postgres-upgrade:private-alpha',sourceCode('private-alpha-policy')],
 ['postgres-upgrade:operator-db','export const transaction=()=>{throw Error("unused operator mutation");};'],
 ['postgres-upgrade:operator-ledger','export const ledger=()=>{throw Error("unused operator mutation");};'],
 ['postgres-upgrade:operator-errors','export class GameError extends Error {}'],
 ['postgres-upgrade:operator-experience',"export const experienceRules={id:'unused'};"]
]);
const entry={'../dist/db.js':'db','../dist/migrate.js':'migrate','../dist/expansion-population.js':'population','../dist/operator.js':'operator'};
const operator={'./db.js':'operator-db','./economy.js':'operator-ledger','./errors.js':'operator-errors','./experience-rules.js':'operator-experience','./private-alpha-policy.js':'private-alpha'};
registerHooks({resolve(specifier,context,next){
 const mocks=context.parentURL===process.env.FIXTURE_CHECKER_URL?entry:context.parentURL==='postgres-upgrade:operator'?operator:null;
 if(mocks&&Object.hasOwn(mocks,specifier))return {url:'postgres-upgrade:'+mocks[specifier],shortCircuit:true};
 return next(specifier,context);
},load(url,context,next){if(sources.has(url))return {format:'module',source:sources.get(url),shortCircuit:true};return next(url,context);}});
