// Prepared visual overrides only; no content, economics, account or activation writes.
import {readFileSync} from 'node:fs';import {readFile,realpath,stat} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve,sep} from 'node:path';
import {deepFreeze} from './compatibility-rules.js';import {equipmentPresentation} from './equipment-presentation.js';import {expandedContent} from './expansion-content.js';import {expansionArtwork,definitionDigest} from './expansion-artwork.js';import {projectRoot} from './config.js';
export interface RegionalAsset {id:string;name:string;level:number;category:'weapon'|'property';region:string;oldPath:string;path:string;sha256:string;bytes:number;width:number;height:number;source:string;sourceSha256:string;reviewStatus:string;ownerApproval:string|null;fullBleed:boolean;elementalIdentity?:string;designBrief?:string;magicTreatment?:string;slightGlow?:boolean;backgroundSha256?:string;}
export interface RegionalBackground {path:string;sha256:string;bytes:number;width:number;height:number;sourceAtlas:string;sourceAtlasSha256:string;crop:number[];}
export interface RegionalRegistry {id:string;reviewStatus:string;activationDefault:boolean;sourceCommit:string;presentationId:string;presentationDigest:string;predecessorArtworkId:string;predecessorArtworkDigest:string;scope:string[];preserveApprovedArt:boolean;entries:RegionalAsset[];supersedesCandidateId?:string;supersedesCandidateDigest?:string;background?:RegionalBackground;}
export const previousRegionalArtwork=deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/regional-weapon-land-art-1/rules.json',import.meta.url),'utf8')) as RegionalRegistry);
export const elementalRegionalArtwork=deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/regional-weapon-land-art-2/rules.json',import.meta.url),'utf8')) as RegionalRegistry);
export const regionalArtwork=deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/regional-weapon-land-art-3/rules.json',import.meta.url),'utf8')) as RegionalRegistry);
// Final coordinated asset approval has not occurred. A future approved immutable registry and
// explicit code release are required. No env flag/query/DB value enables drafts.
export const activeRegionalArtworkId:string|null=null;
const registries:readonly RegionalRegistry[]=[previousRegionalArtwork,elementalRegionalArtwork,regionalArtwork];
const expectedTargets=()=>[
 ...equipmentPresentation.entries.filter(e=>e.category==='weapon'&&e.art.use==='temporary-beta').map(e=>({id:e.id,name:e.name,level:e.level,category:'weapon',oldPath:expansionArtwork.assets!.find(a=>a.role==='weapon')!.path})),
 ...expansionArtwork.entries.filter(e=>e.kind==='property'&&e.use==='temporary-beta').map(e=>{const p=expandedContent.properties.find(p=>p.id===e.id)!;return {id:p.id,name:p.name,level:p.level,category:'property',oldPath:e.path};})];
export function validateRegionalArtwork(registry:RegionalRegistry=regionalArtwork){
 const expected=expectedTargets(),version=['regional-weapon-land-art-1','regional-weapon-land-art-2','regional-weapon-land-art-3'].indexOf(registry.id)+1;
 const predecessor=version===3?elementalRegionalArtwork:previousRegionalArtwork;
 if(!version||registry.activationDefault!==false||registry.reviewStatus!=='pending-owner-review'||registry.preserveApprovedArt!==true||definitionDigest(registry.scope)!==definitionDigest(['weapon','property'])||registry.presentationId!==equipmentPresentation.id||registry.presentationDigest!==definitionDigest(equipmentPresentation)||registry.predecessorArtworkId!==expansionArtwork.id||registry.predecessorArtworkDigest!==definitionDigest(expansionArtwork)||registry.entries.length!==expected.length||expected.length!==22||new Set(registry.entries.map(e=>e.id)).size!==22||version>1&&(registry.supersedesCandidateId!==predecessor.id||registry.supersedesCandidateDigest!==definitionDigest(predecessor)))throw new Error('Invalid exact regional artwork registry.');
 const bg=registry.background;
 if(version===3){
  if(!bg||bg.path!=='/assets/art/regional-weapon-land-3/background.webp'||bg.sourceAtlas!=='public/art/fantasy-0.2/weapons.webp'||definitionDigest(bg.crop)!==definitionDigest([8,8,108,108])||bg.width!==512||bg.height!==512||!Number.isSafeInteger(bg.bytes)||bg.bytes<1||bg.bytes>400000||! /^[a-f0-9]{64}$/.test(bg.sha256)||! /^[a-f0-9]{64}$/.test(bg.sourceAtlasSha256))throw new Error('Invalid exact live-background source.');
 }else if(bg)throw new Error('Historical background metadata changed.');
 for(const e of registry.entries){const target=expected.find(t=>t.id===e.id),preserved=e.category==='property'||e.id==='king-hudsons-sword',assetVersion=preserved?1:version;
  if(version>1&&preserved&&definitionDigest(e)!==definitionDigest(previousRegionalArtwork.entries.find(p=>p.id===e.id)))throw new Error('Preserved property/Hudson candidate changed.');
  const source=e.id==='king-hudsons-sword'?'docs/level100-launch/art/owner-originals/ccb25e5e-239c-4194-b1e7-23d913641f44.png':assetVersion===3?'docs/regional-art-4/foreground/'+e.id+'.png':'docs/regional-art-'+assetVersion+'/sources/'+e.id+'.png';
  if(!target||e.name!==target.name||e.level!==target.level||e.category!==target.category||e.oldPath!==target.oldPath||!e.region||e.reviewStatus!=='pending-owner-review'||e.ownerApproval!==null||e.source!==source||e.fullBleed!==true||e.path!=='/assets/art/regional-weapon-land-'+assetVersion+'/'+e.id+'.webp'||! /^[a-f0-9]{64}$/.test(e.sha256)||! /^[a-f0-9]{64}$/.test(e.sourceSha256)||!Number.isSafeInteger(e.bytes)||e.bytes<1||e.bytes>400000||e.width!==(e.category==='property'?768:512)||e.height!==512)throw new Error('Invalid regional placeholder replacement.');
  if(version===3&&!preserved&&(e.backgroundSha256!==bg!.sha256||e.slightGlow!==['sovereigns-zweihander','throneguard-polehammer','eclipse-gatehammer'].includes(e.id)||typeof e.magicTreatment!=='string'||!e.magicTreatment))throw new Error('Invalid restrained-magic/background identity.');
 }
}
validateRegionalArtwork();
export async function verifyRegionalArtwork(registry=regionalArtwork,publicRoot=resolve(projectRoot,'public')){
 validateRegionalArtwork(registry);if(!registries.some(r=>r.id===registry.id&&definitionDigest(r)===definitionDigest(registry)))throw new Error('Unknown immutable regional artwork identity.');
 const root=await realpath(publicRoot);
 const verifyFile=async(e:{path:string;sha256:string;bytes?:number})=>{const path=await realpath(resolve(root,e.path.replace(/^\/assets\//,'')));if(!path.startsWith(root+sep)||!(await stat(path)).isFile())throw new Error('Regional artwork path escaped public root.');const bytes=await readFile(path);if(e.bytes!==undefined&&bytes.length!==e.bytes||createHash('sha256').update(bytes).digest('hex')!==e.sha256||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw new Error('Regional artwork integrity failed.');};
 for(const e of registry.entries)await verifyFile(e);
 if(registry.background){await verifyFile(registry.background);await verifyFile({path:'/assets/art/fantasy-0.2/weapons.webp',sha256:registry.background.sourceAtlasSha256});}
 return {readyForVisualReview:true,approvedForActivation:false,registryId:registry.id,digest:definitionDigest(registry),entries:registry.entries.length,bytes:registry.entries.reduce((n,e)=>n+e.bytes,0),backgroundBytes:registry.background?.bytes??0};
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
