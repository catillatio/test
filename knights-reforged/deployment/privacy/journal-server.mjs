// Private read-only relay for the authoritative journal volume. No database,
// signing key, mutation endpoint or public-domain setup belongs in this process.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readJournal} from '../../dist/privacy/journal.js';
export async function createJournalRelay({journalPath,publicKey,readToken,scopeDigest}){
 assert.match(readToken??'',/^[A-Za-z0-9_-]{32,128}$/);assert.match(scopeDigest??'',/^[a-f0-9]{64}$/);
 assert.equal(resolve(journalPath),journalPath);const marker=join(dirname(journalPath),'installation.json');
 const info=await lstat(marker);assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.size<=2048);assert.equal(info.mode&0o077,0);assert.equal(info.uid,process.getuid());assert.equal(await realpath(marker),marker);
 const installed=JSON.parse(await readFile(marker,'utf8'));
 assert.deepEqual(Object.keys(installed).sort(),['protocol','publicKeySha256','scopeSha256']);
 assert.equal(installed.protocol,'kingdom-erasure-journal-installation-v1');assert.equal(installed.scopeSha256,scopeDigest);assert.equal(installed.publicKeySha256,createHash('sha256').update(publicKey).digest('hex'));
 await readJournal(journalPath,publicKey);let active=0;
 const server=createServer({maxHeaderSize:4096,requestTimeout:5000},async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const end=(code,body)=>{res.writeHead(code);res.end(JSON.stringify(body));};
  if(req.method==='GET'&&req.url==='/healthz')return end(200,{status:'ready',service:'private-erasure-journal'});
  if(req.method!=='GET'||req.url!=='/v1/journal'||req.headers['transfer-encoding']||Number(req.headers['content-length']??0)!==0)return end(405,{status:'unavailable'});
  const expected=Buffer.from('Bearer '+readToken),actual=Buffer.from(req.headers.authorization??'');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return end(401,{status:'unavailable'});
  if(active>=4)return end(503,{status:'unavailable'});active++;
  try{
   const state=await readJournal(journalPath,publicKey);
   const body=JSON.stringify({protocol:'kingdom-erasure-journal-snapshot-v1',scopeSha256:scopeDigest,sequence:state.sequence,root:state.root,entries:state.entries.map(item=>item.entry)});
   assert.ok(Buffer.byteLength(body)<=8388608);res.writeHead(200);res.end(body);
  }catch{end(503,{status:'unavailable'});}finally{active--;}
 });
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  assert.equal(process.env.RAILWAY_PROJECT_ID,'41a664f1-06bb-492e-90ef-cfd9635fc67f');assert.equal(process.env.RAILWAY_ENVIRONMENT_ID,'8ced8aef-352e-4ea9-931d-8963ff352c1c');
  const server=await createJournalRelay({journalPath:process.env.KINGDOM_ERASURE_JOURNAL_PATH,publicKey:process.env.KINGDOM_ERASURE_VERIFY_KEY,readToken:process.env.KINGDOM_ERASURE_JOURNAL_READ_TOKEN,scopeDigest:process.env.KINGDOM_ERASURE_SCOPE_DIGEST});
  const port=Number(process.env.PORT??8080);assert.ok(Number.isSafeInteger(port)&&port>0&&port<65536);server.listen(port,'::',()=>console.log('ERASURE_JOURNAL_RELAY: READY_PRIVATE_READ_ONLY'));
 }catch{console.error('ERASURE_JOURNAL_RELAY: STOP');process.exitCode=1;}
}
