import test from 'node:test';import assert from 'node:assert/strict';
import {alpha,advanceLevel,activeArmy,levelRequirement,selectEquipment,type OwnedItem} from '../src/alpha-rules.js';
import {compatibility,resolveArmyCapacity,resolveArmy,inventoryLimit} from '../src/compatibility-rules.js';
import {advanceProgression,prepareProgressionEpoch,requirementForEpoch,progressionRequirement,readProgressionEpoch} from '../src/progression-policy.js';
import {equipmentCatalog,activeEquipmentCatalog} from '../src/catalog-compatibility.js';
import {fifoResaleSteps} from '../src/inventory.js';
import {equipmentResale} from '../src/game-feel-rules.js';

test('E2a active policies remain legacy and dormant capacity never fabricates members',()=>{
 assert.deepEqual(compatibility.active,{army:'army-legacy-1',inventory:'inventory-legacy-1',progression:'xp-legacy-1',catalog:'alpha-0.3'});
 for(const level of [1,10,25,50,75,100,200,500]){assert.equal(activeArmy(level,20,3000).capacity,Math.min(101,1+2*level));assert.equal(resolveArmyCapacity(level,1,'army-five-per-level-1'),5*level);}
 assert.equal(resolveArmyCapacity(1,101,'army-five-per-level-1'),101);
 assert.deepEqual(resolveArmy(500,20,50,1,'army-five-per-level-1'),{capacity:2500,participants:71,total:71});
 assert.equal(inventoryLimit(),1000);assert.equal(inventoryLimit('inventory-large-1'),5000);assert.equal(alpha.limits.transaction,100);
 assert.equal(alpha.items.length,60);assert.equal(alpha.quests.length,40);assert.equal(alpha.properties.length,21);
 assert.throws(()=>resolveArmyCapacity(Number.MAX_SAFE_INTEGER,1,'army-five-per-level-1'));assert.throws(()=>resolveArmy(1,Number.MAX_SAFE_INTEGER,1));
 assert.throws(()=>resolveArmyCapacity(1,102));assert.throws(()=>resolveArmyCapacity(5,1,'forged' as never));assert.throws(()=>inventoryLimit('forged' as never));
 assert.throws(()=>{compatibility.active.army='army-five-per-level-1';},TypeError);
});
test('E2a quantity arithmetic selects 500/1000/2500 stacks without expanding individual copies',()=>{
 const inventory:OwnedItem[]=alpha.items.filter(i=>['eclipse-greatsword','eclipse-citadel-plate','eclipse-invocation'].includes(i.id)).map(i=>({...i,inventoryId:i.id,quantity:5000}));
 for(const n of [500,1000,2500]){const a=selectEquipment(inventory,n,'attack',true,'army-five-per-level-1'),d=selectEquipment(inventory,n,'defense',true,'army-five-per-level-1');assert.equal(a.selected.length,3);assert.equal(a.selected.reduce((s,i)=>s+i.quantity,0),n*3);assert.equal(a.attack,n*(110+32+92));assert.equal(d.defense,n*(50+106+60));}
 assert.throws(()=>selectEquipment(inventory,500,'attack'));assert.throws(()=>selectEquipment(inventory,5001,'attack',true,'army-five-per-level-1'));
 assert.equal(inventory[0]!.quantity,5000);assert.deepEqual(selectEquipment(inventory,1,'attack',false).selected,[]);
});
test('E2a FIFO preview consumes only its requested prefix and retains exact per-unit rounding',()=>{
 let visited=0;function* lots(){visited++;yield {remaining_quantity:5000,unit_cost:75};throw new Error('Unnecessary historical lot visited.');}
 const steps=fifoResaleSteps(lots());assert.equal(visited,1);assert.equal(steps.length,100);assert.equal(steps[0],50);assert.equal(steps[99],5000);
 const mixed=[{remaining_quantity:2,unit_cost:75},{remaining_quantity:5,unit_cost:101}];assert.deepEqual(fifoResaleSteps(mixed,4),[50,100,100+equipmentResale(101),100+2*equipmentResale(101)]);
 assert.throws(()=>fifoResaleSteps([],101));
});
test('E2a legacy XP is identical and future epochs freeze the current entitlement without replaying levels',async()=>{
 for(const level of [1,10,50,100,200,500])for(const award of [0,1,1000,1000000])assert.deepEqual(advanceProgression(level,0,award),advanceLevel(level,0,award));
 const level=100,old=levelRequirement(level),epoch=prepareProgressionEpoch(level,old-2,'xp-post50-150-1');
 assert.equal(requirementForEpoch(level,epoch),old);assert.equal(progressionRequirement(100,'xp-post50-150-1'),11750);
 assert.deepEqual(advanceProgression(level,old-2,2,epoch),{level:101,progress:0,points:1,gained:1});
 assert.equal(requirementForEpoch(101,epoch),progressionRequirement(101,'xp-post50-150-1'));
 assert.deepEqual(advanceProgression(level,old-2,0,epoch),{level:100,progress:old-2,points:0,gained:0});
 assert.throws(()=>advanceProgression(99,0,1,epoch));assert.throws(()=>requirementForEpoch(level,{...epoch,boundaryRequirement:1}));
 const sql={query:async()=>{throw new Error('Legacy progression must not create/read future metadata.');}};
 assert.equal(await readProgressionEpoch(sql,'unused'),undefined);await assert.rejects(readProgressionEpoch(sql,'unused','xp-post50-150-1'));
});
test('E2a catalog separates purchase unlocks, ownership, history and explicit nonoverlapping equivalents',()=>{
 const classic=structuredClone(alpha.items.find(i=>i.id==='eclipse-greatsword')!),mirror={...classic,id:'fixture-grounded',name:'Grounded blade'},retired={...classic,id:'fixture-retired'};
 const catalog=equipmentCatalog({id:'fixture-future-1',items:[classic,mirror],historicalItems:[retired],purchaseLevels:{[classic.id]:100},equivalents:[[classic.id,mirror.id]]});
 assert.equal(activeEquipmentCatalog.canPurchase(classic.id,50),true);assert.equal(catalog.canPurchase(classic.id,50),false);
 assert.equal(catalog.definition(classic.id)!.attack,110);assert.equal(catalog.definition(retired.id)!.name,classic.name);assert.equal(catalog.canPurchase(retired.id,500),false);
 assert.deepEqual(catalog.requirements({[classic.id]:3},[{id:classic.id,quantity:3}],50).missing,{});
 assert.deepEqual(catalog.requirements({[classic.id]:3,[mirror.id]:3},[{id:classic.id,quantity:2},{id:mirror.id,quantity:3}],50).missing,{[mirror.id]:1},'same owned copy cannot satisfy two equivalent demands');
 classic.attack=1;if(classic.illustration)classic.illustration.row=999;assert.equal(catalog.definition(classic.id)!.attack,110);assert.notEqual(catalog.definition(classic.id)!.illustration?.row,999);
 assert.throws(()=>equipmentCatalog({id:'bad',items:[classic,mirror],equivalents:[[classic.id,mirror.id],[mirror.id,classic.id]]}));
 assert.throws(()=>equipmentCatalog({id:'bad',items:[classic],purchaseLevels:{forged:1}}));assert.throws(()=>catalog.requirements({forged:1},[],50));assert.equal(catalog.canPurchase('forged',500),false);
 for(const item of alpha.items)assert.equal(activeEquipmentCatalog.purchaseLevel(item.id),item.level);
});
