import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';

const minute=60000,windowMinutes=60,routeLimit=64;
const bounds=[5,10,25,50,100,250,500,1000,2500,5000,10000];
const categories=['resource_shortage','requirements','eligibility','conflict','validation','deadline','database','server_failure'] as const;
type Category=typeof categories[number];
const expected=new Set<Category>(['resource_shortage','requirements','eligibility','conflict','validation']);
const empty=()=>({samples:0,success:0,rejected:0,failed:0,other:0,histogram:Array<number>(bounds.length+1).fill(0),errors:Object.fromEntries(categories.map(key=>[key,0])) as Record<Category,number>});
type Counts=ReturnType<typeof empty>;

export function businessCategory(code:string):Category {
 if(/INSUFFICIENT|NOT_ENOUGH|LOW_ENERGY|LOW_STAMINA/.test(code))return 'resource_shortage';
 if(/REQUIRE|MISSING_EQUIPMENT|LEVEL/.test(code))return 'requirements';
 if(/UNAVAILABLE|INELIGIBLE|COOLDOWN|LIMIT/.test(code))return 'eligibility';
 if(/CONFLICT|ALREADY|STALE/.test(code))return 'conflict';
 return 'validation';
}
export function failureCategory(error:unknown):Category {
 const code=(error as {code?:unknown})?.code;
 if(code==='57014'||code==='ETIMEDOUT')return 'deadline';
 if(typeof code==='string'&&/^(08|23|40|53|57)[0-9A-Z]{3}$/.test(code))return 'database';
 return 'server_failure';
}
export function createRuntimeTelemetry(now=Date.now) {
 const processId=randomUUID(),started=now(),buckets=new Map<number,Map<string,Counts>>(),routes=new Set<string>();
 function prune(index:number){for(const key of buckets.keys())if(key<=index-windowMinutes||key>index)buckets.delete(key);}
 function observe(method:string,route:string|undefined,status:number,elapsed:number,category?:Category) {
  if(!route||route==='/healthz'||route.startsWith('/assets/')||route.startsWith('/owner-runtime/'))return;
  const index=Math.floor(now()/minute);prune(index);
  const label=/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(method)&&/^\/[a-zA-Z0-9/_.:-]{0,95}$/.test(route)?method+' '+route:'Other routes';
  const name=routes.has(label)||routes.size<routeLimit?label:'Other routes';
  if(routes.size<routeLimit)routes.add(name);
  let bucket=buckets.get(index);if(!bucket){bucket=new Map();buckets.set(index,bucket);}
  let counts=bucket.get(name);if(!counts){counts=empty();bucket.set(name,counts);}
  counts.samples++;
  if(status>=500){counts.failed++;counts.errors[category&&!expected.has(category)?category:'server_failure']++;}
  else if(category&&expected.has(category)){counts.rejected++;counts.errors[category]++;}
  else if(status>=400)counts.other++;
  else counts.success++;
  const bin=bounds.findIndex(b=>elapsed<=b);counts.histogram[bin<0?bounds.length:bin]!++;
 }
 function snapshot(){
  const to=now(),index=Math.floor(to/minute),total=empty(),grouped=new Map<string,Counts>();prune(index);
  const merge=(target:Counts,v:Counts)=>{
   for(const k of ['samples','success','rejected','failed','other'] as const)target[k]+=v[k];
   for(let i=0;i<v.histogram.length;i++)target.histogram[i]!+=v.histogram[i]!;
   for(const key of categories)target.errors[key]+=v.errors[key];
  };
  for(const bucket of buckets.values())for(const [route,v]of bucket){const t=grouped.get(route)??empty();merge(t,v);grouped.set(route,t);merge(total,v);}
  const p95=(v:Counts)=>{if(!v.samples)return null;let count=0;return bounds.find((_,i)=>(count+=v.histogram[i]!)>=Math.ceil(v.samples*.95))??null;};
  const summarize=(v:Counts)=>({samples:v.samples,success:v.success,rejected:v.rejected,failed:v.failed,other:v.other,p95UpperMs:p95(v),errors:Object.fromEntries(Object.entries(v.errors).filter(([,n])=>n>0))});
  return {processId,from:new Date(Math.min(to,Math.max(started,(index-windowMinutes+1)*minute))).toISOString(),to:new Date(to).toISOString(),...summarize(total),boundsMs:bounds,histogram:total.histogram,routes:[...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([route,v])=>({route,...summarize(v)}))};
 }
 return {observe,snapshot};
}

export function installRuntimeTelemetry(app:FastifyInstance) {
 const telemetry=createRuntimeTelemetry(),observed=new WeakMap<FastifyRequest,Category>();
 app.addHook('onError',async(req,_reply,error)=>{if(!observed.has(req))observed.set(req,failureCategory(error));});
 app.addHook('onResponse',async(req,reply)=>telemetry.observe(req.method,req.routeOptions.url,reply.statusCode,reply.elapsedTime,observed.get(req)));
 return {snapshot:telemetry.snapshot,reject:(req:FastifyRequest,code:string)=>observed.set(req,businessCategory(code))};
}

export type Job='passive_income'|'autonomous_economy'|'autonomous_combat'|'crime_economy';
interface Schedule {job:Job;enabled:boolean;intervalMs:number;nextDueAt:string|null;lastAttemptAt:string|null;lastSuccessAt:string|null;failureAt:string|null;failure:Category|null;inFlight:boolean;}
const jobs=new Map<Job,Schedule>();
export const schedulerSnapshot=()=>[...jobs.values()].map(j=>({...j}));
export function observeSchedule(job:Job|undefined,enabled:boolean,intervalMs:number){
 if(!job)return;
 const at=()=>new Date().toISOString();
 const value:Schedule={job,enabled,intervalMs,nextDueAt:null,lastAttemptAt:null,lastSuccessAt:null,failureAt:null,failure:null,inFlight:false};
 jobs.set(job,value);
 return {
  due:()=>{value.nextDueAt=new Date(Date.now()+intervalMs).toISOString();},
  attempt:()=>{value.lastAttemptAt=at();value.inFlight=true;},
  success:()=>{value.lastSuccessAt=at();value.inFlight=false;},
  failure:(error:unknown)=>{value.failureAt=at();value.failure=failureCategory(error);value.inFlight=false;},
  stop:()=>{value.enabled=false;value.nextDueAt=null;}
 };
}
