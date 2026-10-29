// Owner's protected-environment approval binds the frozen NON-CREDENTIAL input
// digest. A signing-key or handoff-store compromise alone cannot replace it.
import assert from 'node:assert/strict';
export async function ownerReview(c,requestId,inputDigest,{githubToken,fetcher=globalThis.fetch,purpose='retention'}={}){
 const r=await fetcher('https://api.github.com/repos/catillatio/test/actions/runs/'+c.runId+'/approvals',{redirect:'error',cache:'no-store',headers:{authorization:'Bearer '+githubToken,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(10000)});
 assert.equal(r.status,200);const bytes=await r.text();assert.ok(Buffer.byteLength(bytes)<=100000);const history=JSON.parse(bytes);assert.ok(Array.isArray(history)&&history.length<=100);
 const reviews=history.filter(v=>Array.isArray(v.environments)&&v.environments.some(e=>e.name==='retention-signing'));
 assert.equal(reviews.length,1);assert.equal(reviews[0].state,'approved');assert.equal(reviews[0].user?.login,'catillatio');
 assert.ok(['retention','adoption'].includes(purpose));assert.equal(reviews[0].comment,purpose+' '+requestId+' '+inputDigest);
}
