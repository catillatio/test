// Explicit one-time installation only. No database connection, private key,
// overwrite, ownership change, deployment or account operation is performed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,realpath,mkdir,open} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {authenticate,policyContract} from '../../dist/privacy/authorization.js';
import {candidateDigest} from '../release/candidate.mjs';
import {checkImageIdentity} from '../release/image-policy.mjs';
try{
 assert.equal(process.env.KINGDOM_ERASURE_JOURNAL_INITIALIZE_APPROVED,'initialize-private-erasure-journal');
 assert.equal(process.env.RAILWAY_PROJECT_ID,'41a664f1-06bb-492e-90ef-cfd9635fc67f');assert.equal(process.env.RAILWAY_ENVIRONMENT_ID,'8ced8aef-352e-4ea9-931d-8963ff352c1c');
 assert.ok(!process.env.DATABASE_URL&&!process.env.KINGDOM_ACCOUNT_ERASURE_DATABASE_URL,'Installation must precede database credentials.');
 assert.equal(process.argv.length,3);const inputPath=process.argv[2],info=await lstat(inputPath);
 assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.uid===process.getuid()&&info.size<=100000);assert.equal(info.mode&0o077,0);assert.equal(await realpath(inputPath),inputPath);
 const input=JSON.parse(await readFile(inputPath,'utf8'));assert.equal(input.publicKey,process.env.KINGDOM_ERASURE_VERIFY_KEY);
 const policy=authenticate(input.policy,input.publicKey,policyContract);assert.ok(Date.parse(policy.approvedAt)<=Date.now());
 assert.equal(policy.scope.projectId,process.env.RAILWAY_PROJECT_ID);assert.equal(policy.scope.environmentId,process.env.RAILWAY_ENVIRONMENT_ID);assert.equal(policy.scope.gameServiceId,'47a56e8e-aa72-40df-a5c4-0e5feb0f5cdd');
 checkImageIdentity(JSON.parse(await readFile(new URL('../image-identity.json',import.meta.url),'utf8')),input.codeSha,await candidateDigest());
 const path='/run/kingdom-erasure/private/journal';assert.equal(process.env.KINGDOM_ERASURE_JOURNAL_PATH,path);assert.equal(input.journalPath,path);
 const mount='/run/kingdom-erasure';const mounts=await readFile('/proc/self/mountinfo','utf8');assert.ok(mounts.split('\n').some(line=>line.split(' ')[4]===mount),'Dedicated journal mount required.');
 const mounted=await lstat(mount);assert.ok(mounted.isDirectory()&&!mounted.isSymbolicLink());assert.equal(await realpath(mount),mount);
 await mkdir(dirname(path),{mode:0o700});await mkdir(path,{mode:0o700});
 const privateInfo=await lstat(dirname(path));assert.equal(privateInfo.uid,process.getuid());assert.equal(privateInfo.mode&0o077,0);
 const marker=await open(join(dirname(path),'installation.json'),'wx',0o600);
 try{await marker.writeFile(JSON.stringify({protocol:'kingdom-erasure-journal-installation-v1',scopeSha256:createHash('sha256').update(JSON.stringify(policy.scope)).digest('hex'),publicKeySha256:createHash('sha256').update(input.publicKey).digest('hex')})+'\n');await marker.sync();}finally{await marker.close();}
 const parent=await open(dirname(path),'r');try{await parent.sync();}finally{await parent.close();}
 console.log('ERASURE_JOURNAL_INITIALIZATION: INSTALLED_EMPTY');
}catch{console.error('ERASURE_JOURNAL_INITIALIZATION: STOP; no retry or overwrite authorized');process.exitCode=1;}
