import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {testProcessEnvironment} from '../scripts/ci/isolation.mjs';
test('Play viewport coverage preserves actual game screens, artwork, navigation and commands',{timeout:300000},()=>{
 assert.ok(process.env.TEST_DATABASE_URL);
 const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-play-readiness.ts'],{env:testProcessEnvironment(),encoding:'utf8',timeout:290000,maxBuffer:4*1024*1024});
 assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());
});
