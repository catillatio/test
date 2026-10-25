// Read-only public Actions metadata. Never downloads logs, backups or manifests.
import {execFileSync} from 'node:child_process';
const run=process.argv[2];
if(!/^\d+$/.test(run??''))throw Error('Usage: node scripts/ci/collect-metrics.mjs RUN_ID');
const get=path=>JSON.parse(execFileSync('gh',['api','repos/catillatio/test/'+path],{encoding:'utf8',maxBuffer:4*1024*1024}));
const value=get('actions/runs/'+run),jobs=get('actions/runs/'+run+'/jobs?per_page=100').jobs;
const seconds=(a,b)=>a&&b?(Date.parse(b)-Date.parse(a))/1000:null;
console.log(JSON.stringify({runId:value.id,url:value.html_url,sha:value.head_sha,event:value.event,conclusion:value.conclusion,
  queueSeconds:seconds(value.created_at,value.run_started_at),executionSeconds:seconds(value.run_started_at,value.updated_at),
  jobs:jobs.map(j=>({name:j.name,seconds:seconds(j.started_at,j.completed_at),conclusion:j.conclusion,
    steps:j.steps.map(s=>({name:s.name,seconds:seconds(s.started_at,s.completed_at),conclusion:s.conclusion}))}))},null,2));
