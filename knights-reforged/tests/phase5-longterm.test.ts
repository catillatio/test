import test from 'node:test';
import assert from 'node:assert/strict';
import {distribution,offlineSlot,requireLocalSimulationDatabase} from '../scripts/simulation/living-economy.js';
test('long-horizon reporting uses whole-population quantiles and exactly two explicit outages, without changing runtime policy',()=>{
 assert.deepEqual(distribution([5,1,9,3,7]),{min:1,p10:1,median:5,p90:7,max:9,sum:25});
 assert.equal(Array.from({length:30*288},(_,slot)=>offlineSlot(slot)).filter(Boolean).length,576);
 for(const slot of[2*288+23,3*288+24,14*288+23,15*288+24])assert.equal(offlineSlot(slot),false);
 for(const slot of[2*288+24,3*288+23,14*288+24,15*288+23])assert.equal(offlineSlot(slot),true);
});

test('long-horizon runner rejects production/remote URLs and connection overrides before fixture creation',()=>{
 for(const value of[undefined,'postgresql://operator@production.internal/kingdom_come','postgresql://operator@127.0.0.1/kingdom_come','postgresql://operator@localhost/realm_test?host=production.internal','postgresql://operator@localhost/realm_test?options=-csearch_path=public'])assert.throws(()=>requireLocalSimulationDatabase(value));
 for(const value of['postgresql://fixture@127.0.0.1/realm_test','postgresql://fixture@localhost/realm_test?host=/tmp/kingdom-phase5-pg-socket'])assert.doesNotThrow(()=>requireLocalSimulationDatabase(value));
});
