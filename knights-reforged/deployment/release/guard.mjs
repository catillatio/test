import assert from 'node:assert/strict';
export function releaseInputs(env){
 assert.equal(env.GITHUB_REF,'refs/heads/release/production','Run only the protected production branch workflow.');
 assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch','Production requires an explicit release request.');
 assert.equal(env.KINGDOM_RELEASE_ENABLED,'true','Owner setup is incomplete; release remains disabled.');
 assert.equal(env.KINGDOM_RAILWAY_AUTODEPLOY_DISABLED,'true','Owner must confirm Railway GitHub autodeploy is disabled.');
 assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
 assert.match(env.GITHUB_RUN_ID??'',/^[0-9]{1,20}$/);assert.match(env.GITHUB_RUN_ATTEMPT??'',/^[0-9]{1,5}$/);
 for(const key of ['RAILWAY_PROJECT_ID','RAILWAY_ENVIRONMENT_ID','RAILWAY_GAME_SERVICE_ID','RAILWAY_PG_SERVICE_ID'])assert.match(env[key]??'',/^[a-f0-9-]{36}$/i,key+' is required');
 assert.notEqual(env.RAILWAY_GAME_SERVICE_ID,env.RAILWAY_PG_SERVICE_ID);
 const origin=new URL(env.KINGDOM_PRODUCTION_ORIGIN);assert.equal(origin.protocol,'https:');assert.equal(origin.origin+'/',origin.href);assert.ok(!origin.username&&!origin.password);
 return {sha:env.GITHUB_SHA,origin:origin.origin,id:'gh_'+env.GITHUB_RUN_ID+'_'+env.GITHUB_RUN_ATTEMPT};
}
export function checkEnvironmentProtection(environment,owner){
 const rule=environment.protection_rules?.find(rule=>rule.type==='required_reviewers');
 assert.equal(rule?.reviewers?.length,1,'Configure exactly one required reviewer: the realm owner.');
 assert.ok(rule.reviewers[0].type==='User'&&rule.reviewers[0].reviewer?.login?.toLowerCase()===owner.toLowerCase(),'Configure the realm owner as the sole production environment reviewer.');
 assert.equal(environment.can_admins_bypass,false,'Disable administrator bypass of the approval gate.');
 assert.equal(environment.deployment_branch_policy?.custom_branch_policies,true,'Restrict the environment to release/production.');
}
export function checkBackup(metadata,digest,bytes){
 assert.equal(metadata.sha256,digest,'Export checksum mismatch.');assert.equal(metadata.bytes,bytes,'Truncated export.');assert.ok(bytes>100000);assert.equal(metadata.bots,450);assert.ok(metadata.accounts>=451);
 assert.match(metadata.copy,/^kc_gh_[0-9]+_[0-9]+_restore_test$/);
}
export function checkRestoredCopy(report){
 assert.equal(report.passed,true);assert.equal(report.bots,450);assert.ok(report.accounts>=451);assert.ok(report.existingTablesVerified>=60);assert.equal(report.migrationReplay,'unchanged');assert.equal(report.liveDatabaseConnected,false);
}
export function checkLiveStatus(status){
 assert.equal(status.release,'phase4.7');assert.equal(status.schemaHead,'020_game_feel.sql');assert.equal(status.bots,450);assert.equal(status.active_bots,450);assert.equal(status.bootstrapCredentialsPresent,false);assert.equal(status.initialized,true);
}
