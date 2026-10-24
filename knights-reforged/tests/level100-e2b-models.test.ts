import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {expandedContent,definitionDigest} from '../src/expansion-content.js';import {pace,researchBots,selectStudy,loadout} from '../scripts/simulation/level100-e2b.js';
const data=(name:string)=>JSON.parse(readFileSync(new URL('../docs/level100-e2b/'+name+'.json',import.meta.url),'utf8'));
test('E2b prepared-catalog simulations conserve resources and currency, retain legacy bots and reproduce a finite seed',()=>{
 const p=data('progression');assert.equal(p.catalogDigest,definitionDigest(expandedContent));assert.equal(p.runs.length,15);
 for(const r of p.runs){const s=r.sources;assert.equal(BigInt(r.initialCurrency)+BigInt(s.land)+BigInt(s.quests)-BigInt(s.upkeep)-BigInt(s.shop)-BigInt(s.healing),BigInt(r.finalCurrency));assert.equal(r.conserved,true);assert.equal(r.stats.wins+r.stats.losses,r.stats.attacks);assert.ok(r.army<=r.capacity&&r.army<=1+r.stats.accepted);assert.ok(r.stats.actions<=r.stats.activeMinutes);assert.equal(r.options.extraXpPerLevel,150);}
 const options={name:'e2b-reproducibility',expanded:true,extraXpPerLevel:150,sessionMinutes:[30,30],starts:[480,1140],days:3,seed:1001};assert.deepEqual(pace(options),pace(options));
 assert.deepEqual(researchBots(true).slice(0,450),researchBots(false));assert.equal(researchBots(true).length,900);
 assert.equal(data('population').newBotsCreated,0);
 for(const level of [100,200,500]){const n=5*level,inventory=loadout(level,n,'balanced',true);assert.equal(selectStudy(inventory,n,'attack').selected.reduce((s,i)=>s+i.quantity,0),3*n);assert.ok(inventory.every(i=>i.acquisition!=='quest-exclusive'));}
 const rarity=data('rarity');assert.equal(rarity.approved,false);for(const r of rarity.rates){assert.ok(r.dailyEligibleCompletions<=15);assert.ok(Math.abs(r.expectedCopies-r.quests*r.ppm/1000000)<1e-12);assert.ok(r.probabilityOneOrMore>=r.probabilityTwoOrMore&&r.probabilityTwoOrMore>=r.probability15OrMore);}
});
