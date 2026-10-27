import assert from 'node:assert/strict';
import {uuid,httpsOrigin} from './protocol.mjs';
import {gameTransport} from './image-policy.mjs';
export function releaseInputs(env){
 assert.equal(env.GITHUB_REF,'refs/heads/release/production','Run only the protected production branch workflow.');
 assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch','Production requires an explicit release request.');
 assert.equal(env.KINGDOM_RELEASE_ENABLED,'true','Owner setup is incomplete; release remains disabled.');
 assert.equal(env.KINGDOM_RAILWAY_AUTODEPLOY_DISABLED,'true','Owner must confirm Railway GitHub autodeploy is disabled.');
 assert.equal(env.KINGDOM_RELEASE_TRANSPORT,'private-job-v2','Configure the non-SSH private verification service first.');
 assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
 assert.match(env.GITHUB_RUN_ID??'',/^[0-9]{1,20}$/);assert.match(env.GITHUB_RUN_ATTEMPT??'',/^[0-9]{1,5}$/);
 for(const key of ['RAILWAY_PROJECT_ID','RAILWAY_ENVIRONMENT_ID','RAILWAY_GAME_SERVICE_ID','RAILWAY_PG_SERVICE_ID','RAILWAY_RELEASE_WORKER_SERVICE_ID','RAILWAY_VERIFY_PG_SERVICE_ID'])assert.match(env[key]??'',uuid,key+' is required');
 const ids=[env.RAILWAY_GAME_SERVICE_ID,env.RAILWAY_PG_SERVICE_ID,env.RAILWAY_RELEASE_WORKER_SERVICE_ID,env.RAILWAY_VERIFY_PG_SERVICE_ID];assert.equal(new Set(ids).size,ids.length);
 for(const key of ['KINGDOM_DATABASE_HOST','KINGDOM_RESTORE_DATABASE_HOST'])assert.match(env[key]??'',/^[a-z0-9.-]+\.railway\.internal$/);
 assert.notEqual(env.KINGDOM_DATABASE_HOST,env.KINGDOM_RESTORE_DATABASE_HOST);
 assert.match(env.KINGDOM_DATABASE_NAME??'',/^[a-zA-Z0-9_-]{1,63}$/);assert.ok(!env.KINGDOM_DATABASE_NAME.endsWith('_restore_test'));
 return {sha:env.GITHUB_SHA,gameTransport:gameTransport(env),origin:httpsOrigin(env.KINGDOM_PRODUCTION_ORIGIN),id:'gh_'+env.GITHUB_RUN_ID+'_'+env.GITHUB_RUN_ATTEMPT,
  projectId:env.RAILWAY_PROJECT_ID,environmentId:env.RAILWAY_ENVIRONMENT_ID,gameServiceId:env.RAILWAY_GAME_SERVICE_ID,
  workerServiceId:env.RAILWAY_RELEASE_WORKER_SERVICE_ID,sourceHost:env.KINGDOM_DATABASE_HOST,sourceDatabase:env.KINGDOM_DATABASE_NAME,restoreHost:env.KINGDOM_RESTORE_DATABASE_HOST};
}
export function checkEnvironmentProtection(environment,owner){
 const rule=environment.protection_rules?.find(rule=>rule.type==='required_reviewers');
 assert.equal(rule?.reviewers?.length,1,'Configure exactly one required reviewer: the realm owner.');
 assert.ok(rule.reviewers[0].type==='User'&&rule.reviewers[0].reviewer?.login?.toLowerCase()===owner.toLowerCase(),'Configure the realm owner as the sole production environment reviewer.');
 assert.equal(environment.can_admins_bypass,false,'Disable administrator bypass of the approval gate.');
 assert.equal(environment.deployment_branch_policy?.custom_branch_policies,true,'Restrict the environment to release/production.');
}
