import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

test('Phase 5.1B approved Land and CURRENT equipment: responsive authenticated views and saved-record preservation',{
 skip:!process.env.TEST_DATABASE_URL||!existsSync(process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium'),timeout:240000,
},()=>{
 for(const script of ['scripts/browser-phase51b-art.ts','scripts/browser-phase51b-equipment.ts']){
  const result=spawnSync(process.execPath,['--import','tsx',script,'--verify-only'],{encoding:'utf8',timeout:110000,maxBuffer:8*1024*1024});
  assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());
 }
});
