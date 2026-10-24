import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';import {transaction} from '../src/db.js';
import {readInventory} from '../src/inventory.js';import {readArmyRoster,rosterPageSize} from '../src/army-roster.js';
import {grantExperience} from '../src/progression.js';import {levelRequirement} from '../src/alpha-rules.js';
import {prepareProgressionEpoch,readProgressionEpoch} from '../src/progression-policy.js';
import {assertInstalledRulesets} from '../src/migrate.js';
const options={skip:!testDatabaseUrl,timeout:120000};

test('E2a 2500-copy FIFO sales preserve costs, active limits, rollback and concurrent receipt replay',options,async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Stored Quantity');await r.prepare(a,50000);await r.ok(a,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});
  const entry=(await r.db.query('SELECT id FROM inventory_entries WHERE character_id=$1',[a.id])).rows[0]!.id;
  await r.db.query('UPDATE inventory_entries SET quantity=2500 WHERE id=$1',[entry]);await r.db.query('UPDATE inventory_lots SET acquired_quantity=2500,remaining_quantity=2500,unit_cost=75 WHERE inventory_entry_id=$1',[entry]);
  let item=(await readInventory(r.db,a.id))[0]!;assert.equal(item.quantity,2500);assert.equal(item.maxSell,100);assert.equal(item.resaleSteps![99],5000);
  const denied=await r.command(a,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1,inventoryPolicy:'inventory-large-1'});assert.equal(denied.statusCode,409);assert.equal(denied.json().error.code,'INVENTORY_LIMIT');
  const key=randomUUID(),before=(await r.me(a)).gold;
  await Promise.all([r.ok(a,'/api/v1/inventory/sales',{itemId:'squires-blade',quantity:50},key),r.ok(a,'/api/v1/inventory/sales',{itemId:'squires-blade',quantity:50},key)]);
  assert.equal((await r.me(a)).gold,before+2500);assert.equal((await readInventory(r.db,a.id))[0]!.quantity,2450);
  await assert.rejects(r.db.query('UPDATE inventory_entries SET quantity=5001 WHERE id=$1',[entry]),{code:'23514'});
  await r.db.query('UPDATE inventory_entries SET quantity=110 WHERE id=$1',[entry]);await r.db.query('UPDATE inventory_lots SET acquired_quantity=100,remaining_quantity=100 WHERE inventory_entry_id=$1',[entry]);
  await r.db.query(`INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,acquired_at) VALUES($1,$2,$3,'alpha-0.3',10,10,101,clock_timestamp()+interval '1 second')`,[randomUUID(),entry,a.id]);
  const money=(await r.me(a)).gold;
  await Promise.all([r.ok(a,'/api/v1/inventory/sales',{itemId:'squires-blade',quantity:50}),r.ok(a,'/api/v1/inventory/sales',{itemId:'squires-blade',quantity:50})]);
  item=(await readInventory(r.db,a.id))[0]!;assert.equal(item.quantity,10);assert.equal(item.resaleSteps![9],670);assert.equal((await r.me(a)).gold,money+5000);
  await r.db.query('UPDATE inventory_entries SET quantity=11 WHERE id=$1',[entry]);const bad=await r.command(a,'/api/v1/inventory/sales',{itemId:'squires-blade',quantity:1});assert.equal(bad.json().error.code,'INVENTORY_INCONSISTENT');assert.equal((await r.me(a)).gold,money+5000);
 }finally{await r.close();}
});

test('E2a paged 2540-member fixture uses complete counts and owner-bound cursors, with usable pending filters',options,async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Large Roster'),b=await r.player('Other Viewer');
  const empty=await readArmyRoster(r.db,b.id);assert.equal(empty.total,0);assert.deepEqual(empty.links,[]);assert.equal(empty.nextCursor,null);
  const rows=(await r.db.query(`WITH ids AS MATERIALIZED (SELECT gen_random_uuid() aid,gen_random_uuid() cid,n FROM generate_series(1,2540) n),
   inserted AS (INSERT INTO accounts(id,username,password_hash) SELECT aid,'roster_'||n,'synthetic-disabled-login' FROM ids RETURNING id)
   INSERT INTO characters(id,account_id,name) SELECT cid,aid,CASE WHEN n=1 THEN '<b>Rune🜁' ELSE 'Repeated Name '||(n%3) END FROM ids JOIN inserted ON inserted.id=aid RETURNING id`)).rows;
  const ids=rows.map(row=>row.id);await r.db.query(`INSERT INTO army_links(low_id,high_id,inviter_id,status)
   SELECT LEAST($1::uuid,cid),GREATEST($1::uuid,cid),CASE WHEN n>2500 AND n<=2520 THEN cid ELSE $1::uuid END,CASE WHEN n<=2500 THEN 'accepted' ELSE 'pending' END
   FROM unnest($2::uuid[]) WITH ORDINALITY AS x(cid,n)`,[a.id,ids]);
  await r.db.query('UPDATE characters SET attained_level=500 WHERE id=$1',[a.id]);
  const state=await r.me(a);assert.equal(state.army.allies,2500);assert.equal(state.army.total,2501);assert.equal(state.army.participants,101);assert.equal(state.army.links.length,rosterPageSize);assert.equal(state.army.incoming,20);assert.equal(state.army.outgoing,20);
  const seen=new Set<string>();let cursor:string|undefined;do{const page=await readArmyRoster(r.db,a.id,{},cursor);for(const link of page.links){assert.ok(!seen.has(link.characterId));seen.add(link.characterId);}cursor=page.nextCursor??undefined;}while(cursor);
  assert.equal(seen.size,2540);
  const incoming=await readArmyRoster(r.db,a.id,{},undefined,'incoming');assert.equal(incoming.links.length,20);assert.ok(incoming.links.every(l=>l.incoming&&l.status==='pending'));
  const html=await r.app.inject({method:'GET',url:'/game/army?tab=army',headers:{cookie:a.cookie}});assert.equal(html.statusCode,200);assert.match(html.body,/Next members/);assert.match(html.body,/&lt;b&gt;Rune/);assert.doesNotMatch(html.body,/<b>Rune/);
  const pending=await r.app.inject({method:'GET',url:'/game/army?tab=army&roster=incoming',headers:{cookie:a.cookie}});assert.equal(pending.statusCode,200);assert.match(pending.body,/Incoming invitation/);
  await assert.rejects(readArmyRoster(r.db,b.id,{},state.army.nextCursor!),{code:'INVALID_CURSOR'});await assert.rejects(readArmyRoster(r.db,a.id,{},'not-json'),{code:'INVALID_CURSOR'});
  const limited=await r.command(a,'/api/v1/army/invitations',{targetCharacterId:b.id,armyPolicy:'army-five-per-level-1'});assert.equal(limited.json().error.code,'ROSTER_LIMIT');
  await r.db.query("UPDATE army_links SET status='declined' WHERE low_id=LEAST($1::uuid,$2::uuid) AND high_id=GREATEST($1::uuid,$2::uuid)",[a.id,ids[0]]);assert.equal((await r.me(a)).army.allies,2499);
 }finally{await r.close();}
});

test('E2a installed policy tampering fails closed and cannot activate an alternative through stored JSON',options,async()=>{
 const r=await realm({isolated:true});try{
  await assert.rejects(transaction(r.db,async sql=>{
   await sql.query(`UPDATE rulesets SET definition=jsonb_set(definition,'{active,army}','"army-five-per-level-1"') WHERE id='expansion-compatibility-1'`);
   await assert.rejects(assertInstalledRulesets(sql),/immutable/);throw new Error('roll back synthetic policy tampering');
  }),/roll back synthetic/);
  await assertInstalledRulesets(r.db);
 }finally{await r.close();}
});

test('E2a stored future epoch is dormant, grants serialize once per crossing and resource replay stays unchanged',options,async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Epoch Knight'),level=100,requirement=levelRequirement(level),epoch=prepareProgressionEpoch(level,requirement-2,'xp-post50-150-1');
  await r.db.query('UPDATE characters SET attained_level=$2,level_xp=$3,health=10,mana=1,spirit=0 WHERE id=$1',[a.id,level,requirement-2]);
  await r.db.query('INSERT INTO character_progression_epochs(character_id,policy_id,boundary_level,boundary_requirement,starting_progress) VALUES($1,$2,$3,$4,$5)',[a.id,epoch.policyId,epoch.boundaryLevel,epoch.boundaryRequirement,epoch.startingProgress]);
  assert.deepEqual(await readProgressionEpoch(r.db,a.id,'xp-post50-150-1'),epoch);
  await Promise.all([transaction(r.db,sql=>grantExperience(sql,a.id,1,new Date())),transaction(r.db,sql=>grantExperience(sql,a.id,1,new Date()))]);
  let state=await r.me(a);assert.equal(state.level,101);assert.equal(state.levelXp,0);assert.equal(state.skillPoints,1);assert.equal(state.levelRequirement,levelRequirement(101));assert.equal(state.health,100);assert.equal(state.mana,20);assert.equal(state.spirit,3);
  await r.db.query('UPDATE characters SET health=20,mana=2,spirit=1 WHERE id=$1',[a.id]);await transaction(r.db,sql=>grantExperience(sql,a.id,0,new Date()));state=await r.me(a);assert.equal(state.health,20);assert.equal(state.mana,2);assert.equal(state.spirit,1);
  await assert.rejects(r.db.query('UPDATE character_progression_epochs SET boundary_requirement=1 WHERE character_id=$1',[a.id]));
  assert.equal((await r.db.query('SELECT count(*)::int n FROM progression_awards WHERE character_id=$1',[a.id])).rows[0]!.n,1);
 }finally{await r.close();}
});
