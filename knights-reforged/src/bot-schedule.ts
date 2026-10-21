import {createHash} from 'node:crypto';

export const scheduledNumber=(text:string)=>createHash('sha256').update(text).digest().readUInt32BE(0);
export function scheduledCommand(policy:string,id:string,window:number){
 const bytes=createHash('sha256').update(policy+':'+id+':'+window).digest().subarray(0,16);
 bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;
 const hex=bytes.toString('hex');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
export function scheduledCandidates(ids:string[],window:number,policy:{slots:number;maximum:number;population:number;salt?:string}){
 if(ids.length>policy.population)throw new Error('Unexpected rival population; autonomous work stopped.');
 const salt=policy.salt??'';
 return ids.filter(id=>scheduledNumber(salt+id)%policy.slots===window%policy.slots)
  .sort((a,b)=>scheduledNumber(salt+a+':'+window)-scheduledNumber(salt+b+':'+window)||a.localeCompare(b)).slice(0,policy.maximum);
}
export function startScheduledBotWork(work:()=>Promise<unknown>,enabled:boolean,intervalMs:number,onError:(error:unknown)=>void){
 if(!enabled)return async()=>{};
 let pending:Promise<unknown>|null=null,stopped=false;
 const tick=()=>{if(stopped||pending)return;pending=work().catch(onError).finally(()=>{pending=null;});};
 const timer=setInterval(tick,intervalMs);timer.unref();tick();
 return async()=>{stopped=true;clearInterval(timer);await pending;};
}
