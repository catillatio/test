// Fixed private-spool entrypoint for the default-disabled manual workflow. No arbitrary
// shell, SQL, connection URL, deletion targets or paths accepted from dispatch.
import assert from 'node:assert/strict';
import {lstat,mkdir,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {readPackage} from './spool.mjs';
import {uuid} from '../protocol.mjs';
const root='/run/kingdom-retention';
try{
 process.umask(0o077);
 assert.equal(process.env.KINGDOM_RETENTION_ENABLED,'1');
 assert.match(process.env.RETENTION_REQUEST_ID??'',uuid);
 const operation=process.env.RETENTION_OPERATION;assert.ok(['retire','adoption-review','reconcile','adopt'].includes(operation));
 const {directory,state}=await readPackage(root,process.env.RETENTION_REQUEST_ID,{operation});
 assert.equal(state.coordinator.runId,process.env.GITHUB_RUN_ID);assert.equal(String(state.coordinator.runAttempt),process.env.GITHUB_RUN_ATTEMPT);
 // Secret URLs/keys are supplied only by the reviewed private runner image's
 // credential broker. Never copied to GitHub outputs or result artifacts.
 await mkdir(directory+'/results',{mode:0o700,recursive:true});
 const resultInfo=await lstat(directory+'/results');assert.ok(resultInfo.isDirectory()&&!resultInfo.isSymbolicLink());assert.equal(resultInfo.mode&0o077,0);
 const specific=operation==='retire'?['cleanup','--plan',directory+'/plan.json','--approval',directory+'/approval.txt']:
  operation==='adopt'?['verify-adoption','--manifest',directory+'/manifest.json','--before',directory+'/before.json']:
  operation==='adoption-review'?['verify-adoption','--manifest',directory+'/manifest.json']:
  ['reconcile','--prior-approval',(await readFile(directory+'/prior-approval.txt','utf8')).trim(),'--before',directory+'/before.json'];
 const child=spawn(process.execPath,[new URL('./cli.mjs',import.meta.url).pathname,...specific,'--scope',directory+'/scope.json','--state',directory+'/state.json','--out',directory+'/results/'+process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT+'.json'],{stdio:'ignore',env:process.env});
 const cancel=()=>child.kill('SIGTERM');process.once('SIGTERM',cancel);process.once('SIGINT',cancel);
 const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 assert.equal(status,0);console.log('COPY_RETENTION_JOB: PASS');
}catch{console.error('COPY_RETENTION_JOB: FAIL');process.exitCode=1;}
