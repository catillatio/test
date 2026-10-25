// Display identity only. Immutable numerical catalogs and saved records remain authoritative.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {realpath,readFile} from 'node:fs/promises';
import {alpha,type AlphaRules,type ItemDefinition} from './alpha-rules.js';
import {deepFreeze} from './compatibility-rules.js';
import {expansionArtwork,definitionDigest} from './expansion-artwork.js';
import {projectRoot} from './config.js';
type PresentationEntry={id:string;category:string;level:number;name:string;region:string;brief:string;art:{use:'approved-existing'|'temporary-beta';sourceItemId?:string;role?:string}};
export interface EquipmentPresentation {id:string;activationDefault:boolean;catalogId:string;artworkRegistryId:string;regions:{regionId:string;culture:string;brief:string}[];entries:PresentationEntry[];approvedSourceFiles:{path:string;sha256:string}[];}
export const equipmentPresentation=deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/level100-equipment-presentation-1/rules.json',import.meta.url),'utf8')) as EquipmentPresentation);
const expanded=JSON.parse(readFileSync(new URL('../rulesets/level100-content-1/rules.json',import.meta.url),'utf8')) as AlphaRules;
function approvedSourcePath(id:string){const item=alpha.items.find(i=>i.id===id)!;return 'public/art/'+(['oathbound-greatsword','crown-of-ash-blade','eclipse-greatsword','sovereigns-bastion','eclipse-citadel-plate'].includes(id)?'equipment-51b-current-1/'+id+'.webp':item.illustration?'fantasy-0.2/'+item.illustration.atlas+'.webp':'alpha/'+item.art+'.svg');}
export function validateEquipmentPresentation(policy:EquipmentPresentation=equipmentPresentation){
 if(policy.id!=='level100-equipment-presentation-1'||policy.activationDefault!==false||policy.catalogId!==expanded.id||policy.artworkRegistryId!==expansionArtwork.id||policy.entries.length!==expanded.items.length||new Set(policy.entries.map(e=>e.id)).size!==policy.entries.length||new Set(policy.entries.map(e=>e.name.normalize('NFKC').toLowerCase().replaceAll('’',"'"))).size!==policy.entries.length)throw new Error('Invalid equipment presentation identity.');
 if(policy.regions.length!==6||new Set(policy.regions.map(r=>r.regionId)).size!==6||new Set(policy.regions.map(r=>r.culture)).size!==6||policy.regions.some(r=>!expanded.content?.areas.some(a=>a.id===r.regionId&&a.level>50)||!r.brief))throw new Error('Invalid regional presentation.');
 for(const e of policy.entries){const item=expanded.items.find(i=>i.id===e.id),source=alpha.items.find(i=>i.id===e.art.sourceItemId),asset=expansionArtwork.assets?.find(a=>a.role===e.art.role);
  if(!item||e.category!==item.category||e.level!==item.level||!e.name||e.name.length>80||/[<>\x00-\x1f]/.test(e.name)||!e.brief||!['Legacy',...policy.regions.map(r=>r.culture)].includes(e.region))throw new Error('Mismatched equipment presentation slot.');
  if(e.art.use==='approved-existing'){if(!source||source.category!==item.category||e.art.role!==undefined)throw new Error('Invalid approved artwork source.');}
  else if(e.art.use!=='temporary-beta'||!asset||e.art.sourceItemId!==undefined||!({weapon:['weapon'],armor:['armor','shield'],spell:['spell']}[item.category]).includes(e.art.role!))throw new Error('Invalid temporary artwork role.');
  if(item.acquisition==='quest-exclusive'&&(e.name!==item.name||e.art.use!=='temporary-beta'))throw new Error('Hudson presentation requires a separate art approval.');
 }
 const paths=[...new Set(policy.entries.filter(e=>e.art.use==='approved-existing').map(e=>approvedSourcePath(e.art.sourceItemId!)))].sort();
 if(definitionDigest(paths)!==definitionDigest(policy.approvedSourceFiles.map(f=>f.path).sort())||policy.approvedSourceFiles.some(f=>!/^[a-f0-9]{64}$/.test(f.sha256)))throw new Error('Invalid approved artwork fingerprint.');
}
validateEquipmentPresentation();
export async function verifyPresentationAssets(){
 validateEquipmentPresentation();const root=await realpath(projectRoot);
 for(const file of equipmentPresentation.approvedSourceFiles){const path=await realpath(resolve(root,file.path));if(!path.startsWith(root+sep)||createHash('sha256').update(await readFile(path)).digest('hex')!==file.sha256)throw new Error('Approved presentation artwork changed.');}
}
export function presentedItem<T extends ItemDefinition>(item:T,policyId?:string):T{
 if(!policyId)return item;if(policyId!==equipmentPresentation.id)throw new Error('Unknown equipment presentation policy.');const e=equipmentPresentation.entries.find(e=>e.id===item.id);if(!e)return item;
 return {...item,name:e.name,presentationId:policyId};
}
export function presentationCatalog(catalog:AlphaRules,policyId?:string):AlphaRules{return !policyId?catalog:{...catalog,items:catalog.items.map(i=>presentedItem(i,policyId)),content:catalog.content?{...catalog.content,areas:catalog.content.areas.map(a=>{const r=equipmentPresentation.regions.find(r=>r.regionId===a.id);return r?{...a,description:r.culture+' — '+a.description}:a;})}:undefined};}
// Historical records opt in only through their own recorded policy, never today's realm state.
export function recordedEquipment(item:ItemDefinition,record:{name?:string;presentationId?:string}){return {...presentedItem(item,record.presentationId),name:record.name??item.name};}
export function presentationArt(entry:ItemDefinition&{presentationId?:string}){
 if(!entry.presentationId)return {entry,path:null,use:null};if(entry.presentationId!==equipmentPresentation.id)throw new Error('Unknown artwork presentation.');
 const e=equipmentPresentation.entries.find(e=>e.id===entry.id);if(!e)throw new Error('Unknown artwork presentation target.');
 if(e.art.use==='temporary-beta')return {entry,path:expansionArtwork.assets!.find(a=>a.role===e.art.role)!.path,use:'temporary-beta'};
 return {entry:{...alpha.items.find(i=>i.id===e.art.sourceItemId)!,name:entry.name},path:null,use:'approved-existing'};
}
export const presentationDigest=()=>definitionDigest(equipmentPresentation);
