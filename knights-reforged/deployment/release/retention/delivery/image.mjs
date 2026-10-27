import assert from 'node:assert/strict';
import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {hash} from '../protocol.mjs';
export async function imageIdentity(base='/app'){
 const image=JSON.parse(await readFile(base+'/delivery-image.json','utf8'));
 assert.ok(['executor','authorizer'].includes(image.role));
 for(const [path,digest] of Object.entries(image.files)){
  assert.match(path,/^[a-zA-Z0-9_./-]+$/);assert.ok(!path.split('/').includes('..')&&!path.startsWith('/'));
  assert.ok((await lstat(base+'/'+path)).isFile()&&!(await lstat(base+'/'+path)).isSymbolicLink());
  assert.equal(createHash('sha256').update(await readFile(base+'/'+path)).digest('hex'),digest);
 }
 assert.equal(hash({role:image.role,files:image.files}),image.codeDigest);return image;
}
