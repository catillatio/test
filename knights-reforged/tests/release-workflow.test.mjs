import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {releaseInputs,checkEnvironmentProtection,checkBackup,checkRestoredCopy,checkLiveStatus} from '../deployment/release/guard.mjs';
const valid={GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',KINGDOM_RELEASE_ENABLED:'true',KINGDOM_RAILWAY_AUTODEPLOY_DISABLED:'true',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',RAILWAY_PROJECT_ID:'a'.repeat(36),RAILWAY_ENVIRONMENT_ID:'b'.repeat(36),RAILWAY_GAME_SERVICE_ID:'c'.repeat(36),RAILWAY_PG_SERVICE_ID:'d'.repeat(36),KINGDOM_PRODUCTION_ORIGIN:'https://realm.example'};
test('release guard fails closed for wrong branch, event, setup, services and public HTTP',()=>{
 assert.equal(releaseInputs(valid).sha,'a'.repeat(40));
 for(const changed of [{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'push'},{KINGDOM_RELEASE_ENABLED:'false'},{RAILWAY_PG_SERVICE_ID:valid.RAILWAY_GAME_SERVICE_ID},{KINGDOM_PRODUCTION_ORIGIN:'http://realm.example'},{GITHUB_SHA:'latest'}])assert.throws(()=>releaseInputs({...valid,...changed}));
});
test('production environment requires the exact owner reviewer and restricted branches',()=>{
 const env={can_admins_bypass:false,deployment_branch_policy:{custom_branch_policies:true},protection_rules:[{type:'required_reviewers',reviewers:[{type:'User',reviewer:{login:'catillatio'}}]}]};checkEnvironmentProtection(env,'catillatio');
 assert.throws(()=>checkEnvironmentProtection({...env,protection_rules:[]},'catillatio'));assert.throws(()=>checkEnvironmentProtection(env,'stranger'));
});
test('corrupt, truncated, empty or incomplete backup/copy checks prevent promotion',()=>{
 const meta={sha256:'a'.repeat(64),bytes:120000,accounts:451,bots:450,copy:'kc_gh_123_1_restore_test'};checkBackup(meta,meta.sha256,meta.bytes);
 assert.throws(()=>checkBackup(meta,'b'.repeat(64),meta.bytes));assert.throws(()=>checkBackup(meta,meta.sha256,888));assert.throws(()=>checkBackup({...meta,bots:0},meta.sha256,meta.bytes));
 const report={passed:true,bots:450,accounts:451,existingTablesVerified:64,migrationReplay:'unchanged',liveDatabaseConnected:false};checkRestoredCopy(report);
 for(const changed of [{passed:false},{bots:449},{migrationReplay:'changed'},{liveDatabaseConnected:true},{existingTablesVerified:3}])assert.throws(()=>checkRestoredCopy({...report,...changed}));
 assert.throws(()=>checkLiveStatus({release:'phase4.6'}));
});
test('workflow is manual, credential-gated, serialized, retains a verified encrypted backup before promotion and never initializes upgrades',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/production-release.yml',import.meta.url),'utf8');
 assert.match(workflow,/workflow_dispatch/);assert.doesNotMatch(workflow,/pull_request_target:|^  push:/m);assert.match(workflow,/environment: production/);assert.match(workflow,/cancel-in-progress: false/);assert.match(workflow,/if: inputs.promote/);assert.match(workflow,/f518230646acc7a6a7a67365e7642618f659d5d8cdd7cf8c180336140d0504eb/);
 const prepare=workflow.indexOf('run.mjs prepare'),backup=workflow.indexOf('actions/upload-artifact',prepare),download=workflow.indexOf('actions/download-artifact',backup),promote=workflow.indexOf('run.mjs promote');assert.ok(prepare<backup&&backup<download&&download<promote);
 const runner=readFileSync(new URL('../deployment/release/run.mjs',import.meta.url),'utf8'),script=readFileSync(new URL('../deployment/release/backup.sh',import.meta.url),'utf8');
 assert.match(runner,/checkBackup/);assert.match(runner,/checkRestoredCopy/);assert.match(runner,/StrictHostKeyChecking=yes/);assert.match(runner,/--skip-deploys/);assert.doesNotMatch(runner,/setup-development|db:seed|db:reset|dev:bots|grant-gray/);assert.doesNotMatch(script.split("\n").filter(line=>!line.trim().startsWith('#')).join("\n"),/dropdb|--clean/); // mentions forbidden actions only in explanatory comment
});
