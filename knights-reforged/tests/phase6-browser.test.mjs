import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {existsSync} from 'node:fs';
test('Phase 6 real responsive hunts, competitive profiles, rare discovery and persistent notifications',{skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:240000},()=>{
 const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-phase6.ts','--verify-only'],{encoding:'utf8',timeout:230000,maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());
});
