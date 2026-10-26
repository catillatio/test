import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {spawnSync} from 'node:child_process';
test('level-100 temporary artwork: every item/property route, actual owned records and full-bleed crops at all four widths',{
 skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:180000,
},()=>{const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-level100-launch.ts'],{env:{...process.env,LEVEL100_ART_REVIEW_DIR:'test-results/level100-beta-browser'},encoding:'utf8',timeout:170000,maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());});
