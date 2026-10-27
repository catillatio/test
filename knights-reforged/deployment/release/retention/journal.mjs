import assert from 'node:assert/strict';
import {lstat,open,realpath} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
// The deployment must back this private directory with durable storage retained
// beyond an ephemeral runner. fsync cannot make an ephemeral volume persistent.
export async function writeBaseline(path,baseline){
 const parent=dirname(resolve(path)),info=await lstat(parent);
 assert.ok(info.isDirectory()&&!info.isSymbolicLink());assert.equal(info.mode&0o077,0);
 assert.equal(await realpath(parent),parent);
 const file=await open(path,'wx',0o600);
 try{await file.writeFile(JSON.stringify(baseline,null,2)+'\n');await file.sync();}finally{await file.close();}
 const directory=await open(parent,'r');try{await directory.sync();}finally{await directory.close();}
}
