import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type {Config} from '../src/config.js';
import {createRuntimeTelemetry,schedulerSnapshot} from '../src/owner-runtime-telemetry.js';
import {registerOwnerRuntime} from '../src/owner-runtime.js';
import {startScheduledBotWork} from '../src/bot-schedule.js';

test('rolling process metrics separate business rejections and faults with bounded route groups',()=>{
 let at=Date.UTC(2026,10,10),now=()=>at;
 const t=createRuntimeTelemetry(now);
 t.observe('GET','/healthz',200,2);
 t.observe('GET','/owner-runtime/v1',200,2);
 t.observe('POST','/api/v1/quests/:id',409,11,'resource_shortage');
 t.observe('POST','/api/v1/quests/:id',503,42,'database');
 t.observe('POST','/api/v1/quests/:id',200,19);
 t.observe('GET','/other',404,9);
 const first=t.snapshot();
 assert.equal(first.samples,4);
 assert.deepEqual([first.success,first.rejected,first.failed,first.other],[1,1,1,1]);
 assert.equal(first.p95UpperMs,50);
 assert.deepEqual(first.errors,{resource_shortage:1,database:1});
 for(let i=0;i<90;i++)t.observe('GET','/registered-'+i,200,100);
 assert.ok(t.snapshot().routes.length<=65);
 assert.ok(t.snapshot().routes.some(r=>r.route==='Other routes'));
 at+=60*60000;
 assert.equal(t.snapshot().samples,0);
 assert.notEqual(createRuntimeTelemetry(now).snapshot().processId,first.processId);
});

test('runtime route rejects browser, method, wrong environment and token and reports only scoped summaries',async()=>{
 const token='synthetic-'+ 'a'.repeat(56);
 const env={OWNER_RUNTIME_READ_TOKEN:token,RAILWAY_PROJECT_ID:'41a664f1-06bb-492e-90ef-cfd9635fc67f',RAILWAY_ENVIRONMENT_ID:'8ced8aef-352e-4ea9-931d-8963ff352c1c',RAILWAY_SERVICE_ID:'47a56e8e-aa72-40df-a5c4-0e5feb0f5cdd',RAILWAY_GIT_COMMIT_SHA:'a'.repeat(40)};
 const config={developmentBotRecruitmentEnabled:false,developmentBotBountiesEnabled:false,livingBotEconomyEnabled:false,livingBotCombatEnabled:false} as Config;
 const app=Fastify(),telemetry=registerOwnerRuntime(app,config,{env})!;
 app.get('/fake/:id',async()=>({hello:'World'}));
 app.post('/fake/:id',async(req,reply)=>{telemetry.reject(req,'INSUFFICIENT_CASH');return reply.code(409).send({private:'must not appear'});});
 const headers={authorization:'Bearer '+token};
 try{
  assert.equal((await app.inject({url:'/owner-runtime/v1'})).statusCode,403);
  assert.equal((await app.inject({url:'/owner-runtime/v1',headers:{...headers,origin:'http://localhost'}})).statusCode,403);
  assert.equal((await app.inject({url:'/owner-runtime/v1',method:'POST',headers})).statusCode,404);
  assert.equal((await app.inject({url:'/owner-runtime/v1',method:'HEAD',headers})).statusCode,404);
  await app.inject({url:'/fake/do-not-log-this-player'});
  await app.inject({url:'/fake/do-not-log-this-player',method:'POST'});
  const r=await app.inject({url:'/owner-runtime/v1',headers});
  assert.equal(r.statusCode,200);assert.equal(r.headers['set-cookie'],undefined);
  assert.equal(r.json().telemetry.rejected,1);assert.equal(r.json().telemetry.samples,2);
  assert.doesNotMatch(r.body,/do-not-log-this-player|must not appear|synthetic-/);
 }finally{await app.close();}
 const wrong=Fastify();registerOwnerRuntime(wrong,config,{env:{...env,RAILWAY_ENVIRONMENT_ID:'wrong'}});
 try{assert.equal((await wrong.inject({url:'/owner-runtime/v1',headers})).statusCode,404);}finally{await wrong.close();}
});

test('real scheduler wrapper records failure and completion while retaining non-overlap',async()=>{
 let attempts=0,release!:()=>void,finish!:()=>void,errors=0;
 const done=new Promise<void>(resolve=>{finish=resolve;});
 const stop=startScheduledBotWork(async()=>{attempts++;if(attempts===1)throw Object.assign(Error('private details'),{code:'57014'});await new Promise<void>(resolve=>{release=resolve;finish();});},true,15,()=>{errors++;},'autonomous_economy');
 const timeout=setTimeout(()=>finish(),2000);
 try{
  await done;assert.equal(errors,1);assert.equal(typeof release,'function');
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(attempts,2);const row=schedulerSnapshot().find(j=>j.job==='autonomous_economy')!;
  assert.equal(row.failure,'deadline');assert.ok(row.lastAttemptAt&&row.nextDueAt&&row.failureAt&&row.inFlight);
 }finally{clearTimeout(timeout);release?.();await stop();}
 assert.ok(schedulerSnapshot().find(j=>j.job==='autonomous_economy')?.lastSuccessAt);
});
