// Owner-controlled private signing preparation only. Never run in the game or
// verification worker. Uses the existing Ed25519 proof primitive, creates no key,
// writes no database and uploads nothing. Input policy is an explicit legal act.
import assert from 'node:assert/strict';
import {createPublicKey} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {signProof} from '../release/proof.mjs';
import {writeBaseline} from '../release/retention/journal.mjs';
import {policyContract,intentContract,permitContract,authorize,sha256} from '../../dist/privacy/authorization.js';
async function privateFile(path,max){const absolute=resolve(path),info=await lstat(absolute);assert.ok(info.isFile()&&!info.isSymbolicLink());assert.equal(info.mode&0o077,0);assert.equal(info.uid,process.getuid());assert.equal(await realpath(absolute),absolute);assert.ok(info.size<=max);return readFile(absolute,'utf8');}
try{
 assert.equal(process.argv.length,5);assert.equal(process.env.KINGDOM_ERASURE_POLICY_APPROVED,'1');
 const raw=JSON.parse(await privateFile(process.argv[2],50000)),pem=await privateFile(process.argv[3],2000);
 assert.deepEqual(Object.keys(raw).sort(),['intent','journalPath','permit','policy']);
 assert.ok(typeof raw.journalPath==='string'&&raw.journalPath.startsWith('/'));
 const publicKey=createPublicKey(pem).export({type:'spki',format:'pem'}).toString();
 const signed=payload=>JSON.parse(Buffer.from(signProof(payload,pem),'base64url'));
 const policy=signed(policyContract.parse(raw.policy));
 const intentInput=intentContract.omit({policyDigest:true}).parse(raw.intent);
 const intent=signed(intentContract.parse({...intentInput,policyDigest:sha256(policy.payload)}));
 const permitInput=permitContract.omit({intentDigest:true,policyDigest:true}).parse(raw.permit);
 const permit=signed(permitContract.parse({...permitInput,intentDigest:sha256(intent.payload),policyDigest:sha256(policy.payload)}));
 const checked=authorize(policy,intent,permit,publicKey);
 await writeBaseline(resolve(process.argv[4]),{codeSha:checked.permit.codeSha,policy,intent,permit,journalPath:raw.journalPath,publicKey});
 console.log('ERASURE_APPROVAL_PACKET: SAVED_PRIVATE');
}catch{console.error('ERASURE_APPROVAL_PACKET: STOP; no execution authorized');process.exitCode=1;}
