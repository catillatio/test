import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import ejs from 'ejs';
import {coordinatedArtwork,previousCoordinatedArtwork,coordinatedArtworkDigest,previousCoordinatedArtworkDigest,approvedCoordinatedSelection,activeCoordinatedArtwork,validateCoordinatedArtwork,verifyCoordinatedArtwork,requireCoordinatedAdoption,rendererForCoordinatedSelection,verifyActiveCoordinatedArtwork,coordinatedArt as runtimeCoordinatedArt,rendererForInstalledSelection} from '../src/coordinated-artwork.js';
import {equipmentPresentation,presentationArt,presentedItem} from '../src/equipment-presentation.js';
import {expandedContent,definitionDigest,preparedExpansionArt,expansionArtUse} from '../src/expansion-content.js';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const coordinatedArt=rendererForInstalledSelection(null);
const ids=['royal-warblade','march-wardens-poleaxe','sovereigns-zweihander','throneguard-polehammer','eclipse-gatehammer'];

test('final independent weapons complete all 52 approved mappings and preserve all 47 prior entries',async()=>{
 validateCoordinatedArtwork();const result=await verifyCoordinatedArtwork();assert.equal(result.integrated,52);assert.deepEqual(result.blocked,[]);assert.equal(result.bytes,4021992);assert.equal(result.approvedForAdoption,true);assert.equal(definitionDigest(coordinatedArtwork),coordinatedArtworkDigest);
 assert.equal(definitionDigest(previousCoordinatedArtwork),previousCoordinatedArtworkDigest);
 const manifest=JSON.parse(await readFile('docs/coordinated-art-2/owner-upload/manifest.json','utf8'));
 for(const entry of coordinatedArtwork.entries){
  if(!ids.includes(entry.id)){assert.deepEqual(entry,previousCoordinatedArtwork.entries.find(e=>e.id===entry.id));continue;}
  const source=manifest.targets.find((t:{display_name:string})=>t.display_name===entry.name);assert.ok(source);assert.equal(source.source_is_individual_full_resolution,true);assert.equal(entry.sourceKind,'standalone-owner-webp');assert.equal(entry.sourceSha256,source.webp_sha256);assert.equal(hash(await readFile(entry.source)),source.webp_sha256);assert.deepEqual(source.image_size,[1254,1254]);assert.deepEqual([entry.width,entry.height],[512,512]);assert.equal(hash(await readFile('public/'+entry.path!.replace('/assets/',''))),entry.sha256);
 }
 for(const [category,n]of Object.entries({weapon:15,armor:15,spell:16,property:6}))assert.equal(coordinatedArtwork.entries.filter(e=>e.category===category&&e.path).length,n);
});

test('exact approved adoption resolver changes all 52 slots atomically and keeps current installation and old identities unchanged',async()=>{
 const render=rendererForCoordinatedSelection(approvedCoordinatedSelection),file='views/partials/catalog-art.ejs',template=await readFile(file,'utf8'),locals={small:false,presentationArt,preparedExpansionArt,expansionArtUse};let count=0;
 assert.equal(requireCoordinatedAdoption(approvedCoordinatedSelection),coordinatedArtwork);if(activeCoordinatedArtwork)assert.deepEqual(activeCoordinatedArtwork,approvedCoordinatedSelection);await verifyActiveCoordinatedArtwork();
 for(const raw of [...expandedContent.items,...expandedContent.properties]){
  const entry='category'in raw?presentedItem(raw,equipmentPresentation.id):raw;
  const before=ejs.render(template,{...locals,entry},{filename:file}),inactive=ejs.render(template,{...locals,entry,coordinatedArt},{filename:file});assert.equal(inactive,before);
  const after=ejs.render(template,{...locals,entry,coordinatedArt:render},{filename:file}),asset=render(entry);
  if(asset){count++;assert.ok(after.includes(asset.path!));assert.match(after,/data-art-use="final"/);}else assert.equal(after,before);
  if('category'in raw){assert.equal(render(raw),null);assert.equal(render({...entry,category:'invalid'}),null);assert.equal(render({...entry,name:'<img src=x onerror=alert(1)>'}),null);}
 }
 assert.equal(count,52);
 for(const mutate of[(s:typeof approvedCoordinatedSelection)=>({...s,id:previousCoordinatedArtwork.id}),(s:typeof approvedCoordinatedSelection)=>({...s,digest:'f'.repeat(64)}),(s:typeof approvedCoordinatedSelection)=>({...s,ownerApproval:'forged'})])assert.throws(()=>rendererForCoordinatedSelection(mutate(approvedCoordinatedSelection)),/approval/);
});

test('partial categories, substituted concepts, altered prior assets and unsigned or unknown manifests fail closed',async()=>{
 for(const mutate of[
  (r:typeof coordinatedArtwork)=>r.entries.pop(),
  (r:typeof coordinatedArtwork)=>r.entries.find(e=>e.id===ids[0])!.source=previousCoordinatedArtwork.entries.find(e=>e.id===ids[0])!.source,
  (r:typeof coordinatedArtwork)=>r.entries.find(e=>e.id===ids[0])!.sourceKind='concept-sheet-crop',
  (r:typeof coordinatedArtwork)=>r.entries[0]!.sha256='f'.repeat(64),
  (r:typeof coordinatedArtwork)=>r.entries.find(e=>e.id===ids[0])!.category='armor',
  (r:typeof coordinatedArtwork)=>r.ownerReleaseApproval=null,
  (r:typeof coordinatedArtwork)=>r.predecessorDigest='f'.repeat(64),
  (r:typeof coordinatedArtwork)=>r.entries.find(e=>e.id===ids[0])!.path='/assets/../../private',
 ]){const bad=structuredClone(coordinatedArtwork);mutate(bad);assert.throws(()=>validateCoordinatedArtwork(bad));}
 const swapped=structuredClone(coordinatedArtwork);const e=swapped.entries.find(e=>e.id===ids[0])!;e.sourceSha256='f'.repeat(64);await assert.rejects(verifyCoordinatedArtwork(swapped),/immutable/);
});

test('all 52 decoded-file identities are mandatory; missing, tampered or escaped final weapon payloads cannot install',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coordinated-final-'));
 try{
  for(const e of coordinatedArtwork.entries){const out=join(root,e.path!.replace('/assets/',''));await mkdir(dirname(out),{recursive:true});await writeFile(out,await readFile('public/'+e.path!.replace('/assets/','')));}
  assert.equal((await verifyCoordinatedArtwork(coordinatedArtwork,root)).integrated,52);
  const e=coordinatedArtwork.entries.find(e=>e.id===ids[0])!,out=join(root,e.path!.replace('/assets/',''));
  await writeFile(out,'tamper');await assert.rejects(verifyCoordinatedArtwork(coordinatedArtwork,root),/integrity/);
  await rm(out);await assert.rejects(verifyCoordinatedArtwork(coordinatedArtwork,root));
  await symlink(resolve('public/'+e.path!.replace('/assets/','')),out);await assert.rejects(verifyCoordinatedArtwork(coordinatedArtwork,root),/escaped/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('separate protected adoption patch changes exactly the reviewed whole-set code pin and no data or workflow',async()=>{
 const patch=await readFile('docs/coordinated-art-2/adoption-selection.patch','utf8');
 assert.deepEqual(patch.split('\n').filter(l=>l.startsWith('-')&&!l.startsWith('---')),['-export const activeCoordinatedArtwork:Readonly<CoordinatedSelection>|null=null;']);
 assert.deepEqual(patch.split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++')),['+export const activeCoordinatedArtwork:Readonly<CoordinatedSelection>|null=approvedCoordinatedSelection;']);
 execFileSync('git',['apply',...(activeCoordinatedArtwork?['--reverse']:[]),'--check','knights-reforged/docs/coordinated-art-2/adoption-selection.patch'],{cwd:resolve('..'),stdio:'pipe'});
});

// The same exact-head suite is required for both installation and adoption.
test('actual runtime follows only its compiled whole-set pin in either protected release stage',()=>{
 let count=0;
 for(const raw of [...expandedContent.items,...expandedContent.properties]){
  const entry='category'in raw?presentedItem(raw,equipmentPresentation.id):raw;
  const expected=rendererForInstalledSelection(activeCoordinatedArtwork)(entry);
  assert.deepEqual(runtimeCoordinatedArt(entry),expected);if(expected)count++;
 }
 assert.equal(count,activeCoordinatedArtwork?52:0);
});
