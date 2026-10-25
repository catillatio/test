import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import ejs from 'ejs';
import {alpha} from '../src/alpha-rules.js';import {expandedContent,expansionArtwork,legacyExpansionArtwork,preparedExpansionArt,approvedExpansionArt} from '../src/expansion-content.js';import {expansionAssetReadiness} from '../src/expansion-activation.js';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url)),hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const selectedHudsonSources:Record<string,[string,string]>={
 'king-hudsons-shield':['1df90978-1cde-4080-8bba-dc25fd86b9df.png','ff71f02557c909086a010a1f8b045d95ffd10d9e2039c9442d780d577234943a'],
 'king-hudsons-meteor-shower':['2e7522e3-4f93-40d6-84c6-5e6cfbbce96c.png','8dd0c069a6f118507d7bc0ba8736e33a4f633aa4550ae387e90d3729586178a8'],
 'king-hudsons-sword':['ccb25e5e-239c-4194-b1e7-23d913641f44.png','eff1393d4ae5787c237965a6cca5f7c402ab064b3aafd7bbac6e0c6f4576a3d3']
};
test('all 45 new illustrations have immutable byte provenance, real WebP payloads and shared renderer mappings',async()=>{
 assert.equal(expansionArtwork.id,'level100-artwork-2');assert.equal(legacyExpansionArtwork.id,'level100-artwork-1');assert.ok(legacyExpansionArtwork.entries.every(e=>e.path===null));
 const provenance=JSON.parse(read('public/art/level100-1/provenance.json').toString());assert.equal(provenance.reviewStatus,'pending-owner-approval');assert.equal(provenance.assets.length,45);
 const partial=read('views/partials/catalog-art.ejs').toString();
 for(const e of expansionArtwork.entries){assert.equal(e.path,preparedExpansionArt(e.id));assert.equal(approvedExpansionArt(e.id),null,'availability must not imply owner approval');const bytes=read('public/'+e.path!.replace(/^\/assets\//,''));assert.equal(hash(bytes),e.sha256);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes.length<(e.id.startsWith('king-hudsons-')?750000:250000));const source=provenance.assets.find((a:{id:string})=>a.id===e.id);assert.equal(hash(read('docs/level100-launch/art/masters/'+e.id+'.webp')),source.masterSha256);if(e.id.startsWith('king-hudsons-')){assert.equal(hash(read(source.ownerOriginal)),source.sourceSha256);assert.equal(source.ownerReferenceCommit,'3721dc4595e237f6f5bf8632e70b60a0e6c157a7');assert.match(source.processing,/no repaint/i);assert.ok(bytes.includes(Buffer.from('VP8L')),'Hudson runtime must be lossless WebP');}
  if(selectedHudsonSources[e.id]){const [filename,sha]=selectedHudsonSources[e.id]!;assert.equal(source.ownerOriginal,'docs/level100-launch/art/owner-originals/'+filename);assert.equal(hash(read(source.ownerOriginal)),sha);}
  assert.ok(source.sourceDimensions[0]>=1024&&source.sourceDimensions[1]>=1024);assert.equal(e.fullBleedRequired,true);
  const html=ejs.render(partial,{entry:{...e,name:'<script>unsafe</script>'},small:true,preparedExpansionArt});assert.match(html,/expansion-art art-small/);assert.ok(html.includes(e.path!));assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);
 }
 const readiness=await expansionAssetReadiness();assert.equal(readiness.ready,false);assert.equal(readiness.missing.length,45,'owner art/framing/rights decision remains mandatory');
 for(const old of [...alpha.items,...alpha.properties])assert.equal(preparedExpansionArt(old.id),null,'legacy art must not be overridden');
 assert.equal(expandedContent.items.filter(i=>i.acquisition==='quest-exclusive').length,3);
});
test('owner freeze preserves rejected references without adopting trials or granting artwork approval',()=>{
 const freeze=JSON.parse(read('docs/level100-launch/art-freeze.json').toString());assert.equal(freeze.artworkFrozen,true);assert.equal(freeze.generationAllowed,false);assert.equal(freeze.newArtworkAdopted,false);assert.equal(freeze.activationRemainsBlocked,true);assert.equal(freeze.entries.length,45);assert.equal(freeze.entries.filter((e:{status:string})=>e.status==='rejected-frozen-not-for-adoption').length,42);
 const historic=JSON.parse(read('rulesets/level100-artwork-2/rules.json').toString());for(const entry of freeze.entries){assert.equal(entry.sha256,historic.entries.find((e:{id:string})=>e.id===entry.id).sha256);assert.equal(approvedExpansionArt(entry.id),null);}
 assert.equal(freeze.lastUnadoptedTrials.length,4);for(const trial of freeze.lastUnadoptedTrials){assert.equal(trial.runtimeAdopted,false);const bytes=read(trial.path);assert.equal(hash(bytes),trial.sha256);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(historic.entries.every((e:{sourceSha256:string})=>e.sourceSha256!==trial.sha256),'frozen trial must not replace an existing runtime asset');}
});
