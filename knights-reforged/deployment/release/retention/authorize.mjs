// Owner's OFFLINE workstation only. This dedicated key is never a release key
// and never enters Railway, a GitHub artifact, or the retention runtime.
import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,sign,createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {checkState,hash,retentionProtocol,checkApproval} from './protocol.mjs';
try{
 process.umask(0o077);
 const {values}=parseArgs({options:{scope:{type:'string'},state:{type:'string'},plan:{type:'string'},'private-key':{type:'string'},out:{type:'string'},'release-lock-held':{type:'boolean'}}});
 assert.equal(values['release-lock-held'],true);
 const read=async path=>JSON.parse(await readFile(path,'utf8'));
 const scope=await read(values.scope),state=checkState(await read(values.state),scope),plan=await read(values.plan);
 assert.deepEqual(plan.scope,scope);assert.equal(plan.stateSha256,hash(state));
 const key=createPrivateKey(await readFile(values['private-key'],'utf8'));assert.equal(key.asymmetricKeyType,'ed25519');
 const pub=createPublicKey(key);assert.equal(createHash('sha256').update(pub.export({type:'spki',format:'der'})).digest('hex'),scope.approvalKeyDigest);
 const payload=Buffer.from(JSON.stringify({protocol:retentionProtocol,action:'drop-obsolete-verification-copies',id:randomUUID(),scope,planSha256:hash(plan),stateSha256:hash(state),
  issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+240000).toISOString(),releaseConcurrencyHeld:true}));
 const approval=Buffer.from(JSON.stringify({payload:payload.toString('base64url'),signature:sign(null,payload,key).toString('base64url')})).toString('base64url');
 checkApproval(approval,pub.export({type:'spki',format:'pem'}),plan,state,scope);
 await writeFile(values.out,approval+'\n',{mode:0o600,flag:'wx'});console.log('COPY_RETENTION_AUTHORIZATION: PASS');
}catch{console.error('COPY_RETENTION_AUTHORIZATION: FAIL');process.exitCode=1;}
