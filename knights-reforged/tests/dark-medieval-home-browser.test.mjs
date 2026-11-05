import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {testProcessEnvironment} from '../scripts/ci/isolation.mjs';
test('Static Dark Medieval review preserves Home, combat and market contracts, saved battle values, populated attacks and accessibility', {timeout:240000}, () => {
  assert.ok(process.env.TEST_DATABASE_URL,'A guarded disposable PostgreSQL test database is required');
  const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-dark-medieval-home.ts'],{env:testProcessEnvironment(),encoding:'utf8',timeout:230000,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stdout+result.stderr);
  console.log(result.stdout.trim());
});
