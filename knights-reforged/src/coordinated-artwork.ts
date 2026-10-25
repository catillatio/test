// Presentation-only overrides. Adoption is a separately protected exact code
// release, never a SQL write, environment switch, request or expansion reset.
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
 predecessorId?:string;predecessorDigest?:string;finalFivePackage?:string;finalFivePackageSha256?:string;replacedConceptIds?:string[];
}
const readRegistry=(id:string)=>deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/'+id+'/rules.json',import.meta.url),'utf8')) as CoordinatedRegistry);
export const previousCoordinatedArtwork=readRegistry('coordinated-art-1');
export const previousCoordinatedArtworkDigest='56438d3d4b17db405d71013d4c8b48becb9bf3d01b4de26b16367f90909d12d4';
export const coordinatedArtwork=readRegistry('coordinated-art-2');
export const coordinatedArtworkDigest='de7b86048f4af97e53924d342c26489cc44afe9236db34c1a766a9d53e92f4ff';
const ownerApproval='owner-coordinated-artwork-release-final-five-2026-10-25';
export interface CoordinatedSelection {id:string;digest:string;ownerApproval:string;}
export const approvedCoordinatedSelection:Readonly<CoordinatedSelection>=Object.freeze({id:coordinatedArtwork.id,digest:coordinatedArtworkDigest,ownerApproval});
// Installation is separate from adoption. The one-line pin below changes only
// in a second reviewed, exact-head-tested protected release after installation.
export const activeCoordinatedArtwork:Readonly<CoordinatedSelection>|null=approvedCoordinatedSelection;
const finalFiveIds=['royal-warblade','march-wardens-poleaxe','sovereigns-zweihander','throneguard-polehammer','eclipse-gatehammer'];
const hashPattern=/^[a-f0-9]{64}$/;
const equipmentTargets=equipmentPresentation.entries.filter(e=>e.art.use==='temporary-beta'&&!e.id.startsWith('king-hudsons-'));
const landTargets=previousRegionalArtwork.entries.filter(e=>e.category==='property');
const targets=[...equipmentTargets,...landTargets];

export function validateCoordinatedArtwork(registry:CoordinatedRegistry=coordinatedArtwork){
 const complete=registry.id==='coordinated-art-2';
 if(!['coordinated-art-1','coordinated-art-2'].includes(registry.id)||registry.activationDefault!==false||registry.status!==(complete?'owner-approved-for-coordinated-release':'blocked-incomplete-supply')||registry.ownerReleaseApproval!==(complete?ownerApproval:null)||registry.presentationId!==equipmentPresentation.id||registry.presentationDigest!==definitionDigest(equipmentPresentation)||registry.landPredecessorId!==previousRegionalArtwork.id||registry.landPredecessorDigest!==definitionDigest(previousRegionalArtwork)||!hashPattern.test(registry.sourcePackageSha256)||definitionDigest(registry.scope)!==definitionDigest({weapon:15,armor:15,spell:16,property:6})||registry.entries.length!==52||new Set(registry.entries.map(e=>e.id)).size!==52)throw new Error('Invalid coordinated artwork identity.');
 if(complete&&(registry.predecessorId!==previousCoordinatedArtwork.id||registry.predecessorDigest!==previousCoordinatedArtworkDigest||definitionDigest(registry.replacedConceptIds)!==definitionDigest(finalFiveIds)||!hashPattern.test(registry.finalFivePackageSha256??'')))throw new Error('Invalid final-five predecessor identity.');
 for(const entry of registry.entries){
  const target=targets.find(t=>t.id===entry.id);
  if(!target||(['name','category','level','region'] as const).some(key=>entry[key]!==target[key])||entry.fullBleed!==true||!hashPattern.test(entry.sourceSha256)||!entry.sourceOriginal)throw new Error('Invalid coordinated artwork target.');
  const finalFive=complete&&finalFiveIds.includes(entry.id);
  if(complete&&!finalFive&&definitionDigest(entry)!==definitionDigest(previousCoordinatedArtwork.entries.find(e=>e.id===entry.id)))throw new Error('Preserved 47 artwork entries changed.');
  if(entry.category==='property'){
   const original=landTargets.find(t=>t.id===entry.id)!;
   for(const key of ['path','sha256','bytes','width','height','source','sourceSha256'] as const)if(entry[key]!==original[key])throw new Error('Preserved Land artwork changed.');
   if(entry.status!=='ready-for-release-review'||entry.sourceKind!=='exact-pr37-land')throw new Error('Invalid Land provenance.');
  }else{
   const sourcePrefix=finalFive?'docs/coordinated-art-2/owner-upload/assets/':entry.status==='blocked-concept-only'?'docs/coordinated-art-1/concepts/weapon_concepts/':'docs/coordinated-art-1/owner-upload/';
   if(!entry.source.startsWith(sourcePrefix)||entry.source.includes('..')||!/^docs\/[a-zA-Z0-9_./-]+\.webp$/.test(entry.source))throw new Error('Invalid supplied artwork source.');
   if(entry.status==='blocked-concept-only'){
    if(complete||entry.category!=='weapon'||entry.sourceKind!=='concept-sheet-crop'||!entry.blocker||['path','sha256','bytes','width','height','crop'].some(k=>Object.hasOwn(entry,k)))throw new Error('Concept art cannot become runtime artwork.');
    continue;
   }
   if(entry.status!=='ready-for-release-review'||!['standalone-owner-webp','generated-sheet-tile'].includes(entry.sourceKind)||entry.path!=='/assets/art/coordinated-art-'+(finalFive?'2':'1')+'/'+entry.id+'.webp'||finalFive&&(entry.category!=='weapon'||entry.sourceKind!=='standalone-owner-webp'))throw new Error('Invalid versioned artwork path.');
  }
  if(!entry.path||!hashPattern.test(entry.sha256??'')||!Number.isSafeInteger(entry.bytes)||entry.bytes! < 1||entry.bytes! > 400000||!Number.isSafeInteger(entry.width)||!Number.isSafeInteger(entry.height)||entry.width! < 128||entry.height! < 128||entry.width! > 768||entry.height! > 512)throw new Error('Invalid coordinated artwork payload.');
 }
 const ready=registry.entries.filter(e=>e.path);
 if(new Set(ready.map(e=>e.path)).size!==ready.length||new Set(ready.map(e=>e.sha256)).size!==ready.length)throw new Error('Duplicate coordinated artwork mapping.');
}
validateCoordinatedArtwork(previousCoordinatedArtwork);validateCoordinatedArtwork();
function requireKnownRegistry(registry:CoordinatedRegistry){
 validateCoordinatedArtwork(registry);
 const expected=registry.id==='coordinated-art-2'?coordinatedArtworkDigest:previousCoordinatedArtworkDigest;
 if(definitionDigest(registry)!==expected)throw new Error('Unknown immutable coordinated artwork manifest.');
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
 return {registryId:registry.id,digest:definitionDigest(registry),expected:52,integrated:registry.entries.filter(e=>e.path).length,blocked:registry.entries.filter(e=>!e.path).map(e=>e.id),bytes:registry.entries.reduce((sum,e)=>sum+(e.bytes??0),0),approvedForAdoption:registry.id===coordinatedArtwork.id};
}
export function requireCoordinatedAdoption(selection:CoordinatedSelection){
 requireKnownRegistry(coordinatedArtwork);
 if(selection.id!==coordinatedArtwork.id||selection.digest!==coordinatedArtworkDigest||selection.ownerApproval!==ownerApproval||coordinatedArtwork.entries.some(e=>e.status!=='ready-for-release-review'||!e.path))throw new Error('Complete exact-manifest owner artwork approval required.');
 return coordinatedArtwork;
}
export async function verifyActiveCoordinatedArtwork(){
 // Even the inactive installation must contain all 52 verified payloads before
 // the service is healthy. No missing category can be silently installed.
 await verifyCoordinatedArtwork();
 if(activeCoordinatedArtwork)requireCoordinatedAdoption(activeCoordinatedArtwork);
}
type RenderEntry={id:string;name:string;level?:number;category?:string;presentationId?:string};
function resolveEntry(entry:RenderEntry,registry:CoordinatedRegistry){
 const art=registry.entries.find(e=>e.id===entry.id);
 if(!art?.path||art.name!==entry.name||art.level!==entry.level)return null;
 if(art.category!=='property'&&(entry.presentationId!==equipmentPresentation.id||entry.category!==art.category))return null;
 if(art.category==='property'&&entry.category!==undefined)return null;
 return art;
}
// Tests/preview scripts alone supply the optional historical registry.
export function previewCoordinatedArt(entry:RenderEntry,registry=coordinatedArtwork){const art=resolveEntry(entry,registry);return art?{...art,use:'owner-supplied-preview'}:null;}
// The same resolver used by the later compiled adoption pin; selection is never
// accepted from an HTTP request, environment variable or stored player value.
export function rendererForCoordinatedSelection(selection:CoordinatedSelection){
 const registry=requireCoordinatedAdoption(selection);
 return (entry:RenderEntry)=>{const art=resolveEntry(entry,registry);return art?{...art,use:'final'}:null;};
}
export function rendererForInstalledSelection(selection:CoordinatedSelection|null){
 return selection?rendererForCoordinatedSelection(selection):(_entry:RenderEntry)=>null;
}
const activeRenderer=rendererForInstalledSelection(activeCoordinatedArtwork);
export function coordinatedArt(entry:RenderEntry){return activeRenderer(entry);}

// Public, non-secret installation/adoption evidence only. This is not a control.
export function coordinatedArtworkStatus(){
 return {installedId:coordinatedArtwork.id,installedDigest:coordinatedArtworkDigest,targets:52,adoptedId:activeCoordinatedArtwork?.id??null,adoptedDigest:activeCoordinatedArtwork?.digest??null};
}
