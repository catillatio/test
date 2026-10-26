import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {raritySchedule,questSessions} from '../scripts/simulation/phase6.js';import {killDeathRatio,competitionSchema} from '../src/competitive-records.js';
test('Rare progression model has no invented level-71 opportunities or Mana points, and reports all three review rates',()=>{
 const locked=raritySchedule(71,questSessions[0]);assert.ok(locked.checkpoints.every(p=>p.completions===0));
 const regular=raritySchedule(74,questSessions[3]);assert.equal(regular.actualMaximumMana,93);assert.equal(regular.maximumManaFixed,true);
 assert.deepEqual(regular.checkpoints.map(p=>p.day),[30,60,90]);for(const p of regular.checkpoints){assert.ok(p.completions>0);assert.deepEqual(p.rates.map(r=>r.ppm),[250,500,1000]);assert.ok(p.rates[0]!.anyChance<p.rates[1]!.anyChance&&p.rates[1]!.anyChance<p.rates[2]!.anyChance);for(const r of p.rates)assert.ok(Object.values(r.items).every(i=>i.expectedCopies===i.opportunities*r.ppm/1000000));}
 assert.throws(()=>raritySchedule(70,questSessions[0]));
});
test('K/D retains large-integer precision and defines zero deaths explicitly',()=>{assert.equal(killDeathRatio('1','0'),null);assert.equal(killDeathRatio('0','3'),'0.00');assert.equal(killDeathRatio('10','3'),'3.33');assert.equal(killDeathRatio('9007199254740993','3'),'3002399751580331.00');});
test('New private inspection and activation commands cannot run without trusted operator authorization',()=>{
 for(const mode of ['inspect-economy','inspect-rarity','set-rarity','inspect-hudson','grant-hudson']){const child=spawnSync(process.execPath,['--im'+'port','tsx','src/expansion-console.ts',mode,'/tmp/unapproved-plan.json'],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},timeout:10000});assert.equal(child.status,1);assert.equal(child.stdout,'');assert.equal(child.stderr.trim(),'EXPANSION_OPERATOR: FAIL');}
});

test('Pre-026 read compatibility rejects incomplete installed competitive schemas',async()=>{for(const row of [{installed:true,deaths:false,attention:true},{installed:true,deaths:true,attention:false},{installed:false,deaths:true,attention:true}]){const sql={query:async()=>({rows:[row]})} as unknown as import('../src/db.js').Sql;await assert.rejects(competitionSchema(sql),/Incomplete competitive schema/);}});
