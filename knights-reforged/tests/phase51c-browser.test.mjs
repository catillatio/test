import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {spawnSync} from 'node:child_process';
test('Phase 5.1C real-route mobile/desktop previews, notifications, rewards, bulk trades and no-script purchases',{
 skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:180000,
},()=>{const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-phase51c.ts','--verify-only'],{encoding:'utf8',timeout:170000,maxBuffer:8*1024*1024});assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());});
