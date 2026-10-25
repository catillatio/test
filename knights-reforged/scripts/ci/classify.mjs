import {appendFileSync} from 'node:fs';
import {classify,gitChanges,matrix,validateManifest} from './plan.mjs';
validateManifest();
let profile='full';
try {
  if(process.env.GITHUB_EVENT_NAME==='pull_request') profile=classify(gitChanges(process.env.CI_BASE_SHA,process.env.CI_HEAD_SHA));
} catch { profile='full'; }
const outputs={profile,matrix:JSON.stringify(matrix(profile)),recovery:String(['full','gameplay'].includes(profile))};
for(const [key,value] of Object.entries(outputs)) {
  console.log(key+'='+value);
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,key+'='+value+'\n');
}
