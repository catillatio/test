import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,stat,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {authorize} from '../dist/privacy/authorization.js';import {emptyRoot} from '../dist/privacy/journal.js';
test('private signing reuses original key, derives authenticated bindings, never overwrites or logs sensitive inputs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'erasure-owner-fixture-'));await chmod(dir,0o700);
 const key=generateKeyPairSync('ed25519'),pem=key.privateKey.export({format:'pem',type:'pkcs8'}).toString(),now=new Date().toISOString();
 const input=join(dir,'review.json'),secret=join(dir,'synthetic.pem'),output=join(dir,'packet.json'),operation=randomUUID();
 const scope={projectId:randomUUID(),environmentId:randomUUID(),gameServiceId:randomUUID(),database:'fixture_test',clusterDigest:'f'.repeat(64)};
 const raw={journalPath:dir,policy:{protocol:'kingdom-erasure-policy-v7',policyId:randomUUID(),repository:'catillatio/test',approved:true,approvedAt:now,sharedRecords:'reference-bound-minimal-integrity-records-v1',backupRecords:'suppress-on-restore-until-protected-backups-expire',journalRetention:'last-relevant-backup-destruction-plus-30-days',personalData:'erase-login-and-minimize-live-estate-v2',integrityReviewDays:30,formerWallet:'sealed-integrity-anchor-no-transfer',unreferencedRecordDisposalGraceDays:30,routineBackupMaximumDays:null,routineBackupTargetDays:30,routineBackupTargetEnforced:false,protectedRecoveryArtifactDays:90,otherProviderRetention:'not-fully-established',protectedBackupReviewDays:30,erasureLedgerGraceDays:30,scope},intent:{protocol:'kingdom-erasure-intent-v7',operationId:operation,accountId:randomUUID(),characterId:randomUUID(),requestId:randomUUID(),sourceScope:scope,personalDataReviewCompleted:true,issuedAt:now},permit:{protocol:'kingdom-erasure-execution-v2',coordinator:{protocol:'kingdom-production-mutex-v1',runId:'123',runAttempt:1,jobId:'456'},mode:'fulfill',operationId:operation,journalSequence:0,journalRoot:emptyRoot,targetDatabase:'fixture_test',targetOid:'100',targetClusterDigest:scope.clusterDigest,candidateDigest:'c'.repeat(64),codeSha:'a'.repeat(40),issuedAt:now,expiresAt:new Date(Date.now()+600000).toISOString(),externalHoldsCleared:true,restoreGuardInstalled:true,independentRecoveryVerified:true,encryptedBackupSha256:'b'.repeat(64),recoveryEvidenceSha256:'d'.repeat(64),recoveryVerifiedAt:now}};
 const run=(env={})=>spawnSync(process.execPath,['deployment/privacy/approve.mjs',input,secret,output],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,KINGDOM_ERASURE_POLICY_APPROVED:'1',...env}});
 try{
  await writeFile(input,JSON.stringify(raw),{mode:0o600});await writeFile(secret,pem,{mode:0o600});
  const result=run();assert.equal(result.status,0);assert.equal(result.stdout,'ERASURE_APPROVAL_PACKET: SAVED_PRIVATE\n');assert.equal(result.stderr,'');
  const bytes=await readFile(output,'utf8'),packet=JSON.parse(bytes);assert.ok(!bytes.includes('PRIVATE KEY'));assert.ok(!bytes.includes(pem));assert.equal((await stat(output)).mode&0o077,0);
  const proof=authorize(packet.policy,packet.intent,packet.permit,packet.publicKey);assert.equal(proof.intent.accountId,raw.intent.accountId);assert.equal(packet.publicKey,key.publicKey.export({format:'pem',type:'spki'}).toString());
  assert.equal(run().status,1);assert.equal(await readFile(output,'utf8'),bytes,'Uncertain existing packets are never replaced');
  const denied=run({KINGDOM_ERASURE_POLICY_APPROVED:'0'});assert.equal(denied.status,1);assert.equal(denied.stdout,'');assert.equal(denied.stderr,'ERASURE_APPROVAL_PACKET: STOP; no execution authorized\n');
  assert.equal(await readFile(secret,'utf8'),pem);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('private operator remains disabled before reading private input or attempting a database connection',()=>{
 const result=spawnSync(process.execPath,['deployment/privacy/fulfill.mjs','/missing-private-input'],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});
 assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'ACCOUNT_ERASURE: STOP DISABLED\n');
});

test('separate public-roster approval contains no donor intent/journal and cannot be enabled by the erasure flag',async()=>{
 const {graveyardDefinitionDigest}=await import('../dist/privacy/graveyard-roster.js');const {authorizeConstruction}=await import('../dist/privacy/graveyard-authorization.js');
 const dir=await mkdtemp(join(tmpdir(),'graveyard-approval-'));await chmod(dir,0o700);
 const key=generateKeyPairSync('ed25519'),secret=join(dir,'synthetic.pem'),input=join(dir,'input.json'),output=join(dir,'output.json'),now=new Date().toISOString();
 const scope={projectId:randomUUID(),environmentId:randomUUID(),gameServiceId:randomUUID(),database:'fixture_test',clusterDigest:'a'.repeat(64)};
 const raw={policy:{protocol:'kingdom-graveyard-population-policy-v1',policyId:randomUUID(),repository:'catillatio/test',approved:true,approvedAt:now,scope,definitionDigest:graveyardDefinitionDigest(),targetPopulation:12,maximumPopulation:12,maximumNewPerOperation:6},permit:{protocol:'kingdom-graveyard-construction-v2',operationId:randomUUID(),definitionDigest:graveyardDefinitionDigest(),catalogId:'alpha-0.3',scope,codeSha:'a'.repeat(40),candidateDigest:'b'.repeat(64),targetDatabase:scope.database,targetOid:'100',targetClusterDigest:scope.clusterDigest,expectedPopulation:0,expectedOperationCount:0,slots:[0,1,2,3,4,5],issuedAt:now,expiresAt:new Date(Date.now()+600000).toISOString(),externalHoldsCleared:true,restoreGuardInstalled:true,independentRecoveryVerified:true,encryptedBackupSha256:'d'.repeat(64),recoveryEvidenceSha256:'e'.repeat(64),recoveryVerifiedAt:now}};
 try{
  await writeFile(secret,key.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});await writeFile(input,JSON.stringify(raw),{mode:0o600});
  const r=spawnSync(process.execPath,['deployment/privacy/approve.mjs','--construct-graveyard',input,secret,output],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,KINGDOM_GRAVEYARD_POLICY_APPROVED:'1'}});
  assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'GRAVEYARD_APPROVAL_PACKET: SAVED_PRIVATE\n');assert.equal(r.stderr,'');
  const packet=JSON.parse(await readFile(output,'utf8'));assert.deepEqual(Object.keys(packet).sort(),['codeSha','permit','policy','publicKey']);
  assert.equal(authorizeConstruction(packet.policy,packet.permit,packet.publicKey).permit.expectedPopulation,0);
  const denied=spawnSync(process.execPath,['deployment/privacy/fulfill.mjs','--construct-graveyard','/missing-private-input'],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,KINGDOM_ACCOUNT_ERASURE_ENABLED:'1'}});
  assert.equal(denied.status,1);assert.equal(denied.stdout,'');assert.equal(denied.stderr,'GRAVEYARD_CONSTRUCTION: STOP DISABLED\n');
 }finally{await rm(dir,{recursive:true,force:true});}
});
