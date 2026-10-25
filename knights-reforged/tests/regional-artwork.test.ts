import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import ejs from 'ejs';
import {regionalArtwork,validateRegionalArtwork,verifyRegionalArtwork,regionalArt,previewRegionalArt,activeRegionalArtworkId} from '../src/regional-artwork.js';import {equipmentPresentation,presentedItem,presentationArt} from '../src/equipment-presentation.js';import {expandedContent,preparedExpansionArt,expansionArtUse,definitionDigest} from '../src/expansion-content.js';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
test('prepared regional registry replaces exactly 16 placeholder weapons and six properties, preserves source provenance and cannot activate',async()=>{
 validateRegionalArtwork();assert.equal(activeRegionalArtworkId,null);const verified=await verifyRegionalArtwork();assert.equal(verified.entries,22);assert.equal(verified.approvedForActivation,false);assert.equal(verified.bytes,2294428);
 for(const entry of regionalArtwork.entries){assert.equal(hash(await readFile(entry.source)),entry.sourceSha256);assert.equal(hash(await readFile('public/'+entry.path.replace('/assets/',''))),entry.sha256);assert.equal(entry.ownerApproval,null);assert.equal(regionalArt(entry),null);assert.equal(entry.reviewStatus,'pending-owner-review');}
 assert.equal(regionalArtwork.entries.filter(e=>e.category==='weapon').length,16);assert.equal(regionalArtwork.entries.filter(e=>e.category==='property').length,6);assert.equal(regionalArtwork.entries.filter(e=>e.id==='king-hudsons-sword')[0]!.sourceSha256,'eff1393d4ae5787c237965a6cca5f7c402ab064b3aafd7bbac6e0c6f4576a3d3');
 for(const change of [(m:typeof regionalArtwork)=>m.entries.pop(),(m:typeof regionalArtwork)=>m.entries[0]!.id='oathbound-greatsword',(m:typeof regionalArtwork)=>m.entries[0]!.category='armor' as any,(m:typeof regionalArtwork)=>m.entries[0]!.oldPath='/not-placeholder',(m:typeof regionalArtwork)=>m.entries[0]!.path='/assets/../../private.pem',(m:typeof regionalArtwork)=>m.reviewStatus='approved',(m:typeof regionalArtwork)=>m.entries[0]!.source='../private',(m:typeof regionalArtwork)=>m.presentationDigest='f'.repeat(64)]){const bad=structuredClone(regionalArtwork);change(bad);assert.throws(()=>validateRegionalArtwork(bad));}
});
test('candidate preview changes only selected placeholder art and leaves all live/historical render paths byte-identical while off',async()=>{
 const file='views/partials/catalog-art.ejs',source=await readFile(file,'utf8');const locals={small:false,presentationArt,preparedExpansionArt,expansionArtUse};let count=0;
 for(const raw of [...expandedContent.items,...expandedContent.properties]){
  const entry='category' in raw?presentedItem(raw,equipmentPresentation.id):raw;
  const before=ejs.render(source,{...locals,entry},{filename:file}),off=ejs.render(source,{...locals,entry,regionalArt},{filename:file});assert.equal(off,before,entry.id);
  const preview=ejs.render(source,{...locals,entry,regionalArt:previewRegionalArt},{filename:file}),replacement=previewRegionalArt(entry);
  if(replacement){count++;assert.ok(preview.includes(replacement.path));assert.ok(preview.includes('data-art-use="prepared-preview"'));}else assert.equal(preview,before,entry.id);
  if('category'in raw){assert.equal(previewRegionalArt(raw),null,'historical original identity is preserved');const {name,presentationId,...same}=entry as import('../src/alpha-rules.js').ItemDefinition;const {name:old,...original}=raw;assert.deepEqual(same,original);}
 }
 assert.equal(count,22);assert.equal(regionalArtwork.entries.some(e=>['crown-harbour','tempest-port','imperial-greatblade','imperial-eclipse-greatsword'].includes(e.id)),false,'approved classic/borrowed legendary art is excluded');
});
test('registry identity, runtime byte hashes, real paths and file sizes fail closed without changing immutable versions',async()=>{
 const fake=structuredClone(regionalArtwork);fake.entries[0]!.region='forged';await assert.rejects(verifyRegionalArtwork(fake),/immutable/);
 const folder=await mkdtemp(join(tmpdir(),'regional-art-test-'));try{
 const dir=join(folder,'art/regional-weapon-land-1');await mkdir(dir,{recursive:true});for(const e of regionalArtwork.entries)await writeFile(join(dir,e.id+'.webp'),await readFile('public/'+e.path.replace('/assets/','')));
 assert.equal((await verifyRegionalArtwork(regionalArtwork,folder)).approvedForActivation,false);const e=regionalArtwork.entries[0]!;await writeFile(join(dir,e.id+'.webp'),Buffer.from('tampered'));await assert.rejects(verifyRegionalArtwork(regionalArtwork,folder),/integrity/);
 await rm(join(dir,e.id+'.webp'));await symlink(join(process.cwd(),'public/art/regional-weapon-land-1/'+e.id+'.webp'),join(dir,e.id+'.webp'));await assert.rejects(verifyRegionalArtwork(regionalArtwork,folder),/escaped/);
 }finally{await rm(folder,{recursive:true,force:true});}
 assert.equal(regionalArtwork.presentationDigest,definitionDigest(equipmentPresentation));
});
