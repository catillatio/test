import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {readFileSync,readdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {protocol,checkRequest,signedRequest,verifiedRequest,checkReview,confirmation,checkReport,digest,nameTarget,grayTarget,framePrefix,setupConfirmation,publicEd25519} from '../deployment/operator/protocol.mjs';
import {settings,reviewedArtifact,collectReport,bundle} from '../deployment/operator/controller.mjs';
import {preflight} from '../deployment/operator/preflight.mjs';
import {verifyDeployment,verifyToken,verifyService} from '../deployment/operator/railway.mjs';
import {checkRequest as releaseRequest,checkJobReport as releaseReport} from '../deployment/release/protocol.mjs';
import {safeService} from '../scripts/fixtures/owner-service-posture.mjs';
import {verifyProof} from '../deployment/release/proof.mjs';
const pair=()=>{const p=generateKeyPairSync('ed25519');return {privateKey:p.privateKey.export({type:'pkcs8',format:'pem'}),publicKey:p.publicKey.export({type:'spki',format:'pem'})};};
const keys=pair(),releaseKeys=pair(),sha='a'.repeat(40),context={projectId:randomUUID(),environmentId:randomUUID(),gameServiceId:randomUUID(),pgServiceId:randomUUID(),releaseServiceId:randomUUID(),verifyPgServiceId:randomUUID(),operatorServiceId:randomUUID(),bootstrapServiceId:randomUUID(),sourceHost:'realm.railway.internal',sourceDatabase:'railway'};
const authorization=()=>({id:randomUUID(),sourceSha:sha,...Object.fromEntries(['projectId','environmentId','operatorServiceId','sourceHost','sourceDatabase'].map(k=>[k,context[k]])),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),operator:'catillatio'});
const review=()=>({operation:'name_correction',characterId:nameTarget,accountId:randomUUID(),field:'account_username',usernameHash:'1'.repeat(64),characterNameHash:'2'.repeat(64),authorization:authorization()});
function request(mode='review'){
 const r={protocol,kind:'request',mode,action:'name_correction',jobId:'op_123_1_'+'a'.repeat(32),authorizationId:randomUUID(),sourceSha:sha,bundleDigest:'3'.repeat(64),context,owner:'catillatio',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),recipient:'age1'+'a'.repeat(58),field:'auto',messageId:null,reversesAuthorizationId:null,review:null,confirmation:null};
 if(mode!=='review'){r.review=review();r.authorizationId=r.review.authorization.id;r.field=r.review.field;r.confirmation=mode==='apply'?confirmation(r.review):null;}return r;
}
const encrypted=Buffer.from('age-encryption.org/v1\nsynthetic encrypted bytes').toString('base64');
function report(r=request(),id=randomUUID()){
 const target=r.review??{...review(),authorization:{...authorization(),id:r.authorizationId}};
 return {protocol,kind:'report',jobId:r.jobId,sourceSha:r.sourceSha,bundleDigest:r.bundleDigest,context:r.context,deploymentId:id,mode:r.mode,action:r.action,passed:true,review:target,reviewSha256:digest(target),eligible:true,encrypted,outcome:r.mode==='review'?null:r.mode==='verify'?'verified':'applied'};
}
const env=()=>({GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/release/production',GITHUB_REPOSITORY:'catillatio/test',GITHUB_ACTOR:'catillatio',GITHUB_TRIGGERING_ACTOR:'catillatio',GITHUB_SHA:sha,GH_TOKEN:'synthetic-github',KINGDOM_OPERATOR_ENABLED:'true',KINGDOM_OPERATOR_RAILWAY_SCOPE_ACKNOWLEDGED:'true',KINGDOM_OPERATOR_OWNER:'catillatio',RAILWAY_TOKEN:'synthetic-railway',RAILWAY_PROJECT_ID:context.projectId,RAILWAY_ENVIRONMENT_ID:context.environmentId,RAILWAY_GAME_SERVICE_ID:context.gameServiceId,RAILWAY_PG_SERVICE_ID:context.pgServiceId,RAILWAY_RELEASE_WORKER_SERVICE_ID:context.releaseServiceId,RAILWAY_VERIFY_PG_SERVICE_ID:context.verifyPgServiceId,RAILWAY_OPERATOR_SERVICE_ID:context.operatorServiceId,RAILWAY_OPERATOR_BOOTSTRAP_SERVICE_ID:context.bootstrapServiceId,KINGDOM_DATABASE_HOST:context.sourceHost,KINGDOM_DATABASE_NAME:context.sourceDatabase,KINGDOM_BACKUP_RECIPIENT:'age1'+'a'.repeat(58),KINGDOM_OPERATOR_SIGNING_KEY:keys.privateKey,KINGDOM_OPERATOR_VERIFY_KEY:keys.publicKey,KINGDOM_EXISTING_RELEASE_VERIFY_KEY:releaseKeys.publicKey});

test('operator requests require distinct Ed25519 signatures, exact targets, expiry and action-specific confirmation',()=>{
 const r=request('apply');assert.deepEqual(verifiedRequest(signedRequest(r,keys.privateKey),keys.publicKey),r);
 for(const patch of[{sourceSha:'b'.repeat(40)},{mode:'review'},{confirmation:'APPROVE'},{context:{...context,operatorServiceId:context.gameServiceId}},{expiresAt:new Date(Date.now()-1).toISOString()}]){
  const bad={...r,...patch};const envelope=JSON.parse(signedRequest(r,keys.privateKey));envelope.payload=bad;assert.throws(()=>verifiedRequest(JSON.stringify(envelope),keys.publicKey));assert.throws(()=>checkRequest(bad));
 }
 assert.throws(()=>verifiedRequest(signedRequest(r,keys.privateKey),releaseKeys.publicKey));
 const other={...r.review,characterId:grayTarget};assert.throws(()=>checkReview(other));
 assert.throws(()=>settings({...env(),KINGDOM_OPERATOR_VERIFY_KEY:releaseKeys.publicKey,KINGDOM_OPERATOR_SIGNING_KEY:releaseKeys.privateKey}));
 assert.throws(()=>settings({...env(),RAILWAY_OPERATOR_SERVICE_ID:context.releaseServiceId}));
 const gray={...review(),operation:'gray_broadcast_hide',characterId:grayTarget,field:'message_status',messageId:randomUUID(),bodyHash:'c4cb23c808234a16c1c32862e0128b875635eeb3d704c764767d9fd1d2e6f5ba',createdAt:new Date().toISOString(),status:'visible'};
 const grayRequest={...r,action:gray.operation,field:gray.field,messageId:gray.messageId,authorizationId:gray.authorization.id,review:gray,confirmation:confirmation(gray)};
 assert.equal(checkRequest(grayRequest),grayRequest);assert.ok(grayRequest.confirmation.includes('/'+gray.messageId+'/'));
 const otherMessage={...gray,messageId:randomUUID()};assert.throws(()=>checkRequest({...grayRequest,messageId:otherMessage.messageId,review:otherMessage}));
});
test('operator requests/reports cannot satisfy release protocols or signed migration approval',()=>{
 const r=request('apply'),e=signedRequest(r,keys.privateKey),result=report(r);
 assert.throws(()=>releaseRequest(r));assert.throws(()=>releaseReport(result,{}));
 assert.throws(()=>verifyProof(e,keys.publicKey,{},'a'.repeat(64)));
 assert.throws(()=>verifiedRequest(JSON.stringify({protocol:'kingdom-release-job-v2',kind:'signed-request',payload:r,signature:'x'.repeat(86)}),keys.publicKey));
 for(const file of readdirSync(new URL('../deployment/operator/',import.meta.url)).filter(f=>f.endsWith('.mjs'))){const text=readFileSync(new URL('../deployment/operator/'+file,import.meta.url),'utf8');assert.doesNotMatch(text,/from\s+['"][^'"]*release\//);assert.doesNotMatch(text,/StrictHostKeyChecking|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/);}
 // Mentioning the release secret solely to REJECT accidental wiring is safe;
 // neither the workflow nor any child is allowed to receive or use that key.
 assert.doesNotMatch(readFileSync(new URL('../../.github/workflows/owner-operator.yml',import.meta.url),'utf8'),/secrets\.KINGDOM_RELEASE_SIGNING_KEY/);
 assert.throws(()=>settings({...env(),KINGDOM_RELEASE_SIGNING_KEY:releaseKeys.privateKey}));
});
test('protected preflight rejects non-owner, bypassable environment, wrong branch and missing exact-commit CI',async()=>{
 const responses={environment:{can_admins_bypass:false,protection_rules:[{type:'required_reviewers',reviewers:[{type:'User',reviewer:{login:'catillatio'}}]}],deployment_branch_policy:{custom_branch_policies:true}},policies:{branch_policies:[{name:'release/production',type:'branch'}]},branch:{protected:true,commit:{sha}},runs:{workflow_runs:[{head_sha:sha,conclusion:'success',event:'push',head_repository:{full_name:'catillatio/test'}}]}};
 const fetcher=async url=>({ok:true,json:async()=>url.includes('deployment-branch-policies')?responses.policies:url.includes('/environments/')?responses.environment:url.includes('/branches/')?responses.branch:responses.runs});
 assert.equal(await preflight(env(),{fetcher}),true);
 for(const patch of[{GITHUB_ACTOR:'another-user'},{GITHUB_TRIGGERING_ACTOR:'another-user'},{GITHUB_REF:'refs/heads/feature/unsafe'},{KINGDOM_OPERATOR_ENABLED:'false'}])await assert.rejects(preflight({...env(),...patch},{fetcher}));
 responses.environment.can_admins_bypass=true;await assert.rejects(preflight(env(),{fetcher}));responses.environment.can_admins_bypass=false;responses.runs.workflow_runs=[];await assert.rejects(preflight(env(),{fetcher}));
});
test('metadata must independently establish the exact scoped token and private operator deployment',async()=>{
 const id=randomUUID(),fetcher=async(_,options)=>({ok:true,json:async()=>JSON.parse(options.body).query.includes('Token')?{data:{projectToken:{projectId:context.projectId,environmentId:context.environmentId}}}:{data:{deployment:{id,projectId:context.projectId,environmentId:context.environmentId,serviceId:context.operatorServiceId}}}});
 await verifyToken(context,'synthetic',{fetcher});assert.equal(await verifyDeployment(id,context,'synthetic',{fetcher}),id);
 await assert.rejects(verifyDeployment(id,{...context,operatorServiceId:context.gameServiceId},'synthetic',{fetcher}));
 await assert.rejects(verifyDeployment(id,context,'synthetic',{fetcher:async()=>({ok:false})}));
 await assert.rejects(verifyToken({...context,environmentId:randomUUID()},'synthetic',{fetcher}));
});
test('review artifacts must originate in the successful owner workflow at the same exact production commit',async()=>{
 const r=request(),record=report(r),run={id:123,run_attempt:1,path:'.github/workflows/owner-operator.yml',event:'workflow_dispatch',status:'completed',conclusion:'success',head_sha:sha,head_branch:'release/production',head_repository:{full_name:'catillatio/test'},actor:{login:'catillatio'},triggering_actor:{login:'catillatio'}};
 const artifact={id:456,expired:false,workflow_run:{id:123,head_sha:sha},name:'owner-operator-123-1',size_in_bytes:1000};
 const e={...env(),OPERATOR_MODE:'apply',OPERATOR_ACTION:'name_correction',OPERATOR_REVIEW_RUN_ID:'123',OPERATOR_REVIEW_ARTIFACT_ID:'456',OPERATOR_REVIEW_DIGEST:record.reviewSha256,OPERATOR_CONFIRMATION:confirmation(record.review)};
 const options={fetcher:async url=>({ok:true,json:async()=>url.includes('/artifacts/')?artifact:run}),download:async()=>record};
 assert.deepEqual(await reviewedArtifact(e,context,options),record.review);
 run.head_sha='b'.repeat(40);await assert.rejects(reviewedArtifact(e,context,options));run.head_sha=sha;
 run.path='.github/workflows/production-release.yml';await assert.rejects(reviewedArtifact(e,context,options));run.path='.github/workflows/owner-operator.yml';
 artifact.expired=true;await assert.rejects(reviewedArtifact(e,context,options));artifact.expired=false;
 await assert.rejects(reviewedArtifact({...e,OPERATOR_CONFIRMATION:'yes'},context,options));
 record.mode='apply';await assert.rejects(reviewedArtifact(e,context,options));
});
test('fixed report framing rejects wrong identity, duplicate frames and fixed worker failures without echoing provider output',async()=>{
 const r=request(),id=randomUUID(),record=report(r,id),frame=framePrefix+Buffer.from(JSON.stringify(record)).toString('base64url');
 assert.deepEqual(await collectReport(r,id,'synthetic',{getMessages:async()=>[frame],attempts:1}),record);
 for(const messages of[[frame,frame],['OWNER_OPERATOR_DATABASE: FAIL'],[frame.replace(framePrefix,framePrefix+'bad')]])await assert.rejects(collectReport(r,id,'synthetic',{getMessages:async()=>messages,attempts:1,wait:async()=>{}}));
 assert.throws(()=>checkReport(record,r,randomUUID()));
});
test('setup requires an explicit schema-only confirmation; expired approvals permit read-only verification but never reapply',()=>{
 const setup={...request(),mode:'setup',action:'audit_setup',confirmation:setupConfirmation(context,sha)};assert.equal(checkRequest(setup),setup);assert.throws(()=>checkRequest({...setup,confirmation:null}));
 const r=request('verify');r.review.authorization.createdAt=new Date(Date.now()-172800000).toISOString();r.review.authorization.expiresAt=new Date(Date.now()-86400000).toISOString();assert.equal(checkRequest(r),r);
 assert.throws(()=>checkRequest({...r,mode:'apply',confirmation:confirmation(r.review)}));
});
test('review ZIP reader accepts only the two small expected files and does not extract paths or print failures',()=>{
 const temp=mkdtempSync(join(tmpdir(),'owner-zip-'));try{
  const good=join(temp,'good.zip'),bad=join(temp,'bad.zip'),record=report();writeFileSync(join(temp,'data.json'),JSON.stringify(record));
  const create="import zipfile,sys,json,base64\nr=json.load(open(sys.argv[3]))\nwith zipfile.ZipFile(sys.argv[1],'w') as z:z.writestr('review.json',json.dumps(r));z.writestr('review.age',base64.b64decode(r['encrypted']))\nwith zipfile.ZipFile(sys.argv[2],'w') as z:z.writestr('../escape','not allowed')";
  assert.equal(spawnSync('python3',['-c',create,good,bad,join(temp,'data.json')]).status,0);
  const script=new URL('../deployment/operator/read-artifact.py',import.meta.url).pathname;
  assert.equal(spawnSync('python3',[script,good],{encoding:'utf8'}).status,0);const invalid=spawnSync('python3',[script,bad],{encoding:'utf8'});assert.equal(invalid.status,1);assert.equal(invalid.stdout,'');assert.equal(invalid.stderr,'');
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('operator bundle is allowlisted and excludes secrets, release controller, migrations and game artwork',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'owner-bundle-'));try{
  const built=await bundle(temp,sha),manifest=JSON.parse(readFileSync(join(built.destination,'operator-build.json'),'utf8'));assert.equal(digest(manifest),built.digest);
  assert.ok(manifest.files.some(e=>e.path==='deployment/operator/worker.mjs'));assert.ok(manifest.files.some(e=>e.path==='deployment/operator/audit.sql'));
  assert.ok(manifest.files.every(e=>!e.path.startsWith('public/')&&!e.path.startsWith('migrations/')&&!e.path.includes('deployment/release/')&&!e.path.includes('.env')));
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('invalid worker requests fail before database imports and print only a fixed category; no public operator routes exist',()=>{
 const result=spawnSync(process.execPath,[new URL('../deployment/operator/worker.mjs',import.meta.url).pathname],{
  encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'production',KINGDOM_OPERATOR_REQUEST:'synthetic-invalid-request',KINGDOM_OPERATOR_VERIFY_KEY:'synthetic-invalid-key',DATABASE_URL:'synthetic-sensitive-value'}
 });
 assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'OWNER_OPERATOR_REQUEST: FAIL\n');
 for(const file of readdirSync(new URL('../src/',import.meta.url)).filter(f=>f.endsWith('.ts')&&!f.startsWith('owner-'))){
  assert.doesNotMatch(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),/from\s+['"][^'"]*(?:owner-actions|owner-audit)/);
 }
});

test('all public verification fields reject private PEMs and wrong algorithms without deriving and accepting their public halves',()=>{
 assert.throws(()=>publicEd25519(keys.privateKey));assert.throws(()=>verifiedRequest(signedRequest(request(),keys.privateKey),keys.privateKey));
 assert.throws(()=>settings({...env(),KINGDOM_OPERATOR_VERIFY_KEY:keys.privateKey}));
 assert.throws(()=>settings({...env(),KINGDOM_EXISTING_RELEASE_VERIFY_KEY:releaseKeys.privateKey}));
 const rsa=generateKeyPairSync('rsa',{modulusLength:2048});assert.throws(()=>publicEd25519(rsa.publicKey.export({type:'spki',format:'pem'})));
 assert.equal(publicEd25519(keys.publicKey).asymmetricKeyType,'ed25519');
});
test('private service posture fails closed for source/autodeploy, commands, replicas, restart and every public networking path',async()=>{
 const good=safeService(context.projectId,context.environmentId,context.operatorServiceId);
 const check=record=>verifyService(context,'synthetic',{fetcher:async()=>({ok:true,json:async()=>({data:record})})});
 await check(good);
 for(const [key,value] of Object.entries({source:{repo:'catillatio/test',image:null},startCommand:'node dist/server.js',buildCommand:'run something',preDeployCommand:['node migrate'],restartPolicyType:'ALWAYS',restartPolicyMaxRetries:1,numReplicas:2,cronSchedule:'* * * * *',healthcheckPath:'/healthz',builder:'RAILPACK',sleepApplication:true,railwayConfigFile:'railway.json',rootDirectory:'/knights-reforged'}))await assert.rejects(check({...good,serviceInstance:{...good.serviceInstance,[key]:value}}));
 await assert.rejects(check({...good,service:{...good.service,repoTriggers:{edges:[{node:{id:'synthetic'}}]}}}));
 await assert.rejects(check({...good,tcpProxies:[{id:'synthetic'}]}));
 for(const field of ['customDomains','serviceDomains'])await assert.rejects(check({...good,serviceInstance:{...good.serviceInstance,domains:{...good.serviceInstance.domains,[field]:[{id:'synthetic'}]}}}));
 await assert.rejects(check({...good,serviceInstance:{...good.serviceInstance,startCommand:undefined}}));
});
