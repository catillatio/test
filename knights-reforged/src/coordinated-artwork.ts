// Presentation-only overrides. No SQL, environment switch, request parameter or
// expansion reactivation can adopt this registry. Adoption requires a separately
// owner-reviewed exact code release selecting a complete immutable manifest.
import {readFileSync} from 'node:fs';
import {readFile,realpath,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {deepFreeze} from './compatibility-rules.js';
import {equipmentPresentation} from './equipment-presentation.js';
import {previousRegionalArtwork} from './regional-artwork.js';
import {definitionDigest} from './expansion-artwork.js';
import {projectRoot} from './config.js';

type Category='weapon'|'armor'|'spell'|'property';
export interface CoordinatedEntry {
 id:string;name:string;category:Category;level:number;region:string;
 status:'ready-for-release-review'|'blocked-concept-only';
 source:string;sourceSha256:string;sourceOriginal:string;sourceKind:string;
 fullBleed:boolean;path?:string;sha256?:string;bytes?:number;width?:number;height?:number;
 crop?:number[];blocker?:string;
}
export interface CoordinatedRegistry {
 id:string;status:string;activationDefault:boolean;presentationId:string;presentationDigest:string;
 landPredecessorId:string;landPredecessorDigest:string;ownerReleaseApproval:string|null;
 sourcePackage:string;sourcePackageSha256:string;scope:Record<Category,number>;entries:CoordinatedEntry[];
}
export const coordinatedArtwork=deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/coordinated-art-1/rules.json',import.meta.url),'utf8')) as CoordinatedRegistry);
// This unpublished candidate has five missing production assets. Never edit it
// after review to imply a different identity; append coordinated-art-2 instead.
export const coordinatedArtworkDigest='56438d3d4b17db405d71013d4c8b48becb9bf3d01b4de26b16367f90909d12d4';
export const activeCoordinatedArtwork:Readonly<{id:string;digest:string;ownerApproval:string}>|null=null;
const hashPattern=/^[a-f0-9]{64}$/;
const equipmentTargets=equipmentPresentation.entries.filter(e=>e.art.use==='temporary-beta'&&!e.id.startsWith('king-hudsons-'));
const landTargets=previousRegionalArtwork.entries.filter(e=>e.category==='property');
const targets=[...equipmentTargets,...landTargets];

export function validateCoordinatedArtwork(registry:CoordinatedRegistry=coordinatedArtwork){
 if(registry.id!=='coordinated-art-1'||registry.activationDefault!==false||registry.status!=='blocked-incomplete-supply'||registry.ownerReleaseApproval!==null||registry.presentationId!==equipmentPresentation.id||registry.presentationDigest!==definitionDigest(equipmentPresentation)||registry.landPredecessorId!==previousRegionalArtwork.id||registry.landPredecessorDigest!==definitionDigest(previousRegionalArtwork)||!hashPattern.test(registry.sourcePackageSha256)||definitionDigest(registry.scope)!==definitionDigest({weapon:15,armor:15,spell:16,property:6})||registry.entries.length!==52||new Set(registry.entries.map(e=>e.id)).size!==52)throw new Error('Invalid coordinated artwork identity.');
 for(const entry of registry.entries){
  const target=targets.find(t=>t.id===entry.id);
  if(!target||(['name','category','level','region'] as const).some(key=>entry[key]!==target[key])||entry.fullBleed!==true||!hashPattern.test(entry.sourceSha256)||!entry.sourceOriginal)throw new Error('Invalid coordinated artwork target.');
  if(entry.category==='property'){
   const original=landTargets.find(t=>t.id===entry.id)!;
   for(const key of ['path','sha256','bytes','width','height','source','sourceSha256'] as const)if(entry[key]!==original[key])throw new Error('Preserved Land artwork changed.');
   if(entry.status!=='ready-for-release-review'||entry.sourceKind!=='exact-pr37-land')throw new Error('Invalid Land provenance.');
  }else{
   const sourcePrefix=entry.status==='blocked-concept-only'?'docs/coordinated-art-1/concepts/weapon_concepts/':'docs/coordinated-art-1/owner-upload/';
   if(!entry.source.startsWith(sourcePrefix)||entry.source.includes('..')||!/^docs\/[a-zA-Z0-9_./-]+\.webp$/.test(entry.source))throw new Error('Invalid supplied artwork source.');
   if(entry.status==='blocked-concept-only'){
    if(entry.category!=='weapon'||entry.sourceKind!=='concept-sheet-crop'||!entry.blocker||['path','sha256','bytes','width','height','crop'].some(k=>Object.hasOwn(entry,k)))throw new Error('Concept art cannot become runtime artwork.');
    continue;
   }
   if(entry.status!=='ready-for-release-review'||!['standalone-owner-webp','generated-sheet-tile'].includes(entry.sourceKind)||entry.path!=='/assets/art/coordinated-art-1/'+entry.id+'.webp')throw new Error('Invalid versioned artwork path.');
  }
  if(!entry.path||!hashPattern.test(entry.sha256??'')||!Number.isSafeInteger(entry.bytes)||entry.bytes!<1||entry.bytes!>400000||!Number.isSafeInteger(entry.width)||!Number.isSafeInteger(entry.height)||entry.width!<128||entry.height!<128||entry.width!>768||entry.height!>512)throw new Error('Invalid coordinated artwork payload.');
 }
 const ready=registry.entries.filter(e=>e.path);
 if(new Set(ready.map(e=>e.path)).size!==ready.length||new Set(ready.map(e=>e.sha256)).size!==ready.length)throw new Error('Duplicate coordinated artwork mapping.');
}
validateCoordinatedArtwork();
function requireKnownRegistry(registry:CoordinatedRegistry){
 validateCoordinatedArtwork(registry);
 if(definitionDigest(registry)!==coordinatedArtworkDigest)throw new Error('Unknown immutable coordinated artwork manifest.');
}
export async function verifyCoordinatedArtwork(registry=coordinatedArtwork,publicRoot=resolve(projectRoot,'public')){
 requireKnownRegistry(registry);
 const root=await realpath(publicRoot);
 for(const entry of registry.entries.filter(e=>e.path)){
  const path=await realpath(resolve(root,entry.path!.replace(/^\/assets\//,'')));
  if(!path.startsWith(root+sep)||!(await stat(path)).isFile())throw new Error('Coordinated artwork escaped public root.');
  const bytes=await readFile(path);
  if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw new Error('Coordinated artwork integrity failed.');
 }
 return {registryId:registry.id,digest:definitionDigest(registry),expected:52,integrated:registry.entries.filter(e=>e.path).length,blocked:registry.entries.filter(e=>!e.path).map(e=>e.id),bytes:registry.entries.reduce((sum,e)=>sum+(e.bytes??0),0),approvedForAdoption:false};
}
// This is intentionally a hard failure for the supplied incomplete candidate,
// even if an operator or a forged local configuration claims owner approval.
export function requireCoordinatedAdoption(selection:{id:string;digest:string;ownerApproval:string}){
 requireKnownRegistry(coordinatedArtwork);
 if(selection.id!==coordinatedArtwork.id||selection.digest!==coordinatedArtworkDigest||!selection.ownerApproval||coordinatedArtwork.entries.some(e=>e.status!=='ready-for-release-review'||!e.path)||coordinatedArtwork.ownerReleaseApproval!==selection.ownerApproval)throw new Error('Complete exact-manifest owner artwork approval required.');
 return coordinatedArtwork;
}
export async function verifyActiveCoordinatedArtwork(){
 if(!activeCoordinatedArtwork)return;
 await verifyCoordinatedArtwork(requireCoordinatedAdoption(activeCoordinatedArtwork));
}
type RenderEntry={id:string;name:string;level?:number;category?:string;presentationId?:string};
function resolveEntry(entry:RenderEntry,registry:CoordinatedRegistry){
 const art=registry.entries.find(e=>e.id===entry.id);
 if(!art?.path||art.name!==entry.name||art.level!==entry.level)return null;
 if(art.category!=='property'&&(entry.presentationId!==equipmentPresentation.id||entry.category!==art.category))return null;
 if(art.category==='property'&&entry.category!==undefined)return null;
 return art;
}
// Only local review scripts/tests inject this resolver into template locals.
// It is not selectable by HTTP, an env flag, a DB field or an operator plan.
export function previewCoordinatedArt(entry:RenderEntry){const art=resolveEntry(entry,coordinatedArtwork);return art?{...art,use:'owner-supplied-preview'}:null;}
export function coordinatedArt(entry:RenderEntry){
 if(!activeCoordinatedArtwork)return null;
 const art=resolveEntry(entry,requireCoordinatedAdoption(activeCoordinatedArtwork));
 return art?{...art,use:'final'}:null;
}
