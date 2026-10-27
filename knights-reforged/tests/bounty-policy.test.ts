import test from 'node:test';
import assert from 'node:assert/strict';
import {bountyPlacementPolicy,placementQuota} from '../src/bounty-policy.js';
import {bountyRules,pvp,bountyFee} from '../src/pvp-rules.js';

const now=new Date('2032-02-02T12:00:00.000Z');
test('confirmed placement policy is independent of frozen historical financial rules',()=>{
 assert.deepEqual(bountyPlacementPolicy,{id:'historical-bounty-1',windowSeconds:86400,sponsorTargetLimit:25,targetLimit:250});
 assert.equal(pvp.bounties.targetDailyLimit,50);assert.equal(bountyRules.targetDailyLimit,250);assert.equal(bountyRules.sponsorTargetDailyLimit,25);
 for(const amount of[1,9,10,11,100,9999,10000])assert.equal(bountyFee(amount),Math.max(1,Math.ceil(amount*.1)));
});
test('rolling placements include now, exclude exactly 24 hours ago and future records',()=>{
 const value=placementQuota([new Date(+now-86400001),new Date(+now-86400000),new Date(+now-86399999),now,new Date(+now+1)],25,now);
 assert.equal(value.used,2);assert.equal(value.remaining,23);assert.equal(value.nextReleaseAt,new Date(+now+1).toISOString());assert.equal(value.nextAvailableAt,null);
});
test('25th and 250th slots are independent, with no calendar-day reset',()=>{
 for(const limit of[25,250]){
  const placements=Array.from({length:limit},(_,i)=>new Date(+now-3600000+i));
  assert.equal(placementQuota(placements.slice(1),limit,now).remaining,1);
  const full=placementQuota(placements,limit,now);assert.equal(full.remaining,0);assert.equal(full.nextAvailableAt,new Date(+placements[0]!+86400000).toISOString());
 }
});
test('legacy counts already over a new cap wait for enough old events, never reset or grant negative slots',()=>{
 const placements=Array.from({length:30},(_,i)=>new Date(+now-7200000+i*1000));
 const full=placementQuota([...placements].reverse(),25,now);assert.equal(full.used,30);assert.equal(full.remaining,0);
 assert.equal(full.nextAvailableAt,new Date(+placements[5]!+86400000).toISOString());
 assert.equal(placementQuota(placements,25,new Date(full.nextAvailableAt!)).remaining,1);
});
test('empty placement history exposes all slots without an invented cooldown',()=>{
 assert.deepEqual(placementQuota([],25,now),{limit:25,used:0,remaining:25,nextReleaseAt:null,nextAvailableAt:null});
});
