// Private operator tool. No HTTP endpoint, scheduler, secret creation or automatic
// activation. Signed policy + fresh exact-target permit are mandatory on every run.
import assert from 'node:assert/strict';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createDatabase} from '../../dist/db.js';
import {fulfillErasure} from '../../dist/privacy/erasure.js';
import {candidateDigest} from '../release/candidate.mjs';
import {checkImageIdentity} from '../release/image-policy.mjs';
import {authorize} from '../../dist/privacy/authorization.js';
import {assertErasureOperator} from '../../dist/privacy/operator.js';
let category='DISABLED',db;
try{
 assert.equal(process.env.KINGDOM_ACCOUNT_ERASURE_ENABLED,'1');assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 assert.equal(process.env.KINGDOM_ERASURE_RECONCILIATION_REQUIRED,'1');
 assert.equal(process.env.KINGDOM_ERASURE_OWNER_WINDOW,'exclusive-production-lock-confirmed');
 assert.equal(process.argv.length,3);category='PRIVATE_INPUT';
 const path=resolve(process.argv[2]),info=await lstat(path);assert.ok(info.isFile()&&!info.isSymbolicLink());
 assert.equal(await realpath(path),path);assert.equal(info.mode&0o077,0);assert.equal(info.uid,process.getuid());assert.ok(info.size<=100000);
 const input=JSON.parse(await readFile(path,'utf8'));
 assert.deepEqual(Object.keys(input).sort(),['codeSha','intent','journalPath','permit','policy','publicKey']);
 assert.equal(input.journalPath,process.env.KINGDOM_ERASURE_JOURNAL_PATH);assert.equal(input.publicKey,process.env.KINGDOM_ERASURE_VERIFY_KEY);
 assert.equal(input.codeSha,process.env.KINGDOM_ERASURE_CODE_SHA);
 category='IMMUTABLE_CODE_BINDING';
 const candidate=await candidateDigest();checkImageIdentity(JSON.parse(await readFile(new URL('../image-identity.json',import.meta.url),'utf8')),input.codeSha,candidate);
 category='KINGDOM_COME_TARGET';
 const authorization=authorize(input.policy,input.intent,input.permit,input.publicKey);
 assert.equal(process.env.RAILWAY_PROJECT_ID,'41a664f1-06bb-492e-90ef-cfd9635fc67f');
 assert.equal(process.env.RAILWAY_ENVIRONMENT_ID,'8ced8aef-352e-4ea9-931d-8963ff352c1c');
 assert.equal(authorization.policy.scope.projectId,process.env.RAILWAY_PROJECT_ID);assert.equal(authorization.policy.scope.environmentId,process.env.RAILWAY_ENVIRONMENT_ID);
 assert.equal(authorization.policy.scope.gameServiceId,'47a56e8e-aa72-40df-a5c4-0e5feb0f5cdd');
 category='RESTRICTED_CONNECTION';
 const url=new URL(process.env.KINGDOM_ACCOUNT_ERASURE_DATABASE_URL);assert.equal(url.username,'kc_account_eraser');
 assert.ok(['postgres:','postgresql:'].includes(url.protocol));assert.ok(url.hostname.endsWith('.railway.internal'));assert.ok(url.password);
 assert.equal(url.search,'');assert.equal(url.hash,'');db=createDatabase(url.href);
 await assertErasureOperator(db);
 category='AUTHORIZATION_OR_PRESERVATION';
 await fulfillErasure(db,{...input,candidateDigest:candidate,enabled:true});
 console.log('ACCOUNT_ERASURE: VERIFIED');
}catch{console.error('ACCOUNT_ERASURE: STOP '+category);process.exitCode=1;}
finally{if(db)try{await db.end();}catch{console.error('ACCOUNT_ERASURE: STOP CONNECTION_CLEANUP');process.exitCode=1;}}
