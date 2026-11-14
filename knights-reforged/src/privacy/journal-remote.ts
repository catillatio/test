import assert from 'node:assert/strict';
import {verifyJournalEntries,type JournalState} from './journal.js';
import {sha256} from './authorization.js';
export interface JournalReader {journalUrl:string;journalToken:string;journalScope:string;publicKey:string;fetcher?:typeof fetch;}
// Owner-configured private Railway service only. Never send the read credential
// to a public host, accept redirects, or fall back to a stale filesystem copy.
export async function readRemoteJournal(options:JournalReader):Promise<JournalState>{
 const url=new URL(options.journalUrl);
 assert.ok(['http:','https:'].includes(url.protocol)&&url.hostname.endsWith('.railway.internal'));
 assert.equal(url.pathname,'/v1/journal');assert.ok(!url.username&&!url.password&&!url.search&&!url.hash);
 assert.match(options.journalToken,/^[A-Za-z0-9_-]{32,128}$/);assert.match(options.journalScope,/^[a-f0-9]{64}$/);
 const response=await (options.fetcher??fetch)(url.href,{method:'GET',headers:{authorization:'Bearer '+options.journalToken,accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
 assert.equal(response.status,200,'Independent journal is unavailable.');
 assert.ok(response.headers.get('content-type')?.startsWith('application/json'));
 const parts:Uint8Array[]=[];let bytes=0;
 try{assert.ok(response.body);for await(const part of response.body as any){bytes+=part.length;assert.ok(bytes<=8388608,'Journal reader capacity exceeded.');parts.push(part);}}
 catch(error){await response.body?.cancel().catch(()=>{});throw error;}
 const snapshot=JSON.parse(Buffer.concat(parts).toString('utf8'));
 assert.deepEqual(Object.keys(snapshot).sort(),['entries','protocol','root','scopeSha256','sequence']);
 assert.equal(snapshot.protocol,'kingdom-erasure-journal-snapshot-v1');assert.equal(snapshot.scopeSha256,options.journalScope);
 const state=verifyJournalEntries(snapshot.entries,options.publicKey);assert.equal(snapshot.sequence,state.sequence);assert.equal(snapshot.root,state.root);
 for(const entry of state.entries)assert.equal(sha256(JSON.stringify(entry.intent.sourceScope)),options.journalScope,'Journal belongs to another source realm.');
 return state;
}
