import assert from 'node:assert/strict';
import {checkScope,checkCoordinator} from './protocol.mjs';
import {httpsOrigin,sha} from '../protocol.mjs';

const repository='catillatio/test';
const workflow='.github/workflows/production-release.yml';
// Only existing read endpoints. No dispatch, provider writes, new polling,
// production database access, or caller-controlled URL/redirect.
export function liveGuards(scope,{githubToken,fetcher=globalThis.fetch}={}){
 checkScope(scope);
 async function json(url,headers={}){
  try{
   const response=await fetcher(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),headers});
   assert.equal(response.status,200);
   const reader=response.body.getReader();let size=0,chunks=[];
   try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;assert.ok(size<=100000);chunks.push(value);}}
   finally{await reader.cancel().catch(()=>{});}
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{throw new Error('Retention read-only coordination evidence unavailable.');}
 }
 async function health(){
  const result=await json(httpsOrigin(scope.origin)+'/healthz');
  assert.equal(result.status,'ready');assert.equal(result.release,'phase4.7');assert.match(result.commit??'',sha);return result.commit;
 }
 async function github(path){
  assert.ok(typeof githubToken==='string'&&githubToken&&!/[^\x21-\x7e]/.test(githubToken));
  return json('https://api.github.com/repos/'+repository+path,{authorization:'Bearer '+githubToken,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
 }
 const guards={
  health,
  async coordinated(state,env){
   const c=checkCoordinator(state.coordinator);
   if(env){
    assert.equal(env.GITHUB_REPOSITORY,c.repository);assert.equal(env.GITHUB_RUN_ID,c.runId);
    assert.equal(env.GITHUB_RUN_ATTEMPT,String(c.runAttempt));assert.equal(env.GITHUB_SHA,c.headSha);
    assert.equal(env.GITHUB_JOB,c.job);assert.equal(env.GITHUB_REF,'refs/heads/release/production');
    assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');
   }
   const run=await github('/actions/runs/'+c.runId+'/attempts/'+c.runAttempt);
   assert.equal(String(run.id),c.runId);assert.equal(run.run_attempt,c.runAttempt);
   assert.equal(run.path,c.workflow);assert.equal(run.head_sha,c.headSha);assert.equal(run.head_branch,'release/production');
   assert.equal(run.head_repository?.full_name,repository);assert.equal(run.event,'workflow_dispatch');assert.equal(run.status,'in_progress');
   const result=await github('/actions/runs/'+c.runId+'/attempts/'+c.runAttempt+'/jobs?per_page=100');
   // No incomplete pagination or duplicate job names. Owner gate precedes the
   // job holding the SAME repository concurrency group as protected release.
   assert.ok(Array.isArray(result.jobs)&&result.total_count===result.jobs.length&&result.total_count<=100);
   const gate=result.jobs.filter(j=>j.name==='owner-approval'),job=result.jobs.filter(j=>j.name===c.job);
   assert.equal(gate.length,1);assert.equal(job.length,1);
   assert.equal(gate[0].status,'completed');assert.equal(gate[0].conclusion,'success');assert.equal(gate[0].run_attempt,c.runAttempt);
   assert.equal(job[0].status,'in_progress');assert.equal(job[0].run_attempt,c.runAttempt);
  },
  async beforeDelete(record,state){
   await guards.coordinated(state);
   assert.equal(await health(),state.activeSha);
   const statuses=['queued','in_progress','waiting','pending','requested'];
   const checks=await Promise.all(statuses.map(status=>github('/actions/workflows/production-release.yml/runs?status='+status+'&per_page=1')));
   for(const result of checks){assert.equal(result.total_count,0);assert.ok(Array.isArray(result.workflow_runs)&&result.workflow_runs.length===0);}
   const match=record.jobId.match(/^gh_([0-9]{1,20})_([0-9]{1,5})_[a-f0-9]{32}$/);assert.ok(match);
   const run=await github('/actions/runs/'+match[1]+'/attempts/'+match[2]);
   assert.equal(String(run.id),match[1]);assert.equal(String(run.run_attempt),match[2]);
   assert.equal(run.status,'completed');assert.equal(run.path,workflow);assert.equal(run.event,'workflow_dispatch');assert.equal(run.head_branch,'release/production');
   assert.equal(run.head_repository?.full_name,repository);assert.equal(run.head_sha,record.evidence.request.sha);
  }
 };
 return guards;
}
