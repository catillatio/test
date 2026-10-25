import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {spawnSync} from 'node:child_process';
test('coordinated owner artwork: real template rendering at four widths, 52 exact slots and populated preservation',{
 skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:240000,
},()=>{const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-coordinated-art.ts'],{env:{...process.env,COORDINATED_ART_REVIEW_DIR:'test-results/coordinated-art-browser'},encoding:'utf8',timeout:230000,maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());});
