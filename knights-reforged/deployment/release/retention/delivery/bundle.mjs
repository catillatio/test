import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {hash} from '../protocol.mjs';
export const commonFiles=['package.json','package-lock.json','deployment/release/protocol.mjs',
 ...['protocol','retention','verification','journal','guards','observation'].map(n=>'deployment/release/retention/'+n+'.mjs'),
 'deployment/release/retention/bootstrap.sql','rulesets/level100-rivals-1/rules.json',
 ...['worker','protocol','io','image','volume','bundle','build-image','approval'].map(n=>'deployment/release/retention/delivery/'+n+'.mjs')];
export function roleFiles(role){assert.ok(['executor','authorizer'].includes(role));return [...commonFiles,...(role==='executor'?['cli','reconcile','job','spool','ready']:['permit','ready']).map(n=>'deployment/release/retention/'+n+'.mjs'),...(role==='authorizer'?['deployment/release/retention/delivery/prepare.mjs']:['deployment/release/retention/delivery/initialize-journal.mjs'])];}
export async function makeBundle(role,base,destination,sha){
 assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:base,encoding:'utf8'}).trim(),sha);
 const files={};
 for(const path of roleFiles(role)){
  const bytes=await readFile(join(base,path));
  const recorded=execFileSync('git',['show',sha+':knights-reforged/'+path],{cwd:base,maxBuffer:5000000});assert.deepEqual(bytes,recorded,'Build only the exact committed files.');
  files[path]=createHash('sha256').update(bytes).digest('hex');await mkdir(dirname(join(destination,path)),{recursive:true});await cp(join(base,path),join(destination,path),{force:false,errorOnExist:true});
 }
 const image={role,files,codeDigest:hash({role,files})};
 await writeFile(join(destination,'delivery-image.json'),JSON.stringify(image),{flag:'wx',mode:0o600});
 const docker=await readFile(join(base,'deployment/release/retention/'+(role==='executor'?'Dockerfile':'delivery/Authorizer.Dockerfile')));
 assert.deepEqual(docker,execFileSync('git',['show',sha+':knights-reforged/deployment/release/retention/'+(role==='executor'?'Dockerfile':'delivery/Authorizer.Dockerfile')],{cwd:base}));
 await writeFile(join(destination,'Dockerfile'),docker,{flag:'wx'});
 await writeFile(join(destination,'railway.json'),JSON.stringify({build:{builder:'DOCKERFILE',dockerfilePath:'Dockerfile'},deploy:{restartPolicyType:'NEVER',numReplicas:1}}),{flag:'wx'});
 return image;
}
