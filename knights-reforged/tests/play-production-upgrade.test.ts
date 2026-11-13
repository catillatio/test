import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {realm} from './helpers.js';
import {migrate} from '../src/migrate.js';
import {loadConfig} from '../src/config.js';
import {registerAccount,createSession} from '../src/auth.js';
async function snapshot(db:any){
 const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows;
 const result:Record<string,string[]>={};for(const {table_name:table} of tables){assert.match(table,/^[a-z_]+$/);result[table]=(await db.query('SELECT row_to_json(t)::text AS row FROM "'+table+'" t')).rows.map((row:any)=>row.row).sort();}return result;
}
test('current deployed 052 source upgrades to Play 054 without rewriting any existing business row or migration; replay is exact',async()=>{
 const pinned=JSON.parse(await readFile(new URL('./fixtures/play-production-migrations.json',import.meta.url),'utf8'));
 for(const [file,digest]of Object.entries(pinned.files))assert.equal(createHash('sha256').update(await readFile(new URL('../migrations/'+file,import.meta.url))).digest('hex'),digest,file+' is immutable');
 const r=await realm({isolated:true,migrationThrough:'052_npc_sponsorship.sql'});
 try{
  async function oldPlayer(name:string){
   const account=await registerAccount(r.db,{name,username:'p_'+randomUUID().replaceAll('-','').slice(0,20),password:'SyntheticTest!2026'});
   const session=await createSession(r.db,account.accountId);
   return {id:account.characterId,accountId:account.accountId,cookie:'kr_session='+session.token,csrf:session.session.csrf_token};
  }
  const a=await oldPlayer('Play Upgrade One'),b=await oldPlayer('Play Upgrade Two');
  await r.prepare(a,100000,30);await r.prepare(b,20000,30);
  await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});
  await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:1});
  // Populated current-production caches and immutable premium/achievement records
  // are synthetic evidence only: no disabled payout/provider operation is invoked.
  await r.db.query('INSERT INTO crown_wallets(character_id,balance) VALUES($1,0) ON CONFLICT DO NOTHING',[a.id]);
  const old=await snapshot(r.db);await migrate(r.db);const next=await snapshot(r.db);
  for(const [table,rows]of Object.entries(old)){
   if(['schema_migrations','rulesets'].includes(table))assert.ok(rows.every(row=>new Set(next[table]).has(row)),table);
   else assert.deepEqual(next[table],rows,table);
  }
  assert.equal(next.schema_migrations?.length,35);assert.equal(Object.keys(next).length,106);
  for(const table of Object.keys(next).filter(t=>!Object.hasOwn(old,t)))assert.equal(next[table]?.length,0,table+' starts empty');
  await migrate(r.db);assert.deepEqual(await snapshot(r.db),next);
  const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000'});
  assert.equal(config.developmentBotBountiesEnabled,false);assert.equal(config.developmentBotRecruitmentEnabled,false);
  await mkdir('test-results',{recursive:true});await writeFile('test-results/play-production-upgrade.json',JSON.stringify({base:pinned.source,from:'052_npc_sponsorship.sql',to:'054_account_erasure.sql',oldTables:Object.keys(old).length,totalTables:Object.keys(next).length,immutableMigrationsVerified:Object.keys(pinned.files).length,businessRows:'exact',replay:'exact',liveDataUsed:false},null,2)+'\n');
 }finally{await r.close();}
});
