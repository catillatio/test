import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
test('Hudson artwork and unchanged classic layouts render across Armory, owned/public inventories and saved battles at four widths',{
 skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:180000,
},()=>{
 const result=spawnSync(process.execPath,['--import','tsx','scripts/browser-equipment-cleanup.ts'],{env:{...process.env,EQUIPMENT_CLEANUP_REVIEW_DIR:'test-results/equipment-cleanup-browser'},encoding:'utf8',timeout:170000,maxBuffer:4*1024*1024});
 assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());
});
