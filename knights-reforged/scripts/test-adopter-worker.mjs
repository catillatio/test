// Disposable real-image/PG18/TLS rehearsal. No Railway or GitHub mutation.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm,rename,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,generateKeyPairSync,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {prepareDatabase} from './fixtures/retention-delivery-database.mjs';
import {fixture} from '../tests/fixtures/release-retention.mjs';
import {recordObservation,observationPayload} from '../deployment/release/retention/observation.mjs';
import {hash} from '../deployment/release/retention/protocol.mjs';
import {rawDigest,verifyAdoptionPreservation} from '../deployment/release/retention/delivery/adoption-operation.mjs';
import {signArm,receipt} from '../deployment/release/retention/delivery/protocol.mjs';
import {verifyAdoption} from '../deployment/release/retention/verification.mjs';
import {snapshot} from '../deployment/release/retention/retention.mjs';
const image=process.env.KINGDOM_RETENTION_ADOPTER_IMAGE;assert.match(image??'',/^kingdom-come:[a-z0-9-]+$/);
const dockerEnv={...process.env};for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[k];
const docker=(...args)=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv,encoding:'utf8',maxBuffer:5000000,stdio:['ignore','pipe','pipe']}).trim();
const app=fileURLToPath(new URL('../',import.meta.url)),name='kc-adopter-test-'+randomUUID().slice(0,8),net=name,dir=await mkdtemp(join(tmpdir(),name+'-')),containers=[];
const save=async(n,v)=>{await writeFile(join(dir,n+'.next'),JSON.stringify(v),{mode:0o600});await rename(join(dir,n+'.next'),join(dir,n));};
const wait=async fn=>{const end=Date.now()+30000;for(;;){const v=await fn();if(v)return v;assert.ok(Date.now()<end,'Disposable adopter deadline');await delay(100);}};
const objectFile=key=>join(dir,'objects',createHash('sha256').update(key).digest('hex'));
const put=async(key,value)=>writeFile(objectFile(key),JSON.stringify(value),{mode:0o600,flag:'wx'});
const load=async key=>{try{return JSON.parse(await readFile(objectFile(key),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
let fixtureDb,runtime;
try{
 const config=JSON.parse(docker('image','inspect',image))[0].Config;assert.equal(config.User,'node');assert.deepEqual(config.Entrypoint,['node','deployment/release/retention/delivery/adopter.mjs']);
 assert.equal(docker('run','--rm','--network','none','--read-only',image),'RETENTION_ADOPTER: DISABLED');
 const imageIdentity=JSON.parse(docker('run','--rm','--network','none','--entrypoint','cat',image,'/app/delivery-image.json'));assert.equal(imageIdentity.role,'adopter');
 await mkdir(join(dir,'objects'),{mode:0o700});await save('grants.json',[]);docker('network','create',net);
 const pgName=name+'-pg';containers.push(pgName);docker('run','-d','--name',pgName,'--network',net,'--network-alias','copy.railway.internal','--tmpfs','/var/lib/postgresql','-p','127.0.0.1::5432','-e','POSTGRES_USER=knights','-e','POSTGRES_PASSWORD=disposable-only','-e','POSTGRES_DB=kingdom_adopter_test','postgres:18-bookworm');
 await wait(()=>docker('exec',pgName,'pg_isready','-h','127.0.0.1','-U','knights','-d','kingdom_adopter_test').includes('accepting'));
 const port=docker('port',pgName,'5432/tcp').split(':').at(-1),url=new URL('postgres://knights:disposable-only@127.0.0.1:'+port+'/kingdom_adopter_test');
 const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:app,encoding:'utf8'}).trim();fixtureDb=await prepareDatabase(url,randomUUID(),sha);
 const {scope,db}=fixtureDb;for(const oid of ['106971','129180'])await db.query('CREATE DATABASE kc_adopter_emergency_'+oid+' WITH OID = '+oid);
 const target=fixture(1901,{now:Date.now(),age:0});await db.query('CREATE DATABASE '+target.database.name);
 target.database.oid=(await db.query('SELECT oid::text FROM pg_database WHERE datname=$1',[target.database.name])).rows[0].oid;
 Object.assign(target.catalog.evidence.report,{restoreClusterDigest:scope.clusterDigest,verifiedCopyIdentity:{oid:target.database.oid,owner:'knights',maintenanceDatabase:scope.adminDatabase,clusterDigest:scope.clusterDigest}});
 await db.query('SET SESSION AUTHORIZATION kc_copy_registrar');try{await recordObservation(db,observationPayload(target.catalog.evidence));}finally{await db.query('RESET SESSION AUTHORIZATION');}
 const runtimeUrl=new URL(url);runtimeUrl.username='kc_retention_runtime';runtimeUrl.password='disposable-runtime-only';runtime=new pg.Client({connectionString:runtimeUrl.href});await runtime.connect();
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',join(dir,'server.key'),'-out',join(dir,'server.crt'),'-subj','/CN=adopter-fixture','-addext','subjectAltName=DNS:api.github.com,DNS:realm.fixture.invalid,DNS:objects.fixture.invalid','-addext','basicConstraints=critical,CA:TRUE'],{stdio:'ignore'});
 await chmod(join(dir,'server.crt'),0o644);await writeFile(join(dir,'server.mjs'),await readFile(new URL('./fixtures/retention-delivery-server.mjs',import.meta.url)),{mode:0o600});
 await save('provider.json',{});await save('control.json',{runId:'999',sha,status:'in_progress'});
 const server=name+'-tls';containers.push(server);docker('run','-d','--name',server,'--user',String(process.getuid()),'--network',net,'--network-alias','api.github.com','--network-alias','realm.fixture.invalid','--network-alias','objects.fixture.invalid','--sysctl','net.ipv4.ip_unprivileged_port_start=0','--mount','type=bind,src='+dir+',dst=/fixture','--entrypoint','node',image,'/fixture/server.mjs');
 await wait(()=>{try{docker('exec',server,'node','-e','const n=require("net").connect(443,"127.0.0.1");n.on("connect",()=>{n.end();process.exit(0)});n.on("error",()=>process.exit(1));');return true;}catch{return false;}});
 const owner=async()=>(await db.query('SELECT r.rolname AS owner FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=$1',[target.database.name])).rows[0].owner;
 let before;
 for(const cancel of [true,false]){
  const requestId=randomUUID(),deploymentId=randomUUID(),key=generateKeyPairSync('ed25519'),grants=[];
  const grant=(name,method)=>{const k=requestId+'/'+name,url='https://objects.fixture.invalid/'+k+'?method='+method;grants.push({url,key:k,method});return url;};
  const bytes=Buffer.from(JSON.stringify(target.catalog.evidence)),adoption={serviceId:randomUUID(),futureAfter:new Date(Date.now()-600000).toISOString()};
  const state={...fixtureDb.state,observedAt:new Date().toISOString(),closedJobIds:[...fixtureDb.state.closedJobIds,target.jobId]};
  const data={protocol:'kingdom-retention-delivery-v1',scope,coordinator:state.coordinator,state,requestId,operation:'adopt',data:{manifestBytes:bytes.toString('base64url'),manifestSha256:rawDigest(bytes),expectedOid:target.database.oid,artifactId:'123',adoption}};delete data.coordinator;
  const urls={inputGet:grant('input.json','GET'),readyPut:grant('adopter-ready.json','PUT'),armGet:grant('adopter-arm.json','GET'),resultPut:grant('adopter-result.json','PUT'),baselinePut:grant('adoption-baseline.json','PUT'),baselineGet:grant('adoption-baseline.json','GET'),proceedGet:grant('adopter-proceed.json','GET')};
  const f={protocol:data.protocol,role:'adopter',operation:'adopt',requestId,scope,coordinator:state.coordinator,adoption,codeDigest:imageIdentity.codeDigest,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),githubToken:'disposable-read-token',origin:'https://objects.fixture.invalid',urls,deliveryVerifyKey:key.publicKey.export({type:'spki',format:'pem'})};
  await save('grants.json',grants);await save('control.json',{runId:'999',sha,status:'in_progress',reviewComment:'adoption '+requestId+' '+hash(data)});await put(requestId+'/input.json',data);
  const env={NODE_ENV:'production',KINGDOM_RETENTION_ADOPTER_ENABLED:'1',KINGDOM_RETENTION_JOB:Buffer.from(JSON.stringify(f)).toString('base64url'),RAILWAY_PROJECT_ID:scope.projectId,RAILWAY_ENVIRONMENT_ID:scope.environmentId,RAILWAY_SERVICE_ID:adoption.serviceId,RAILWAY_DEPLOYMENT_ID:deploymentId,KINGDOM_RETENTION_ADOPTER_DB_HOST:scope.host,KINGDOM_RETENTION_ADOPTER_DB_USER:'knights',KINGDOM_RETENTION_ADOPTER_DB_PASSWORD:'disposable-only',KINGDOM_RETENTION_ADOPTER_DB_NAME:scope.adminDatabase,NODE_EXTRA_CA_CERTS:'/run/adopter-fixture-ca.pem'};
  const worker=name+'-'+(cancel?'cancel':'success');containers.push(worker);docker('run','-d','--name',worker,'--network',net,'--read-only','--mount','type=bind,src='+join(dir,'server.crt')+',dst=/run/adopter-fixture-ca.pem,readonly',...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),image);
  const ready=await wait(()=>load(requestId+'/adopter-ready.json'));receipt(ready,f,deploymentId,'ready');
  await put(requestId+'/adopter-arm.json',signArm(f,deploymentId,hash(data),key.privateKey));
  before=await wait(()=>load(requestId+'/adoption-baseline.json'));assert.equal(await owner(),'knights');assert.ok(before.databases.some(d=>d.oid==='106971')&&before.databases.some(d=>d.oid==='129180'));
  if(cancel)await save('control.json',{runId:'999',sha,status:'completed',reviewComment:'adoption '+requestId+' '+hash(data)});
  else await put(requestId+'/adopter-proceed.json',signArm(f,deploymentId,hash(data),key.privateKey,hash(before)));
  await wait(()=>JSON.parse(docker('inspect',worker))[0].State.Running===false);
  const code=JSON.parse(docker('inspect',worker))[0].State.ExitCode;
  if(cancel){assert.notEqual(code,0);assert.equal(await owner(),'knights');assert.equal((await db.query('SELECT count(*)::int AS n FROM release_retention.copies')).rows[0].n,5);}
  else{assert.equal(code,0,'Adopter must exit successfully');const outcome=await load(requestId+'/adopter-result.json');receipt(outcome.receipt,f,deploymentId,'completed');assert.equal(outcome.baselineDigest,hash(before));assert.equal(await owner(),'kc_release_copy_owner');}
 }
 await verifyAdoption(runtime,target.catalog.evidence,scope);assert.equal(verifyAdoptionPreservation(before,await snapshot(runtime),observationPayload(target.catalog.evidence)).allUntargetedIdentitiesPreserved,true);
 await fixtureDb.preservation();assert.equal((await db.query('SELECT count(*)::int AS n FROM release_retention.permits')).rows[0].n,0);
 await mkdir(join(app,'test-results'),{recursive:true});await writeFile(join(app,'test-results/adopter-worker-verification.json'),JSON.stringify({passed:true,realRailway:false,realGithub:false,nonRootDefaultOff:true,realPostgres18OwnershipTransfer:true,independentRestrictedPostcheck:true,durablePreMutationHandshake:true,cancelBeforeCommitPreserved:true,emergencyTuplesPreserved:true,existingSixPopulatedRealmsPreserved:true,retirementAuthorized:false},null,2));
 console.log('ADOPTER_DISPOSABLE_IMAGE: PASS — default OFF, real PG18 adoption/cancellation, restricted postcheck, all survivors preserved');
}finally{
 if(runtime)await runtime.end().catch(()=>{});if(fixtureDb)await fixtureDb.db.end().catch(()=>{});
 for(const name of containers.reverse())try{docker('rm','-f',name);}catch{}try{docker('network','rm',net);}catch{}await rm(dir,{recursive:true,force:true});
}
