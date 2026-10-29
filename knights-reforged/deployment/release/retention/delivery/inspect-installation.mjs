// Protected read-only entrypoint: no CLI, SQL, store, worker or mutation imports.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {installationMetadata} from './install.mjs';
import {uuid} from '../../protocol.mjs';
import {InstallationIdentityError,verifyInstallationToken} from './installation-identity.mjs';
export const expectedInstallationIdentity=Object.freeze({
 projectId:'41a664f1-06bb-492e-90ef-cfd9635fc67f',
 environmentId:'8ced8aef-352e-4ea9-931d-8963ff352c1c'
});
export async function inspectInstallation(env,{fetcher=globalThis.fetch,log=console.log}={}){
 // No assertion details or dynamic errors escape this boundary.
 let stage='WORKFLOW_CONTEXT';
 try{
  assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.GITHUB_REF,'refs/heads/release/production');
  assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_JOB,'inspect-installation');
  assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
  assert.equal(env.RETENTION_OPERATION,'inspect-installation');assert.match(env.RETENTION_REQUEST_ID??'',uuid);
  assert.equal(env.KINGDOM_RETENTION_EXECUTION_APPROVED,'0');
  stage='CONFIGURED_PROJECT_MISMATCH';assert.equal(env.RAILWAY_PROJECT_ID,expectedInstallationIdentity.projectId);
  stage='CONFIGURED_ENVIRONMENT_MISMATCH';assert.equal(env.RAILWAY_ENVIRONMENT_ID,expectedInstallationIdentity.environmentId);
  stage='INSTALLATION_METADATA';const target=installationMetadata(env);
  stage='TOKEN_VERIFICATION';await verifyInstallationToken(env.RAILWAY_TOKEN,target,{fetcher});
  log('RETENTION_TOKEN_PROJECT: MATCH');log('RETENTION_TOKEN_ENVIRONMENT: MATCH');
  log('RETENTION_INSTALLATION_METADATA: MATCH');log('RETENTION_INSTALLATION_INSPECTION: PASS');
  return {passed:true};
 }catch(error){
  log('RETENTION_INSTALLATION_FAILURE: '+(error instanceof InstallationIdentityError?error.code:stage));
  log('RETENTION_INSTALLATION_INSPECTION: FAIL');return {passed:false};
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await inspectInstallation(process.env);if(!result.passed)process.exitCode=1;
}
