import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {alpha,previousAlpha,itemById,questById,lootById,propertyPrice,selectEquipment,levelRequirement} from '../src/alpha-rules.js';

test('the level-50 catalog adds content without changing any preexisting item or property contract',()=>{
  assert.equal(alpha.id,'alpha-0.3');assert.equal(alpha.items.length,60);assert.equal(alpha.properties.length,21);assert.equal(alpha.quests.length,40);
  for(const category of ['weapon','armor','spell'])assert.equal(alpha.items.filter(item=>item.category===category).length,20);
  for(const old of previousAlpha.items){const current=itemById.get(old.id)!;for(const key of Object.keys(old))assert.deepEqual(current[key as keyof typeof current],old[key as keyof typeof old],old.id+': '+key);}
  for(const old of previousAlpha.properties){const current=alpha.properties.find(p=>p.id===old.id)!;for(const key of Object.keys(old))assert.deepEqual(current[key as keyof typeof current],old[key as keyof typeof old],old.id+': '+key);}
  for(const key of ['thresholds','laterBase','laterStep','pointsPerLevel'] as const)assert.deepEqual(alpha.progression[key],previousAlpha.progression[key]);
  assert.equal(levelRequirement(50),2000);
});
test('every level through 50 has relevant unlocked equipment, quests and properties',()=>{
  for(let level=1;level<=50;level++){
    for(const category of ['weapon','armor','spell'])assert.ok(alpha.items.some(item=>item.category===category&&item.level<=level&&item.level>=level-5),'Missing '+category+' goal near level '+level);
    assert.ok(alpha.quests.some(q=>q.level<=level&&q.level>=level-5),'Missing quest near '+level);
    assert.ok(alpha.properties.some(p=>p.level<=level&&p.level>=level-5),'Missing property near '+level);
  }
  assert.ok(alpha.properties.some(p=>p.level===55));assert.equal(alpha.content!.areas.length,11);
});
test('all quest prerequisites are reachable and story discoveries form an acyclic path',()=>{
  let quantityGates=0;
  for(const quest of alpha.quests){
    assert.ok(quest.mana<=20);assert.ok(quest.army<=Math.min(21,1+2*quest.level));
    for(const [id,quantity] of Object.entries(quest.items)){assert.ok(itemById.get(id)!.level<=quest.level);if(quantity>1)quantityGates++;}
    const seen=new Set<string>();let current=quest;
    while(current.requiresLoot){assert.ok(!seen.has(current.id),'Story cycle at '+current.id);seen.add(current.id);
      assert.ok(lootById.has(current.requiresLoot));const source=alpha.quests.find(q=>q.loot?.id===current.requiresLoot)!;assert.ok(source.level<=current.level);assert.equal(source.loot!.firstGuaranteed,true);current=source;}
  }
  assert.ok(quantityGates>=10);assert.equal(lootById.size,12);assert.ok(questById.has('defy-eclipsed-sovereign'));
});
test('high-tier power grows with tradeoffs and automatic attack/defense builds remain different',()=>{
  const full=alpha.items.map(item=>({...item,quantity:1,inventoryId:item.id}));
  const attack=selectEquipment(full,1,'attack'),defense=selectEquipment(full,1,'defense');
  assert.ok(attack.attack<8*39);assert.ok(defense.defense>attack.defense);
  assert.equal(attack.selected.find(item=>item.category==='armor')!.itemId,'seraphic-vestment');
  assert.equal(defense.selected.find(item=>item.category==='weapon')!.itemId,'astral-conductor');
  assert.equal(defense.selected.find(item=>item.category==='spell')!.itemId,'seraphs-rebuke');
  assert.equal(attack.selected.reduce((n,item)=>n+item.quantity,0),3);
});
test('prestige property payback grows and every possible unit quote fits the retained wallet schema',()=>{
  let previous=0;
  const originalIds=new Set(previousAlpha.properties.map(p=>p.id));
  for(const property of alpha.properties){
    for(let owned=0;owned<=100;owned++)assert.ok(propertyPrice(property.price,owned)<=2147483647);
    if(!originalIds.has(property.id)){
      const payback=property.price/(property.hourlyIncome-property.hourlyUpkeep);assert.ok(payback>=previous);previous=payback;
      assert.ok(propertyPrice(property.price,1)>property.price);
    }
  }
  assert.equal(previous,50);
});
test('every catalog entry maps to a unique generated painting and all optimized artwork hashes match',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/art/fantasy-0.2/provenance.json',import.meta.url),'utf8'));
  assert.equal(manifest.assets.length,4);assert.equal(manifest.assignments.length,81);
  const seen=new Set<string>();
  for(const entry of [...alpha.items,...alpha.properties]){
    const art=entry.illustration!,key=[art.atlas,art.column,art.row].join(':');assert.ok(!seen.has(key));seen.add(key);
    assert.ok(art.column>=0&&art.column<4);assert.ok(art.row>=0&&art.row<(art.atlas==='properties'?6:5));
    assert.ok(manifest.assignments.some((assignment:{id:string})=>assignment.id===entry.id));
  }
  let total=0;for(const asset of manifest.assets){const data=readFileSync(new URL('../public/art/fantasy-0.2/'+asset.asset,import.meta.url));assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256);assert.equal(data.length,asset.bytes);total+=data.length;}
  assert.ok(total<1500000,'Mobile artwork transfer budget exceeded.');
});
