// Owner-reviewed metadata replay only. No backup, restore, upload or cleanup.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {registerVerifiedCopy} from './observation.mjs';
try{
 process.umask(0o077);
 const {values}=parseArgs({options:{manifest:{type:'string'},'expected-sha256':{type:'string'},'owner-reviewed':{type:'boolean'}}});
 assert.equal(values['owner-reviewed'],true);assert.match(values['expected-sha256']??'',/^[a-f0-9]{64}$/);
 const bytes=await readFile(values.manifest);assert.ok(bytes.length<=2000000);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),values['expected-sha256']);
 await registerVerifiedCopy(JSON.parse(bytes),process.env,{replay:true});console.log('COPY_REGISTRATION_REPLAY: PASS');
}catch{console.error('COPY_REGISTRATION_REPLAY: FAIL');process.exitCode=1;}
