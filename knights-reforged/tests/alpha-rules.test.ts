import test from 'node:test';
import assert from 'node:assert/strict';
import { alpha,itemById,advanceLevel,levelRequirement,selectEquipment,activeArmy,propertyQuote,propertyPrice,maintenanceBill,resolveAlphaCombat,areRivals } from '../src/alpha-rules.js';

test('alpha progression carries excess XP and awards each crossed level once',() => {
  assert.deepEqual(advanceLevel(1,11,20),{level:3,progress:1,points:2,gained:2});
  assert.equal(levelRequirement(10),200);
  assert.throws(() => advanceLevel(1,12,1));
});
test('army equipment uses quantities, category caps and different attack/defense preferences',() => {
  const inventory = ['ash-spear','iron-sword','padded-coat','ember-word','hearth-ward'].map(id => ({...itemById.get(id)!,inventoryId:id,quantity:id==='ash-spear'?20:1}));
  const attack=selectEquipment(inventory,2,'attack'); const defense=selectEquipment(inventory,2,'defense');
  assert.equal(attack.selected.filter(i=>i.category==='weapon').reduce((n,i)=>n+i.quantity,0),2);
  assert.equal(attack.selected.find(i=>i.itemId==='iron-sword')?.quantity,1);
  assert.equal(selectEquipment(inventory,1,'attack').selected.find(i=>i.category==='spell')?.itemId,'ember-word');
  assert.equal(selectEquipment(inventory,1,'defense').selected.find(i=>i.category==='spell')?.itemId,'hearth-ward');
  assert.ok(defense.defense>0);
});
test('suspended upkeep equipment falls back to owned free equipment without losing inventory',() => {
  const inventory=['ransackers-axe','ash-spear'].map(id=>({...itemById.get(id)!,inventoryId:id,quantity:1}));
  assert.equal(selectEquipment(inventory,1,'attack',true).selected[0]?.itemId,'ransackers-axe');
  assert.equal(selectEquipment(inventory,1,'attack',false).selected[0]?.itemId,'ash-spear');
  assert.equal(inventory[0]?.quantity,1);
});
test('mercenaries and allies share one cap while legacy participation is retained',() => {
  assert.deepEqual(activeArmy(1,10,10),{capacity:3,participants:3,total:21});
  assert.equal(activeArmy(1,20,0,21).participants,21);
  assert.equal(activeArmy(1000,20,1000).participants,alpha.limits.participants);
});
test('property bulk quotes equal successive integer-priced purchases',() => {
  assert.deepEqual(propertyQuote(45,0,3),[45,50,55]);
  assert.equal(propertyQuote(45,3,2).reduce((a,b)=>a+b,0),propertyPrice(45,3)+propertyPrice(45,4));
  assert.throws(()=>propertyQuote(45,99,2));
});
test('maintenance retains exact fractional gold and bounds an unfunded long absence',() => {
  const at=new Date('2026-10-17T00:00:00Z');
  const partial=maintenanceBill(3,at,new Date(+at+600000),0n,3n,0);
  assert.equal(partial.due,0n);assert.equal(partial.remainder,1800000n);
  const complete=maintenanceBill(3,new Date(+at+600000),new Date(+at+1200000),partial.remainder,3n,0);
  assert.equal(complete.due,1n);assert.equal(complete.credit,2n);
  const absent=maintenanceBill(3,at,new Date(+at+100000*3600000),0n,3n,2);
  assert.equal(absent.fromCredit,3n);assert.equal(absent.fromWallet,2);assert.equal(absent.arrears,3n);assert.equal(absent.paused,true);
});
test('maintenance cannot bill a backward clock or overflow a wallet',() => {
  const at=new Date('2026-10-17T00:00:00Z');
  const result=maintenanceBill(100,at,new Date(+at-10000),0n,0n,10);
  assert.equal(result.due,0n);assert.equal(+result.throughAt,+at);
});
test('alpha fights are reproducible, conserve loot, and honor no-reward rematches',() => {
  const a={attack:10,health:100,maxHealth:100,gold:100};const d={defense:10,health:100,maxHealth:100,gold:200};
  const tie=resolveAlphaCombat(a,d,0,0);assert.equal(tie.outcome,'defender_win');assert.equal(tie.loot,5);
  const win=resolveAlphaCombat(a,d,10,-10);assert.equal(win.outcome,'attacker_win');assert.equal(win.loot,10);
  assert.equal(resolveAlphaCombat(a,d,10,-10,false).loot,0);
  assert.deepEqual(resolveAlphaCombat(a,d,10,-10),win);assert.throws(()=>resolveAlphaCombat(a,d,99,0));
  assert.equal(areRivals(2,20),false);assert.equal(areRivals(4,5),true);
});
