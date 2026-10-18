import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,transaction,type Database} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {testDatabaseUrl} from './helpers.js';
import {initializePrivateAlpha} from '../src/development.js';
import {privateAlphaConfirmation} from '../src/private-alpha-policy.js';
import {registerAccount,createSession} from '../src/auth.js';
import {purchaseItems} from '../src/inventory.js';
import {buyEstate} from '../src/estate.js';
import {ledger} from '../src/economy.js';
import {vaultTransfer} from '../src/pvp-economy.js';
async function snapshot(db:Database){
 const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows;
 const map:Record<string,string[]>={};for(const {table_name:table} of tables){assert.match(table,/^[a-z_]+$/);map[table]=(await db.query('SELECT row_to_json(t)::text AS row FROM "'+table+'" t')).rows.map(r=>r.row).sort();}return map;
}
test('additive Phase 4.4 upgrade preserves the entire populated Phase 4.3 realm, dev identity, 450 rivals, passwords, sessions, saved costs and financial history',{skip:!testDatabaseUrl},async()=>{
 const admin=createDatabase(testDatabaseUrl!),schema='upgrade44_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);
 const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);const db=createDatabase(url.href);
 try{
  await migrate(db,{through:'015_private_alpha_initialization.sql'});
  await initializePrivateAlpha(db,{NODE_ENV:'production',DATABASE_URL:'postgres://fixture@postgres.railway.internal/railway',KINGDOM_PRIVATE_ALPHA:'1',RAILWAY_SERVICE_ID:randomUUID(),RAILWAY_ENVIRONMENT_ID:randomUUID(),KINGDOM_ALPHA_INITIALIZE:privateAlphaConfirmation,KINGDOM_DEV_PASSWORD:randomUUID()+'Aa1!'});
  const gray=await registerAccount(db,{username:'gray',name:'Existing Gray',password:randomUUID()+'Aa1!'});await createSession(db,gray.accountId);
  await transaction(db,async sql=>{
   await sql.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[gray.characterId]);await ledger(sql,null,'legacy_test_grant',[{characterId:gray.characterId,amount:10000}]);
   await purchaseItems(sql,gray.characterId,1,{'squires-blade':2},randomUUID(),new Date());
   await buyEstate(sql,gray.characterId,1,'smallholding',2,randomUUID(),new Date());
   await vaultTransfer(sql,gray.characterId,50,true,randomUUID(),new Date());
  });
  // Only this isolated fixture: a real Phase 4.3 backup predates the new
  // experience catalog, although the current migration helper knows its ID.
  await db.query("DELETE FROM rulesets WHERE id='player-experience-1'");
  const before=await snapshot(db);await migrate(db);const after=await snapshot(db);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM rulesets WHERE id='player-experience-1'")).rows[0]!.n,1);
  for(const [table,rows] of Object.entries(before)){
   if(['rulesets','schema_migrations'].includes(table)){const current=new Set(after[table]);assert.ok(rows.every(row=>current.has(row)),table);}
   else assert.deepEqual(after[table],rows,table);
  }
  await migrate(db);assert.deepEqual(await snapshot(db),after);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM development_bots')).rows[0]!.n,450);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM authorized_gold_grants')).rows[0]!.n,0,'An upgrade must not execute the gray grant.');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM character_achievements')).rows[0]!.n,0,'Retroactive awards are lazy, not a player rewrite migration.');
 }finally{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
