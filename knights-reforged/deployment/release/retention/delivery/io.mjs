import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
// Exact per-object HTTPS grants only; no redirects, provider bodies or exceptions
// are propagated. Only absent GET objects may wait. PUT is single-attempt.
export async function readObject(url,{signal,deadline=Date.now()+15000,wait=false,fetcher=globalThis.fetch}={}){
 assert.equal(new URL(url).protocol,'https:');
 for(;;){
  signal?.throwIfAborted();assert.ok(Date.now()<deadline);
  const r=await fetcher(url,{redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(Math.min(15000,deadline-Date.now()))]):AbortSignal.timeout(Math.min(15000,deadline-Date.now()))});
  if(wait&&[403,404].includes(r.status)){await r.body?.cancel();await delay(Math.min(1000,deadline-Date.now()),undefined,{signal});continue;}
  assert.equal(r.status,200);let n=0;const parts=[];
  for await(const b of r.body){n+=b.length;assert.ok(n<=2000000);parts.push(b);}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
 }
}
export async function writeObject(url,value,{signal,fetcher=globalThis.fetch,expectExisting=false}={}){
 assert.equal(new URL(url).protocol,'https:');const body=JSON.stringify(value);assert.ok(Buffer.byteLength(body)<=2000000);
 const r=await fetcher(url,{method:'PUT',redirect:'error',headers:{'if-none-match':'*','content-type':'application/json'},body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
 const status=r.status;await r.body?.cancel();if(expectExisting)assert.equal(status,412);else assert.ok(status>=200&&status<300);
}
