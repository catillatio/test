import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ejs from 'ejs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root)),json=p=>JSON.parse(read(p));
const manifest=json('public/art/properties-51b-fullbleed-2/provenance.json'),catalog=json('rulesets/alpha-0.3/rules.json');
const ids=['dawnspire-cathedral','wyrmcrest-keep','astral-observatory','throne-of-ash','eclipse-citadel','tempest-port'];
const equipment=json('public/art/equipment-51b-current-1/provenance.json');
const equipmentIds=equipment.assets.map(a=>a.id);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('six owner-selected assets have exact source provenance and bounded, versioned derivatives',()=>{
 assert.deepEqual(manifest.assets.map(a=>a.id),ids);
 assert.equal(manifest.economicCatalogChanged,false);assert.equal(manifest.crownHarbourChanged,false);assert.equal(manifest.equipmentOrSpellsChanged,false);
 for(const [index,a] of manifest.assets.entries()){
  assert.equal(a.classIndex,index);assert.ok(catalog.properties.some(p=>p.id===a.id));assert.equal(a.asset,a.id+'.webp');
  assert.equal(hash(read(a.source)),a.sourceSha256);
  const bytes=read('public/art/properties-51b-fullbleed-2/'+a.asset);assert.equal(hash(bytes),a.sha256);assert.equal(bytes.length,a.bytes);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(a.bytes<300000);
  assert.equal(a.width,768);assert.equal(a.height,512);assert.equal(hash(read(a.landscapeMaster)),a.landscapeMasterSha256);
  assert.deepEqual(a.focalPosition,[0.5,0]);
  for(const [w,h] of [[68,49],[80,58],[90,60],[198,116],[60,60],[64,72]]){
   const scale=Math.max(w/a.width,h/a.height),visibleW=w/scale,visibleH=h/scale,left=(a.width-visibleW)/2;
   const [x,y,bw,bh]=a.landmarkBounds;
   assert.ok(x>=left&&x+bw<=left+visibleW&&y>=0&&y+bh<=visibleH,a.id+' landmark loss at '+w+'x'+h);
  }
 }
});

test('shared artwork mapping changes only eleven selected IDs across all 81 current entries and historical fallbacks',()=>{
 const before=read('tests/fixtures/phase51b-art-before.ejs').toString(),after=read('views/partials/catalog-art.ejs').toString();
 const frozen=JSON.stringify(catalog);
 for(const entry of [...catalog.items,...catalog.properties,{id:'retired-property',name:'Historical Property',art:'fields'},{id:'moonwell-sanctuary',name:'Saved Moonwell Sanctuary',art:'moonwell'}])for(const small of [false,true]){
  const a=ejs.render(after,{entry,small}).trim();
  if(ids.includes(entry.id)){
   assert.match(a,/data-art-atlas="properties-51b"/);assert.ok(a.includes('property-art-51b-'+ids.indexOf(entry.id)));
   assert.ok(a.includes('aria-label="'+entry.name+' illustration"'));assert.ok(a.includes('role="img"'));assert.equal(a.includes('art-small'),small);
  }else if(equipmentIds.includes(entry.id)){assert.match(a,/data-art-atlas="equipment-51b-current-1"/);assert.ok(a.includes('equipment-art-51b-'+equipmentIds.indexOf(entry.id)));assert.equal(a.includes('art-small'),small);}
  else assert.equal(a,ejs.render(before,{entry,small}).trim(),entry.id);
 }
 const escaped=ejs.render(after,{entry:{id:'tempest-port',name:'<script>unsafe</script>'},small:false});assert.ok(!escaped.includes('<script>'));assert.match(escaped,/&lt;script&gt;/);
 assert.equal(JSON.stringify(catalog),frozen);
});

test('preserved equipment, spell and Land atlases still match their existing manifests',()=>{
 for(const name of ['fantasy-0.2','land-simple-0.1','land-review','properties-49']){
  const m=json('public/art/'+name+'/provenance.json');
  for(const a of m.assets??[m])assert.equal(hash(read('public/art/'+name+'/'+a.asset)),a.sha256,name+'/'+a.asset);
 }
 // Crown Harbour retains its original slot in the unchanged simplified atlas.
 const crown=catalog.properties.find(p=>p.id==='crown-harbour');assert.deepEqual(crown.illustration,{atlas:'properties',column:2,row:1});
});

test('full-bleed policy rejects the earlier contain/matte treatment',()=>{
 const css=read('public/phase49.css').toString(),selected=css.slice(css.indexOf('/* Full-bleed scene compositions.'));
 assert.match(selected,/background-size: cover/);assert.doesNotMatch(selected,/background-size: contain|background-color: #0c0b0a/);
 assert.match(selected,/background-color: transparent/);assert.match(selected,/border: 0/);
 assert.match(read('docs/ARTWORK_REQUIREMENTS.md').toString(),/Applies permanently/);
});


test('five CURRENT equipment reference crops are pinned to the exact reviewed source and original atlases',()=>{
 assert.equal(equipment.selection,'CURRENT, not PROPOSED');assert.equal(equipment.sourceReferenceCommit,'df0b4dc9bfd1dbed533487d5aabe0b5357d8fdec');
 assert.deepEqual(equipmentIds,['oathbound-greatsword','crown-of-ash-blade','eclipse-greatsword','sovereigns-bastion','eclipse-citadel-plate']);
 for(const [index,a] of equipment.assets.entries()){
  assert.equal(a.classIndex,index);assert.equal(hash(read(a.source)),a.sourceSha256);assert.equal(hash(read(a.originalAtlas)),a.originalAtlasSha256);
  const output=read('public/art/equipment-51b-current-1/'+a.asset);assert.equal(hash(output),a.sha256);assert.equal(output.length,a.bytes);assert.ok(a.bytes<60000);
  assert.equal(a.width,208);assert.equal(a.height,208);assert.deepEqual(a.crop,[a.id==='crown-of-ash-blade'?2:1,2,208,208]);
  assert.deepEqual(catalog.items.find(i=>i.id===a.id).illustration,a.originalCatalogIllustration);
 }
});

test('approved c764e19 Land bytes, mapping markup, focal positions and framing rules remain frozen',()=>{
 const approval=json('docs/phase51b-selected-art/APPROVED_LAND.json');assert.equal(approval.approvedCommit,'c764e1913501148cc58a2fe582742efab9eeed97');
 const prefix=read('public/phase49.css').toString().split('/* Owner-selected CURRENT equipment')[0];assert.equal(hash(prefix),approval.landCssPrefixSha256);
 const before=read('tests/fixtures/phase51b-approved-land.ejs').toString(),after=read('views/partials/catalog-art.ejs').toString();
 for(const a of approval.assets){
  const current=manifest.assets.find(i=>i.id===a.id);assert.equal(current.sha256,a.sha256);assert.equal(hash(read('public/art/properties-51b-fullbleed-2/'+current.asset)),a.sha256);assert.deepEqual(current.focalPosition,a.focalPosition);assert.equal(current.classIndex,a.classIndex);
  for(const small of [false,true]){const entry=catalog.properties.find(i=>i.id===a.id);assert.equal(ejs.render(after,{entry,small}).trim(),ejs.render(before,{entry,small}).trim());}
 }
});
