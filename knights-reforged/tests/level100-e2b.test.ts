import test from 'node:test';import assert from 'node:assert/strict';
import {alpha,selectEquipment} from '../src/alpha-rules.js';import {expandedContent,expansionEngine,expansionArtwork,hudsonGrant,questRarities,definitionDigest,equipmentCatalogFor,contentCatalog,expansionAchievement} from '../src/expansion-content.js';
import {rareRoll} from '../src/quest-equipment.js';import {expansionAssetReadiness} from '../src/expansion-activation.js';
test('E2b definitions are immutable, dormant, additive and retain all classic definitions and art',async()=>{
 assert.equal(expansionEngine.activationDefault,false);assert.equal(contentCatalog(),alpha);assert.equal(expandedContent.items.length,99);assert.equal(expandedContent.quests.length,58);assert.equal(expandedContent.properties.length,27);
 for(const key of ['items','quests','properties'] as const)for(const old of alpha[key])assert.deepEqual(expandedContent[key].find(i=>i.id===old.id),old);
 assert.equal(expandedContent.content!.areas.length,alpha.content!.areas.length+6);assert.notEqual(expansionAchievement.id,'player-experience-1');
 assert.throws(()=>{expandedContent.items[0]!.attack=0;});assert.throws(()=>contentCatalog('forged'));
 const readiness=await expansionAssetReadiness();assert.equal(readiness.ready,true);assert.equal(readiness.use,'temporary-beta');assert.equal(readiness.temporaryEntries,45);assert.equal(readiness.missing.length,0);assert.equal(expansionArtwork.entries.length,45);
 assert.equal(hudsonGrant.characterId,'55742e75-70c9-4792-8136-fe6ead2b83e0');assert.equal(hudsonGrant.items.reduce((s,i)=>s+i.quantity,0),45);
 for(const id of hudsonGrant.upkeepExemptItemIds){const item=equipmentCatalogFor(expandedContent.id).definition(id)!;assert.equal(item.acquisition,'quest-exclusive');assert.ok(item.level>=71&&item.upkeep>0);assert.equal(equipmentCatalogFor(expandedContent.id).canPurchase(id,500),false);}
 assert.equal(questRarities.reviewStatus,'pending');assert.match(definitionDigest(expandedContent),/^[a-f0-9]{64}$/);
});
test('rare probability has exact integer outcomes, no pity or rounded percentage boundary',()=>{
 let hits=0;for(let n=0;n<1000000;n++)if(rareRoll(n))hits++;assert.equal(hits,500);assert.equal(rareRoll(499),true);assert.equal(rareRoll(500),false);
 for(const n of [-1,1000000,NaN,0.5])assert.throws(()=>rareRoll(n));
 for(const[id,items]of Object.entries(questRarities.quests)){assert.ok(expandedContent.quests.find(q=>q.id===id)!.level>=71);assert.ok(items.length>0);}
});
test('rare equipment uses ordinary quantity selection, remains offense oriented and carries ordinary upkeep',()=>{
 const set=expandedContent.items.filter(i=>i.acquisition==='quest-exclusive').map(i=>({...i,quantity:500,inventoryId:i.id}));
 const attack=selectEquipment(set,500,'attack',true,'army-five-per-level-1');assert.equal(attack.attack,500*(190+112+180));assert.equal(attack.selected.reduce((n,i)=>n+i.quantity,0),1500);
 assert.equal(selectEquipment(set,500,'attack',false,'army-five-per-level-1').attack,0);
 const exempt=set.map(i=>({...i,maintenanceExempt:true,effectiveUpkeep:0}));assert.equal(selectEquipment(exempt,500,'attack',false,'army-five-per-level-1').attack,attack.attack);assert.ok(set.every(i=>i.upkeep>0));
});
