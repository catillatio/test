import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';
import {checkPopulationEvidence,checkJobReport} from '../deployment/release/protocol.mjs';
const m=JSON.parse(readFileSync(new URL('../rulesets/level100-rivals-1/rules.json',import.meta.url)));
const norm=v=>Array.isArray(v)?v.map(norm):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort().map(([k,x])=>[k,norm(x)])):v;
const evidence={manifestId:m.id,manifestDigest:createHash('sha256').update(JSON.stringify(norm(m))).digest('hex'),legacyDigest:'a'.repeat(64),originalBots:450,addedBots:450,totalBots:900,activeAddedBots:0,autonomyMode:'paused'};
test('release population verification accepts only the exact installed 450+450 manifest, preserving the ordinary 450 contract',()=>{
 assert.equal(checkPopulationEvidence(null),450);assert.equal(checkPopulationEvidence(undefined),450);assert.equal(checkPopulationEvidence(evidence),900);assert.equal(checkPopulationEvidence({...evidence,activeAddedBots:450}),900);
 for(const changed of [{manifestId:'unknown'},{manifestDigest:'b'.repeat(64)},{originalBots:449},{addedBots:451},{totalBots:901},{activeAddedBots:1},{legacyDigest:'invalid'},{legacyDigest:null},{autonomyMode:'unknown'},{autonomyMode:'enabled'}])assert.throws(()=>checkPopulationEvidence({...evidence,...changed}));
});
test('900 evidence cannot substitute for restoration, exact candidate, signature or schema verification',()=>{
 // Incomplete/forged recovery material remains rejected even with valid cohort metadata.
 for(const mode of ['prepare','verify'])assert.throws(()=>checkJobReport({protocol:'wrong',passed:true,bots:900,population:evidence,accounts:901,schemaHead:'026_living_competition.sql'},{mode}));
});
