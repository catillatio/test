import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {alpha,activeArmy,selectEquipment,levelRequirement,type OwnedItem} from '../src/alpha-rules.js';
import {botVictoryRewards} from '../src/bot-combat-rules.js';import {scheduledCandidates} from '../src/bot-schedule.js';
import {capacity,selectStudy,loadout,portfolio,studyRequirement,catalogItems,proposal,pace,populationStudy,researchBots,safeStudyPrice} from '../scripts/simulation/level100-e1.js';
const json=(name:string)=>JSON.parse(readFileSync(new URL('../docs/level100-e1/'+name,import.meta.url),'utf8'));

test('E1 army study separates capacity, recruited members and unchanged active guards',()=>{
 assert.equal(activeArmy(100,1000,0).participants,101);assert.equal(capacity(100,'historical-5x'),500);assert.equal(capacity(500,'historical-5x'),2500);assert.equal(capacity(100,'uncapped-2x'),201);
 assert.equal(capacity(1,'historical-5x',101),101,'legacy entitlement must not shrink');
 assert.throws(()=>selectEquipment(loadout(50,500,'balanced'),500,'attack'));
 const inv:OwnedItem[]=[{...alpha.items.find(i=>i.id==='iron-sword')!,inventoryId:'1',quantity:250},{...alpha.items.find(i=>i.id==='ash-spear')!,inventoryId:'2',quantity:300}];
 const selected=selectStudy(inv,500,'attack');assert.equal(selected.attack,250*8+250*3);assert.equal(selected.selected.reduce((s,i)=>s+i.quantity,0),500);
 for(const n of[1,21,101])assert.deepEqual(selectStudy(inv,n,'defense'),selectEquipment(inv,n,'defense'));
 assert.throws(()=>selectStudy(inv,2501,'attack'));
});

test('E1 catalog is uninstalled, internally consistent and preserves classic owned use through purchase retiering',()=>{
 const before=JSON.stringify(alpha),ids=new Set(catalogItems(true).map(i=>i.id));assert.equal(proposal.installed,false);assert.equal(proposal.researchOnly,true);assert.equal(ids.size,103);
 for(const m of proposal.midLevelMirrors){const old=alpha.items.find(i=>i.id===m.replaces)!;for(const key of['level','attack','defense','price','upkeep','category'] as const)assert.equal(m[key],old[key]);}
 for(const category of ['weapon','armor','spell'])for(const [role,stat] of [['offense','attack'],['defense','defense']] as const){const tiers=proposal.items.filter(i=>i.category===category&&(i as typeof i&{role:string}).role===role).sort((a,b)=>a.level-b.level);assert.equal(tiers.length,6);assert.ok(tiers.every((i,n)=>n===0||i[stat]>tiers[n-1]![stat]),'new '+category+' '+role+' tiers must improve their primary stat');}
 for(const q of proposal.quests){assert.ok(q.level>=51&&q.level<=100);assert.ok(q.mana<=alpha.resources.mana);assert.ok(q.army<=5*q.level);for(const [id,quantity]of Object.entries(q.items)){assert.ok(ids.has(id));assert.ok(quantity>0&&quantity<=100);assert.ok(catalogItems(true).find(i=>i.id===id)!.level<=q.level);}}
 const old=catalogItems(true).find(i=>i.id==='eclipse-greatsword')!;assert.equal(old.level,100);
 assert.equal(selectStudy([{...old,inventoryId:'owned-before-expansion',quantity:5}],5,'attack').attack,550,'owned level-50 character can still use all five classic copies');
 loadout(500,2500,'balanced',true);assert.equal(JSON.stringify(alpha),before,'research must never edit installed catalog objects');
});

test('E1 zero-surplus and reinvestment portfolios use actual progressive prices and expose treasury boundaries',()=>{
 const p=portfolio(100,342500,true);assert.ok(p.sustainable&&p.net>=342500);assert.ok(p.cost>0);assert.ok(p.holdings.every(h=>h.quantity<=100));
 assert.notEqual(safeStudyPrice(2200000,70),null);assert.equal(safeStudyPrice(2200000,99),null,'future high-base Land needs safe quote clipping, not overflow');
 assert.equal(studyRequirement(50,150),levelRequirement(50));assert.equal(studyRequirement(100,150),11750);assert.equal(studyRequirement(500,150),89750);assert.throws(()=>studyRequirement(100,-1));
 const reward=botVictoryRewards(1000000,100,100,1,100,100);assert.equal(reward.loot.amount,3000);assert.equal(reward.xp.fullXpPercent,65,'research does not alter the live approved bot policy');
});

test('E1 finite simulations reproduce seeds and conserve saved money and every player resource',()=>{
 const options={name:'focused',expanded:true,extraXpPerLevel:150,sessionMinutes:[30,30],starts:[480,1140],days:4,seed:1001};
 const first=pace(options),again=pace(options);assert.deepEqual(first,again);assert.equal(first.conserved,true);assert.equal(first.stats.wins+first.stats.losses,first.stats.attacks);assert.ok(first.stats.actions<=first.stats.activeMinutes);assert.ok(first.army<=1+first.stats.accepted);assert.ok(first.stats.accepted<=80);
 const noTargets=pace({...options,availability:0});assert.equal(noTargets.stats.attacks,0);assert.ok(noTargets.blocked.opponents>0);assert.equal(noTargets.conserved,true);
 assert.throws(()=>pace({...options,starts:[1400],sessionMinutes:[100]}));
});

test('E1 population study adds synthetic identities only and exposes existing scheduler failure rather than changing it',()=>{
 const old=researchBots(false),next=researchBots(true);assert.equal(old.length,450);assert.equal(next.length,900);assert.deepEqual(next.slice(0,450),old);assert.equal(new Set(next.map(b=>b.id)).size,900);
 assert.throws(()=>scheduledCandidates(next.map(b=>b.id),0,{slots:144,maximum:5,population:450}));
 for(const b of next.slice(450)){const budget=b.level-1+(alpha.progression.milestones??[]).filter(m=>m.level<=b.level).reduce((s,m)=>s+m.points,0);assert.ok(2*b.training+(b.maxHealth-100)/10+2*(b.maxSpirit-3)<=budget);assert.ok(b.net>b.rate);assert.ok(b.landUnits<=100);}
 const p=populationStudy();assert.equal(p.incomeSweep.callsFor900Due,2);assert.equal(p.measuredLatency,null);assert.ok(p.schedules.every(s=>s.atMostTwoOpportunities));
});

test('E1 committed research inputs and all recorded progression/accounting results are verifiable without another long simulation',()=>{
 const provenance=json('provenance.json');assert.equal(provenance.headSchema,'022_player_foundations.sql');assert.equal(provenance.productionContacted,false);assert.equal(provenance.installed,false);
 // Historical mutable runtime-module hashes are evidence at the stated Git
 // baseline. Versioned rules, this research source and authored inputs remain
 // directly checkable; no blanket freeze on future legitimate app development.
 for(const [path,hash]of Object.entries(provenance.sources))if(/^(rulesets|migrations|scripts)\//.test(path)||path.endsWith('proposed-content.json'))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex'),hash,path);
 const data=json('progression.json');assert.equal(data.runs.length,72);assert.deepEqual(data.seeds,[1001,1007,1013]);
 for(const r of data.runs){const s=r.sources;assert.equal(BigInt(r.initialCurrency)+BigInt(s.land)+BigInt(s.quests)-BigInt(s.upkeep)-BigInt(s.shop)-BigInt(s.healing),BigInt(r.finalCurrency));
  const xp=Array.from({length:r.finalLevel-1},(_,i)=>studyRequirement(i+1,r.options.extraXpPerLevel)).reduce((n,x)=>n+x,0);assert.equal(xp+r.progress,r.stats.xpQuest+r.stats.xpCombat);
  const a=r.resources.allocations;assert.equal(r.resources.currentMana+r.stats.manaSpent,20+r.stats.naturalMana+r.stats.refillMana+a.mana);assert.equal(r.resources.currentStamina+r.stats.staminaSpent,3+r.stats.naturalSpirit+r.stats.refillSpirit+a.spirit);assert.equal(r.resources.currentHealth+r.stats.healthDamageApplied,100+r.stats.naturalHealth+r.stats.refillHealth+a.health*10+r.stats.healingRestored);
  assert.ok(r.stats.actions<=r.stats.activeMinutes);assert.equal(r.stats.wins+r.stats.losses,r.stats.attacks);assert.ok(r.wallet>=0&&r.wallet<=2147483647);assert.ok(r.army<=r.capacity);assert.equal(r.options.days,180);
 }
});
