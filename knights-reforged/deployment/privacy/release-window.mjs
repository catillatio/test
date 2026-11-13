// Read-only evidence that the private operator is inside the SAME GitHub mutex
// as protected releases. No Railway/database/signing credential is accepted here.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo='catillatio/test',workflow='.github/workflows/account-erasure-window.yml';
const digest=value=>createHash('sha256').update(value).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function verifyErasureWindow(permit,{token,fetcher=globalThis.fetch,now=Date.now}={}){
 assert.ok(token&&!/[\r\n]/.test(token),'Coordinator read credential required.');
 assert.match(permit.codeSha??'',/^[a-f0-9]{40}$/);assert.match(permit.operationId??'',/^[a-f0-9-]{36}$/);
 const c=permit.coordinator;assert.ok(c);assert.equal(c.protocol,'kingdom-production-mutex-v1');
 for(const value of [c.runId,c.jobId])assert.ok(/^[1-9][0-9]{0,15}$/.test(value)&&Number.isSafeInteger(Number(value)));
 assert.ok(Number.isSafeInteger(c.runAttempt)&&c.runAttempt>0);
 async function get(path){
  const response=await fetcher('https://api.github.com/repos/'+repo+path,{method:'GET',headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(8000)});
  assert.equal(response.status,200,'Coordinator evidence unavailable.');return response.json();
 }
 const run=await get('/actions/runs/'+c.runId);
 assert.equal(String(run.id),c.runId);assert.equal(run.run_attempt,c.runAttempt);assert.equal(run.event,'workflow_dispatch');
 assert.equal(run.path,workflow);assert.equal(run.head_repository?.full_name,repo);assert.equal(run.head_branch,'release/production');
 assert.equal(run.head_sha,permit.codeSha);assert.equal(run.status,'in_progress');assert.equal(run.conclusion,null);
 assert.equal(run.display_title,'Account erasure window '+digest(permit.operationId));
 const jobs=await get('/actions/runs/'+c.runId+'/jobs?per_page=100');
 const matches=jobs.jobs.filter(j=>j.name==='window');assert.equal(matches.length,1);const job=matches[0];
 assert.equal(String(job.id),c.jobId);assert.equal(job.status,'in_progress');assert.equal(job.conclusion,null);
 assert.ok(job.steps.some(s=>s.name==='Hold the production release mutex'&&s.status==='in_progress'));
 const started=Date.parse(job.started_at);assert.ok(Number.isFinite(started)&&started<=now()+30000&&now()-started<1200000);
 const approvals=await get('/actions/runs/'+c.runId+'/approvals');
 assert.ok(Array.isArray(approvals)&&approvals.some(a=>a.state==='approved'&&a.user?.login==='catillatio'&&a.environments?.some(e=>e.name==='account-erasure')),'Owner environment approval required.');
 return {runId:c.runId,jobId:c.jobId,runAttempt:c.runAttempt};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  assert.equal(process.argv[2],'hold');assert.equal(process.env.GITHUB_REPOSITORY,repo);assert.equal(process.env.GITHUB_REF,'refs/heads/release/production');
  assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.match(process.env.ERASURE_OPERATION_DIGEST??'',/^[a-f0-9]{64}$/);
  // Only a coordinator is running here: the private operator verifies its own
  // operation binding with verifyErasureWindow before writes AND before commit.
  console.log('ACCOUNT_ERASURE_WINDOW: HELD; private operator execution remains separately authorized');
  const deadline=Date.now()+1080000;
  while(Date.now()<deadline)await delay(Math.min(30000,deadline-Date.now()));
  throw new Error('Owner window expired.');
 }catch{console.error('ACCOUNT_ERASURE_WINDOW: CLOSED');process.exitCode=1;}
}
