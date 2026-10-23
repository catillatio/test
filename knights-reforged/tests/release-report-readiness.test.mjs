import test from 'node:test';
import assert from 'node:assert/strict';
import {getReport,getFile} from '../deployment/release/transfer.mjs';
import {checkJobReport,copyName,protocol} from '../deployment/release/protocol.mjs';

// No sockets, credentials, provider responses or real-time polling. Simulate an
// exact-object S3 grant before/after the worker's conditional report PUT.
const url='https://recovery.fixture.invalid/exact-report?X-Amz-Signature=synthetic-only';
const secret='synthetic-provider-output-with-private-url-and-credential';
const epoch=Date.parse('2050-01-01T00:00:00Z');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function harness(t,handler){
 t.mock.timers.enable({apis:['setTimeout','Date'],now:epoch});
 const requests=[],statuses=[];
 t.mock.method(globalThis,'fetch',async(target,options)=>{
  assert.equal(target,url);assert.equal(options.redirect,'error');
  assert.ok(options.signal instanceof AbortSignal);
  requests.push({target,options});return handler(requests.length,options);
 });
 return {requests,statuses,read:(options={})=>getReport(url,{wait:true,onStatus:code=>statuses.push(code),...options})};
}
function pending(status=403){
 const body=new ReadableStream({pull(){throw new Error('An error body must never be read.');}});
 return new Response(body,{status});
}
const capture=operation=>operation.then(value=>({value}),error=>({error}));

for(const code of [403,404])test('a not-yet-created report returning '+code+' is polled until the same object is ready',async t=>{
 let written=false,cancels=0;
 const h=harness(t,()=>written?Response.json({passed:true}):new Response(new ReadableStream({cancel(){cancels++;}}),{status:code}));
 const result=capture(h.read());await flush();
 assert.equal(h.requests.length,1);assert.equal(cancels,1);
 t.mock.timers.tick(3000);await flush();assert.equal(h.requests.length,2);
 assert.equal(cancels,2);written=true;
 t.mock.timers.tick(3000);await flush();
 assert.deepEqual(await result,{value:{passed:true}});
 assert.equal(h.requests.length,3);assert.deepEqual(h.statuses,['HTTP_'+code,'JSON_RECEIVED']);
 for(const {options}of h.requests)assert.equal(options.cache,'no-store');
});

test('mixed 404/403 readiness responses only produce each fixed status once',async t=>{
 const codes=[404,403,404,403,200];
 const h=harness(t,n=>codes[n-1]===200?Response.json({passed:true}):pending(codes[n-1]));
 const result=capture(h.read());await flush();
 for(let i=0;i<4;i++){t.mock.timers.tick(3000);await flush();}
 assert.deepEqual(await result,{value:{passed:true}});
 assert.deepEqual(h.statuses,['HTTP_404','HTTP_403','JSON_RECEIVED']);
});

for(const code of [403,404])test('persistent '+code+' fails closed at the existing 20-minute deadline',async t=>{
 const h=harness(t,()=>pending(code));const result=capture(h.read());await flush();
 for(let i=0;i<400;i++){t.mock.timers.tick(3000);await flush();}
 assert.ok((await result).error);assert.equal(h.requests.length,400);
 assert.deepEqual(h.statuses,['HTTP_'+code,'DEADLINE']);
 t.mock.timers.tick(30000);await flush();assert.equal(h.requests.length,400);
});

test('a caller cannot extend the existing 20-minute maximum',async t=>{
 const h=harness(t,()=>pending(403));const result=capture(h.read({deadline:epoch+3600000}));await flush();
 t.mock.timers.tick(1200000);await flush();
 assert.ok((await result).error);assert.equal(h.requests.length,1);
 assert.deepEqual(h.statuses,['HTTP_403','DEADLINE']);
});

test('a shorter deadline stops before another GET, including a partial polling interval',async t=>{
 const h=harness(t,()=>pending(404));const result=capture(h.read({deadline:epoch+4500}));await flush();
 t.mock.timers.tick(3000);await flush();assert.equal(h.requests.length,2);
 t.mock.timers.tick(1499);await flush();assert.equal(h.requests.length,2);
 t.mock.timers.tick(1);await flush();assert.ok((await result).error);
 assert.equal(h.requests.length,2);assert.deepEqual(h.statuses,['HTTP_404','DEADLINE']);
});

test('an already expired deadline never contacts the object store',async t=>{
 const h=harness(t,()=>assert.fail('Unexpected request'));
 assert.ok((await capture(h.read({deadline:epoch}))).error);assert.equal(h.requests.length,0);
 assert.deepEqual(h.statuses,['DEADLINE']);
});

for(const reason of ['SignatureDoesNotMatch','ExpiredToken','RequestTimeTooSkewed','AccessDenied'])test(reason+' in a 403 body cannot authorize a report or disclose provider details',async t=>{
 // 403 alone is ambiguous; no XML/body heuristics or credential re-signing.
 const h=harness(t,()=>new Response('<Error><Code>'+reason+'</Code><Message>'+secret+'</Message></Error>',{status:403}));
 const result=capture(h.read({deadline:epoch+1000}));await flush();t.mock.timers.tick(1000);await flush();
 const {error}=await result;assert.ok(error);assert.doesNotMatch(error.message,new RegExp(secret+'|'+reason));
 assert.equal(h.requests.length,1);assert.deepEqual(h.statuses,['HTTP_403','DEADLINE']);
});

test('untrusted error bodies/headers are never inspected or logged',async t=>{
 let canceled=0;
 const h=harness(t,()=>({status:403,body:{cancel:async()=>{canceled++;}},get text(){throw new Error(secret);},get headers(){throw new Error(secret);}}));
 const result=capture(h.read({deadline:epoch+10}));await flush();t.mock.timers.tick(10);await flush();
 assert.ok((await result).error);assert.equal(canceled,1);
 assert.deepEqual(h.statuses,['HTTP_403','DEADLINE']);
});

for(const code of [401,429,500,502,503,504,301,418])test('HTTP '+code+' is not reclassified as report readiness',async t=>{
 const h=harness(t,()=>pending(code));
 assert.ok((await capture(h.read())).error);assert.equal(h.requests.length,1);
 assert.deepEqual(h.statuses,['HTTP_'+code,'HTTP_REJECTED']);
});

for(const code of [403,404])test('non-polling report reads still reject '+code+' immediately',async t=>{
 const h=harness(t,()=>pending(code));assert.ok((await capture(h.read({wait:false}))).error);
 assert.equal(h.requests.length,1);assert.deepEqual(h.statuses,['HTTP_'+code,'HTTP_REJECTED']);
});

test('transport, redirect and TLS failures are not retried or disclosed',async t=>{
 const h=harness(t,()=>{throw new Error(secret);});const {error}=await capture(h.read());
 assert.ok(error);assert.doesNotMatch(error.message,/synthetic-provider/);
 assert.equal(h.requests.length,1);assert.deepEqual(h.statuses,['TRANSPORT_FAILURE']);
});

test('external abort cancels a pending request without another GET',async t=>{
 const controller=new AbortController();
 const h=harness(t,(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error(secret)),{once:true})));
 const result=capture(h.read({signal:controller.signal}));await flush();controller.abort(new Error(secret));await flush();
 assert.ok((await result).error);assert.equal(h.requests.length,1);assert.deepEqual(h.statuses,['ABORTED']);
});

test('external abort during a readiness wait stops polling',async t=>{
 const controller=new AbortController(),h=harness(t,()=>pending());
 const result=capture(h.read({signal:controller.signal}));await flush();controller.abort(new Error(secret));await flush();
 assert.ok((await result).error);t.mock.timers.tick(3000);await flush();
 assert.equal(h.requests.length,1);assert.deepEqual(h.statuses,['HTTP_403','ABORTED']);
});

test('an already aborted request does not contact the store',async t=>{
 const controller=new AbortController();controller.abort(new Error(secret));
 const h=harness(t,()=>assert.fail('Unexpected request'));assert.ok((await capture(h.read({signal:controller.signal}))).error);
 assert.equal(h.requests.length,0);assert.deepEqual(h.statuses,['ABORTED']);
});

test('each GET retains its 15-second timeout, shortened to the remaining deadline',async t=>{
 const timeouts=[];
 t.mock.method(AbortSignal,'timeout',ms=>{timeouts.push(ms);return new AbortController().signal;});
 const h=harness(t,()=>pending());const result=capture(h.read({deadline:epoch+16000}));await flush();
 t.mock.timers.tick(3000);await flush();assert.deepEqual(timeouts,[15000,13000]);
 t.mock.timers.tick(13000);await flush();assert.ok((await result).error);assert.equal(h.requests.length,2);
});

test('a response that arrives at or after the deadline is not accepted',async t=>{
 const h=harness(t,()=>{t.mock.timers.tick(1000);return Response.json({passed:true});});
 assert.ok((await capture(h.read({deadline:epoch+1000}))).error);
 assert.deepEqual(h.statuses,['DEADLINE']);
});

test('an oversized report fails closed without polling or printing its contents',async t=>{
 const h=harness(t,()=>new Response('x'.repeat(100001)));
 const {error}=await capture(h.read());assert.ok(error);assert.equal(h.requests.length,1);
 assert.ok(h.statuses.includes('REPORT_TOO_LARGE'));assert.ok(!h.statuses.includes('JSON_RECEIVED'));
});

test('invalid JSON is fatal even after a pending response becomes HTTP 200',async t=>{
 const h=harness(t,n=>n===1?pending():new Response(secret));const result=capture(h.read());await flush();
 t.mock.timers.tick(3000);await flush();const {error}=await result;assert.ok(error);
 assert.doesNotMatch(error.message,/synthetic-provider/);assert.deepEqual(h.statuses,['HTTP_403','INVALID_JSON']);
});

test('independent ciphertext download never receives report polling behavior',async t=>{
 const h=harness(t,()=>pending());await assert.rejects(getFile(url,'must-not-be-created',{}));
 assert.equal(h.requests.length,1);assert.deepEqual(h.statuses,[]);
});

function evidence(){
 const ids=Array.from({length:5},(_,i)=>(i+1).toString().repeat(8)+'-1111-4111-8111-111111111111');
 const expected={protocol,jobId:'gh_123_1_'+'c'.repeat(32),mode:'prepare',sha:'a'.repeat(40),candidateDigest:'b'.repeat(64),projectId:ids[0],environmentId:ids[1],gameServiceId:ids[2],workerServiceId:ids[3],sourceHost:'game-db.railway.internal',sourceDatabase:'railway',restoreHost:'restore-db.railway.internal',backupRecipient:'age1'+'a'.repeat(58)};
 expected.copy=copyName(expected.jobId);
 return {expected,report:{...expected,passed:true,workerDeploymentId:ids[4],sourceClusterDigest:'1'.repeat(64),restoreClusterDigest:'2'.repeat(64),accounts:452,bots:450,
  backup:{sha256:'3'.repeat(64),bytes:200000,encryptedSha256:'4'.repeat(64),encryptedBytes:200500,recipient:expected.backupRecipient,conditionalWriteVerified:true,exportRoundTripVerified:true},
  restoredCopy:{passed:true,accounts:452,bots:450,existingTablesVerified:64,migrationReplay:'unchanged',liveDatabaseConnected:false,restoredDatabase:expected.copy,restoredHost:expected.restoreHost,sha256:'5'.repeat(64)}}};
}
for(const mutation of ['none','passed','jobId','sha','projectId','workerServiceId','backup','restoredCopy'])test('a retrieved report still passes every existing identity/restore gate: '+mutation,async t=>{
 const {expected,report}=evidence();
 if(mutation==='passed')report.passed=false;
 else if(mutation==='backup')report.backup.exportRoundTripVerified=false;
 else if(mutation==='restoredCopy')report.restoredCopy.liveDatabaseConnected=true;
 else if(mutation!=='none')report[mutation]='wrong';
 const h=harness(t,n=>n===1?pending(403):Response.json(report));const result=capture(h.read());await flush();
 t.mock.timers.tick(3000);await flush();const received=(await result).value;assert.ok(received);
 if(mutation==='none')assert.equal(checkJobReport(received,expected),received);
 else assert.throws(()=>checkJobReport(received,expected));
 assert.deepEqual(h.statuses,['HTTP_403','JSON_RECEIVED']);
});


test('an interrupted report body cannot be accepted or retried as readiness',async t=>{
 const h=harness(t,()=>new Response(new ReadableStream({start(controller){controller.error(new Error(secret));}})));
 const {error}=await capture(h.read());assert.ok(error);assert.doesNotMatch(error.message,/synthetic-provider/);
 assert.equal(h.requests.length,1);assert.deepEqual(h.statuses,['BODY_REJECTED']);
});

test('an external abort while streaming a report stops without accepting partial JSON',async t=>{
 const controller=new AbortController();
 const h=harness(t,(_,options)=>new Response(new ReadableStream({start(stream){
  stream.enqueue(Buffer.from('{"passed":'));
  options.signal.addEventListener('abort',()=>stream.error(new Error(secret)),{once:true});
 }})));
 const result=capture(h.read({signal:controller.signal}));await flush();controller.abort(new Error(secret));await flush();
 const {error}=await result;assert.ok(error);assert.doesNotMatch(error.message,/synthetic-provider/);
 assert.equal(h.requests.length,1);assert.deepEqual(h.statuses,['ABORTED']);
});

test('a worker publishing its report after one minute is retrieved without an early authorization failure',async t=>{
 const h=harness(t,()=>Date.now()<epoch+60000?pending(403):Response.json({passed:true}));
 const result=capture(h.read());await flush();
 for(let i=0;i<20;i++){t.mock.timers.tick(3000);await flush();}
 assert.deepEqual(await result,{value:{passed:true}});assert.equal(h.requests.length,21);
 assert.deepEqual(h.statuses,['HTTP_403','JSON_RECEIVED']);
});

test('a request timeout fails closed at 15 seconds without starting another request',async t=>{
 const h=harness(t,(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error(secret)),{once:true})));
 t.mock.method(AbortSignal,'timeout',ms=>{const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal;});
 const result=capture(h.read());await flush();t.mock.timers.tick(15000);await flush();
 assert.ok((await result).error);assert.equal(h.requests.length,1);assert.deepEqual(h.statuses,['TRANSPORT_FAILURE']);
});

test('a stalled body is aborted at the remaining overall deadline',async t=>{
 const h=harness(t,(_,options)=>new Response(new ReadableStream({start(stream){
  options.signal.addEventListener('abort',()=>stream.error(new Error(secret)),{once:true});
 }})));
 t.mock.method(AbortSignal,'timeout',ms=>{const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal;});
 const result=capture(h.read({deadline:epoch+7000}));await flush();t.mock.timers.tick(7000);await flush();
 assert.ok((await result).error);assert.equal(h.requests.length,1);assert.deepEqual(h.statuses,['DEADLINE']);
});


test('every non-200 integer HTTP status from 100 to 599 is exact and fails closed without retry',async t=>{
 let code=100,canceled=0;
 const h=harness(t,()=>({status:code,body:{cancel:async()=>{canceled++;}}}));
 for(code=100;code<=599;code++){
  if(code===200)continue; // Success remains JSON_RECEIVED, covered above.
  const previous=h.requests.length;h.statuses.length=0;
  const {error}=await capture(h.read({wait:false}));
  assert.ok(error);assert.equal(h.requests.length,previous+1);
  assert.deepEqual(h.statuses,['HTTP_'+code,'HTTP_REJECTED']);
 }
 assert.equal(canceled,499);
});

for(const code of [201,204,206,299,300,302,307,308,400,405,408,409,418,422,451,499,501,505,520,599])test('HTTP '+code+' previously hidden as HTTP_OTHER is exact and fatal even in polling mode',async t=>{
 const h=harness(t,()=>({status:code,body:{cancel:async()=>{}}}));
 const {error}=await capture(h.read());assert.ok(error);
 t.mock.timers.tick(30000);await flush();assert.equal(h.requests.length,1);
 assert.deepEqual(h.statuses,['HTTP_'+code,'HTTP_REJECTED']);
});

test('invalid status values are never coerced or inserted into diagnostics',async t=>{
 let code;
 const poison={toString(){throw new Error(secret);},valueOf(){throw new Error(secret);}};
 const h=harness(t,()=>({status:code,body:{cancel:async()=>{}},get text(){throw new Error(secret);},get headers(){throw new Error(secret);}}));
 for(code of [undefined,null,true,false,0,99,600,-1,400.5,NaN,Infinity,-Infinity,400n,'400',secret,Symbol(secret),poison]){
  const previous=h.requests.length;h.statuses.length=0;
  const {error}=await capture(h.read());assert.ok(error);assert.doesNotMatch(error.message,/synthetic-provider/);
  assert.equal(h.requests.length,previous+1);assert.deepEqual(h.statuses,['HTTP_OTHER','HTTP_REJECTED']);
 }
});

test('capture the numeric status once so a changing getter cannot inject provider text',async t=>{
 let reads=0,canceled=0;
 const h=harness(t,()=>({get status(){return ++reads===1?400:secret;},body:{cancel:async()=>{canceled++;}},get headers(){throw new Error(secret);},get text(){throw new Error(secret);}}));
 const {error}=await capture(h.read());assert.ok(error);assert.equal(reads,1);assert.equal(canceled,1);
 assert.equal(h.requests.length,1);assert.deepEqual(h.statuses,['HTTP_400','HTTP_REJECTED']);
 assert.doesNotMatch(JSON.stringify(h.statuses)+error.message,/synthetic-provider/);
});


test('404 followed by an unexpected status stops immediately and never consumes a later success',async t=>{
 const h=harness(t,n=>n===1?pending(404):n===2?pending(400):Response.json({passed:true}));
 const result=capture(h.read());await flush();t.mock.timers.tick(3000);await flush();
 assert.ok((await result).error);assert.equal(h.requests.length,2);
 assert.deepEqual(h.statuses,['HTTP_404','HTTP_400','HTTP_REJECTED']);
 t.mock.timers.tick(30000);await flush();assert.equal(h.requests.length,2);
});
