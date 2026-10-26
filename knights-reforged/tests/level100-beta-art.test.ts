import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {expansionArtwork,betaArtworkPolicy,preparedExpansionArt,approvedExpansionArt,definitionDigest,expandedContent} from '../src/expansion-content.js';
import {validateArtworkRegistry,validateArtworkReplacement,verifyExpansionArtwork} from '../src/expansion-artwork.js';
test('45 exact IDs use five tiny owner-authorized temporary images, never final approvals or economic substitutions',async()=>{
 const ready=await verifyExpansionArtwork();assert.equal(ready.ready,true);assert.equal(ready.use,'temporary-beta');assert.equal(ready.temporaryEntries,45);assert.equal(expansionArtwork.finalArtwork,false);assert.equal(expansionArtwork.assets!.length,5);assert.equal(betaArtworkPolicy.prestigeCeiling,'existing-approved-level-50');
 assert.equal(expansionArtwork.assets!.reduce((n,a)=>n+a.bytes,0),4000);assert.equal(new Set(expansionArtwork.entries.map(e=>e.path)).size,5);
 for(const e of expansionArtwork.entries){const item=[...expandedContent.items,...expandedContent.properties].find(i=>i.id===e.id)!;assert.equal(e.name,item.name);assert.equal(e.level,item.level);assert.equal(e.use,'temporary-beta');assert.equal(e.status,'temporary-beta-approved');assert.equal(approvedExpansionArt(e.id),null);assert.equal(preparedExpansionArt(e.id),e.path);}
 assert.match(preparedExpansionArt('king-hudsons-shield')!,/shield.webp$/);assert.equal(preparedExpansionArt('crown-harbour'),null);assert.equal(preparedExpansionArt('oathbound-greatsword'),null);
});
test('missing payloads, altered hashes, outside-root symlinks and unknown registry identities fail closed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'beta-art-check-')),outside=root+'-outside';try{
  for(const a of expansionArtwork.assets!){const path=join(root,a.path.replace('/assets/',''));await mkdir(join(path,'..'),{recursive:true});await writeFile(path,await readFile('public/'+a.path.replace('/assets/','')));}
  assert.equal((await verifyExpansionArtwork(expansionArtwork,root)).ready,true);
  const a=expansionArtwork.assets![0]!,path=join(root,a.path.replace('/assets/','')),bytes=await readFile(path);await writeFile(path,Buffer.concat([bytes,Buffer.from('tampered')]));assert.equal((await verifyExpansionArtwork(expansionArtwork,root)).ready,false);
  await rm(path);assert.equal((await verifyExpansionArtwork(expansionArtwork,root)).ready,false);await writeFile(outside,bytes);await symlink(outside,path);assert.equal((await verifyExpansionArtwork(expansionArtwork,root)).ready,false);
  assert.equal((await verifyExpansionArtwork({...structuredClone(expansionArtwork),id:'unreviewed'},root)).ready,false);
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{force:true});}
});
test('future per-item art changes require an exact predecessor, new immutable path, complete framing/rights review and unchanged item identity',()=>{
 const next=structuredClone(expansionArtwork),entry=next.entries[0]!,oldPath=entry.path!;
 next.id='level100-beta-artwork-2';next.predecessorId=expansionArtwork.id;next.predecessorDigest=definitionDigest(expansionArtwork);next.purpose='mixed';next.changedEntryIds=[entry.id];entry.use='final';entry.status='approved';entry.path='/assets/art/level100-artwork-3/'+entry.id+'.webp';entry.sha256='a'.repeat(64);entry.ownerApproval='Synthetic future final-asset review';entry.framingApproval='Synthetic complete frame review';
 next.assets!.push({...next.assets!.find(a=>a.path===oldPath)!,path:entry.path,sha256:entry.sha256,use:'final',bytes:1000});validateArtworkReplacement(next,expansionArtwork,expansionArtwork.entries);
 for(const mutate of [(n:typeof next)=>{n.predecessorDigest='b'.repeat(64);},(n:typeof next)=>{n.entries[0]!.name='Different item';},(n:typeof next)=>{n.entries[0]!.level++;},(n:typeof next)=>{n.entries[0]!.ownerApproval=null;},(n:typeof next)=>{n.entries[0]!.framingApproval=null;},(n:typeof next)=>{n.entries[0]!.path='/assets/../secret.webp';},(n:typeof next)=>{n.changedEntryIds=[];},(n:typeof next)=>{n.assets![0]!.bytes++;}]){const invalid=structuredClone(next);mutate(invalid);assert.throws(()=>validateArtworkReplacement(invalid,expansionArtwork,expansionArtwork.entries));}
 for(const mutate of [(n:typeof next)=>{n.finalArtwork=true;},(n:typeof next)=>{n.assets![0]!.bytes=8193;},(n:typeof next)=>{n.entries.push({...n.entries[0]!});}]){const invalid=structuredClone(expansionArtwork);mutate(invalid);assert.throws(()=>validateArtworkRegistry(invalid,expansionArtwork.entries));}
});
