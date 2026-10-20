import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {soundIndex} from '../public/audio/index.js';
const root=new URL('../public/audio/',import.meta.url),inventory=JSON.parse(readFileSync(new URL('inventory.json',root),'utf8'));
test('approved orchestral rewards and retained action assets have verified AAC bytes, safe peaks and a bounded sprite',()=>{
 assert.equal(inventory.sounds.length,19);assert.equal(Object.keys(soundIndex).length,19);const hashes=new Set();
 for(const sound of inventory.sounds){const file=readFileSync(new URL(sound.file,root));assert.equal(file.length,sound.bytes);assert.equal(file.subarray(4,8).toString(),'ftyp');assert.ok(sound.seconds<=5.4);assert.ok(sound.peak<=.68&&sound.peak>0);assert.ok(sound.rms>0&&sound.rms<.25);assert.equal(sound.license,'CC0-1.0');const hash=createHash('sha256').update(file).digest('hex');assert.equal(hash,sound.sha256);hashes.add(hash);}
 assert.equal(hashes.size,18,'Only decisive victory shares the approved victory recording.');
 assert.deepEqual(inventory.aliases,{decisive:'victory'});assert.deepEqual(inventory.silentEvents,['click','navigate']);
 const sprite=readFileSync(new URL('realm.m4a',root));assert.equal(sprite.length,inventory.sprite.bytes);assert.equal(createHash('sha256').update(sprite).digest('hex'),inventory.sprite.sha256);assert.ok(statSync(new URL('realm.m4a',root)).size<600000);
 assert.match(readFileSync(new URL('LICENSE.txt',root),'utf8'),/VSCO 2 Community Edition/);
});
test('sprite segments are bounded and separate; no background music or remote assets',()=>{
 let end=0;for(const [id,segment] of Object.entries(soundIndex)){if(id==='decisive'){assert.deepEqual(segment,soundIndex.victory);continue;}assert.ok(segment.start>=end-.000001);assert.ok(segment.duration>0);end=segment.start+segment.duration;}assert.ok(end<35);assert.ok(inventory.sprite.seconds>=end);
 const client=readFileSync(new URL('../public/sound.js',import.meta.url),'utf8');assert.doesNotMatch(client,/https?:\/\//);assert.match(client,/pref|enabled/);assert.doesNotMatch(client,/\.loop\s*=\s*true/);
});
