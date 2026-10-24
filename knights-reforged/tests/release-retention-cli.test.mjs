import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {keys,publicKey,scope,scenario} from './fixtures/release-retention.mjs';
import {checkApproval} from '../deployment/release/retention/protocol.mjs';
import {makePlan} from '../deployment/release/retention/retention.mjs';

test('entrypoints fail with fixed categories and never expose credentials, keys or parser exceptions',()=>{
 for(const [name,label,args]of[['cli','COPY_RETENTION',[]],['cli','COPY_RETENTION',['cleanup','--scope','missing-secret-file']],['register','COPY_PROVENANCE_IMPORT',[]],['authorize','COPY_RETENTION_AUTHORIZATION',[]],['permit','COPY_RETENTION_PERMIT',[]]]){
  const result=spawnSync(process.execPath,['deployment/release/retention/'+name+'.mjs',...args],{encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'production',DATABASE_URL:'SYNTHETIC_SECRET_MUST_NOT_APPEAR',KINGDOM_RETENTION_SIGNING_KEY:'SYNTHETIC_SECRET_MUST_NOT_APPEAR'},timeout:5000});
  assert.equal(result.error,undefined);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,label+': FAIL\n');
 }
});
test('offline owner authorization produces a scoped four-minute permit; exclusive output protects old files',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'copy-retention-signing-'));
 try{
  const {snapshot,state}=scenario(undefined,Date.now());
  const plan=makePlan(snapshot,state,scope);
  for(const [name,value]of[['scope',scope],['state',state],['plan',plan]])await writeFile(join(folder,name+'.json'),JSON.stringify(value),{mode:0o600});
  const keyFile=join(folder,'private.pem'),out=join(folder,'approval.txt');await writeFile(keyFile,keys.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  const args=['deployment/release/retention/authorize.mjs','--scope',join(folder,'scope.json'),'--state',join(folder,'state.json'),'--plan',join(folder,'plan.json'),'--private-key',keyFile,'--release-lock-held','--out',out];
  const run=()=>spawnSync(process.execPath,args,{encoding:'utf8',env:{PATH:process.env.PATH},timeout:5000});
  const result=run();assert.equal(result.status,0);assert.equal(result.stdout,'COPY_RETENTION_AUTHORIZATION: PASS\n');assert.equal(result.stderr,'');
  const encoded=(await readFile(out,'utf8')).trim(),approval=checkApproval(encoded,publicKey,plan,state,scope);
  assert.equal(Date.parse(approval.expiresAt)-Date.parse(approval.issuedAt),240000);assert.equal((await stat(out)).mode&0o777,0o600);
  const repeated=run();assert.equal(repeated.status,1);assert.equal(repeated.stderr,'COPY_RETENTION_AUTHORIZATION: FAIL\n');assert.equal((await readFile(out,'utf8')).trim(),encoded);
 }finally{await rm(folder,{recursive:true,force:true});}
});
