import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {uploadSource} from '../deployment/release/upload.mjs';
import {verifyQueuedDeployment} from '../deployment/release/deployment.mjs';

const ids=Array.from({length:4},(_,i)=>String(i+1).repeat(8)+'-'+String(i+1).repeat(4)+'-4'+String(i+1).repeat(3)+'-8'+String(i+1).repeat(3)+'-'+String(i+1).repeat(12));
const context={root:'/private/source',projectId:ids[0],environmentId:ids[1],serviceId:ids[2],sha:'a'.repeat(40)};
const secret='private-token https://username:password@private.invalid/archive?signature=private-proof';
const prefix=(service=ids[2])=>'railway up\nservice: '+service+'\nenvironment: '+ids[1]+'\nbytes: 13601887\n';
const queued=JSON.stringify({deploymentId:ids[3],logsUrl:secret});
function harness({body=queued,code=0,stderr=secret,preamble=prefix(),hang=false,error,killCloses=true,chunks,env={},worker=false,...options}={}){
 const events=[],calls=[],kills=[];let time=0;
 const spawn=(executable,args,settings)=>{
  calls.push({executable,args,settings});const task=new EventEmitter();task.stdout=new PassThrough();task.stderr=new PassThrough();
  task.kill=signal=>{kills.push(signal);if(killCloses)task.emit('close',null,signal);};
  queueMicrotask(()=>{
   if(error){task.emit('error',error);return;}
   if(hang)return;
   if(chunks)for(const [at,text] of chunks){time=at;task.stdout.write(text);}else{time=20;task.stdout.write(preamble+body);}
   task.stdout.end();task.stderr.end(stderr);time=80;task.emit('close',code);
  });return task;
 };
 const result=uploadSource({...context,spawn,env,worker,now:()=>time,log:e=>events.push(e),...options});
 return {result,events,calls,kills};
}
const last=h=>h.events.at(-1);
const privateOutput=h=>{
 const text=JSON.stringify(h.events);assert.doesNotMatch(text,/private-token|username|password|private\.invalid|signature|private-proof|\/private\/source/);
 for(const id of ids)assert.ok(!text.includes(id));
};

test('pinned verbose output is normalized privately; size/timing never replace exact deployment identity',async()=>{
 const h=harness();assert.equal(await h.result,queued);assert.equal(h.calls.length,1);
 assert.deepEqual(h.calls[0],{executable:'railway',args:['up',context.root,'--project',ids[0],'--environment',ids[1],'--service',ids[2],'--detach','--json','--verbose','--message','Kingdom Come '+context.sha],settings:{cwd:context.root,stdio:['ignore','pipe','pipe']}});
 assert.equal(last(h).event,'CLI_COMPLETED');assert.equal(last(h).upload_bytes,13601887);assert.equal(last(h).pre_upload_ms,20);assert.equal(last(h).transfer_wait_ms,60);
 assert.equal(last(h).elapsed_ms,80);assert.equal(last(h).termination_observed,true);privateOutput(h);
 await assert.rejects(verifyQueuedDeployment(await h.result,context,{token:'fixture',fetcher:async()=>({ok:true,json:async()=>({data:{deployment:{id:ids[3],projectId:ids[0],environmentId:ids[1],serviceId:ids[0]}}})})}));
});
test('worker keeps its independent flat source root and emits only its fixed component',async()=>{
 const h=harness({worker:true});await h.result;assert.ok(h.calls[0].args.includes('--path-as-root'));assert.equal(last(h).component,'WORKER');privateOutput(h);
});
for(const [name,error,status,evidence] of [
 ['generic snapshot rejection','Synthetic snapshot service failure',null,'UNAVAILABLE'],
 ['server 503 literal','Failed to upload code with status code 503',503,'UNVERIFIED_CLI_TEXT'],
 ['actual pinned CLI 503 reason phrase','Failed to upload code with status code 503 Service Unavailable',503,'UNVERIFIED_CLI_TEXT'],
 ['unrecognized reason is never exposed','Failed to upload code with status code 503 '+secret,null,'UNAVAILABLE'],
 ['payload 413 prefix','Failed to upload code. File too large (13601887 bytes): '+secret,413,'UNVERIFIED_CLI_TEXT'],
 ['provider 400 can imitate a 503 literal','Failed to upload code with status code 503',503,'UNVERIFIED_CLI_TEXT']
])test('HTTP diagnostics remain hints rather than authorization: '+name,async()=>{
 const h=harness({code:1,body:JSON.stringify({code:'UPLOAD_FAILED',error,hint:secret})});await assert.rejects(h.result);
 assert.equal(last(h).category,'UPLOAD_REJECTED');assert.equal(last(h).http_status_hint,status);assert.equal(last(h).http_status_evidence,evidence);
 assert.equal(h.calls.length,1);privateOutput(h);
});
for(const code of ['FETCH_ERROR','ERROR'])test('timeout text is a separate CLI hint, including actual reqwest ERROR: '+code,async()=>{
 const h=harness({code:1,preamble:'',body:JSON.stringify({code,error:secret+': operation timed out',hint:secret})});await assert.rejects(h.result);
 assert.equal(last(h).category,code==='FETCH_ERROR'?'TRANSPORT_FAILURE':'CLI_FAILURE');assert.equal(last(h).cli_timeout_hint,true);assert.equal(last(h).controller_timed_out,false);assert.equal(last(h).http_status_hint,null);privateOutput(h);
});
test('unknown error codes, malformed output and stderr never reach diagnostics',async()=>{
 for(const body of [secret,JSON.stringify({code:secret,error:secret,status:401,hint:secret})]){
  const h=harness({code:1,body});await assert.rejects(h.result);assert.equal(last(h).cli_code,'UNKNOWN');assert.equal(last(h).http_status_hint,null);privateOutput(h);
 }
});
test('authentication is a fixed category with no credential values or retry',async()=>{
 const h=harness({code:1,preamble:'',body:JSON.stringify({code:'NOT_AUTHENTICATED',error:secret})});await assert.rejects(h.result);
 assert.equal(last(h).category,'AUTHENTICATION_FAILURE');assert.equal(h.calls.length,1);privateOutput(h);
});
test('controller timeout terminates the exact child and does not retry',async()=>{
 const h=harness({hang:true,timeoutMs:5,killGraceMs:5});await assert.rejects(h.result);
 assert.deepEqual(h.kills,['SIGTERM']);assert.equal(last(h).controller_timed_out,true);assert.equal(last(h).category,'COMMAND_TIMEOUT');assert.equal(last(h).termination_observed,true);assert.equal(h.calls.length,1);privateOutput(h);
});
test('an unacknowledged termination is bounded, explicitly unknown and cannot become success',async()=>{
 const h=harness({hang:true,killCloses:false,timeoutMs:5,killGraceMs:5});await assert.rejects(h.result);
 assert.deepEqual(h.kills,['SIGTERM','SIGKILL']);assert.equal(last(h).termination_observed,false);assert.equal(last(h).category,'COMMAND_TIMEOUT');assert.equal(h.calls.length,1);privateOutput(h);
});
for(const stream of ['stdout','stderr'])test('oversized '+stream+' is bounded and rejected without printing it',async()=>{
 const h=harness(stream==='stdout'?{body:'x'.repeat(2000001)}:{stderr:'x'.repeat(2000001)});await assert.rejects(h.result);
 assert.equal(last(h).category,'OUTPUT_LIMIT');assert.equal(h.calls.length,1);privateOutput(h);
});
test('spawn exceptions and error events are never inspected or echoed',async()=>{
 let inspected=false;const error=Object.create(null);for(const key of ['message','stack','cause','code'])Object.defineProperty(error,key,{get(){inspected=true;throw Error(secret);}});
 const h=harness({error});await assert.rejects(h.result);assert.equal(last(h).category,'LAUNCH_FAILURE');assert.equal(inspected,false);privateOutput(h);
 const events=[];await assert.rejects(uploadSource({...context,spawn:()=>{throw error;},log:e=>events.push(e)}));assert.equal(inspected,false);assert.equal(events.at(-1).category,'LAUNCH_FAILURE');
});
test('partial and CRLF verbose output is parsed only after the complete fixed preamble',async()=>{
 const h=harness({chunks:[[10,prefix().slice(0,-1)],[30,'\r\n'],[50,queued]]});await h.result;
 assert.equal(last(h).upload_bytes,13601887);assert.equal(last(h).pre_upload_ms,30);privateOutput(h);
});
test('a substituted verbose service cannot authorize an upload result',async()=>{
 const h=harness({preamble:prefix(ids[0])});await assert.rejects(h.result);assert.equal(last(h).category,'OUTPUT_FORMAT');privateOutput(h);
});
test('malformed success JSON still reaches the existing independent identity guard, never a fallback',async()=>{
 for(const body of [secret,JSON.stringify({logsUrl:secret})]){
  const h=harness({body});const result=await h.result;assert.equal(last(h).event,'CLI_COMPLETED');
  let called=false;await assert.rejects(verifyQueuedDeployment(result,{projectId:ids[0],environmentId:ids[1],serviceId:ids[2]},{token:'fixture',fetcher:async()=>{called=true;throw Error(secret);}}));
  assert.equal(called,false);privateOutput(h);
 }
});
test('only safe timeout numbers are reported, with the original command ceiling intact',async()=>{
 for(const [raw,expected] of [[undefined,90000],['300',300000],['1e3',90000],[secret,90000],['9999999999999999999',null]]){
  const h=harness({env:{RAILWAY_HTTP_TIMEOUT:raw}});await h.result;assert.equal(h.events[0].cli_http_timeout_ms,expected);assert.equal(h.events[0].controller_timeout_ms,120000);privateOutput(h);
 }
 await assert.rejects(uploadSource({...context,timeoutMs:120001}));
});
