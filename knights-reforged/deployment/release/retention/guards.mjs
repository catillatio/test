import assert from 'node:assert/strict';
import {checkScope} from './protocol.mjs';
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
 return {
  health,
  async beforeDelete(record,state){
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
}
