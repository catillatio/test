import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

test('Phase 5.1A real-route responsive, read-only receipt and no-JavaScript regression',{
 skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:180000,
},()=>{
 const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-phase51a.ts','--verify-only'],{encoding:'utf8',timeout:170000});
 assert.equal(result.status,0,result.stdout+result.stderr);
 console.log(result.stdout.trim());
});
