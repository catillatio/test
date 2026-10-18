import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {candidateDigest} from './candidate.mjs';
import {uuid,digest,sha,privateDatabase,copyName,httpsOrigin} from './protocol.mjs';

export function signProof(payload,pem){
 const key=pem?.type==='private'?pem:createPrivateKey(pem);assert.equal(key.asymmetricKeyType,'ed25519');
 const data=Buffer.from(JSON.stringify(payload));
 return Buffer.from(JSON.stringify({payload:data.toString('base64url'),signature:sign(null,data,key).toString('base64url')})).toString('base64url');
}
export function verifyProof(encoded,pem,env,actualCandidate,{now=Date.now()}={}){
 assert.match(encoded??'',/^[A-Za-z0-9_-]{1,24000}$/,'A signed verified-backup approval is required.');
 const envelope=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
 assert.match(envelope.payload??'',/^[A-Za-z0-9_-]{1,20000}$/);assert.match(envelope.signature??'',/^[A-Za-z0-9_-]{86}$/);
 assert.ok(typeof pem==='string'&&pem.trimStart().startsWith('-----BEGIN PUBLIC KEY-----'),'Railway must receive only the public verification key.');
 const key=createPublicKey(pem);assert.equal(key.asymmetricKeyType,'ed25519');
 const bytes=Buffer.from(envelope.payload,'base64url');
 assert.ok(verify(null,bytes,key,Buffer.from(envelope.signature,'base64url')),'Invalid release approval signature.');
 const proof=JSON.parse(bytes.toString('utf8'));
 assert.equal(proof.protocol,'kingdom-release-proof-v2');assert.equal(proof.repository,'catillatio/test');assert.equal(proof.branch,'release/production');assert.equal(proof.approvalEnvironment,'production');
 assert.match(proof.sha,sha);assert.equal(proof.sha,env.KINGDOM_RELEASE_SHA);assert.equal(proof.candidateDigest,actualCandidate);
 for(const [key,variable] of [['projectId','RAILWAY_PROJECT_ID'],['environmentId','RAILWAY_ENVIRONMENT_ID'],['gameServiceId','RAILWAY_SERVICE_ID']]){assert.match(proof[key],uuid);assert.equal(proof[key],env[variable]);}
 assert.equal(httpsOrigin(proof.origin),httpsOrigin(env.APP_ORIGIN));
 const source=privateDatabase(env.DATABASE_URL),restore=privateDatabase(env.KINGDOM_RESTORE_DATABASE_URL);
 assert.equal(proof.sourceHost,source.host);assert.equal(proof.sourceDatabase,source.name);assert.equal(proof.restoreHost,restore.host);assert.notEqual(source.host,restore.host);
 assert.equal(proof.copy,copyName(proof.jobId));assert.equal(proof.copy,env.KINGDOM_RESTORE_TEST_DATABASE);
 assert.match(proof.backupSha256,digest);assert.match(proof.encryptedSha256,digest);assert.match(proof.preservationSha256,digest);
 assert.ok(Number.isSafeInteger(proof.backupBytes)&&proof.backupBytes>100000);assert.equal(proof.independentRecoveryVerified,true);
 assert.match(String(proof.artifactId),/^[1-9][0-9]{0,24}$/);assert.equal(proof.backupKeyVerified,true);
 assert.ok(Date.parse(proof.issuedAt)<=now+60000&&Date.parse(proof.expiresAt)>now&&Date.parse(proof.expiresAt)-Date.parse(proof.issuedAt)<=7200000,'Release approval expired. Rehearse and verify a fresh backup.');
 return proof;
}
export async function requireReleaseProof(env=process.env){
 if(env.KINGDOM_AUTOMATED_RELEASES===undefined||env.KINGDOM_AUTOMATED_RELEASES==='0')return null;
 assert.equal(env.KINGDOM_AUTOMATED_RELEASES,'1');assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 assert.equal(env.KINGDOM_RELEASE_WORKER,undefined,'The game service cannot be a verification worker.');
 try{return verifyProof(env.KINGDOM_RELEASE_BACKUP_PROOF,env.KINGDOM_RELEASE_VERIFY_KEY,env,await candidateDigest());}
 catch{throw new Error('A current signed approval for the independently retained backup and exact candidate is required. No production migration was authorized.');}
}
