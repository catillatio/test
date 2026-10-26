import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeDisplayName,checkNewContent,ContentPolicyError} from '../src/content-policy.js';
import {automaticFunding} from '../src/maintenance.js';

test('Unicode display names retain readable scripts, accents, symbols, emoji and canonical graphemes',()=>{
 for(const name of ['Éowyn ⚔️','勇者 🐉','Марина','Αλέξανδρος','👩‍🚀 Star','🇬🇧 Knight','A'.repeat(28),'🐉'.repeat(28)])assert.equal(normalizeDisplayName(name),name);
 assert.equal(normalizeDisplayName('  E\u0301owyn　of Dawn  '),'Éowyn of Dawn');
 for(const name of ['A','🐉','A'.repeat(29),'A\u202eKnight','A\u200bKnight','A\u034fKnight','A\u2066Knight','A\u0000Knight',
  'Pаul','Knight Ω','<script>alert(1)</script>','A\u200dB','A\u0301'.repeat(90),'A\ud800B'])assert.throws(()=>normalizeDisplayName(name));
});
test('content policy catches full-word profanity, explicit inflections and common Unicode/separator/leet evasions',()=>{
 for(const value of ['Fag','ＦＡＧ','fаg','f\u200bag','f.a.g','f a g','f@g','SH1T','fuuuck','f.u.c.k','fucking','faggots'])
  for(const scope of ['name','comment','broadcast'] as const)assert.throws(()=>checkNewContent(value,scope),ContentPolicyError);
 for(const value of ['Scunthorpe','Nigel','class','grass','assistant','shitake','Éowyn of Dawn','Hello <img onerror="bad()"> & friends','🛡️ Good battle','I need 105 gold'])
  checkNewContent(value,'comment');
 for(const name of ['Admin','ＭＯＤＥＲＡＴＯＲ','Official Support','Kingdom Come'])assert.throws(()=>checkNewContent(name,'name'),ContentPolicyError);
 checkNewContent('Development Knight','name');checkNewContent('Gray','name');
});
test('automatic maintenance funding conserves cash plus reserves and never cancels unpaid debt',()=>{
 for(const rate of [0,1,10,100])for(const reserve of [0n,1n,15n,500n])for(const arrears of [0n,1n,20n,1000n])for(const wallet of [0,1,10,100,2000]){
  const plan=automaticFunding(rate,reserve,arrears,wallet);
  assert.equal(plan.affordable,plan.cost<=BigInt(wallet));
  if(plan.affordable){assert.ok(plan.reserveAfter>=BigInt(rate));assert.ok(BigInt(wallet)-plan.cost>=0n);
   assert.equal(BigInt(wallet)-plan.cost+plan.reserveAfter,BigInt(wallet)+reserve-arrears);assert.equal(plan.arrearsPaid,arrears);}
 }
 for(const input of [[-1,0n,0n,0],[1,-1n,0n,0],[1,0n,-1n,0],[1,0n,0n,-1]] as const)assert.throws(()=>automaticFunding(input[0],input[1],input[2],input[3]));
});
