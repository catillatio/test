import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Trusted private producer only. Publish last, once the actual operation commits.
export async function publishReady(path,files){
 const hashes={};for(const [name,file] of Object.entries(files))hashes[name]=createHash('sha256').update(await readFile(file)).digest('hex');
 const text=JSON.stringify(hashes)+'\n';
 try{await writeFile(path,text,{mode:0o600,flag:'wx'});}catch(error){assert.equal(error.code,'EEXIST');assert.equal(await readFile(path,'utf8'),text);}
}
