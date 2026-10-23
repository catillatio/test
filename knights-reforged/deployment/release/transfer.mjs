import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {stat} from 'node:fs/promises';
import timers from 'node:timers/promises';
const httpsOnly=url=>{const target=new URL(url);assert.equal(target.protocol,'https:');assert.ok(!target.username&&!target.password);};

export async function fileDigest(path){
 const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
 return {sha256:hash.digest('hex'),bytes:(await stat(path)).size};
}
// All URLs are exact per-object, short-lived SigV4 grants. Redirects are fatal:
// never forward backup data or authorization to an unexpected destination.
export async function putFile(url,path,{verifyExisting=false}={}){
 httpsOnly(url);
 const size=(await stat(path)).size;
 const response=await fetch(url,{method:'PUT',redirect:'error',headers:{'if-none-match':'*','content-type':'application/octet-stream','content-length':String(size)},body:createReadStream(path),duplex:'half',signal:AbortSignal.timeout(600000)});
 const status=response.status;await response.body?.cancel();
 if(verifyExisting)assert.equal(status,412,'Recovery storage did not enforce conditional writes; promotion stopped.');
 else assert.ok(status>=200&&status<300,'Private recovery upload failed; promotion stopped.');
}
export async function putReport(url,report){
 httpsOnly(url);
 const response=await fetch(url,{method:'PUT',redirect:'error',headers:{'if-none-match':'*','content-type':'application/json'},body:JSON.stringify(report),signal:AbortSignal.timeout(30000)});
 const accepted=response.ok;await response.body?.cancel();assert.ok(accepted,'Private verification report upload failed.');
}
export async function getFile(url,path,expected){
 httpsOnly(url);
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(600000)});
 assert.equal(response.status,200,'Independent backup download failed.');
 const length=response.headers.get('content-length');if(length!==null)assert.equal(Number(length),expected.bytes,'Truncated recovery response.');
 let size=0;const hash=createHash('sha256');
 const bounded=new Transform({transform(chunk,encoding,callback){
  size+=chunk.length;if(size>expected.bytes)return callback(new Error('Recovery file exceeds its verified length.'));
  hash.update(chunk);callback(null,chunk);
 }});
 await pipeline(Readable.fromWeb(response.body),bounded,createWriteStream(path,{flags:'wx',mode:0o600}));
 assert.equal(size,expected.bytes);assert.equal(hash.digest('hex'),expected.sha256,'Independent recovery checksum mismatch.');
}
// S3 can return 403 for an absent key when ListBucket is not granted. A 403
// alone cannot distinguish readiness from denied access or an invalid signature.
// Only this exact report GET may wait on it; it never counts as evidence.
export async function getReport(url,{wait=false,deadline=Date.now()+1200000,signal,onStatus=()=>{}}={}){
 httpsOnly(url);
 assert.ok(Number.isFinite(deadline));
 const end=Math.min(deadline,Date.now()+1200000),seen=new Set();
 const status=code=>{if(!seen.has(code)){seen.add(code);onStatus(code);}};
 const fail=code=>{status(code);throw new Error('The private verification report could not be retrieved.');};
 const check=()=>{if(signal?.aborted)fail('ABORTED');if(Date.now()>=end)fail('DEADLINE');};
 for(;;){
  check();
  const attempt=AbortSignal.timeout(Math.min(15000,end-Date.now()));
  let response;
  try{response=await fetch(url,{redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,attempt]):attempt});}
  catch{check();fail('TRANSPORT_FAILURE');}
  const httpStatus=response.status;
  if(httpStatus!==200){
   await response.body?.cancel();
   // Only a captured integer can enter diagnostics: never coerce provider data.
   status(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?'HTTP_'+httpStatus:'HTTP_OTHER');
   check();
   if(wait&&(httpStatus===403||httpStatus===404)){
    // Keep the existing 3-second cadence and 20-minute maximum. Reuse the
    // original grant; never extend its lifetime, re-sign, or inspect error bodies.
    try{await timers.setTimeout(Math.min(3000,end-Date.now()),undefined,{signal});}
    catch{check();fail('TRANSPORT_FAILURE');}
    continue;
   }
   fail('HTTP_REJECTED');
  }
  const pieces=[];let bytes=0;
  try{
   check();
   for await(const chunk of response.body){
    check();bytes+=chunk.length;
    if(bytes>100000)fail('REPORT_TOO_LARGE');
    pieces.push(chunk);
   }
  }catch{check();fail('BODY_REJECTED');}
  check();
  let report;try{report=JSON.parse(Buffer.concat(pieces).toString('utf8'));}catch{fail('INVALID_JSON');}
  status('JSON_RECEIVED');
  // Parsing is not approval. The controller still requires checkJobReport,
  // independent deployment identity, ciphertext export and every later gate.
  return report;
 }
}
