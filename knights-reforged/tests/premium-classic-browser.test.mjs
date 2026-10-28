import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {spawnSync} from 'node:child_process';
test('premium classic system preserves gameplay forms, artwork and usable responsive screens',{
 skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:300000,
},()=>{const r=spawnSync(process.execPath,['--import','tsx','scripts/browser-premium-classic.ts','--evidence'],{encoding:'utf8',env:{...process.env,BROWSER_EXECUTABLE:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'},timeout:290000,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());});
