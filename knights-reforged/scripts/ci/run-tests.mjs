import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import pg from 'pg';
import {manifest,root,selected,shard,validateManifest} from './plan.mjs';
import {fixtureUrl,databaseLease} from './isolation.mjs';
import {testResult} from './result.mjs';

const options=Object.fromEntries(process.argv.slice(2).map(s=>{const match=/^--([a-z]+)=([a-z0-9/.,-]+)$/.exec(s);if(!match)throw Error('Invalid runner argument');return [match[1],match[2]];}));
if(Object.keys(options).some(k=>!['profile','lane','shard','workers','files'].includes(k)))throw Error('Unknown runner option');
const profile=options.profile??'full',lane=options.lane??'all',workers=Number(options.workers??2);
if(!['all','unit','database','browser'].includes(lane)||!Number.isInteger(workers)||workers<1||workers>4)throw Error('Invalid runner limits');
validateManifest();
const [index,count]=(options.shard??'1/1').split('/').map(Number);
const only=options.files?.split(',');
if(only && (new Set(only).size!==only.length||only.some(f=>!manifest.tests.some(e=>e.file===f))))throw Error('Unknown focused test');
const entries=shard(selected(profile).filter(e=>(lane==='all'||e.lane===lane)&&(!only||only.includes(e.file))),index,count);
if(!entries.length)throw Error('Empty required test selection');
const needsDb=entries.some(e=>e.lane!=='unit'),base=needsDb?fixtureUrl(process.env.TEST_DATABASE_URL).href:null;
const browser=process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium';
if(entries.some(e=>e.lane==='browser')&&!existsSync(browser))throw Error('Required browser is unavailable');
const pool=base?new pg.Pool({connectionString:base,max:2}):null;
const label=process.env.CI_BENCHMARK_LABEL??`${profile}-${lane}-${index}`;
if(!/^[a-z0-9-]{1,80}$/.test(label))throw Error('Invalid evidence label');
const directory=root+'test-results/ci-'+label;
await mkdir(directory,{recursive:true});
const active=new Set(),results=[];let interrupted=false,browserBusy=false,exclusiveBusy=false,running=0;
const started=performance.now();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  interrupted=true;
  for(const child of active) {try{process.kill(-child.pid,'SIGTERM');}catch{}}
  setTimeout(()=>{for(const child of active){try{process.kill(-child.pid,'SIGKILL');}catch{}}},5000).unref();
});
async function run(entry){
  const start=performance.now();let lease;
  const key=entry.file.replaceAll('/','-').replaceAll('.','-');
  let output='',status=-1,signal=null,overflow=false;
  try {
    if(entry.lane!=='unit')lease=await databaseLease(pool,base);
    if(interrupted)throw Error('Interrupted fixture');
    const env={...process.env,NODE_ENV:'test',BROWSER_EXECUTABLE:browser};
    delete env.DATABASE_URL;delete env.TEST_DATABASE_URL;
    if(lease)env.TEST_DATABASE_URL=env.DATABASE_URL=lease.url;
    const args=entry.script?['--import','tsx',entry.file]:['--import','tsx','--test','--test-concurrency=1','--test-reporter=tap',entry.file];
    const child=spawn(process.execPath,args,{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});
    active.add(child);
    const append=bytes=>{output+=bytes;if(output.length>8*1024*1024){overflow=true;try{process.kill(-child.pid,'SIGKILL');}catch{}output=output.slice(-1024*1024);}};
    child.stdout.on('data',append);child.stderr.on('data',append);
    const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},600000);
    await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,sig)=>{status=code;signal=sig;resolve();});}).finally(()=>{clearTimeout(timer);active.delete(child);});
    const {passed,...counts}=testResult(entry,output,status,signal,{overflow});
    await writeFile(directory+'/'+key+'.log',output);
    results.push({file:entry.file,lane:entry.lane,seconds:Number(((performance.now()-start)/1000).toFixed(3)),passed,...counts});
    console.log(`${passed?'PASS':'FAIL'} ${entry.file} ${results.at(-1).seconds}s ${entry.script?'browser-script':`tests=${counts.tests??0} skipped=${counts.skipped??0}`}`);
    if(!passed)console.error(output.slice(-16000));
  } catch {
    results.push({file:entry.file,lane:entry.lane,seconds:Number(((performance.now()-start)/1000).toFixed(3)),passed:false});
    console.error('FAIL '+entry.file+' fixture/runner failure');
  } finally {
    if(lease)try {await lease.close();}catch {
      // Finish/join the other workers before closing their shared fixture pool.
      // Cleanup failure is evidence failure, never a successful partial run.
      const result=results.find(r=>r.file===entry.file);
      if(result){result.passed=false;result.cleanupFailed=true;}
      console.error('FAIL '+entry.file+' fixture cleanup');
    }
  }
}
try {
  const queue=[...entries];
  async function worker(){
    while(queue.length&&!interrupted){
      const i=exclusiveBusy?-1:queue.findIndex(e=>(e.lane!=='browser'||!browserBusy)&&(!e.exclusive||running===0));
      if(i<0){await new Promise(r=>setTimeout(r,50));continue;}
      const [entry]=queue.splice(i,1);if(entry.lane==='browser')browserBusy=true;
      if(entry.exclusive)exclusiveBusy=true;running++;
      try{await run(entry);}finally{if(entry.lane==='browser')browserBusy=false;if(entry.exclusive)exclusiveBusy=false;running--;}
    }
  }
  await Promise.all(Array.from({length:lane==='browser'?1:workers},worker));
} finally {
  if(pool)await pool.end();
  await writeFile(directory+'/timings.json',JSON.stringify({profile,lane,shard:index,shards:count,workers:lane==='browser'?1:workers,seconds:Number(((performance.now()-started)/1000).toFixed(3)),expected:entries.length,completed:results.length,interrupted,results},null,2)+'\n');
}
if(interrupted||results.length!==entries.length||results.some(r=>!r.passed))process.exitCode=1;
