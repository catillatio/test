import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {spawnSync} from 'node:child_process';
test('historical priority fixes render real equipment and Land at four widths and a text/DPR stress size',{
 skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:240000,
},()=>{const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-historical-priority.ts'],{env:{...process.env,BROWSER_EXECUTABLE:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'},encoding:'utf8',timeout:230000,maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());});
