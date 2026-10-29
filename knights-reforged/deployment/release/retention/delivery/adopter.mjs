// Only this distinct bounded process can receive the maintenance superuser reference.
import assert from 'node:assert/strict';
import pg from 'pg';
import {pathToFileURL} from 'node:url';
import {frame,input,verifyArm,makeReceipt} from './protocol.mjs';
import {hash} from '../protocol.mjs';
import {privateDatabase} from '../../protocol.mjs';
import {imageIdentity} from './image.mjs';
import {readObject,writeObject} from './io.mjs';
import {liveGuards} from '../guards.mjs';
import {ownerReview} from './approval.mjs';
import {performAdoption} from './adoption-operation.mjs';
export function adopterConnection(env,f){
 const connection=new URL('postgresql://placeholder:placeholder@localhost:5432/');
 connection.hostname=env.KINGDOM_RETENTION_ADOPTER_DB_HOST;connection.username=encodeURIComponent(env.KINGDOM_RETENTION_ADOPTER_DB_USER);connection.password=encodeURIComponent(env.KINGDOM_RETENTION_ADOPTER_DB_PASSWORD);connection.pathname='/'+encodeURIComponent(env.KINGDOM_RETENTION_ADOPTER_DB_NAME);
 for(const key of ['HOST','USER','PASSWORD','NAME'])assert.ok(env['KINGDOM_RETENTION_ADOPTER_DB_'+key]);
 const target=privateDatabase(connection.href);assert.equal(target.host,f.scope.host);assert.equal(target.name,f.scope.adminDatabase);
 return target;
}
export async function runAdopter({env=process.env,clientFactory=url=>new pg.Client({connectionString:url,connectionTimeoutMillis:5000,query_timeout:15000}),image,fetcher=globalThis.fetch,signal}={}){
 image??=await imageIdentity();
 assert.notEqual(process.getuid(),0);assert.equal(env.NODE_ENV,'production');assert.equal(env.KINGDOM_RETENTION_ADOPTER_ENABLED,'1');
 assert.equal(image.role,'adopter');assert.ok(!env.NODE_OPTIONS&&!env.NODE_TLS_REJECT_UNAUTHORIZED);
 for(const [k,v] of Object.entries(env))if((/DATABASE_URL/.test(k))||/SIGNING_KEY|STORE_.*KEY|^RAILWAY_(TOKEN|API_TOKEN)$|^PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SERVICE|OPTIONS|SSLMODE)$/.test(k))assert.ok(!v);
 const raw=Buffer.from(env.KINGDOM_RETENTION_JOB??'','base64url');assert.ok(raw.length>0&&raw.length<=100000);
 const f=frame(JSON.parse(raw),env,'adopter');assert.equal(f.codeDigest,image.codeDigest);
 const target=adopterConnection(env,f);
 const deadline=Date.parse(f.expiresAt),control=new AbortController(),combined=signal?AbortSignal.any([signal,control.signal]):control.signal;
 const timeout=setTimeout(()=>control.abort(),Math.max(1,deadline-Date.now()));let client,timer,checking=false;
 const guards=liveGuards(f.scope,{githubToken:f.githubToken,fetcher}),io={fetcher,signal:combined,deadline,wait:true};
 const check=async()=>{combined.throwIfAborted();assert.ok(Date.now()<deadline);await guards.coordinated({coordinator:f.coordinator});combined.throwIfAborted();};
 try{
  await check();timer=setInterval(async()=>{if(checking)return;checking=true;try{await check();}catch{control.abort();}finally{checking=false;}},5000);
  await writeObject(f.urls.readyPut,makeReceipt(f,env.RAILWAY_DEPLOYMENT_ID,'ready'),io);
  const arm=await readObject(f.urls.armGet,io),data=input(await readObject(f.urls.inputGet,io),f),digest=hash(data);
  assert.equal(verifyArm(arm,f,env.RAILWAY_DEPLOYMENT_ID),digest);
  const approved=()=>ownerReview(f.coordinator,f.requestId,digest,{githubToken:f.githubToken,fetcher,purpose:'adoption'});
  await approved();await check();client=clientFactory(target.url.href);client.on('error',()=>control.abort());await client.connect();
  const result=await performAdoption(client,{f,data,signal:combined,guards,ownerApproved:approved,durableIntent:async before=>{
   await writeObject(f.urls.baselinePut,before,io);assert.equal(hash(await readObject(f.urls.baselineGet,io)),hash(before));
   const proceed=await readObject(f.urls.proceedGet,io);assert.equal(verifyArm(proceed,f,env.RAILWAY_DEPLOYMENT_ID,hash(before)),digest);
   await check();
  }});
  await writeObject(f.urls.resultPut,{receipt:makeReceipt(f,env.RAILWAY_DEPLOYMENT_ID,'completed',digest),...result},io);
  return {passed:true};
 }finally{clearTimeout(timeout);if(timer)clearInterval(timer);if(client)await client.end().catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const c=new AbortController();process.once('SIGTERM',()=>c.abort());process.once('SIGINT',()=>c.abort());
 // Independent hard exit bounds credential-bearing processes even after cancellation.
 const hard=setTimeout(()=>process.exit(1),900000);hard.unref();
 try{if(process.env.KINGDOM_RETENTION_ADOPTER_ENABLED==='0'){assert.ok(!process.env.KINGDOM_RETENTION_JOB);for(const [k,v] of Object.entries(process.env))if(/DATABASE_URL|ADOPTER_DB_|SIGNING_KEY|STORE_.*KEY|^RAILWAY_(TOKEN|API_TOKEN)$/.test(k))assert.ok(!v);console.log('RETENTION_ADOPTER: DISABLED');}
 else{await runAdopter({signal:c.signal});console.log('RETENTION_ADOPTER: PASS');}}
 catch{console.error('RETENTION_ADOPTER: FAIL — reconcile; no retry');process.exitCode=1;}
}
