import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
test('manual expansion entrypoint rejects missing authorization, public connections and unexpected operations without exposing values',()=>{
 for(const [allow,url,args]of [
  ['0','postgres://synthetic:never-print@not-production.invalid/example',['inspect-hudson','/tmp/unused-plan.json']],
  ['1','postgres://synthetic:never-print@not-production.invalid/example',['inspect-hudson','/tmp/unused-plan.json']],
  ['1','postgres://synthetic:never-print@unconfigured.railway.internal/example',['arbitrary-sql','/tmp/unused-plan.json']],
  ['1','postgres://synthetic:never-print@unconfigured.railway.internal/example',['inspect-hudson','public/forbidden-plan.json']]
 ]){const result=spawnSync(process.execPath,['deployment/expansion.mjs',...args],{cwd:new URL('../',import.meta.url),env:{PATH:process.env.PATH,ALLOW_EXPANSION_OPERATOR:allow,DATABASE_URL:url},encoding:'utf8',timeout:5000});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'EXPANSION_OPERATOR: FAIL\n');}
});
test('independent restored-cluster evidence binds the exact additive migration and retains the whole legacy fixture',()=>{
 const report=JSON.parse(readFileSync(new URL('../docs/level100-e2b/independent-restore.json',import.meta.url),'utf8'));const sql=readFileSync(new URL('../migrations/024_level100_expansion.sql',import.meta.url));assert.equal(report.migrationSha256,createHash('sha256').update(sql).digest('hex'));assert.equal(report.independentClusters,true);assert.equal(report.productionContacted,false);assert.equal(report.bots,450);assert.ok(report.existingTablesVerified>=71);assert.equal(report.migrationReplay,'unchanged');assert.equal(report.expansionActive,false);assert.equal(report.hudsonGranted,false);
});
