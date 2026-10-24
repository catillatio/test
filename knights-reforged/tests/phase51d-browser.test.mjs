import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {existsSync} from 'node:fs';
test('5.1D real mobile Dashboard, hourly funding and acceptance acknowledgements',{skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:180000},()=>{
 const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-phase51d.ts','--verify-only'],{encoding:'utf8',timeout:170000,maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());
});
