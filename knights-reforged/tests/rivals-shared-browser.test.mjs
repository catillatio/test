import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {spawnSync} from 'node:child_process';
test('Attack Rivals shows participating army beneath level/class with shared Bounty styling, responsive navigation and ordinary attacks',{
 skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:240000,
},()=>{const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-rivals-shared.ts'],{encoding:'utf8',env:{...process.env,BROWSER_EXECUTABLE:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'},timeout:230000,maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());});
