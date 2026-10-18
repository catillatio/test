import assert from 'node:assert/strict';
import {checkEnvironmentProtection} from './guard.mjs';
assert.equal(process.env.GITHUB_REF,'refs/heads/release/production');
assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');
assert.equal(process.env.KINGDOM_RELEASE_ENABLED,'true','Complete owner setup before enabling releases.');
assert.equal(process.env.KINGDOM_RAILWAY_AUTODEPLOY_DISABLED,'true','Confirm Railway GitHub autodeploy is disabled first.');
const repo=process.env.GITHUB_REPOSITORY,sha=process.env.GITHUB_SHA,owner=process.env.KINGDOM_RELEASE_OWNER;
assert.match(repo??'',/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);assert.match(sha??'',/^[a-f0-9]{40}$/);assert.match(owner??'',/^[A-Za-z0-9-]{1,39}$/);
async function get(path){const response=await fetch('https://api.github.com/repos/'+repo+path,{headers:{authorization:'Bearer '+process.env.GH_TOKEN,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});assert.ok(response.ok,'GitHub protection/check evidence is unavailable. Release stopped.');return response.json();}
const environment=await get('/environments/production');checkEnvironmentProtection(environment,owner);
const policies=await get('/environments/production/deployment-branch-policies');
assert.equal(policies.branch_policies?.length,1);assert.equal(policies.branch_policies[0].name,'release/production');assert.equal(policies.branch_policies[0].type,'branch');
const branch=await get('/branches/release%2Fproduction');assert.equal(branch.protected,true,'Production branch must be protected.');assert.equal(branch.commit.sha,sha,'A newer commit has superseded this release request.');
const runs=await get('/actions/workflows/checks.yml/runs?branch=release%2Fproduction&event=push&head_sha='+sha+'&status=completed&per_page=10');
assert.ok(runs.workflow_runs?.some(run=>run.head_sha===sha&&run.conclusion==='success'&&run.event==='push'&&run.head_repository?.full_name===repo),'The exact production commit has no successful complete check run.');
console.log('Protected exact commit, successful checks, owner approval rule and production-only environment verified. Awaiting explicit owner approval.');
