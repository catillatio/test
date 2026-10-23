import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ejs from 'ejs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root)),json=p=>JSON.parse(read(p));
const manifest=json('public/art/properties-51b/provenance.json'),catalog=json('rulesets/alpha-0.3/rules.json');
const ids=['dawnspire-cathedral','wyrmcrest-keep','astral-observatory','throne-of-ash','eclipse-citadel','tempest-port'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('six owner-selected assets have exact source provenance and bounded, versioned derivatives',()=>{
 assert.deepEqual(manifest.assets.map(a=>a.id),ids);
 assert.equal(manifest.economicCatalogChanged,false);assert.equal(manifest.crownHarbourChanged,false);assert.equal(manifest.equipmentOrSpellsChanged,false);
 for(const [index,a] of manifest.assets.entries()){
  assert.equal(a.classIndex,index);assert.ok(catalog.properties.some(p=>p.id===a.id));assert.equal(a.asset,a.id+'.webp');
  assert.equal(hash(read(a.source)),a.sourceSha256);
  const bytes=read('public/art/properties-51b/'+a.asset);assert.equal(hash(bytes),a.sha256);assert.equal(bytes.length,a.bytes);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(a.bytes<300000);
  assert.deepEqual(a.crop,[2,2,a.sourceSize[0]-4,a.sourceSize[1]-4]);assert.equal(a.width,a.crop[2]);assert.equal(a.height,a.crop[3]);
 }
});

test('shared property mapping changes only six IDs across all 81 current entries and historical fallbacks',()=>{
 const before=read('tests/fixtures/phase51b-art-before.ejs').toString(),after=read('views/partials/catalog-art.ejs').toString();
 const frozen=JSON.stringify(catalog);
 for(const entry of [...catalog.items,...catalog.properties,{id:'retired-property',name:'Historical Property',art:'fields'},{id:'moonwell-sanctuary',name:'Saved Moonwell Sanctuary',art:'moonwell'}])for(const small of [false,true]){
  const a=ejs.render(after,{entry,small}).trim();
  if(ids.includes(entry.id)){
   assert.match(a,/data-art-atlas="properties-51b"/);assert.ok(a.includes('property-art-51b-'+ids.indexOf(entry.id)));
   assert.ok(a.includes('aria-label="'+entry.name+' illustration"'));assert.ok(a.includes('role="img"'));assert.equal(a.includes('art-small'),small);
  }else assert.equal(a,ejs.render(before,{entry,small}).trim(),entry.id);
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
