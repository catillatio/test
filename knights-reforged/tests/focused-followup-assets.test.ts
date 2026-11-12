import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('original Profile silhouette provenance and immutable matchmaking source remain exact',async()=>{
 const directory='public/art/class-silhouettes-1/',provenance=JSON.parse(await readFile(directory+'provenance.json','utf8'));
 assert.deepEqual(Object.keys(provenance.files).sort(),['freeblade.svg','spellward.svg','warden.svg']);
 const distinct=new Set<string>();for(const [file,expected] of Object.entries(provenance.files)){
  const bytes=await readFile(directory+file),svg=bytes.toString();assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);assert.match(svg,/viewBox="0 0 180 180"/);assert.doesNotMatch(svg,/<(?:image|script|foreignObject|rect)\b|(?:href|src)=|@import/i);distinct.add(svg);
 }assert.equal(distinct.size,3);
 const frozen={
  'src/rival-recommendations.ts':'6baa815ecc531e3382d9381bdccd56dfea013c62',
  'migrations/050_rival_recommendation_snapshots.sql':'b53e8aa6e3bb5df4014d9462743e1e7bd39ebf94',
  'tests/rival-quality-fixture.ts':'6ae447060b0d9fa4afcc97f45eb244f2e61854eb',
 };
 for(const [file,blob] of Object.entries(frozen)){const bytes=await readFile(file);assert.equal(createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'),blob,file+' must stay byte-identical to the owner-preserved e508 package');}
});
