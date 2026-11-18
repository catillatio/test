import assert from 'node:assert/strict';
import {sha} from './protocol.mjs';
export async function preflight(env,{fetcher=globalThis.fetch}={}){
 assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_REF,'refs/heads/release/production');assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');
 assert.equal(env.KINGDOM_OPERATOR_ENABLED,'true');assert.equal(env.KINGDOM_OPERATOR_RAILWAY_SCOPE_ACKNOWLEDGED,'true');assert.equal(env.KINGDOM_OPERATOR_OWNER,'catillatio');assert.equal(env.GITHUB_ACTOR,'catillatio');assert.equal(env.GITHUB_TRIGGERING_ACTOR,'catillatio');
 assert.match(env.GITHUB_SHA,sha);assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 const get=async path=>{const r=await fetcher('https://api.github.com/repos/catillatio/test'+path,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.GH_TOKEN,accept:'application/vnd.github+json'}});assert.equal(r.ok,true);return r.json();};
 const e=await get('/environments/production'),rule=e.protection_rules?.find(r=>r.type==='required_reviewers');
 assert.equal(e.can_admins_bypass,false);assert.equal(rule?.reviewers?.length,1);assert.equal(rule.reviewers[0].type,'User');assert.equal(rule.reviewers[0].reviewer.login,'catillatio');assert.equal(e.deployment_branch_policy?.custom_branch_policies,true);
 const policy=await get('/environments/production/deployment-branch-policies');assert.equal(policy.branch_policies?.length,1);assert.equal(policy.branch_policies[0].name,'release/production');assert.equal(policy.branch_policies[0].type,'branch');
 const branch=await get('/branches/release%2Fproduction');assert.equal(branch.protected,true);assert.equal(branch.commit.sha,env.GITHUB_SHA);
 for(const workflow of ['checks.yml','owner-operator-checks.yml']){
  const runs=await get('/actions/workflows/'+workflow+'/runs?branch=release%2Fproduction&event=push&head_sha='+env.GITHUB_SHA+'&status=completed&per_page=10');
  assert.ok(runs.workflow_runs?.some(r=>r.head_sha===env.GITHUB_SHA&&r.conclusion==='success'&&r.event==='push'&&r.head_repository?.full_name===env.GITHUB_REPOSITORY));
 }
 return true;
}
if(process.argv[1]?.endsWith('/preflight.mjs'))preflight(process.env).then(()=>console.log('OWNER_OPERATOR_PREFLIGHT: PASS')).catch(()=>{console.error('OWNER_OPERATOR_PREFLIGHT: FAIL');process.exitCode=1;});
