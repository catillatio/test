// Non-SQL installation only, separately approved. Never accepts a connection,
// signing key, arbitrary command, image, path or owner-transfer request.
import assert from 'node:assert/strict';
import {uuid} from '../../protocol.mjs';
export const setupOperations=Object.freeze(['initialize-journal','install-disabled']);
export function installationTarget(env){
 assert.equal(env.KINGDOM_RETENTION_INSTALLATION_APPROVED,'1');assert.ok(setupOperations.includes(env.RETENTION_OPERATION));
 assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.GITHUB_REF,'refs/heads/release/production');assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_JOB,'retire');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
 const t=JSON.parse(env.KINGDOM_RETENTION_INSTALL_TARGET);assert.deepEqual(Object.keys(t).sort(),['projectId','environmentId','operatorServiceId','authorizerServiceId','journalVolumeId','gameServiceId','productionServiceId','verificationServiceId','verificationWorkerServiceId'].sort());
 for(const id of Object.values(t))assert.match(id,uuid);
 assert.equal(new Set([t.operatorServiceId,t.authorizerServiceId,t.gameServiceId,t.productionServiceId,t.verificationServiceId,t.verificationWorkerServiceId]).size,6);
 assert.equal(t.projectId,env.RAILWAY_PROJECT_ID);assert.equal(t.environmentId,env.RAILWAY_ENVIRONMENT_ID);
 // This is an installation view, NOT invented database/recovery evidence.
 return {...t,delivery:{authorizerServiceId:t.authorizerServiceId,journalVolumeId:t.journalVolumeId}};
}
export async function installDisabled({env,provider,bundle,signal,log=()=>{},fetcher=globalThis.fetch}){
 const target=installationTarget(env);
 const get=async path=>{assert.ok(env.GH_TOKEN);const r=await fetcher('https://api.github.com/repos/catillatio/test'+path,{redirect:'error',cache:'no-store',headers:{authorization:'Bearer '+env.GH_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);return r.json();};
 const run=await get('/actions/runs/'+env.GITHUB_RUN_ID+'/attempts/1');
 assert.equal(String(run.id),env.GITHUB_RUN_ID);assert.equal(run.run_attempt,1);assert.equal(run.head_sha,env.GITHUB_SHA);assert.equal(run.head_branch,'release/production');assert.equal(run.event,'workflow_dispatch');assert.equal(run.status,'in_progress');assert.equal(run.path,'.github/workflows/recovery-copy-retention.yml');assert.equal(run.head_repository?.full_name,'catillatio/test');
 const jobs=await get('/actions/runs/'+env.GITHUB_RUN_ID+'/attempts/1/jobs?per_page=100');assert.equal(jobs.total_count,jobs.jobs.length);assert.ok(jobs.jobs.length<=100);
 const gate=jobs.jobs.filter(j=>j.name==='owner-approval'),active=jobs.jobs.filter(j=>j.name==='retire');assert.equal(gate.length,1);assert.equal(active.length,1);assert.equal(gate[0].conclusion,'success');assert.equal(gate[0].status,'completed');assert.equal(active[0].status,'in_progress');assert.equal(active[0].run_attempt,1);
 await provider.preflight(target);signal?.throwIfAborted();
 const roleList=env.RETENTION_OPERATION==='initialize-journal'?['executor']:['executor','authorizer'];
 const started=[];
 try{
  for(const role of roleList){
   const image=await bundle(role,env.GITHUB_SHA);signal?.throwIfAborted();
   const id=await provider.install(role,target,image.directory,env.RETENTION_OPERATION);started.push({id,role});
   if(env.RETENTION_OPERATION==='initialize-journal')await provider.completion(id,target,role,{signal,deadline:Date.now()+600000});
   else await provider.running(id,target,role,{signal,deadline:Date.now()+600000});
  }
 }catch(error){for(const {id,role} of started)await provider.stop(id,target,role);throw error;}
 finally{if(env.RETENTION_OPERATION==='initialize-journal')await provider.resetInstallation(target);}
 log(env.RETENTION_OPERATION==='initialize-journal'?'JOURNAL_INITIALIZED':'DISABLED_CONSOLES_READY');
}
