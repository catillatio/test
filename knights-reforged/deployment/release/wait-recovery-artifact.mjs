// Read-only visibility barrier for the exact upload receipt. Never downloads a
// fallback, reruns a backup, or exposes GitHub responses/credentials in logs.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

export async function waitForRecoveryArtifact(env,{fetcher=globalThis.fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now}={}){
 assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');
 assert.equal(env.GITHUB_REF,'refs/heads/release/production');
 assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
 for(const key of ['GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','KINGDOM_RECOVERY_ARTIFACT_ID']){
  assert.match(env[key]??'',/^[1-9][0-9]{0,15}$/);assert.ok(Number.isSafeInteger(Number(env[key])));
 }
 assert.ok(env.GH_TOKEN&&!/[\r\n]/.test(env.GH_TOKEN));
 const digest=/^(?:sha256:)?([a-f0-9]{64})$/.exec(env.KINGDOM_RECOVERY_ARTIFACT_DIGEST??'');assert.ok(digest);
 const name='kingdom-recovery-'+env.GITHUB_RUN_ID+'-'+env.GITHUB_RUN_ATTEMPT;
 const url='https://api.github.com/repos/catillatio/test/actions/runs/'+env.GITHUB_RUN_ID+'/artifacts?per_page=100&name='+encodeURIComponent(name);
 const deadline=now()+60000;
 for(let attempt=0;attempt<13;attempt++){
  assert.ok(now()<deadline);
  const response=await fetcher(url,{method:'GET',headers:{authorization:'Bearer '+env.GH_TOKEN,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(Math.min(8000,deadline-now()))});
  if(response.status===404){await response.body?.cancel();}
  else{
   assert.equal(response.status,200);
   const data=await response.json();assert.ok(data&&Array.isArray(data.artifacts));assert.ok(Number.isSafeInteger(data.total_count)&&data.total_count>=0);
   if(data.total_count!==0||data.artifacts.length!==0){
    assert.equal(data.total_count,1);assert.equal(data.artifacts.length,1);
    const artifact=data.artifacts[0];assert.ok(Number.isSafeInteger(artifact.id));assert.equal(String(artifact.id),env.KINGDOM_RECOVERY_ARTIFACT_ID);
    assert.equal(artifact.name,name);assert.equal(artifact.expired,false);
    assert.ok(Number.isSafeInteger(artifact.size_in_bytes)&&artifact.size_in_bytes>0);
    assert.equal(artifact.digest,'sha256:'+digest[1]);
    assert.ok(Number.isSafeInteger(artifact.workflow_run?.id));assert.equal(String(artifact.workflow_run.id),env.GITHUB_RUN_ID);assert.equal(artifact.workflow_run.head_sha,env.GITHUB_SHA);
    assert.ok(now()<deadline);return artifact;
   }
  }
  assert.ok(attempt<12&&now()<deadline);await wait(Math.min(5000,deadline-now()));
 }
 throw new Error('Recovery artifact visibility deadline exceeded.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await waitForRecoveryArtifact(process.env);console.log('RECOVERY_ARTIFACT_VISIBILITY: PASS');}
 catch{console.error('RECOVERY_ARTIFACT_VISIBILITY: FAIL');process.exitCode=1;}
}
