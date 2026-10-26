import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';import {syntheticCutover} from './level100-e2b-fixture.js';import {transaction} from '../src/db.js';import {realmPolicy} from '../src/realm-policy.js';import {definitionDigest,expandedContent,questRarities} from '../src/expansion-content.js';import {inspectRarity,setRarityAuthorization,type RecoveryReference} from '../src/rarity-activation.js';import {questEquipmentDrops,rareRoll} from '../src/quest-equipment.js';import {acquireQuestEquipment} from '../src/equipment-acquisition.js';import {refreshMaintenance} from '../src/maintenance.js';import {readInventory} from '../src/inventory.js';
const skip=!testDatabaseUrl;
import {syntheticRecovery,prepareRareQuest,withQuestDraw} from './phase6-fixtures.js';
test('Phase 6 rarity authorization is separate, default-off, exact-target, concurrent-idempotent and append-only; no old quest becomes a new draw',{skip},async()=>{const r=await realm({isolated:true});try{
 const a=await r.player('Careful Discoverer');await r.prepare(a,100000);await r.db.query('UPDATE characters SET attained_level=100 WHERE id=$1',[a.id]);await syntheticCutover(r.db,false);
 const activation=(await r.db.query('SELECT row_to_json(s)::text AS row FROM realm_expansion_state s')).rows[0]!.row;
 const quest=Object.keys(questRarities.quests)[0]!,runId=randomUUID();await transaction(r.db,sql=>sql.query('INSERT INTO quest_runs(id,character_id,quest_id,ruleset_id,energy_spent,gold_reward,xp_reward) VALUES($1,$2,$3,$4,17,0,0)',[runId,a.id,quest,expandedContent.id]));
 const p=await inspectRarity(r.db,syntheticRecovery());assert.equal(p.enabled,false);assert.equal((await realmPolicy(r.db)).rareDrops,false);assert.equal(questRarities.reviewStatus,'pending');
 await assert.rejects(setRarityAuthorization(r.db,p,definitionDigest(p)),/owner-reviewed/);
 const enabled={...p,enabled:true,rateReviewed:true,equipmentReviewed:true};
 for(const bad of [{...enabled,probabilityPpm:1000},{...enabled,policyDigest:'f'.repeat(64)}])await assert.rejects(setRarityAuthorization(r.db,bad,definitionDigest(bad)),/owner-reviewed/);
 const wrong={...enabled,target:{...enabled.target,databaseOid:'1'}};await assert.rejects(setRarityAuthorization(r.db,wrong,definitionDigest(wrong)),/identity/);
 const attempts=await Promise.all([setRarityAuthorization(r.db,enabled,definitionDigest(enabled)),setRarityAuthorization(r.db,enabled,definitionDigest(enabled))]);assert.equal(attempts.filter(r=>r.replayed).length,1);assert.equal((await realmPolicy(r.db)).rareDrops,true);
 assert.equal((await r.db.query('SELECT row_to_json(s)::text AS row FROM realm_expansion_state s')).rows[0]!.row,activation,'original expansion approval is untouched');
 assert.deepEqual(await transaction(r.db,sql=>questEquipmentDrops(sql,a.id,runId,randomUUID(),new Date(),()=>0)),[],'pre-approval quest cannot be rerolled after activation');
 const nowRun=async(draw:number,fail=false)=>transaction(r.db,async sql=>{await sql.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[a.id]);const id=randomUUID();await sql.query('INSERT INTO quest_runs(id,character_id,quest_id,ruleset_id,energy_spent,gold_reward,xp_reward) VALUES($1,$2,$3,$4,17,0,0)',[id,a.id,quest,expandedContent.id]);const drops=await questEquipmentDrops(sql,a.id,id,randomUUID(),new Date(),()=>draw);await refreshMaintenance(sql,a.id,randomUUID(),new Date());if(fail)throw Error('simulated rollback');return {id,drops};});
 assert.deepEqual((await nowRun(500)).drops,[]);const hit=await nowRun(499);assert.equal(hit.drops[0]!.id,'king-hudsons-sword');assert.equal((await readInventory(r.db,a.id))[0]!.quantity,1);
 await assert.rejects(nowRun(0,true),/rollback/);assert.equal((await readInventory(r.db,a.id))[0]!.quantity,1);assert.ok((await readInventory(r.db,a.id))[0]!.upkeep>0);
 await transaction(r.db,async sql=>{await assert.rejects(acquireQuestEquipment(sql,a.id,'king-hudsons-sword',15,'quest_drop',hit.id,randomUUID(),new Date()),/exactly one/);});
 await transaction(r.db,sql=>sql.query('UPDATE characters SET attained_level=70 WHERE id=$1',[a.id]));
 assert.deepEqual((await nowRun(0)).drops,[],'level-70 character cannot acquire ordinary quest-exclusive gear');
 const pause={...await inspectRarity(r.db,syntheticRecovery()),enabled:false,rateReviewed:true,equipmentReviewed:true};await setRarityAuthorization(r.db,pause,definitionDigest(pause));assert.equal((await realmPolicy(r.db)).rareDrops,false);
 await setRarityAuthorization(r.db,enabled,definitionDigest(enabled));assert.equal((await realmPolicy(r.db)).rareDrops,false,'old replay never undoes a later pause');
 await assert.rejects(r.db.query('UPDATE rare_equipment_authorizations SET enabled=true'),/append-only/);await assert.rejects(r.db.query('DELETE FROM rare_equipment_authorizations'),/append-only/);
 assert.equal((await r.db.query('SELECT count(*)::int n FROM hudson_equipment_grants')).rows[0]!.n,0);
 }finally{await r.close();}});
test('Phase 6 proposed draw remains exactly 500 per million; no rarity change or activation is implicit',()=>{
 let hits=0;for(let n=0;n<1000000;n++)if(rareRoll(n))hits++;assert.equal(hits,500);assert.equal(questRarities.minimumLevel,71);assert.equal(questRarities.reviewStatus,'pending');assert.ok(expandedContent.quests.filter(q=>questRarities.quests[q.id]).every(q=>q.level>=74&&q.requiresLoot&&q.army>0));
});

test('Real quest commands ignore forged draws, award saved rare discovery once and preserve upkeep through retries',{skip},async()=>{const r=await realm({isolated:true});try{
 const actor=await r.player('Actual Quest Discoverer');await r.db.query('UPDATE characters SET attained_level=100 WHERE id=$1',[actor.id]);await syntheticCutover(r.db,false);
 const plan={...await inspectRarity(r.db,syntheticRecovery()),enabled:true,rateReviewed:true,equipmentReviewed:true};await setRarityAuthorization(r.db,plan,definitionDigest(plan));
 const quest=await prepareRareQuest(r,actor);const url='/api/v1/quests/'+quest.id+'/runs';
 const miss=await withQuestDraw(999999,()=>r.ok(actor,url,{draw:0,rareRoll:0,rewards:[{id:'king-hudsons-sword',quantity:15}]}));assert.equal(miss.data.equipmentDrops,undefined);
 await transaction(r.db,sql=>sql.query('UPDATE characters SET mana=max_mana WHERE id=$1',[actor.id]));const key=randomUUID();
 const hit=await withQuestDraw(0,()=>r.ok(actor,url,{},key));assert.equal(hit.data.equipmentDrops[0].id,'king-hudsons-sword');assert.equal(hit.data.equipmentDrops[0].quantity,1);
 const repeated=await withQuestDraw(999999,()=>r.ok(actor,url,{},key));assert.deepEqual(repeated.data,hit.data);assert.equal((await readInventory(r.db,actor.id)).find(i=>i.id==='king-hudsons-sword')?.quantity,1);
 assert.ok((await readInventory(r.db,actor.id)).find(i=>i.id==='king-hudsons-sword')!.upkeep>0);
 const receipt=await r.app.inject({url:'/game/quests?command='+key,headers:{cookie:actor.cookie}});assert.equal(receipt.statusCode,200,receipt.body);assert.match(receipt.body,/Rare equipment discovered/);
 }finally{await r.close();}});
