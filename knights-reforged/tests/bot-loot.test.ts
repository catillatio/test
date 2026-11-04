import test from 'node:test';
import assert from 'node:assert/strict';
import {progressiveBotLoot} from '../src/bot-loot.js';

test('bot progressive payout follows the exact approved logarithmic curve and threshold floors',()=>{
 // Independent Python Decimal, 100-digit precision, ROUND_FLOOR reference.
 const vectors=[
  [0,0],[1,1],[3000,3000],[10000,10000],[19999,19999],[20000,20000],
  [20001,20000],[20002,20001],[20003,20002],[20010,20009],[20100,20099],[21000,20953],
  [30000,26931],[50000,33862],[100000,41972],[200000,49444],[500000,58918],
  [1000000,65951],[2147483647,142772],[1000000000,135129],[1000000000000,204206],
  [270215977642229,260199],[Number.MAX_SAFE_INTEGER,295264]
 ];
 for(const [raw,expected]of vectors)assert.equal(progressiveBotLoot(raw!),expected);
});

test('curve floors correctly on both sides of difficult integer-payout boundaries',()=>{
 // floor(10000*exp(k/10000)+10000), independently computed using 100-digit
 // Decimal arithmetic. At this raw input payout is 20000+k-1; the next is k.
 const boundaries=[
  [1,20001],[2,20002],[100,20100],[1000,21051],[5000,26487],[10000,37182],
  [20000,83890],[50000,1494131],[100000,220274657],
  [200000,4851651964097],[270000,5320482406027986]
 ];
 for(const [k,raw]of boundaries){
  assert.equal(progressiveBotLoot(raw!),20000+k!-1);
  assert.equal(progressiveBotLoot(raw!+1),20000+k!);
 }
});

test('progressive gold stays monotone, source-bounded and deterministic without a fixed payout ceiling',()=>{
 const samples=[0,1,33,34,3000,10000,19999,20000,20001,20002,30000,50000,100000,200000,500000,
  1000000,100000000,1000000000,1000000000000,270215977642229,Number.MAX_SAFE_INTEGER];
 let previous=0;
 for(const raw of samples){
  const payout=progressiveBotLoot(raw);assert.ok(Number.isSafeInteger(payout)&&payout>=0&&payout<=raw);
  assert.ok(payout>=previous);assert.equal(progressiveBotLoot(raw),payout);previous=payout;
 }
 assert.ok(progressiveBotLoot(Number.MAX_SAFE_INTEGER)>progressiveBotLoot(1000000000000));
 // Flooring can create single-gold plateaus; it must never create a decrease.
 let last=progressiveBotLoot(19990);
 for(let raw=19991;raw<=20500;raw++){
  const payout=progressiveBotLoot(raw);assert.ok(payout>=last&&payout-last<=1);last=payout;
 }
});

test('equal large input steps yield progressively smaller rewards above the threshold',()=>{
 let previous=progressiveBotLoot(20000),previousGain=10001;
 for(let raw=30000;raw<=300000;raw+=10000){
  const value=progressiveBotLoot(raw),gain=value-previous;
  assert.ok(gain>=0&&gain<=previousGain);previous=value;previousGain=gain;
 }
});

test('invalid or unsafe reward inputs fail before calculation',()=>{
 for(const raw of [-1,-Infinity,Infinity,NaN,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>progressiveBotLoot(raw),RangeError);
});
