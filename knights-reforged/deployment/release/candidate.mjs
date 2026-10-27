import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';

// Identical in the candidate, private verification job and game pre-deploy.
// Source paths, credentials, dependencies and temporary files are not included.
export async function candidateDigest(root=new URL('../../',import.meta.url).pathname){
 const files=[];
 async function walk(relative){
  for(const entry of await readdir(join(root,relative),{withFileTypes:true})){
   const path=relative+'/'+entry.name;
   if(entry.isDirectory())await walk(path);
   else if(entry.isFile())files.push(path);
   else throw new Error('Candidate cannot contain symbolic links.');
  }
 }
 for(const path of ['dist','migrations','rulesets','views','public'])await walk(path);
 files.push('deployment/start.mjs','deployment/migrate.mjs','deployment/check-upgrade.mjs','deployment/environment.mjs',
  'deployment/release/candidate.mjs','deployment/release/protocol.mjs','deployment/release/proof.mjs','deployment/release/image-policy.mjs');
 const hash=createHash('sha256');
 for(const file of files.sort()){
  const bytes=await readFile(join(root,file));
  hash.update(file+'\0'+bytes.length+'\0');hash.update(bytes);
 }
 return hash.digest('hex');
}
