// Visual definitions only. Registries never contain or modify economic data.
import {readFileSync} from 'node:fs';import {readFile,realpath,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {resolve,sep} from 'node:path';
import {deepFreeze} from './compatibility-rules.js';import {projectRoot} from './config.js';
export interface ArtworkEntry {id:string;name:string;kind:string;level:number;brief:string;use?:'temporary-beta'|'final';status:string;path:string|null;sha256:string|null;fullBleedRequired:boolean;license:string|null;provenanceEvidence:string|null;framingApproval:string|null;ownerApproval:string|null;}
export interface ArtworkAsset {role:string;path:string;sha256:string;bytes:number;width:number;height:number;use:'temporary-beta'|'final';}
export interface ArtworkRegistry {id:string;purpose?:'temporary-beta'|'mixed'|'final';finalArtwork?:boolean;policyId?:string;predecessorId?:string;predecessorDigest?:string;changedEntryIds?:string[];assets?:ArtworkAsset[];entries:ArtworkEntry[];}
const read=(id:string)=>{const definition=JSON.parse(readFileSync(new URL('../rulesets/'+id+'/rules.json',import.meta.url),'utf8'));if(definition.id!==id)throw new Error('Artwork filename and immutable identity differ.');return definition;};
function normalized(v:unknown):unknown{return Array.isArray(v)?v.map(normalized):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort().map(([k,x])=>[k,normalized(x)])):v;}
export const definitionDigest=(v:unknown)=>createHash('sha256').update(JSON.stringify(normalized(v))).digest('hex');
export const legacyExpansionArtwork=deepFreeze(read('level100-artwork-1') as ArtworkRegistry);
export const rejectedExpansionArtwork=deepFreeze(read('level100-artwork-2') as ArtworkRegistry);
export const betaArtworkPolicy=deepFreeze(read('temporary-beta-artwork-1') as {id:string;use:string;ownerAuthorization:string;maximumAssets:number;maximumTotalBytes:number;maximumAssetBytes:number;prestigeCeiling:string});
export const expansionArtwork=deepFreeze(read('level100-beta-artwork-1') as ArtworkRegistry);
// Future replacement: append a reviewed immutable registry here and select it
// above in the same protected code release. Never mutate a registered version,
// the activation record, catalogs, ownership or saved receipts to replace images.
export const artworkRegistries=Object.freeze([legacyExpansionArtwork,rejectedExpansionArtwork,expansionArtwork] as const);
const pathPattern=/^\/assets\/art\/level100-(?:beta-|artwork-)[1-9][0-9]*\/[a-z0-9-]+\.webp$/;
const hashPattern=/^[a-f0-9]{64}$/;
type Target=Pick<ArtworkEntry,'id'|'name'|'kind'|'level'>;
export function validateArtworkRegistry(next:ArtworkRegistry,targets:Target[]){
 if(!/^[a-z0-9-]+$/.test(next.id)||!['temporary-beta','mixed','final'].includes(next.purpose??'')||next.entries.length!==45||targets.length!==45||new Set(next.entries.map(e=>e.id)).size!==45||!next.assets?.length||new Set(next.assets.map(a=>a.path)).size!==next.assets.length)throw new Error('Invalid artwork registry.');
 const temporary=next.entries.some(e=>e.use==='temporary-beta');
 if(next.finalArtwork!==!temporary||next.purpose!==(temporary?(next.entries.every(e=>e.use==='temporary-beta')?'temporary-beta':'mixed'):'final')||temporary&&next.policyId!==betaArtworkPolicy.id)throw new Error('Temporary art must be explicitly distinguished from final artwork.');
 for(const e of next.entries){const expected=targets.find(t=>t.id===e.id),a=next.assets.find(a=>a.path===e.path);
  if(!expected||expected.name!==e.name||expected.kind!==e.kind||expected.level!==e.level||!e.brief||!e.fullBleedRequired||!e.path||!pathPattern.test(e.path)||!e.sha256||!hashPattern.test(e.sha256)||!e.license||!e.provenanceEvidence||!e.ownerApproval||!e.framingApproval||!['temporary-beta','final'].includes(e.use??'')||e.status!==(e.use==='temporary-beta'?'temporary-beta-approved':'approved')||!a||a.sha256!==e.sha256||a.use!==e.use)throw new Error('Unreviewed or mismatched artwork entry.');
  if(!({weapon:['weapon'],armor:['armor','shield'],spell:['spell'],property:['land']}[e.kind]??[]).includes(a.role))throw new Error('Artwork role mismatch.');
 }
 const beta=next.assets.filter(a=>a.use==='temporary-beta');
 if(beta.length>betaArtworkPolicy.maximumAssets||beta.reduce((n,a)=>n+a.bytes,0)>betaArtworkPolicy.maximumTotalBytes)throw new Error('Beta artwork budget exceeded.');
 for(const a of next.assets)if(!pathPattern.test(a.path)||!hashPattern.test(a.sha256)||!Number.isSafeInteger(a.bytes)||a.bytes<=0||a.bytes>(a.use==='temporary-beta'?betaArtworkPolicy.maximumAssetBytes:1048576)||!Number.isSafeInteger(a.width)||!Number.isSafeInteger(a.height)||a.width<128||a.height<128||!next.entries.some(e=>e.path===a.path))throw new Error('Invalid artwork payload definition.');
}
export function validateArtworkReplacement(next:ArtworkRegistry,previous:ArtworkRegistry,targets:Target[]){
 validateArtworkRegistry(next,targets);
 if(next.id===previous.id||next.predecessorId!==previous.id||next.predecessorDigest!==definitionDigest(previous))throw new Error('Artwork replacement must bind the exact immutable predecessor.');
 for(const asset of next.assets!){const old=previous.assets?.find(a=>a.path===asset.path);if(old&&definitionDigest(old)!==definitionDigest(asset))throw new Error('Existing asset paths are immutable; use a new versioned path.');}
 const changes=next.entries.filter(e=>definitionDigest(e)!==definitionDigest(previous.entries.find(p=>p.id===e.id))).map(e=>e.id).sort();
 if(!changes.length||definitionDigest(changes)!==definitionDigest(next.changedEntryIds))throw new Error('Artwork replacement must declare exactly the changed IDs.');
}
export const knownArtworkDigest=(digest:string)=>artworkRegistries.some(m=>definitionDigest(m)===digest);
export const expansionArtUse=(id:string)=>expansionArtwork.entries.find(e=>e.id===id)?.use??null;
export function approvedExpansionArt(id:string){const e=expansionArtwork.entries.find(e=>e.id===id);return e?.use==='final'&&e.status==='approved'?e.path:null;}
export function preparedExpansionArt(id:string){return expansionArtwork.entries.find(e=>e.id===id)?.path??null;}
export async function verifyExpansionArtwork(manifest:ArtworkRegistry=expansionArtwork,publicRoot=resolve(projectRoot,'public')){
 const failures=new Set<string>();const digest=definitionDigest(manifest);
 try{
  if(!artworkRegistries.some(m=>m.id===manifest.id&&definitionDigest(m)===digest))throw new Error('Unknown immutable registry.');
  validateArtworkRegistry(manifest,expansionArtwork.entries);
  const root=await realpath(publicRoot);
  for(const a of manifest.assets!){try{const path=await realpath(resolve(root,a.path.replace(/^\/assets\//,'')));if(!path.startsWith(root+sep)||!(await stat(path)).isFile())throw new Error('Invalid artwork path.');const bytes=await readFile(path);if(bytes.length!==a.bytes||createHash('sha256').update(bytes).digest('hex')!==a.sha256||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw new Error('Artwork payload mismatch.');}catch{for(const e of manifest.entries)if(e.path===a.path)failures.add(e.id);}}
 }catch{for(const e of manifest.entries)failures.add(e.id);}
 return {ready:failures.size===0,missing:[...failures],digest,registryId:manifest.id,use:manifest.purpose??'unapproved',temporaryEntries:manifest.entries.filter(e=>e.use==='temporary-beta').length};
}
