// Pinned CLI output stays private in bounded memory. Diagnostics are constructed
// from this allowlist; never print provider text, URLs, argv or exception objects.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {STATUS_CODES} from 'node:http';
import {uuid,sha as commitPattern} from './protocol.mjs';

const codes=new Set(['UPLOAD_FAILED','FETCH_ERROR','ERROR','NOT_AUTHENTICATED','UNAUTHORIZED','PROJECT_NOT_FOUND','SERVICE_NOT_FOUND']);
const signals=new Set(['SIGTERM','SIGKILL','SIGINT','SIGABRT','SIGSEGV','SIGPIPE','SIGHUP']);
const limit=2000000;
function output(text,context){
 let body=text,bytes=null,valid=true;
 if(text.startsWith('railway up\n')){
  const lines=text.split('\n');
  valid=lines.length>=5&&lines[1]==='service: '+context.serviceId&&lines[2]==='environment: '+context.environmentId&&/^bytes: [1-9][0-9]{0,10}$/.test(lines[3]??'');
  if(valid){bytes=Number(lines[3].slice(7));valid=Number.isSafeInteger(bytes);body=lines.slice(4).join('\n');}
 }
 let value;try{value=JSON.parse(body);}catch{}
 const code=typeof value?.code==='string'&&codes.has(value.code)?value.code:'UNKNOWN';
 let status=null;
 // CLI 5.70 uses this literal for non-200/400/413 replies. A 400 message is
 // provider-controlled and can imitate it, so this is ALWAYS an unverified hint.
 if(code==='UPLOAD_FAILED'&&typeof value.error==='string'){
  const match=/^Failed to upload code with status code ([45][0-9]{2})(?: ([ -~]{1,50}))?$/.exec(value.error);
  if(match&&(match[2]===undefined||match[2]===STATUS_CODES[Number(match[1])]))status=Number(match[1]);
  else if(/^Failed to upload code\. File too large \([1-9][0-9]* bytes\):/.test(value.error))status=413;
 }
 // reqwest errors propagated through anyhow use the generic ERROR code in
 // the actual binary. This remains a text hint, never a timeout assertion.
 const timeoutHint=['FETCH_ERROR','ERROR'].includes(code)&&typeof value.error==='string'&&/\b(?:operation timed out|deadline has elapsed|request timed out)\b/i.test(value.error);
 return {body,bytes,valid,code,status,timeoutHint};
}

export async function uploadSource({spawn,root,projectId,environmentId,serviceId,sha,worker=false,log=()=>{},env=process.env,
 now=()=>performance.now(),timeoutMs=120000,killGraceMs=2000}={}){
 for(const id of [projectId,environmentId,serviceId])assert.match(id??'',uuid);
 assert.match(sha??'',commitPattern);assert.equal(typeof root,'string');assert.ok(root.length>0);assert.equal(typeof worker,'boolean');
 assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000);assert.ok(Number.isInteger(killGraceMs)&&killGraceMs>0&&killGraceMs<=2000);
 const raw=env.RAILWAY_HTTP_TIMEOUT?.trim(),configured=Number(raw);
 const httpTimeout=raw&&/^\+?[0-9]+$/.test(raw)&&configured>0?(Number.isSafeInteger(configured)&&configured<=Number.MAX_SAFE_INTEGER/1000?configured*1000:null):90000;
 const component=worker?'WORKER':'GAME',start=now();let packagedAt=null,text='',received=0,reason=null,task,timer,hardTimer,settled=false;
 const elapsed=()=>Math.max(0,Math.min(2147483647,Math.floor(now()-start)));
 log({component,event:'START',controller_timeout_ms:timeoutMs,cli_http_timeout_ms:httpTimeout});
 return new Promise((resolve,reject)=>{
  const finish=(exitCode,signal,closed)=>{
   if(settled)return;settled=true;clearTimeout(timer);clearTimeout(hardTimer);
   const parsed=output(text.replaceAll('\r\n','\n'),{serviceId,environmentId});
   const success=reason===null&&exitCode===0&&signal===null&&parsed.valid;
   let category=reason;
   if(!category&&!parsed.valid)category='OUTPUT_FORMAT';
   if(!category&&!success)category=parsed.code==='UPLOAD_FAILED'?'UPLOAD_REJECTED':parsed.code==='FETCH_ERROR'?'TRANSPORT_FAILURE':['NOT_AUTHENTICATED','UNAUTHORIZED'].includes(parsed.code)?'AUTHENTICATION_FAILURE':'CLI_FAILURE';
   const duration=elapsed();
   log({component,event:success?'CLI_COMPLETED':'FAILED',category:category??'NONE',elapsed_ms:duration,pre_upload_ms:packagedAt,transfer_wait_ms:packagedAt===null?null:Math.max(0,duration-packagedAt),
    upload_bytes:parsed.bytes,exit_code:Number.isInteger(exitCode)&&exitCode>=0&&exitCode<=255?exitCode:null,
    signal:signal===null?null:signals.has(signal)?signal:'OTHER',controller_timed_out:reason==='COMMAND_TIMEOUT',termination_observed:closed,
    cli_code:success?'NONE':parsed.code,cli_timeout_hint:parsed.timeoutHint,http_status_hint:parsed.status,http_status_evidence:parsed.status===null?'UNAVAILABLE':'UNVERIFIED_CLI_TEXT'});
   // Normalization removes only the pinned verbose preamble. Exact deployment
   // identity still MUST be authenticated by the existing verifier afterward.
   if(success)resolve(parsed.body);else reject(new Error('Source upload failed; no automatic retry is authorized.'));
  };
  const stop=category=>{
   if(settled||reason!==null)return;reason=category;
   try{task?.kill('SIGTERM');}catch{}
   if(!settled)hardTimer=setTimeout(()=>{try{task?.kill('SIGKILL');}catch{}finish(null,'SIGKILL',false);},killGraceMs);
  };
  try{
   task=spawn('railway',['up',root,'--project',projectId,'--environment',environmentId,'--service',serviceId,'--detach','--json','--verbose',...(worker?['--path-as-root']:[]),'--message','Kingdom Come '+sha],{cwd:root,stdio:['ignore','pipe','pipe']});
   task.once('error',()=>{reason='LAUNCH_FAILURE';finish(null,null,false);});
   task.once('close',(code,signal)=>finish(code,signal??null,true));
   const collect=(chunk,stdout)=>{
    if(settled||reason!==null)return;received+=Buffer.byteLength(chunk);
    if(received>limit){stop('OUTPUT_LIMIT');return;}
    if(stdout){text+=chunk.toString();if(packagedAt===null&&output(text.replaceAll('\r\n','\n'),{serviceId,environmentId}).bytes!==null)packagedAt=elapsed();}
   };
   task.stdout.on('data',b=>collect(b,true));task.stderr.on('data',b=>collect(b,false));
   timer=setTimeout(()=>stop('COMMAND_TIMEOUT'),timeoutMs);
  }catch{reason='LAUNCH_FAILURE';finish(null,null,false);}
 });
}
