// Local configuration checks only. Never import the release controller/worker.
import {createPrivateKey,createPublicKey} from 'node:crypto';

const env=process.env;
let signingKey,privateKeyValid=false,keysMatch=false,backupValid=false;
try{
 signingKey=createPrivateKey(env.KINGDOM_RELEASE_SIGNING_KEY);
 privateKeyValid=signingKey.asymmetricKeyType==='ed25519';
}catch{}
try{
 if(privateKeyValid){
  const derived=createPublicKey(signingKey).export({type:'spki',format:'der'});
  const expected=createPublicKey(env.KINGDOM_RELEASE_VERIFY_KEY).export({type:'spki',format:'der'});
  keysMatch=derived.equals(expected);
 }
}catch{}
try{
 // Dynamic import lets the two key checks still report if dependencies fail.
 const {recoveryStore}=await import('./store.mjs');
 const store=recoveryStore(env);
 try{
  // A syntactically valid synthetic object name; nothing is sent or stored.
  const key='kingdom-releases/'+'0'.repeat(40)+'/gh_1_1_'+'0'.repeat(32)+'/realm.dump.age';
  const url=new URL(await store.grant(key,'PUT'));
  backupValid=url.protocol==='https:'&&url.searchParams.get('X-Amz-Algorithm')==='AWS4-HMAC-SHA256'
   &&url.searchParams.get('X-Amz-Expires')==='3600'
   &&/^[a-f0-9]{64}$/.test(url.searchParams.get('X-Amz-Signature')??'')
   &&(url.searchParams.get('X-Amz-SignedHeaders')??'').split(';').includes('if-none-match');
 }finally{store.close();}
}catch{backupValid=false;}

// Fixed labels and booleans only. Errors and input values never reach stdout.
console.log('SIGNING_KEY_ED25519: '+(privateKeyValid?'PASS':'FAIL'));
console.log('SIGNING_KEY_MATCH: '+(keysMatch?'PASS':'FAIL'));
console.log('BACKUP_STORE_PRESIGN: '+(backupValid?'PASS':'FAIL'));
process.exitCode=privateKeyValid&&keysMatch&&backupValid?0:1;
