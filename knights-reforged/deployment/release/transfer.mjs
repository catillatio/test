import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {stat} from 'node:fs/promises';
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
export async function getReport(url,{wait=false,deadline=Date.now()+1200000}={}){
 httpsOnly(url);
 for(;;){
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(response.status===404&&wait&&Date.now()<deadline){await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,3000));continue;}
  assert.equal(response.status,200,'The private verification job did not produce a successful report.');
  const pieces=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;assert.ok(bytes<=100000,'Verification report is too large.');pieces.push(chunk);}
  return JSON.parse(Buffer.concat(pieces).toString('utf8'));
 }
}
