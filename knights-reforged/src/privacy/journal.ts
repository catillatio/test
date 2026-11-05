import assert from 'node:assert/strict';
import {lstat,open,readdir,readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {authenticate,intentContract,sha256,type SignedRecord,type ErasureIntent} from './authorization.js';
export const emptyRoot=sha256('kingdom-erasure-journal-v1');
export interface JournalEntry {sequence:number;previous:string;intent:SignedRecord;root:string;}
export interface JournalState {sequence:number;root:string;entries:{entry:JournalEntry;intent:ErasureIntent}[];}
async function privateDirectory(path:string){
 assert.ok(path.startsWith('/'));assert.equal(resolve(path),path);
 const info=await lstat(path);assert.ok(info.isDirectory()&&!info.isSymbolicLink());assert.equal(info.mode&0o077,0);
 assert.equal(await realpath(path),path);
}
function entryRoot(sequence:number,previous:string,intent:SignedRecord){return sha256(JSON.stringify({sequence,previous,intent}));}
export async function readJournal(path:string,publicKey:string):Promise<JournalState>{
 await privateDirectory(path);let root=emptyRoot,sequence=0;const entries:JournalState['entries']=[];
 const files=(await readdir(path)).sort();assert.ok(files.every(f=>/^entry-[0-9]{12}\.json$/.test(f)),'Unexpected erasure journal entry.');
 const operations=new Set(),accounts=new Set();
 for(const file of files){
  const info=await lstat(path+'/'+file);assert.ok(info.isFile()&&!info.isSymbolicLink());assert.equal(info.mode&0o077,0);
  assert.ok(info.size<=24000,'Invalid journal entry.');
  const entry=JSON.parse(await readFile(path+'/'+file,'utf8')) as JournalEntry;
  assert.deepEqual(Object.keys(entry).sort(),['intent','previous','root','sequence']);
  assert.equal(entry.sequence,sequence+1);assert.equal(file,`entry-${String(entry.sequence).padStart(12,'0')}.json`);
  assert.equal(entry.previous,root);assert.equal(entry.root,entryRoot(entry.sequence,root,entry.intent));
  const intent=authenticate(entry.intent,publicKey,intentContract);
  if(entries.length)assert.deepEqual(intent.sourceScope,entries[0]!.intent.sourceScope,'An erasure journal belongs to one source realm.');
  assert.ok(!operations.has(intent.operationId)&&!accounts.has(intent.accountId),'Conflicting erasure intent.');
  operations.add(intent.operationId);accounts.add(intent.accountId);root=entry.root;sequence=entry.sequence;entries.push({entry,intent});
 }
 return {sequence,root,entries};
}
// Caller holds the realm's exclusive writer lock and the protected release mutex.
// O_EXCL prevents a second writer from replacing/committing a different next entry.
// A torn file is deliberately fail-closed; never discard/rewrite it automatically.
export async function appendIntent(path:string,key:string,intent:SignedRecord,expected:Pick<JournalState,'sequence'|'root'>){
 const state=await readJournal(path,key);assert.equal(state.sequence,expected.sequence);assert.equal(state.root,expected.root);
 const parsed=authenticate(intent,key,intentContract),same=state.entries.find(e=>e.intent.operationId===parsed.operationId);
 if(same){assert.deepEqual(same.entry.intent,intent);return state;}
 assert.ok(!state.entries.some(e=>e.intent.accountId===parsed.accountId));
 if(state.entries.length)assert.deepEqual(parsed.sourceScope,state.entries[0]!.intent.sourceScope);
 const sequence=state.sequence+1,entry={sequence,previous:state.root,intent,root:entryRoot(sequence,state.root,intent)};
 const file=await open(path+`/entry-${String(sequence).padStart(12,'0')}.json`,'wx',0o600);
 try{await file.writeFile(JSON.stringify(entry)+'\n');await file.sync();}finally{await file.close();}
 const dir=await open(path,'r');try{await dir.sync();}finally{await dir.close();}
 return {sequence,root:entry.root,entries:[...state.entries,{entry,intent:parsed}]};
}
