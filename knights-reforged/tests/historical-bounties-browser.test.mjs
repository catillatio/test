import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {spawnSync} from 'node:child_process';
test('historical bounty board, profile, placement, confirmation and result remain usable at mobile widths and enlarged text',{
 skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:180000,
},()=>{const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-historical-bounties.ts'],{env:{...process.env,BROWSER_EXECUTABLE:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'},encoding:'utf8',timeout:170000,maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());});
