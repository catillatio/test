// Exact owner-selected artwork only. This code release changes presentation;
// it never writes an expansion approval, grant, inventory or catalog definition.
import {readFileSync} from 'node:fs';
import {readFile,realpath,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {projectRoot} from './config.js';
import {deepFreeze} from './compatibility-rules.js';
import {expandedContent,definitionDigest} from './expansion-content.js';
import {equipmentPresentation} from './equipment-presentation.js';

interface EquipmentArtworkEntry {
 id:string;name:string;category:string;level:number;path:string;sha256:string;
 bytes:number;width:number;height:number;fullBleed:boolean;
 source:string;sourceSha256:string;ownerOriginal:string;ownerOriginalSha256:string;
 sourceCommit:string;processing:string;license:string;
}
interface EquipmentArtworkRegistry {
 id:string;status:string;ownerSelection:string;presentationId:string;
 predecessorArtworkId:string;predecessorDigest:string;entries:EquipmentArtworkEntry[];
}
export const equipmentArtwork=deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/equipment-artwork-1/rules.json',import.meta.url),'utf8')) as EquipmentArtworkRegistry);
export const equipmentArtworkDigest='2b43b9c93880f7235df8c533a27a58648e01b27ef9e6bf0c1c747918c1748c3a';
const ids=['king-hudsons-meteor-shower','king-hudsons-shield','king-hudsons-sword'];
export function validateEquipmentArtwork(registry:EquipmentArtworkRegistry=equipmentArtwork){
 if(registry.id!=='equipment-artwork-1'||registry.status!=='owner-selected-for-integration'||registry.ownerSelection!=='owner-final-equipment-cleanup-2026-10-26'||registry.presentationId!==equipmentPresentation.id||registry.predecessorArtworkId!=='coordinated-art-2'||registry.predecessorDigest!=='de7b86048f4af97e53924d342c26489cc44afe9236db34c1a766a9d53e92f4ff'||definitionDigest(registry.entries.map(e=>e.id).sort())!==definitionDigest(ids))throw Error('Invalid equipment artwork selection.');
 for(const e of registry.entries){
  const item=expandedContent.items.find(i=>i.id===e.id);
  if(!item||item.acquisition!=='quest-exclusive'||e.name!==item.name||e.level!==item.level||e.category!==item.category||e.path!=='/assets/art/equipment-artwork-1/'+e.id+'.webp'||!e.fullBleed||e.width!==512||e.height!==512||!Number.isSafeInteger(e.bytes)||e.bytes<1||e.bytes>750000||!/^[a-f0-9]{64}$/.test(e.sha256)||e.sourceSha256!==e.sha256||!/^[a-f0-9]{64}$/.test(e.ownerOriginalSha256)||e.source!=='docs/level100-launch/art/archived-runtime-level100-1/'+e.id+'.webp'||!e.license)throw Error('Invalid equipment artwork identity.');
 }
 if(definitionDigest(registry)!==equipmentArtworkDigest)throw Error('Unknown immutable equipment artwork manifest.');
}
validateEquipmentArtwork();
export async function verifyEquipmentArtwork(registry=equipmentArtwork,publicRoot=resolve(projectRoot,'public')){
 validateEquipmentArtwork(registry);const root=await realpath(publicRoot);
 for(const e of registry.entries){
  const path=await realpath(resolve(root,e.path.replace(/^\/assets\//,'')));
  if(!path.startsWith(root+sep)||!(await stat(path)).isFile())throw Error('Equipment artwork escaped public root.');
  const bytes=await readFile(path);
  if(bytes.length!==e.bytes||createHash('sha256').update(bytes).digest('hex')!==e.sha256||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw Error('Equipment artwork integrity failed.');
 }
 return {registryId:registry.id,digest:equipmentArtworkDigest,entries:registry.entries.length,bytes:registry.entries.reduce((n,e)=>n+e.bytes,0)};
}
// Only exact catalog identities resolve, including saved reports which already
// preserve their own name/category/level. No player-controlled artwork selector.
export function approvedEquipmentArt(entry:{id:string;name:string;category?:string;level?:number}){
 const e=equipmentArtwork.entries.find(e=>e.id===entry.id);
 return e&&e.name===entry.name&&e.category===entry.category&&e.level===entry.level?{...e,use:'final'}:null;
}
