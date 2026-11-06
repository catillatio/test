// Private operator tool. No HTTP endpoint, scheduler, secret creation or automatic
// activation. Signed policy + fresh exact-target permit are mandatory on every run.
import assert from 'node:assert/strict';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createDatabase} from '../../dist/db.js';
import {constructGraveyard} from '../../dist/privacy/graveyard.js';
import {authorizeConstruction} from '../../dist/privacy/graveyard-authorization.js';
import {fulfillErasure} from '../../dist/privacy/erasure.js';
import {candidateDigest} from '../release/candidate.mjs';
import {checkImageIdentity} from '../release/image-policy.mjs';
import {authorize} from '../../dist/privacy/authorization.js';
import {assertErasureOperator,assertGraveyardOperator} from '../../dist/privacy/operator.js';
const construction=process.argv[2]==='--construct-graveyard',prefix=construction?'GRAVEYARD_CONSTRUCTION':'ACCOUNT_ERASURE';
let category='DISABLED',db;
try{
 assert.equal(construction?process.env.KINGDOM_GRAVEYARD_CONSTRUCTION_ENABLED:process.env.KINGDOM_ACCOUNT_ERASURE_ENABLED,'1');assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 if(!construction)assert.equal(process.env.KINGDOM_ERASURE_RECONCILIATION_REQUIRED,'1');
 assert.equal(construction?process.env.KINGDOM_GRAVEYARD_OWNER_WINDOW:process.env.KINGDOM_ERASURE_OWNER_WINDOW,'exclusive-production-lock-confirmed');
 assert.equal(process.argv.length,construction?4:3);category='PRIVATE_INPUT';
 const path=resolve(process.argv[construction?3:2]),info=await lstat(path);assert.ok(info.isFile()&&!info.isSymbolicLink());
 assert.equal(await realpath(path),path);assert.equal(info.mode&0o077,0);assert.equal(info.uid,process.getuid());assert.ok(info.size<=100000);
 const input=JSON.parse(await readFile(path,'utf8'));
 assert.deepEqual(Object.keys(input).sort(),construction?['codeSha','permit','policy','publicKey']:['codeSha','intent','journalPath','permit','policy','publicKey']);
 if(!construction)assert.equal(input.journalPath,process.env.KINGDOM_ERASURE_JOURNAL_PATH);assert.equal(input.publicKey,construction?process.env.KINGDOM_GRAVEYARD_VERIFY_KEY:process.env.KINGDOM_ERASURE_VERIFY_KEY);
 assert.equal(input.codeSha,construction?process.env.KINGDOM_GRAVEYARD_CODE_SHA:process.env.KINGDOM_ERASURE_CODE_SHA);
 category='IMMUTABLE_CODE_BINDING';
 const candidate=await candidateDigest();checkImageIdentity(JSON.parse(await readFile(new URL('../image-identity.json',import.meta.url),'utf8')),input.codeSha,candidate);
 category='KINGDOM_COME_TARGET';
 const authorization=construction?authorizeConstruction(input.policy,input.permit,input.publicKey):authorize(input.policy,input.intent,input.permit,input.publicKey);
 assert.equal(process.env.RAILWAY_PROJECT_ID,'41a664f1-06bb-492e-90ef-cfd9635fc67f');
 assert.equal(process.env.RAILWAY_ENVIRONMENT_ID,'8ced8aef-352e-4ea9-931d-8963ff352c1c');
 assert.equal(authorization.policy.scope.projectId,process.env.RAILWAY_PROJECT_ID);assert.equal(authorization.policy.scope.environmentId,process.env.RAILWAY_ENVIRONMENT_ID);
 assert.equal(authorization.policy.scope.gameServiceId,'47a56e8e-aa72-40df-a5c4-0e5feb0f5cdd');
 category='RESTRICTED_CONNECTION';
 const url=new URL(construction?process.env.KINGDOM_GRAVEYARD_DATABASE_URL:process.env.KINGDOM_ACCOUNT_ERASURE_DATABASE_URL);assert.equal(url.username,construction?'kc_graveyard_builder':'kc_account_eraser');
 assert.ok(['postgres:','postgresql:'].includes(url.protocol));assert.ok(url.hostname.endsWith('.railway.internal'));assert.ok(url.password);
 assert.equal(url.search,'');assert.equal(url.hash,'');db=createDatabase(url.href);
 if(construction)await assertGraveyardOperator(db);else await assertErasureOperator(db);
 category='AUTHORIZATION_OR_PRESERVATION';
 if(construction)await constructGraveyard(db,{...input,candidateDigest:candidate,enabled:true});else await fulfillErasure(db,{...input,candidateDigest:candidate,enabled:true});
 console.log(prefix+': VERIFIED');
}catch{console.error(prefix+': STOP '+category);process.exitCode=1;}
finally{if(db)try{await db.end();}catch{console.error(prefix+': STOP CONNECTION_CLEANUP');process.exitCode=1;}}
