import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';import {syntheticCutover,syntheticHudson} from './level100-e2b-fixture.js';
import {transaction} from '../src/db.js';import {realmPolicy} from '../src/realm-policy.js';import {expandedContent,hudsonGrant,definitionDigest,questRarities} from '../src/expansion-content.js';
import {questEquipmentDrops} from '../src/quest-equipment.js';import {readInventory,purchaseItems,sellItem} from '../src/inventory.js';
import {inspectHudson,provisionHudson} from '../src/hudson-provision.js';import {inspectExpansion,activateExpansion} from '../src/expansion-activation.js';
import {refreshMaintenance,settleMaintenance} from '../src/maintenance.js';import {grantExperience} from '../src/progression.js';import {levelRequirement} from '../src/alpha-rules.js';import {createApp} from '../src/app.js';import {loadConfig} from '../src/config.js';
async function run(r:Awaited<ReturnType<typeof realm>>,id:string,questId:string,draw:number,runId=randomUUID(),fail=false){return transaction(r.db,async sql=>{await sql.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[id]);await sql.query('INSERT INTO quest_runs(id,character_id,quest_id,ruleset_id,energy_spent,gold_reward,xp_reward) VALUES($1,$2,$3,$4,1,100,10)',[runId,id,questId,expandedContent.id]);const drop=await questEquipmentDrops(sql,id,runId,randomUUID(),new Date(),()=>draw);await refreshMaintenance(sql,id,randomUUID(),new Date());if(fail)throw new Error('synthetic rollback');return {drop,runId};});}
test('E2b installation leaves legacy behavior and all activation/grant gates closed',{skip:!testDatabaseUrl},async()=>{const r=await realm({isolated:true});try{
 const a=await r.player();assert.equal((await realmPolicy(r.db)).expanded,false);assert.equal((await r.me(a)).rulesetId,'alpha-0.3');
 assert.equal((await r.command(a,'/api/v1/inventory/purchases',{itemId:'king-hudsons-sword',quantity:1})).statusCode,404);
 const plan=await inspectExpansion(r.db,{storageReviewed:true,recoveryReviewed:true,opponentPlanReviewed:true,rareDrops:false});await assert.rejects(activateExpansion(r.db,plan,definitionDigest(plan)),/Approved expansion assets/);assert.equal((await r.db.query('SELECT count(*)::int n FROM character_progression_epochs')).rows[0]!.n,0);
 await assert.rejects(activateExpansion(r.db,{...plan,catalogDigest:'f'.repeat(64)},definitionDigest(plan)),/Exact reviewed/);
 assert.equal((await r.db.query('SELECT count(*)::int n FROM realm_expansion_state')).rows[0]!.n,0);
 }finally{await r.close();}});
test('E2b synthetic cutover freezes existing transitions, initializes new humans, preserves policy through restart and fences stale writers',{skip:!testDatabaseUrl},async()=>{const r=await realm({isolated:true});try{
 const a=await r.player('Epoch Knight');await r.db.query('UPDATE characters SET attained_level=80,level_xp=$2,xp=10000 WHERE id=$1',[a.id,levelRequirement(80)-1]);const old=(await r.db.query('SELECT * FROM characters WHERE id=$1',[a.id])).rows[0];
 await syntheticCutover(r.db,false);const installed=(await r.db.query('SELECT * FROM characters WHERE id=$1',[a.id])).rows[0];assert.deepEqual(installed,old);
 await assert.rejects(r.db.query('UPDATE characters SET xp=xp+1 WHERE id=$1',[a.id]),{code:'55000'});
 await transaction(r.db,async sql=>{await grantExperience(sql,a.id,1,new Date());});const state=await r.me(a);assert.equal(state.level,81);assert.equal(state.army.capacity,405);assert.equal(state.army.participants,1);assert.equal(state.levelRequirement,levelRequirement(81)+150*31);
 const b=await r.player('New Expanded Knight');assert.equal((await r.me(b)).army.capacity,5);assert.equal((await r.db.query('SELECT policy_id FROM character_progression_epochs WHERE character_id=$1',[b.id])).rows[0]!.policy_id,'xp-post50-150-1');
 const app=await createApp({db:r.db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',DATABASE_URL:testDatabaseUrl})});try{const response=await app.inject({url:'/api/v1/me',headers:{cookie:a.cookie}});assert.equal(response.json().state.level,81);}finally{await app.close();}
 // In-flight pre-engine writer is aborted while the exclusive cutover barrier
 // is held; it cannot deadlock by taking a character lock first.
 await transaction(r.db,async()=>{const c=await r.db.connect();try{await c.query('BEGIN');await assert.rejects(c.query('UPDATE characters SET xp=xp+1 WHERE id=$1',[a.id]),{code:'40001'});await c.query('ROLLBACK');}finally{c.release();}},{expansionLock:'exclusive'});
 }finally{await r.close();}});
test('E2b rare outcomes authorize the exact quest/level, persist hits/misses, rollback and serialize concurrent acquisitions',{skip:!testDatabaseUrl},async()=>{const r=await realm({isolated:true});try{
 const a=await r.player('Rare Discoverer'),b=await r.player('Second Discoverer');await r.db.query('UPDATE characters SET attained_level=80 WHERE id=$1',[a.id]);await syntheticCutover(r.db);
 const quest=Object.keys(questRarities.quests)[0]!,itemId=questRarities.quests[quest]![0]!;
 const miss=await run(r,a.id,quest,999999);assert.deepEqual(miss.drop,[]);const hit=await run(r,a.id,quest,0);assert.equal(hit.drop[0]!.id,itemId);
 await transaction(r.db,async sql=>{const replay=await questEquipmentDrops(sql,a.id,hit.runId,randomUUID(),new Date(),()=>{throw new Error('reroll');});assert.deepEqual(replay,hit.drop);});
 assert.deepEqual((await run(r,b.id,quest,0)).drop,[],'below 71 cannot acquire');assert.deepEqual((await run(r,a.id,'border-patrol',0)).drop,[],'old low-level quest cannot acquire');
 const before=(await readInventory(r.db,a.id)).find(i=>i.id===itemId)!.quantity;
 await assert.rejects(run(r,a.id,quest,0,randomUUID(),true),/synthetic rollback/);assert.equal((await readInventory(r.db,a.id)).find(i=>i.id===itemId)!.quantity,before);
 await Promise.all(Array.from({length:8},()=>run(r,a.id,quest,0)));assert.equal((await readInventory(r.db,a.id)).find(i=>i.id===itemId)!.quantity,before+8);
 const item=(await readInventory(r.db,a.id)).find(i=>i.id===itemId)!;assert.equal(item.resaleSteps![0],0);assert.equal(item.effectiveUpkeep,undefined);
 assert.equal((await r.db.query('SELECT hourly_rate FROM maintenance_accounts WHERE character_id=$1',[a.id])).rows[0]!.hourly_rate,item.quantity*item.upkeep);
 await assert.rejects(transaction(r.db,sql=>purchaseItems(sql,a.id,100,{[itemId]:1},randomUUID(),new Date())),/only be discovered/);
 await transaction(r.db,async sql=>{await sql.query('UPDATE inventory_entries SET quantity=5000 WHERE character_id=$1 AND item_definition_id=$2',[a.id,itemId]);});const full=await run(r,a.id,quest,0);assert.deepEqual(full.drop,[]);assert.equal((await r.db.query('SELECT outcome FROM quest_equipment_outcomes WHERE quest_run_id=$1',[full.runId])).rows[0]!.outcome,'inventory_full');
 }finally{await r.close();}});
test('E2b Hudson grant binds exact UUID/account/manifest, is concurrent-idempotent, audits acquisition and exempts only three items',{skip:!testDatabaseUrl},async()=>{const r=await realm({isolated:true});try{
 const h=await syntheticHudson(r.db),copy=await r.player('King Hudson');await r.db.query('UPDATE characters SET attained_level=100 WHERE id=$1',[copy.id]);await syntheticCutover(r.db);
 const plan=await inspectHudson(r.db),digest=definitionDigest(plan);await assert.rejects(provisionHudson(r.db,{...plan,accountId:copy.accountId},digest),/Exact approved/);
 const wrong={...plan,accountId:copy.accountId};await assert.rejects(provisionHudson(r.db,wrong,definitionDigest(wrong)),/binding changed/);
 const results=await Promise.all(Array.from({length:4},()=>provisionHudson(r.db,plan,digest)));assert.equal(results.filter(r=>!r.replayed).length,1);
 const inventory=await readInventory(r.db,h.id);assert.equal(inventory.reduce((n,i)=>n+i.quantity,0),45);assert.ok(inventory.every(i=>i.maintenanceExempt&&i.effectiveUpkeep===0&&i.upkeep>0&&i.resaleSteps![0]===0));
 assert.equal((await r.db.query('SELECT hourly_rate FROM maintenance_accounts WHERE character_id=$1',[h.id])).rows[0]!.hourly_rate,0);
 assert.equal((await r.db.query('SELECT count(*)::int n FROM realm_expansion_events WHERE kind=\'hudson_grant\'')).rows[0]!.n,1);assert.equal((await r.db.query('SELECT count(*)::int n FROM inventory_acquisition_events')).rows[0]!.n,3);
 await transaction(r.db,async sql=>{await purchaseItems(sql,h.id,80,{'squires-blade':1},randomUUID(),new Date());await refreshMaintenance(sql,h.id,randomUUID(),new Date());await sellItem(sql,h.id,'king-hudsons-sword',1,randomUUID());await refreshMaintenance(sql,h.id,randomUUID(),new Date());});
 assert.equal((await provisionHudson(r.db,plan,digest)).replayed,true);assert.equal((await readInventory(r.db,h.id)).find(i=>i.id==='king-hudsons-sword')!.quantity,14);await run(r,h.id,'storm-the-river-fortress',0);assert.equal((await readInventory(r.db,h.id)).find(i=>i.id==='king-hudsons-sword')!.quantity,15);assert.equal((await r.db.query('SELECT hourly_rate FROM maintenance_accounts WHERE character_id=$1',[h.id])).rows[0]!.hourly_rate,0);
 await assert.rejects(r.db.query('UPDATE hudson_equipment_grants SET manifest_digest=$1',['f'.repeat(64)]),/immutable/);await assert.rejects(r.db.query('DELETE FROM equipment_upkeep_entitlements'),/immutable/);
 for(let n=0;n<15;n++)await run(r,copy.id,'defend-the-hundred-kingdoms',0);
 const ordinary=await readInventory(r.db,copy.id);assert.equal(ordinary.reduce((s,i)=>s+i.quantity,0),45);assert.ok(ordinary.every(i=>!i.maintenanceExempt));assert.equal((await r.db.query('SELECT hourly_rate FROM maintenance_accounts WHERE character_id=$1',[copy.id])).rows[0]!.hourly_rate,7650);const {selectEquipment}=await import('../src/alpha-rules.js');assert.equal(selectEquipment(ordinary,20,'attack',false,'army-five-per-level-1').attack,0);
 }finally{await r.close();}});
test('E2b grant interruption and partial source attempts roll back, while old liabilities and unrelated upkeep remain payable',{skip:!testDatabaseUrl},async()=>{const r=await realm({isolated:true});try{
 const h=await syntheticHudson(r.db);await syntheticCutover(r.db);const plan=await inspectHudson(r.db),digest=definitionDigest(plan);
 // Fixture trigger injects failure on the second item inside the real grant TX.
 await r.db.query(`CREATE FUNCTION synthetic_grant_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.item_id='king-hudsons-shield' THEN RAISE EXCEPTION 'synthetic grant interruption';END IF;RETURN NEW;END $$;CREATE TRIGGER synthetic_grant_failure BEFORE INSERT ON inventory_acquisition_events FOR EACH ROW EXECUTE FUNCTION synthetic_grant_failure()`);
 await assert.rejects(provisionHudson(r.db,plan,digest),/synthetic grant interruption/);assert.equal((await r.db.query('SELECT count(*)::int n FROM hudson_equipment_grants')).rows[0]!.n,0);assert.equal((await readInventory(r.db,h.id)).length,0);
 await r.db.query('DROP TRIGGER synthetic_grant_failure ON inventory_acquisition_events');
 const paid=expandedContent.items.find(i=>i.level<=80&&i.upkeep>0&&i.acquisition!=='quest-exclusive')!;
 await transaction(r.db,async sql=>{await purchaseItems(sql,h.id,80,{[paid.id]:1},randomUUID(),new Date());await refreshMaintenance(sql,h.id,randomUUID(),new Date());await sql.query("UPDATE maintenance_accounts SET paused=true,reserve_gold=0,arrears_gold=17 WHERE character_id=$1",[h.id]);await sql.query('UPDATE wallets SET balance=0 WHERE character_id=$1',[h.id]);});
 await provisionHudson(r.db,plan,digest);
 const account=(await r.db.query('SELECT * FROM maintenance_accounts WHERE character_id=$1',[h.id])).rows[0]!;assert.equal(account.hourly_rate,paid.upkeep);assert.equal(account.arrears_gold,'17','old charges are never erased by the entitlement');
 const {selectEquipment}=await import('../src/alpha-rules.js');const inventory=await readInventory(r.db,h.id);const selected=selectEquipment(inventory,20,'attack',false,'army-five-per-level-1');assert.equal(selected.selected.reduce((n,i)=>n+i.quantity,0),45);assert.ok(!selected.selected.some(i=>i.itemId===paid.id));
 await assert.rejects(provisionHudson(r.db,{...plan,operationId:randomUUID()},definitionDigest({...plan,operationId:randomUUID()})),/Exact approved/);
 // A receipt-less prior acquisition is an unexpected partial operation.
 }finally{await r.close();}});
test('E2b expanded HTTP quests, receipts, shop and high-price Land remain authoritative and historical achievements survive',{skip:!testDatabaseUrl},async()=>{const r=await realm({isolated:true});try{
 const a=await r.player('Upper Quest Knight');await r.db.query('UPDATE characters SET attained_level=100 WHERE id=$1',[a.id]);await syntheticCutover(r.db);await r.prepare(a,100000000);
 // Synthetic retained relationships, not fabricated by capacity resolution.
 await transaction(r.db,async sql=>{const rows=(await sql.query(`WITH ids AS (SELECT gen_random_uuid() aid,gen_random_uuid() cid,n FROM generate_series(1,500) n), a AS(INSERT INTO accounts(id,username,password_hash) SELECT aid,'e2b_'||n::text,'synthetic' FROM ids RETURNING id) INSERT INTO characters(id,account_id,name) SELECT cid,aid,'Synthetic Ally '||n::text FROM ids RETURNING id`)).rows;
 for(const b of rows)await sql.query("INSERT INTO army_links(low_id,high_id,inviter_id,status) VALUES(LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid),$1,'accepted')",[a.id,b.id]);
 });
 const q=expandedContent.quests.find(q=>q.id==='storm-the-river-fortress')!;
 await transaction(r.db,async sql=>{await purchaseItems(sql,a.id,100,q.items,randomUUID(),new Date());});
 if(q.requiresLoot)await r.db.query('INSERT INTO character_loot(character_id,loot_id,name,source_quest,ruleset_id) VALUES($1,$2,$3,$4,$5)',[a.id,q.requiresLoot,'Synthetic prerequisite','fixture',expandedContent.id]);
 const key=randomUUID();const first=await r.ok(a,'/api/v1/quests/'+q.id+'/runs',{},key);const replay=await r.ok(a,'/api/v1/quests/'+q.id+'/runs',{},key);assert.equal(replay.commandId,first.commandId);assert.deepEqual(replay.data,first.data);assert.equal(replay.message,first.message);
 assert.equal((await r.db.query('SELECT count(*)::int n FROM quest_equipment_outcomes WHERE character_id=$1',[a.id])).rows[0]!.n,1);
 const state=await r.me(a);assert.equal(state.army.participants,500);assert.ok(state.quests.some(q=>q.level===100));
 const achievements=(await r.app.inject({url:'/game/achievements',headers:{cookie:a.cookie}}));assert.equal(achievements.statusCode,200);assert.match(achievements.body,/Sovereign of a Hundred Kingdoms/);
 assert.equal((await r.db.query("SELECT count(*)::int n FROM character_achievements WHERE character_id=$1 AND achievement_id='level100-summit'",[a.id])).rows[0]!.n,1);
 const property=expandedContent.properties.at(-1)!;await transaction(r.db,async sql=>{await sql.query(`INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through) VALUES($1,$2,$3,$4,$5,100,100,$6,$7,$8,3600,clock_timestamp(),clock_timestamp())`,[randomUUID(),a.id,property.id,property.name,expandedContent.id,property.price,property.hourlyIncome,property.hourlyUpkeep]);});
 const expensive=(await r.me(a)).land.properties.find(p=>p.id===property.id)!;assert.equal(expensive.price,null);assert.equal(expensive.maxPurchase,0);assert.equal(expensive.maxAffordable,0);
 const land=await r.app.inject({url:'/game/land',headers:{cookie:a.cookie}});assert.equal(land.statusCode,200);assert.match(land.body,/Quote unavailable/);
 }finally{await r.close();}});
test('E2b rejects a receipt-less partial grant and forged acquisition sources without crediting equipment',{skip:!testDatabaseUrl},async()=>{const r=await realm({isolated:true});try{
 const h=await syntheticHudson(r.db);await syntheticCutover(r.db);const plan=await inspectHudson(r.db),entry=randomUUID(),lot=randomUUID(),item=hudsonGrant.items[0]!;
 const {acquireQuestEquipment}=await import('../src/equipment-acquisition.js');await assert.rejects(transaction(r.db,sql=>acquireQuestEquipment(sql,h.id,item.itemId,15,'hudson_grant',hudsonGrant.operationId,hudsonGrant.operationId,new Date())),/Unauthorized private grant source/);
 await transaction(r.db,async sql=>{await sql.query('INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity) VALUES($1,$2,$3,$4,15)',[entry,h.id,item.itemId,expandedContent.id]);await sql.query('INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,acquired_at) VALUES($1,$2,$3,$4,15,15,0,clock_timestamp())',[lot,entry,h.id,expandedContent.id]);await sql.query("INSERT INTO inventory_acquisition_events(id,character_id,inventory_entry_id,lot_id,item_id,quantity,unit_cost,source_kind,source_id,command_id,ruleset_id) VALUES($1,$2,$3,$4,$5,15,0,'hudson_grant',$6,$6,$7)",[randomUUID(),h.id,entry,lot,item.itemId,hudsonGrant.operationId,expandedContent.id]);});
 await assert.rejects(provisionHudson(r.db,plan,definitionDigest(plan)),/Unexpected partial/);assert.equal((await readInventory(r.db,h.id)).reduce((n,i)=>n+i.quantity,0),15);assert.equal((await r.db.query('SELECT count(*)::int n FROM hudson_equipment_grants')).rows[0]!.n,0);
 }finally{await r.close();}});
