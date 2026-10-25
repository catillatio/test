// Prepared visual overrides only; no content, economics, account or activation writes.
import {readFileSync} from 'node:fs';import {readFile,realpath,stat} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve,sep} from 'node:path';
import {deepFreeze} from './compatibility-rules.js';import {equipmentPresentation} from './equipment-presentation.js';import {expandedContent} from './expansion-content.js';import {expansionArtwork,definitionDigest} from './expansion-artwork.js';import {projectRoot} from './config.js';
export interface RegionalAsset {id:string;name:string;level:number;category:'weapon'|'property';region:string;oldPath:string;path:string;sha256:string;bytes:number;width:number;height:number;source:string;sourceSha256:string;reviewStatus:string;ownerApproval:string|null;fullBleed:boolean;}
export interface RegionalRegistry {id:string;reviewStatus:string;activationDefault:boolean;sourceCommit:string;presentationId:string;presentationDigest:string;predecessorArtworkId:string;predecessorArtworkDigest:string;scope:string[];preserveApprovedArt:boolean;entries:RegionalAsset[];}
export const regionalArtwork=deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/regional-weapon-land-art-1/rules.json',import.meta.url),'utf8')) as RegionalRegistry);
// Owner visual review has NOT occurred. A future reviewed immutable registry and
// explicit code release are required. No env flag/query/DB value enables drafts.
export const activeRegionalArtworkId:string|null=null;
const registries:readonly RegionalRegistry[]=[regionalArtwork];
const expectedTargets=()=>[
 ...equipmentPresentation.entries.filter(e=>e.category==='weapon'&&e.art.use==='temporary-beta').map(e=>({id:e.id,name:e.name,level:e.level,category:'weapon',oldPath:expansionArtwork.assets!.find(a=>a.role==='weapon')!.path})),
 ...expansionArtwork.entries.filter(e=>e.kind==='property'&&e.use==='temporary-beta').map(e=>{const p=expandedContent.properties.find(p=>p.id===e.id)!;return {id:p.id,name:p.name,level:p.level,category:'property',oldPath:e.path};})];
export function validateRegionalArtwork(registry:RegionalRegistry=regionalArtwork){
 const expected=expectedTargets();
 if(registry.id!=='regional-weapon-land-art-1'||registry.activationDefault!==false||registry.reviewStatus!=='pending-owner-review'||registry.preserveApprovedArt!==true||definitionDigest(registry.scope)!==definitionDigest(['weapon','property'])||registry.presentationId!==equipmentPresentation.id||registry.presentationDigest!==definitionDigest(equipmentPresentation)||registry.predecessorArtworkId!==expansionArtwork.id||registry.predecessorArtworkDigest!==definitionDigest(expansionArtwork)||registry.entries.length!==expected.length||expected.length!==22||new Set(registry.entries.map(e=>e.id)).size!==22)throw new Error('Invalid exact regional artwork registry.');
 for(const e of registry.entries){const target=expected.find(t=>t.id===e.id);
  if(!target||e.name!==target.name||e.level!==target.level||e.category!==target.category||e.oldPath!==target.oldPath||!e.region||e.reviewStatus!=='pending-owner-review'||e.ownerApproval!==null||e.source!==(e.id==='king-hudsons-sword'?'docs/level100-launch/art/owner-originals/ccb25e5e-239c-4194-b1e7-23d913641f44.png':'docs/regional-art-1/sources/'+e.id+'.png')||e.fullBleed!==true||e.path!=='/assets/art/regional-weapon-land-1/'+e.id+'.webp'||! /^[a-f0-9]{64}$/.test(e.sha256)||! /^[a-f0-9]{64}$/.test(e.sourceSha256)||!Number.isSafeInteger(e.bytes)||e.bytes<1||e.bytes>400000||e.width!==(e.category==='property'?768:512)||e.height!==512)throw new Error('Invalid regional placeholder replacement.');
 }
}
validateRegionalArtwork();
export async function verifyRegionalArtwork(registry=regionalArtwork,publicRoot=resolve(projectRoot,'public')){
 validateRegionalArtwork(registry);if(!registries.some(r=>r.id===registry.id&&definitionDigest(r)===definitionDigest(registry)))throw new Error('Unknown immutable regional artwork identity.');
 const root=await realpath(publicRoot);for(const e of registry.entries){const path=await realpath(resolve(root,e.path.replace(/^\/assets\//,'')));if(!path.startsWith(root+sep)||!(await stat(path)).isFile())throw new Error('Regional artwork path escaped public root.');const bytes=await readFile(path);if(bytes.length!==e.bytes||createHash('sha256').update(bytes).digest('hex')!==e.sha256||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw new Error('Regional artwork integrity failed.');}
 return {readyForVisualReview:true,approvedForActivation:false,registryId:registry.id,digest:definitionDigest(registry),entries:registry.entries.length,bytes:registry.entries.reduce((n,e)=>n+e.bytes,0)};
}
type RenderEntry={id:string;name:string;presentationId?:string};
// Local preview scripts/tests use this exact candidate resolver; never accepted
// from a request, environment variable, private plan or player-supplied value.
export function previewRegionalArt(entry:RenderEntry){const e=regionalArtwork.entries.find(e=>e.id===entry.id);if(!e||e.category==='weapon'&&(entry.presentationId!==equipmentPresentation.id||entry.name!==e.name))return null;return {...e,use:'prepared-preview' as const};}
export function regionalArt(entry:RenderEntry){
 if(activeRegionalArtworkId===null)return null;
 const approved=registries.find(r=>r.id===activeRegionalArtworkId);
 if(!approved||approved.reviewStatus!=='approved'||approved.entries.some(e=>e.reviewStatus!=='approved'||!e.ownerApproval))throw new Error('Regional artwork requires exact owner review.');
 const e=approved.entries.find(e=>e.id===entry.id);if(!e||e.category==='weapon'&&(entry.presentationId!==equipmentPresentation.id||entry.name!==e.name))return null;return {...e,use:'final' as const};
}
