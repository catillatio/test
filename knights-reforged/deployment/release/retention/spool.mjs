import assert from 'node:assert/strict';
import {access,lstat,readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {uuid} from '../protocol.mjs';
export const packageFiles=Object.freeze(['scope.json','state.json','plan.json','approval.txt']);
export const operationFiles=Object.freeze({retire:packageFiles,'adoption-review':Object.freeze(['scope.json','state.json','manifest.json']),reconcile:Object.freeze(['scope.json','state.json','prior-approval.txt','before.json'])});
// Fixed private handoff, never a public artifact/dispatch payload. Only ENOENT
// of the readiness marker is waited for; corrupt or unsafe inputs fail once.
export async function readPackage(root,id,{operation='retire',deadline=Date.now()+180000,pause=()=>new Promise(resolve=>setTimeout(resolve,1000))}={}){
 assert.ok(Object.hasOwn(operationFiles,operation));const files=operationFiles[operation];
 assert.match(id??'',uuid);const directory=root+'/'+id;
 for(;;){
  try{await access(directory+'/ready.json');break;}
  catch(error){assert.equal(error.code,'ENOENT');assert.ok(Date.now()<deadline);await pause();}
 }
 for(const path of [root,directory]){
  const info=await lstat(path);assert.ok(info.isDirectory()&&!info.isSymbolicLink());assert.equal(info.mode&0o077,0);assert.equal(await realpath(path),path);
 }
 for(const name of [...files,'ready.json']){
  const path=directory+'/'+name,info=await lstat(path);
  assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.size>0&&info.size<=2000000);assert.equal(info.mode&0o077,0);assert.equal(await realpath(path),path);
 }
 const ready=JSON.parse(await readFile(directory+'/ready.json','utf8'));
 assert.deepEqual(Object.keys(ready).sort(),files.slice().sort());
 for(const name of files)assert.equal(createHash('sha256').update(await readFile(directory+'/'+name)).digest('hex'),ready[name]);
 return {directory,state:JSON.parse(await readFile(directory+'/state.json','utf8'))};
}
