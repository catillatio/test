import test from 'node:test';
import assert from 'node:assert/strict';
import {alpha} from '../src/alpha-rules.js';
import {botCombat} from '../src/bot-combat-rules.js';
import {blueprintSnapshot,equipmentRate,inventory,type Tier} from '../scripts/experiments/bot-calibration-model.js';
import {canary,planCanary,applyCanarySnapshot,selectedSlots,slotKey,prepareManifest,verifyManifest,digest,powers,winPercent} from '../scripts/experiments/bot-canary-model.js';
const snapshots=()=>selectedSlots.map(slot=>{const[l,t,v]=slot.split(':'),s=blueprintSnapshot(Number(l),t as Tier,Number(v));return {...s,accountId:'synthetic-account:'+slot};});
const date=new Date('2035-01-01T00:00:00Z');

test('canary selects exactly eighteen predetermined slots across all tiers and six levels, independent of finances or attacker',()=>{
  assert.equal(selectedSlots.length,18);assert.equal(new Set(selectedSlots).size,18);
  for(const tier of canary.tiers)assert.equal(snapshots().filter(s=>s.tier===tier).length,6);
  assert.deepEqual(prepareManifest([...snapshots()].reverse(),date),prepareManifest(snapshots(),date));
  assert.throws(()=>prepareManifest(snapshots().slice(1),date));
  assert.throws(()=>prepareManifest([...snapshots().slice(1),snapshots()[1]!],date));
  assert.throws(()=>prepareManifest(snapshots().map((s,i)=>i?s:{...s,level:6}),date));
  assert.throws(()=>prepareManifest(snapshots().map(s=>({...s,accountId:'duplicate'})),date));
});
test('all level1–50 proposals retain old equipment, armies, skills, Vault and Land and pay exact catalog cost from the saved purse',()=>{
  for(let level=1;level<=50;level++)for(const tier of canary.tiers)for(let variant=0;variant<3;variant++){
    const before=blueprintSnapshot(level,tier,variant),original=structuredClone(before),p=planCanary(before),after=applyCanarySnapshot(before,p);
    assert.deepEqual(before,original);
    for(const k of['id','accountId','name','level','tier','variant','calling','militia','legacyFloor','attackTraining','defenseTraining','skillPoints','vault','grossIncome','propertyUpkeep'] as const)assert.equal(after[k],before[k],k);
    for(const h of before.inventory){const actual=after.inventory.find(i=>i.itemId===h.itemId)!;assert.ok(actual.quantity>=h.quantity);assert.deepEqual(actual.lots.slice(0,h.lots.length),h.lots);}
    assert.equal(after.gold+after.reserve,before.gold+before.reserve-p.cost);assert.ok(after.gold<=before.gold);assert.ok(after.reserve>=before.reserve);
    assert.deepEqual(powers(after),p.after);assert.equal(equipmentRate(after),p.newRate);
    if(p.status==='purchase'){
      assert.equal(p.purchases.length,1);assert.ok(p.purchases[0]!.quantity<=2);
      assert.equal(p.cost,p.purchases.reduce((n,b)=>n+b.quantity*alpha.items.find(i=>i.id===b.itemId)!.price,0));
      assert.ok(p.cost+p.reserveTopup<=Math.floor(before.gold*.1));assert.ok(after.gold>=4*p.newRate);
      assert.ok(p.newRate-p.oldRate<=Math.max(1,Math.floor(p.propertyNet*.02)));assert.ok(p.netHourly>0);
    }
  }
});
test('modest improvement bounds do not make already punishing rivals harder or invent members for an unreachable band',()=>{
  const manifest=prepareManifest(snapshots(),date);
  assert.ok(manifest.entries.some(e=>e.plan.status==='purchase'));assert.ok(manifest.entries.some(e=>e.plan.status==='control'));
  for(const e of manifest.entries){
    assert.ok(e.plan.after.attack<=e.plan.before.attack*1.08);assert.ok(e.plan.after.defense<=e.plan.before.defense*1.08);
    if(e.plan.status==='purchase')assert.ok(e.plan.after.defense>=e.plan.before.defense*1.01);
    if(e.before.tier==='elite')assert.equal(e.plan.status,'control');
  }
  assert.throws(()=>planCanary({...snapshots()[0]!,level:100}));assert.throws(()=>planCanary({...snapshots()[0]!,level:200}));
  assert.throws(()=>planCanary({...snapshots()[0]!,militia:21}));
});
test('zero purse, paused maintenance and arrears never use reserved credit, Vault or sales as acquisition capital',()=>{
  const b=snapshots()[0]!;
  for(const altered of[{...b,gold:0,reserve:10000000},{...b,paused:true},{...b,arrears:1}]){
    const p=planCanary(altered);assert.equal(p.status,'control');assert.equal(p.cost,0);assert.equal(p.finalGold,altered.gold);assert.equal(p.finalReserve,altered.reserve);
  }
});
test('a manifest binds all exact slots, identities, paid plans and fifteen-minute quote bounds; changed plans fail closed',()=>{
  const m=prepareManifest(snapshots(),date),h=digest(m);verifyManifest(m,h);
  assert.equal(+new Date(m.expiresAt)-+new Date(m.createdAt),900000);assert.equal(m.productionAuthorized,false);
  for(const changed of[{...m,productionAuthorized:true},{...m,expiresAt:'2040-01-01T00:00:00Z'},{...m,entries:m.entries.slice(1)},
    {...m,entries:m.entries.map((e,i)=>i?e:{...e,plan:{...e.plan,cost:0}})}])assert.throws(()=>verifyManifest(changed as any,digest(changed)));
  assert.throws(()=>verifyManifest(m,'0'.repeat(64)));
  const e=m.entries.find(e=>e.plan.status==='purchase')!;
  assert.throws(()=>applyCanarySnapshot({...e.before,gold:e.before.gold+1},e.plan),/mismatch/);
  assert.throws(()=>applyCanarySnapshot(e.before,{...e.plan,finalGold:e.before.gold+1}),/mismatch/);
});
test('roll enumeration favors defender ties; approved65% XP and repeat percentages remain unchanged',()=>{
  assert.equal(winPercent(0,0),0);assert.ok(winPercent(100,100)<50);assert.equal(winPercent(1000,10),100);
  assert.equal(botCombat.id,'bot-combat-rewards-2');assert.equal(botCombat.fullXpPercent,65);assert.deepEqual(botCombat.victoryPercentages,[100,85,70,55,40]);
  assert.equal(canary.adopted,false);assert.ok(Object.isFrozen(canary.levels));
});
test('local canary consent rejects production/nonlocal/missing authorization and non-selected targets before connecting',async()=>{
  const {applyTestCanary,inspectCanary}=await import('../scripts/experiments/bot-canary-store.js');
  let connected=false;const db={query:async()=>{throw new Error('Unexpected query');},connect:async()=>{connected=true;throw new Error('Unexpected connection');},end:async()=>{}};
  const m=prepareManifest(snapshots(),date),base={mode:'test',allowLocalExperiment:true,databaseUrl:'postgresql://unused@127.0.0.1/local_test',manifestDigest:digest(m)};
  for(const p of[{...base,mode:'production'},{...base,allowLocalExperiment:false},{...base,databaseUrl:'postgresql://unused@private.invalid/local_test'},{...base,databaseUrl:'postgresql://unused@127.0.0.1/kingdom_come'},{...base,databaseUrl:'invalid'}]){
    await assert.rejects(inspectCanary(db,m.entries[0]!.botId,p as any),/required/);await assert.rejects(applyTestCanary(db,p as any,m,m.entries[0]!.botId,'12345678-1234-4234-8234-123456789abc'),/required/);
  }
  await assert.rejects(applyTestCanary(db,base as any,m,'not-selected','12345678-1234-4234-8234-123456789abc'),/required/);assert.equal(connected,false);
  const {simulateBotCombat}=await import('../scripts/simulation/bot-combat.js');
  const options={level:15,hours:.1,policy:'phase49' as const,mode:'same' as const,targetSlot:'15:green:2'};
  const run=simulateBotCombat(options);assert.equal(run.samples[0]!.target,options.targetSlot);
  assert.throws(()=>simulateBotCombat({...options,targetSlot:'50:elite:0'}),/eligible/);
  assert.throws(()=>simulateBotCombat({...options,mode:'varied'}),/eligible/);
});
