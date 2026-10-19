import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {soundIndex} from '../public/audio/index.js';
const root=new URL('../public/audio/',import.meta.url),inventory=JSON.parse(readFileSync(new URL('inventory.json',root),'utf8'));
test('nineteen original action cues have distinct AAC assets, safe peaks and a compact mobile sprite',()=>{
 assert.equal(inventory.sounds.length,19);assert.equal(Object.keys(soundIndex).length,19);const hashes=new Set();
 for(const sound of inventory.sounds){const file=readFileSync(new URL(sound.file,root));assert.equal(file.length,sound.bytes);assert.equal(file.subarray(4,8).toString(),'ftyp');assert.ok(sound.seconds<=1.6);assert.ok(sound.peak<=.68&&sound.peak>0);assert.ok(sound.rms>0&&sound.rms<.25);assert.equal(sound.license,'CC0-1.0');hashes.add(createHash('sha256').update(file).digest('hex'));}
 assert.equal(hashes.size,19);assert.ok(statSync(new URL('realm.m4a',root)).size<200000);
 assert.match(readFileSync(new URL('LICENSE.txt',root),'utf8'),/No third-party samples/);
});
test('sprite segments are bounded and separate; no background music or remote assets',()=>{
 let end=0;for(const segment of Object.values(soundIndex)){assert.ok(segment.start>=end);assert.ok(segment.duration>0);end=segment.start+segment.duration;}assert.ok(end<22);
 const client=readFileSync(new URL('../public/sound.js',import.meta.url),'utf8');assert.doesNotMatch(client,/https?:\/\//);assert.match(client,/pref|enabled/);assert.doesNotMatch(client,/\.loop\s*=\s*true/);
});
