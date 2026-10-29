import assert from 'node:assert/strict';
import timers from 'node:timers/promises';
import {uuid} from '../../protocol.mjs';
import {DeliveryFailure,deliveryStep} from './failure.mjs';
export const lifecycleQuery='query RetentionDeliveryStopIdentity($id:String!){deployment(id:$id){id projectId environmentId serviceId status deploymentStopped instances{id status}}}';
const pending=new Set(['WAITING','QUEUED','INITIALIZING','BUILDING','DEPLOYING']);
const terminal=new Set(['FAILED','CRASHED','REMOVED','SKIPPED']);
const states=new Set([...pending,...terminal,'REMOVING','SUCCESS']);
const instanceStates=new Set(['CREATED','INITIALIZING','RUNNING','EXITED']);
function budget(phase,maximum,{deadline=Date.now()+maximum,signal}={}){
 if(!Number.isFinite(deadline))throw new DeliveryFailure(phase+'_CONFIGURATION');
 const end=Math.min(deadline,Date.now()+maximum);
 const check=()=>{if(signal?.aborted)throw new DeliveryFailure(phase+'_CANCELLED');if(Date.now()>=end||timeout?.aborted)throw new DeliveryFailure(phase+'_TIMEOUT');};
 let timeout;check();timeout=AbortSignal.timeout(Math.max(1,end-Date.now()));
 const bounded=signal?AbortSignal.any([signal,timeout]):timeout;
 const wait=async milliseconds=>{check();try{await timers.setTimeout(Math.min(milliseconds,end-Date.now()),undefined,{signal:bounded});}catch{check();throw new DeliveryFailure(phase+'_TIMEOUT');}check();};
 return {check,wait,end,signal:bounded};
}
function target(id,expected,phase){
 for(const value of [id,...['projectId','environmentId','serviceId'].map(k=>expected?.[k])]){
  if(typeof value!=='string'||value.length!==36||!uuid.test(value))throw new DeliveryFailure(phase+'_CONFIGURATION');
 }
}
function reader(api,id,expected,phase,clock){
 let instanceId;
 return async()=>{
  clock.check();let result;
  try{result=await api(lifecycleQuery,{id},{signal:clock.signal,deadline:clock.end});}
  catch{clock.check();throw new DeliveryFailure(phase+'_API');}
  clock.check();const d=result?.deployment;
  await deliveryStep(phase+'_IDENTITY',()=>{
   assert.equal(d?.id,id);for(const [key,value] of Object.entries(expected))assert.equal(d[key],value);
  });
  await deliveryStep(phase+'_STATE',()=>{
   assert.ok(states.has(d.status));assert.equal(typeof d.deploymentStopped,'boolean');
   assert.ok(Array.isArray(d.instances)&&d.instances.length<=1);
   const instance=d.instances[0];
   if(instance){assert.ok(typeof instance.id==='string'&&instance.id.length>0&&instance.id.length<=200);assert.ok(instanceStates.has(instance.status));
    if(instanceId!==undefined)assert.equal(instance.id,instanceId);instanceId=instance.id;
   }else if(instanceId!==undefined)assert.ok(phase==='CLEANUP'&&terminal.has(d.status));
  });
  return d;
 };
}
export async function waitForRunning(api,id,expected,options={}){
 target(id,expected,'STARTUP');const clock=budget('STARTUP',600000,options),read=reader(api,id,expected,'STARTUP',clock);
 for(;;){
  const d=await read();
  if(terminal.has(d.status)||d.status==='REMOVING')throw new DeliveryFailure('STARTUP_TERMINAL');
  if(d.instances[0]?.status==='EXITED')throw new DeliveryFailure('STARTUP_EXITED');
  if(d.status==='SUCCESS'&&d.deploymentStopped===false&&d.instances.length===1&&d.instances[0].status==='RUNNING')return;
  // Before an instance starts, "all instances stopped" can legitimately be true.
  await clock.wait(1000);
 }
}
const permanentlyStopped=d=>d.deploymentStopped===true&&(
 terminal.has(d.status)&&d.instances.every(i=>i.status==='EXITED')||
 d.status==='SUCCESS'&&d.instances.length===1&&d.instances[0].status==='EXITED');
export async function stopExactDeployment(api,id,expected,stopMutation,options={}){
 target(id,expected,'CLEANUP');const clock=budget('CLEANUP',30000,options),read=reader(api,id,expected,'CLEANUP',clock);
 let d=await read();if(permanentlyStopped(d))return;
 if(d.status!=='REMOVING'){
  clock.check();
  try{
   const result=await api(stopMutation,{id},{signal:clock.signal,deadline:clock.end});
   if(result?.deploymentRemove!==true)throw new Error('Unacknowledged');
  }catch{throw new DeliveryFailure('CLEANUP_ACK_UNCONFIRMED');}
  // A lost acknowledgement is never retried, even if the provider applied it.
 }
 for(;;){clock.check();d=await read();if(permanentlyStopped(d))return;await clock.wait(500);}
}
