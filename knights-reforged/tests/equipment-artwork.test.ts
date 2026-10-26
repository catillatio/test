import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import ejs from 'ejs';
import {equipmentArtwork,equipmentArtworkDigest,validateEquipmentArtwork,verifyEquipmentArtwork,approvedEquipmentArt} from '../src/equipment-artwork.js';
import {expandedContent,definitionDigest,preparedExpansionArt} from '../src/expansion-content.js';
import {coordinatedArtwork,coordinatedArtworkDigest,coordinatedArt} from '../src/coordinated-artwork.js';
import {equipmentPresentation,presentedItem,presentationArt} from '../src/equipment-presentation.js';
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

test('Hudson artwork reuses exactly the three selected originals and prepared WebPs, without changing any existing artwork identity',async()=>{
 validateEquipmentArtwork();assert.equal(definitionDigest(equipmentArtwork),equipmentArtworkDigest);
 const result=await verifyEquipmentArtwork();assert.equal(result.entries,3);assert.equal(result.bytes,1138080);
 const selection=JSON.parse(await readFile('docs/level100-launch/art/hudson-selection.json','utf8'));
 for(const entry of equipmentArtwork.entries){
  const chosen=selection.items.find((e:{id:string})=>e.id===entry.id);assert.ok(chosen);
  assert.equal(entry.sha256,chosen.sha256);assert.equal(entry.ownerOriginal,chosen.ownerOriginal);
  assert.equal(hash(await readFile(entry.ownerOriginal)),entry.ownerOriginalSha256);
  assert.equal(hash(await readFile(entry.source)),entry.sha256);
  assert.equal(hash(await readFile('public/'+entry.path.replace('/assets/',''))),entry.sha256);
  assert.equal(entry.sourceCommit,'3721dc4595e237f6f5bf8632e70b60a0e6c157a7');
 }
 assert.equal(definitionDigest(coordinatedArtwork),coordinatedArtworkDigest,'the deployed 52-item registry remains immutable');
 for(const id of ['eclipse-citadel-plate','sovereigns-zweihander','eclipse-gatehammer','eclipse-aegis']){
  const item=presentedItem(expandedContent.items.find(i=>i.id===id)!,equipmentPresentation.id);
  assert.equal(approvedEquipmentArt(item),null,'missing replacement assets must retain the current exact illustration');
  assert.equal(coordinatedArt(item)!.sha256,coordinatedArtwork.entries.find(e=>e.id===id)!.sha256);
 }
});

test('Shared equipment renderer uses exact Hudson identities, escapes content and cannot select art through forged names, levels, categories or paths',async()=>{
 const template=await readFile('views/partials/catalog-art.ejs','utf8');
 for(const raw of expandedContent.items){
  const entry=presentedItem(raw,equipmentPresentation.id),selected=approvedEquipmentArt(entry);
  if(!raw.id.startsWith('king-hudsons-')){assert.equal(selected,null);continue;}
  assert.ok(selected);const html=ejs.render(template,{entry,small:false,approvedEquipmentArt,presentationArt,coordinatedArt,preparedExpansionArt});
  assert.ok(html.includes(selected.path));assert.match(html,/data-art-use="final"/);
  for(const wrong of [{...entry,name:'<img src=x onerror=alert(1)>'},{...entry,level:70},{...entry,category:'property'},{...entry,id:'unknown'}])assert.equal(approvedEquipmentArt(wrong),null);
  const escaped=ejs.render(template,{entry:{...entry,name:'<script>unsafe</script>'},small:false,approvedEquipmentArt,presentationArt,preparedExpansionArt});assert.ok(!escaped.includes('<script>'));assert.match(escaped,/&lt;script&gt;/);
 }
 for(const mutate of[(r:typeof equipmentArtwork)=>r.entries.pop(),(r:typeof equipmentArtwork)=>r.entries[0]!.path='/assets/../../private',(r:typeof equipmentArtwork)=>r.entries[0]!.sha256='a'.repeat(64),(r:typeof equipmentArtwork)=>r.entries[0]!.level=70,(r:typeof equipmentArtwork)=>r.ownerSelection='forged']){const bad=structuredClone(equipmentArtwork);mutate(bad);assert.throws(()=>validateEquipmentArtwork(bad));}
});

test('Missing, tampered and symlink-escaped Hudson payloads fail closed before installation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'equipment-art-'));
 try{
  const directory=join(root,'art/equipment-artwork-1');await mkdir(directory,{recursive:true});
  for(const e of equipmentArtwork.entries)await writeFile(join(directory,e.id+'.webp'),await readFile(e.source));
  await verifyEquipmentArtwork(equipmentArtwork,root);
  const first=equipmentArtwork.entries[0]!,path=join(directory,first.id+'.webp');
  await writeFile(path,'tamper');await assert.rejects(verifyEquipmentArtwork(equipmentArtwork,root),/integrity/);
  await rm(path);await assert.rejects(verifyEquipmentArtwork(equipmentArtwork,root));
  await symlink(resolve(first.source),path);await assert.rejects(verifyEquipmentArtwork(equipmentArtwork,root),/escaped/);
 }finally{await rm(root,{recursive:true,force:true});}
});
