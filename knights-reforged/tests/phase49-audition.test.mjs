import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const root=new URL('../docs/phase49/audio-orchestral-audition/',import.meta.url);
const bytes=file=>readFileSync(new URL(file,root));
const json=file=>JSON.parse(bytes(file));
const sha=file=>createHash('sha256').update(bytes(file)).digest('hex');

test('orchestral audition has pinned recorded-instrument provenance, licensed mappings and no rejected sound-effect sources',()=>{
 const sources=json('sources.json'),score=json('score.json'),inventory=json('inventory.json');
 assert.equal(sources.license,'CC0-1.0');assert.equal(sha('LICENSE-VSCO-CC0.txt'),sources.licenseSha256);
 assert.equal(sha('sources.json'),inventory.sourceManifestSha256);assert.equal(sha('score.json'),inventory.scoreSha256);
 assert.equal(inventory.runtimeAssetsChanged,false);assert.match(inventory.status,/NOT approved or adopted/);
 for(const mapping of sources.mappings)assert.equal(createHash('sha256').update(gunzipSync(bytes('source-mappings/'+mapping.path+'.gz'))).digest('hex'),mapping.sha256);
 assert.deepEqual(Object.keys(score.cues),['victory','defeat','quest','level']);
 for(const s of sources.sources){assert.ok(s.url.startsWith('https://raw.githubusercontent.com/sgossner/VSCO-2-CE/'+sources.sampleCommit+'/'));assert.match(s.sha256,/^[a-f0-9]{64}$/);assert.match(s.gitBlob,/^[a-f0-9]{40}$/);assert.ok(s.bytes>1000);}
 const instrumentNames=new Set(sources.sources.map(s=>s.instrument));for(const name of['horn','horn-stac','trumpet','trumpet-stac','cello','violin','harp','glock'])assert.ok(instrumentNames.has(name));
 for(const cue of Object.values(score.cues))for(const e of cue.events){assert.ok(e.time>=0&&e.duration>0&&e.time+e.duration<cue.seconds);assert.ok(sources.sources.some(s=>s.instrument===e.instrument&&e.note>=s.lokey&&e.note<=s.hikey&&e.velocity>=s.lovel&&e.velocity<=s.hivel),'Event must use a recorded instrument within its publisher mapping');}
 assert.ok(score.cues.victory.events.some(e=>e.instrument==='trumpet'));
 assert.ok(score.cues.defeat.events.every(e=>['horn','cello'].includes(e.instrument)));
 assert.ok(score.cues.quest.events.some(e=>e.instrument==='harp'));
 assert.ok(score.cues.level.events.length>score.cues.victory.events.length);
});

test('four documentation-only audition clips are distinct, checksum-verified and loudness matched',()=>{
 const inventory=json('inventory.json'),sources=json('sources.json');
 const rejected=JSON.parse(readFileSync(new URL('../docs/phase49/audio-audition/inventory.json',import.meta.url)));
 assert.match(rejected.status,/REJECTED/);assert.equal(rejected.runtimeAssetsChanged,false);
 assert.equal(inventory.cues.length,4);assert.equal(new Set(inventory.cues.map(c=>c.sha256)).size,4);
 for(const cue of inventory.cues){assert.equal(sha(cue.file),cue.sha256);assert.equal(sha(cue.master),cue.masterSha256);assert.equal(bytes(cue.file).length,cue.bytes);assert.ok(Math.abs(cue.integratedLUFS+20)<=.4);assert.ok(cue.truePeakDBTP<=-1.8);assert.ok(!rejected.cues.some(old=>old.sha256===cue.sha256));for(const hash of cue.sources)assert.ok(sources.sources.some(s=>s.sha256===hash));}
 assert.equal(sha('audition.mp3'),inventory.reelSha256);
 // This review cannot implicitly replace the existing runtime audio set.
 const runtime=JSON.parse(readFileSync(new URL('../public/audio/inventory.json',import.meta.url)));
 assert.equal(runtime.version,'phase47-1');
});
