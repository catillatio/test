import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import ejs from 'ejs';
import {previousCoordinatedArtwork as coordinatedArtwork,previousCoordinatedArtworkDigest as coordinatedArtworkDigest,validateCoordinatedArtwork,verifyCoordinatedArtwork,requireCoordinatedAdoption,activeCoordinatedArtwork,approvedCoordinatedSelection,rendererForInstalledSelection,previewCoordinatedArt as previewAnyCoordinatedArt} from '../src/coordinated-artwork.js';
import {equipmentPresentation,presentationArt,presentedItem} from '../src/equipment-presentation.js';
import {expandedContent,definitionDigest,preparedExpansionArt,expansionArtUse} from '../src/expansion-content.js';
import {previousRegionalArtwork} from '../src/regional-artwork.js';
const coordinatedArt=rendererForInstalledSelection(null);
const previewCoordinatedArt=(entry:Parameters<typeof previewAnyCoordinatedArt>[0])=>previewAnyCoordinatedArt(entry,coordinatedArtwork);
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');

test('coordinated upload pins all 52 exact slots; 47 production-format images and five explicit concept blockers',async()=>{
 validateCoordinatedArtwork(coordinatedArtwork);assert.equal(definitionDigest(coordinatedArtwork),coordinatedArtworkDigest);
 const verified=await verifyCoordinatedArtwork(coordinatedArtwork);assert.equal(verified.integrated,47);assert.equal(verified.expected,52);assert.equal(verified.bytes,3773728);assert.equal(verified.approvedForAdoption,false);
 assert.deepEqual(verified.blocked,['royal-warblade','march-wardens-poleaxe','sovereigns-zweihander','throneguard-polehammer','eclipse-gatehammer']);
 const sourceChecks=JSON.parse(await readFile('docs/coordinated-art-1/owner-upload/asset_checksums.json','utf8'));
 for(const file of sourceChecks.files){const prefix=file.path.startsWith('weapon_concepts/')?'concepts':'owner-upload';const source=await readFile('docs/coordinated-art-1/'+prefix+'/'+file.path);assert.equal(hash(source),file.sha256);assert.equal(source.length,file.bytes);}
 for(const e of coordinatedArtwork.entries){assert.equal(hash(await readFile(e.source)),e.sourceSha256);if(e.path){assert.equal(hash(await readFile('public/'+e.path.replace('/assets/',''))),e.sha256);}else assert.equal(e.sourceKind,'concept-sheet-crop');}
 const ward=coordinatedArtwork.entries.find(e=>e.id==='rampart-ward')!;assert.equal(ward.sourceSha256,'34ac0468e9dcb02614ba968966c592483347f101b0b0a2ef556f4dda39cc3d70');assert.equal(ward.sourceKind,'standalone-owner-webp');
});

test('new preview changes only selected current presentation slots, with old raw catalog and disabled runtime byte-identical',async()=>{
 const file='views/partials/catalog-art.ejs',template=await readFile(file,'utf8'),locals={small:false,presentationArt,preparedExpansionArt,expansionArtUse};let changed=0;
 for(const raw of [...expandedContent.items,...expandedContent.properties]){
  const entry='category'in raw?presentedItem(raw,equipmentPresentation.id):raw;
  const before=ejs.render(template,{...locals,entry},{filename:file});
  assert.equal(ejs.render(template,{...locals,entry,coordinatedArt},{filename:file}),before,entry.id);
  const preview=ejs.render(template,{...locals,entry,coordinatedArt:previewCoordinatedArt},{filename:file}),replacement=previewCoordinatedArt(entry);
  if(replacement){changed++;assert.match(preview,/data-art-use="owner-supplied-preview"/);assert.ok(preview.includes(replacement.path!));}else assert.equal(preview,before);
  if('category'in raw){assert.equal(previewCoordinatedArt(raw),null,'unmarked historical identity remains unchanged');assert.equal(previewCoordinatedArt({...entry,name:'<script>bad</script>'}),null);assert.equal(previewCoordinatedArt({...entry,category:'wrong'}),null);}
 }
 assert.equal(changed,47);if(activeCoordinatedArtwork)assert.deepEqual(activeCoordinatedArtwork,approvedCoordinatedSelection);
 for(const id of ['crown-harbour','tempest-port','king-hudsons-sword','king-hudsons-shield','king-hudsons-meteor-shower','imperial-eclipse-greatsword'])assert.equal(coordinatedArtwork.entries.some(e=>e.id===id),false);
});

test('exact identity, category, approval, source, paths and incomplete category sets fail closed',async()=>{
 for(const mutate of [
  (r:typeof coordinatedArtwork)=>r.entries.pop(),
  (r:typeof coordinatedArtwork)=>r.entries[0]!.id='oathbound-greatsword',
  (r:typeof coordinatedArtwork)=>r.entries[0]!.category='armor',
  (r:typeof coordinatedArtwork)=>r.entries[0]!.path='/assets/../../secret',
  (r:typeof coordinatedArtwork)=>r.entries[0]!.source='../private',
  (r:typeof coordinatedArtwork)=>r.ownerReleaseApproval='forged',
  (r:typeof coordinatedArtwork)=>r.presentationDigest='f'.repeat(64),
  (r:typeof coordinatedArtwork)=>r.entries.find(e=>!e.path)!.path='/assets/art/coordinated-art-1/concept.webp',
  (r:typeof coordinatedArtwork)=>r.entries.find(e=>e.category==='property')!.sha256='f'.repeat(64),
 ]){const bad=structuredClone(coordinatedArtwork);mutate(bad);assert.throws(()=>validateCoordinatedArtwork(bad));}
 const swapped=structuredClone(coordinatedArtwork);[swapped.entries[0]!.sha256,swapped.entries[1]!.sha256]=[swapped.entries[1]!.sha256,swapped.entries[0]!.sha256];await assert.rejects(verifyCoordinatedArtwork(swapped),/immutable/);
 for(const selection of [{id:coordinatedArtwork.id,digest:coordinatedArtworkDigest,ownerApproval:'forged'}, {id:'regional-weapon-land-art-3',digest:coordinatedArtworkDigest,ownerApproval:'forged'}])assert.throws(()=>requireCoordinatedAdoption(selection),/approval/);
});

test('missing, changed or symlink-escaped runtime bytes cannot pass integrity verification',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coordinated-assets-'));
 try{
  for(const e of coordinatedArtwork.entries.filter(e=>e.path)){const target=join(root,e.path!.replace('/assets/',''));await mkdir(dirname(target),{recursive:true});await writeFile(target,await readFile('public/'+e.path!.replace('/assets/','')));}
  assert.equal((await verifyCoordinatedArtwork(coordinatedArtwork,root)).integrated,47);
  const e=coordinatedArtwork.entries.find(e=>e.path)!,target=join(root,e.path!.replace('/assets/',''));
  await writeFile(target,'tampered');await assert.rejects(verifyCoordinatedArtwork(coordinatedArtwork,root),/integrity/);
  await rm(target);await assert.rejects(verifyCoordinatedArtwork(coordinatedArtwork,root));
  await symlink(join(process.cwd(),'public/'+e.path!.replace('/assets/','')),target);await assert.rejects(verifyCoordinatedArtwork(coordinatedArtwork,root),/escaped/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('six canonical Land payloads and Hudson stay exact; supplied raw weapon files are not re-encoded',async()=>{
 assert.equal(definitionDigest(previousRegionalArtwork),'a831fd9784e007489ddcb7c15a7e71eaa26b949e4029cb46a4028090ab07341f');
 for(const entry of coordinatedArtwork.entries.filter(e=>e.category==='property')){
  const original=previousRegionalArtwork.entries.find(e=>e.id===entry.id)!;
  for(const key of ['path','sha256','bytes','width','height','source','sourceSha256'] as const)assert.equal(entry[key],original[key]);
 }
 const hudson=previousRegionalArtwork.entries.find(e=>e.id==='king-hudsons-sword')!;assert.equal(hash(await readFile('public/'+hudson.path.replace('/assets/',''))),hudson.sha256);assert.equal(hudson.ownerApproval,null);assert.equal(hudson.reviewStatus,'pending-owner-review');
 for(const entry of coordinatedArtwork.entries.filter(e=>e.category==='weapon'&&e.path))assert.equal(entry.sha256,entry.sourceSha256);
});
