import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deepFreeze,resolveArmyCapacity} from '../compatibility-rules.js';
import {contentCatalog,expandedContent} from '../expansion-content.js';
import {alpha} from '../alpha-rules.js';
import {prepareProgressionEpoch,type ProgressionEpoch} from '../progression-policy.js';
import {sha256} from './authorization.js';
export interface GraveyardTemplate {id:string;level:number;garrison:number;health:number;calling:string;attackTraining:number;defenseTraining:number;equipment:{itemId:string;quantity:number}[];property:{id:string;quantity:number};progression?:ProgressionEpoch;}
// Public immutable inputs only. There is deliberately no donor/profile argument.
export const graveyardWorld=deepFreeze(JSON.parse(readFileSync(new URL('../../rulesets/graveyard-world-2/rules.json',import.meta.url),'utf8')) as {
 id:string;name:string;startingGold:number;limits:{maximumPopulation:number;maximumNewPerOperation:number};recommended:{targetPopulation:number;maximumPopulation:number;maximumNewPerOperation:number};rosters:Record<string,GraveyardTemplate[]>;
});
assert.equal(graveyardWorld.id,'graveyard-world-2');assert.deepEqual(graveyardWorld.limits,{maximumPopulation:96,maximumNewPerOperation:12});assert.equal(graveyardWorld.startingGold,0);assert.equal(graveyardWorld.name,'Abandoned Kingdom');
for(const catalogId of [alpha.id,expandedContent.id]){
 const catalog=contentCatalog(catalogId),roster=graveyardWorld.rosters[catalogId]!;
 assert.equal(roster.length,24);assert.equal(new Set(roster.map(t=>t.id)).size,24);
 for(const t of roster){
  assert.deepEqual(t.progression,catalogId===alpha.id?undefined:prepareProgressionEpoch(t.level,0,'xp-post50-150-1'));
  assert.ok(t.level>=1&&t.level<=(catalogId===alpha.id?50:100));assert.ok(t.garrison>=1&&t.garrison<=resolveArmyCapacity(t.level,1,catalogId===alpha.id?'army-legacy-1':'army-five-per-level-1'));
  assert.equal(t.health,100+2*t.level);assert.ok(['Freeblade','Warden'].includes(t.calling));assert.equal(t.attackTraining,Math.floor(t.level/10));assert.equal(t.defenseTraining,Math.floor(t.level/10));
  assert.equal(t.equipment.length,3);assert.equal(new Set(t.equipment.map(e=>catalog.items.find(i=>i.id===e.itemId)!.category)).size,3);
  for(const e of t.equipment){const i=catalog.items.find(i=>i.id===e.itemId);assert.ok(i&&i.level<=t.level&&i.acquisition!=='quest-exclusive');assert.equal(e.quantity,t.garrison);}
  assert.ok(catalog.properties.some(p=>p.id===t.property.id&&p.level<=t.level));assert.ok([1,2].includes(t.property.quantity));
 }
}
export function graveyardRoster(catalogId:string){const roster=graveyardWorld.rosters[catalogId];assert.ok(roster,'Unreviewed graveyard catalog.');return roster;}
export const graveyardDefinitionDigest=()=>sha256(JSON.stringify(graveyardWorld));

export function graveyardTemplate(catalogId:string,slot:number){assert.ok(Number.isSafeInteger(slot)&&slot>=0&&slot<graveyardWorld.limits.maximumPopulation);const roster=graveyardRoster(catalogId);return roster[slot%roster.length]!;}
export function replenishmentSlots(occupied:number[],target:number,limit:number){assert.ok(Number.isSafeInteger(target)&&target>=0&&target<=graveyardWorld.limits.maximumPopulation);assert.ok(Number.isSafeInteger(limit)&&limit>=1&&limit<=graveyardWorld.limits.maximumNewPerOperation);assert.equal(new Set(occupied).size,occupied.length);return Array.from({length:target},(_,i)=>i).filter(i=>!occupied.includes(i)).slice(0,limit);}
