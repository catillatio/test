import type {FastifyInstance} from 'fastify';import type {Config} from './config.js';import {createHash,timingSafeEqual} from 'node:crypto';import {installRuntimeTelemetry,schedulerSnapshot} from './owner-runtime-telemetry.js';
const ownerGame='kingdom';
const digest=(s:string)=>createHash('sha256').update(s).digest();
const startedAt=new Date(Date.now()-process.uptime()*1000).toISOString();
export interface RuntimePayments{mode:'disabled'|'test'|'live'|'unavailable';enabled:boolean|null;webReady:boolean|null;playReady:boolean|null;}
export function registerOwnerRuntime(app:FastifyInstance,config:Config,options:{env?:NodeJS.ProcessEnv;payments?:()=>Promise<RuntimePayments>}={}){
 const env=options.env??process.env,token=env.OWNER_RUNTIME_READ_TOKEN,environment='production';
 const installed=!!token&&token.length>=48&&env.RAILWAY_PROJECT_ID==='41a664f1-06bb-492e-90ef-cfd9635fc67f'&&env.RAILWAY_ENVIRONMENT_ID==='8ced8aef-352e-4ea9-931d-8963ff352c1c'&&env.RAILWAY_SERVICE_ID==='47a56e8e-aa72-40df-a5c4-0e5feb0f5cdd';
 const telemetry=installed?installRuntimeTelemetry(app):null;
 app.get('/owner-runtime/v1',{exposeHeadRoute:false},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  if(!installed||!telemetry)return reply.code(404).send({error:'Owner runtime observation is not installed.'});
  if(request.headers.origin!==undefined||!timingSafeEqual(digest(request.headers.authorization??''),digest('Bearer '+token)))return reply.code(403).send({error:'Monitoring capability required.'});
  const sourceSha=ownerGame==='kingdom'?(env.KINGDOM_RELEASE_SHA??env.RAILWAY_GIT_COMMIT_SHA):env.RAILWAY_GIT_COMMIT_SHA;
  return {api:1,game:ownerGame,environment,collectedAt:new Date().toISOString(),build:{commit:/^[a-f0-9]{40}$/.test(sourceSha??'')?sourceSha:null,label:env.OWNER_BUILD_LABEL??null,startedAt,deploymentId:env.RAILWAY_DEPLOYMENT_ID??null,android:null},policies:{npcPurchases:config.livingBotEconomyEnabled,npcDuels:config.livingBotCombatEnabled,npcRecruitment:config.developmentBotRecruitmentEnabled,npcBounties:config.developmentBotBountiesEnabled},telemetry:telemetry.snapshot(),schedulers:schedulerSnapshot(),payments:options.payments?await options.payments():{mode:'unavailable',enabled:null,webReady:null,playReady:null}};
 });
 return telemetry;
}
