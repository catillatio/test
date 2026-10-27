import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,chmod,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {readPackage,packageFiles,operationFiles} from '../deployment/release/retention/spool.mjs';
async function fixture(run,operation="retire"){
 const root=await mkdtemp(join(tmpdir(),'retention-private-spool-')),id=randomUUID(),directory=root+'/'+id;await mkdir(directory,{mode:0o700});
 const values={'scope.json':'{}','state.json':JSON.stringify({coordinator:{runId:'999',runAttempt:1}}),'plan.json':'{}','approval.txt':'synthetic-signature-not-a-credential','manifest.json':'{}','prior-approval.txt':randomUUID(),'before.json':'{}'};
 const hashes={};for(const name of operationFiles[operation]){await writeFile(directory+'/'+name,values[name],{mode:0o600});hashes[name]=createHash('sha256').update(values[name]).digest('hex');}
 const ready=()=>writeFile(directory+'/ready.json',JSON.stringify(hashes),{mode:0o600});
 try{await run({root,id,directory,ready,hashes});}finally{await rm(root,{recursive:true,force:true});}
}
test('private handoff waits for final marker, validates exact files/hashes and returns bound job state',()=>fixture(async({root,id,directory,ready})=>{
 let waited=0;const result=await readPackage(root,id,{pause:async()=>{waited++;await ready();}});
 assert.equal(waited,1);assert.equal(result.directory,directory);assert.equal(result.state.coordinator.runId,'999');
}));
test('missing marker is bounded; traversal input fails before filesystem access',()=>fixture(async({root,id})=>{
 await assert.rejects(readPackage(root,id,{deadline:Date.now()-1}));
 for(const bad of ['../outside','not-a-uuid',''])await assert.rejects(readPackage(root,bad));
}));
for(const mode of ['changed-bytes','world-readable','symlink','extra-file-hash','missing-input','directory-symlink'])test('unsafe private handoff fails closed: '+mode,()=>fixture(async({root,id,directory,ready,hashes})=>{
 await ready();
 if(mode==='changed-bytes')await writeFile(directory+'/plan.json','tampered');
 if(mode==='world-readable')await chmod(directory+'/approval.txt',0o644);
 if(mode==='symlink'){await rename(directory+'/plan.json',directory+'/original.json');await symlink(directory+'/original.json',directory+'/plan.json');}
 if(mode==='extra-file-hash')await writeFile(directory+'/ready.json',JSON.stringify({...hashes,extra:'f'.repeat(64)}));
 if(mode==='missing-input')await rm(directory+'/plan.json');
 if(mode==='directory-symlink'){await rename(directory,directory+'-moved');await symlink(directory+'-moved',directory);}
 await assert.rejects(readPackage(root,id));
}));

for(const operation of ['adoption-review','reconcile'])test('non-destructive private handoff is mode-bound: '+operation,()=>fixture(async({root,id,ready})=>{
 await ready();assert.equal((await readPackage(root,id,{operation})).state.coordinator.runId,'999');
 await assert.rejects(readPackage(root,id,{operation:'retire'}));await assert.rejects(readPackage(root,id,{operation:'../../outside'}));
},operation));
