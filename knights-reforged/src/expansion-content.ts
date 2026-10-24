import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {alpha,type AlphaRules,type ItemDefinition} from './alpha-rules.js';
import {deepFreeze,safeCount} from './compatibility-rules.js';
import {equipmentCatalog,activeEquipmentCatalog} from './catalog-compatibility.js';
const read=(id:string)=>JSON.parse(readFileSync(new URL('../rulesets/'+id+'/rules.json',import.meta.url),'utf8'));
export const expandedContent=deepFreeze(read('level100-content-1') as AlphaRules);
export const questRarities=deepFreeze(read('quest-equipment-rarities-1') as {id:string;reviewStatus:string;scale:number;minimumLevel:number;quantity:number;proposedPpm:number;quests:Record<string,string[]>;provenance:string});
export const hudsonGrant=deepFreeze(read('hudson-equipment-grant-1') as {id:string;characterId:string;operationId:string;catalogId:string;items:{itemId:string;quantity:number}[];upkeepExemptItemIds:string[];unitAcquisitionCost:number;retroactiveCharges:boolean;provenance:string});
export const legacyExpansionArtwork=deepFreeze(read('level100-artwork-1') as {id:string;status:string;provenance:string;entries:{id:string;name:string;kind:string;level:number;status:string;path:string|null;sha256:string|null;ownerApproval:string|null;brief:string;fullBleedRequired:boolean;license:string|null;provenanceEvidence:string|null;framingApproval:string|null}[]});
export const expansionArtwork=deepFreeze(read('level100-artwork-2') as typeof legacyExpansionArtwork);
export const expansionAchievement=deepFreeze({id:'level100-achievements-1',provenance:'Expansion-only cosmetic achievement; does not replace any installed tutorial or level-50 award.',achievements:[{id:'level100-summit',name:'Sovereign of a Hundred Kingdoms',category:'Character',metric:'level' as const,threshold:100,rank:6,emblem:'crown',description:'Reach character level 100. Earlier summit awards remain earned.'}]});
export const expansionEngine=deepFreeze({id:'level100-expansion-1',writer:'level100-engine-1',activationDefault:false,catalogId:expandedContent.id,armyPolicy:'army-five-per-level-1' as const,inventoryPolicy:'inventory-large-1' as const,progressionPolicy:'xp-post50-150-1' as const,legacyBotProgression:'xp-legacy-1' as const,expectedBots:450,opponentLevels:[51,60,70,80,90,100],minimumOpponentsPerBand:5,provenance:'Explicit coordinated owner cutover only. Existing bot policies, population and financial records are not provisioned or rewritten.'});
function normalized(v:unknown):unknown{return Array.isArray(v)?v.map(normalized):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort().map(([k,x])=>[k,normalized(x)])):v;}
export const definitionDigest=(v:unknown)=>createHash('sha256').update(JSON.stringify(normalized(v))).digest('hex');
const regular=expandedContent.items.filter(i=>i.acquisition!=='quest-exclusive'),exclusive=expandedContent.items.filter(i=>i.acquisition==='quest-exclusive');
const expandedEquipment=equipmentCatalog({id:expandedContent.id,items:regular,historicalItems:exclusive});
export function contentCatalog(id=alpha.id){if(id===alpha.id)return alpha;if(id===expandedContent.id)return expandedContent;throw new Error('Unknown installed content catalog.');}
export function equipmentCatalogFor(id=alpha.id){if(id===alpha.id)return activeEquipmentCatalog;if(id===expandedContent.id)return expandedEquipment;throw new Error('Unknown installed equipment catalog.');}
for(const key of ['items','quests','properties'] as const){const old=alpha[key],next=expandedContent[key];if(new Set(next.map(i=>i.id)).size!==next.length)throw new Error('Duplicate expansion ID.');for(const entry of old)if(definitionDigest(entry)!==definitionDigest(next.find(i=>i.id===entry.id)))throw new Error('Expansion changed historical content.');}
if(expandedContent.items.length!==alpha.items.length+39||expandedContent.quests.length!==alpha.quests.length+18||expandedContent.properties.length!==alpha.properties.length+6)throw new Error('Incomplete expansion catalog.');
const allLoot=new Map(expandedContent.quests.filter(q=>q.loot).map(q=>[q.loot!.id,q]));
if(new Set(expandedContent.content!.areas.map(a=>a.id)).size!==expandedContent.content!.areas.length)throw new Error('Duplicate region.');
for(const q of expandedContent.quests){if(!expandedContent.content!.areas.some(a=>a.name===q.area)||q.requiresLoot&&(!allLoot.has(q.requiresLoot)||allLoot.get(q.requiresLoot)!.level>q.level))throw new Error('Invalid region or prerequisite loot.');safeCount(q.army,1,500);safeCount(q.mana,1,alpha.resources.mana);safeCount(q.xp,1,1000000);safeCount(q.goldMin);safeCount(q.goldMax,q.goldMin);for(const[id,n]of Object.entries(q.items)){safeCount(n,1,alpha.limits.transaction);const item=expandedEquipment.definition(id);if(!item||item.level>q.level||item.acquisition==='quest-exclusive')throw new Error('Invalid quest requirement.');}}
for(const p of expandedContent.properties){safeCount(p.price,1,2147483647);safeCount(p.hourlyIncome,1);safeCount(p.hourlyUpkeep);if(p.hourlyUpkeep>p.hourlyIncome)throw new Error('Invalid expansion property.');}
for(const[id,items]of Object.entries(questRarities.quests)){const quest=expandedContent.quests.find(q=>q.id===id);if(!quest||quest.level<71||new Set(items).size!==items.length)throw new Error('Ineligible rare quest.');for(const itemId of items){const i=expandedEquipment.definition(itemId);if(!i||i.level<71||i.acquisition!=='quest-exclusive')throw new Error('Ineligible rare item.');}}
if(questRarities.scale!==1000000||questRarities.minimumLevel!==71||questRarities.quantity!==1)throw new Error('Invalid rarity policy.');safeCount(questRarities.proposedPpm,1,10000);
export const catalogDefinition=(id:string,catalogId=alpha.id):Readonly<ItemDefinition>|undefined=>equipmentCatalogFor(catalogId).definition(id);

if(hudsonGrant.characterId!=='55742e75-70c9-4792-8136-fe6ead2b83e0'||hudsonGrant.operationId!=='db21b413-31bb-4165-bb0c-c07e767c5be1'||hudsonGrant.items.length!==3||hudsonGrant.items.some(i=>i.quantity!==15||!exclusive.some(e=>e.id===i.itemId))||new Set(hudsonGrant.items.map(i=>i.itemId)).size!==3||definitionDigest([...hudsonGrant.upkeepExemptItemIds].sort())!==definitionDigest(exclusive.map(i=>i.id).sort())||hudsonGrant.unitAcquisitionCost!==0||hudsonGrant.retroactiveCharges)throw new Error('Invalid exact Hudson grant manifest.');

export function approvedExpansionArt(id:string){const e=expansionArtwork.entries.find(e=>e.id===id);return e?.status==='approved'&&e.ownerApproval&&e.license&&e.provenanceEvidence&&e.framingApproval&&e.path&&/^\/assets\/[a-z0-9/_.-]+$/.test(e.path)?e.path:null;}

// Availability is distinct from approval. These future-catalog images can be
// rendered for review, but prepared status never satisfies activation readiness.
export function preparedExpansionArt(id:string){const e=expansionArtwork.entries.find(e=>e.id===id);return e&&['prepared','approved'].includes(e.status)&&e.license&&e.provenanceEvidence&&e.sha256&&/^[a-f0-9]{64}$/.test(e.sha256)&&e.path&&/^\/assets\/art\/level100-1\/[a-z0-9-]+\.webp$/.test(e.path)?e.path:null;}

const expectedArt=[...expandedContent.items.filter(i=>!alpha.items.some(old=>old.id===i.id)),...expandedContent.properties.filter(p=>!alpha.properties.some(old=>old.id===p.id))];
if(expansionArtwork.entries.length!==45||new Set(expansionArtwork.entries.map(e=>e.id)).size!==45||expectedArt.some(i=>!expansionArtwork.entries.some(e=>e.id===i.id&&e.name===i.name&&e.level===i.level&&e.fullBleedRequired&&e.brief.length>=50)))throw new Error('Incomplete expansion artwork specifications.');
