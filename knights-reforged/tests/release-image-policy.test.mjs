import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {checkImageCandidate,checkImageIdentity,checkImageApproval,checkImageRequest,gameTransport,definitionDigest,imagePackage,imageRepository,imageRegistrySetup,imageRegistryCredentials,checkNoImageRequest} from '../deployment/release/image-policy.mjs';
import {checkRegistryManifest,checkImageConfiguration,checkArtifactMetadata,registryClient,boundedBody,authenticateImage} from '../deployment/release/image.mjs';
import {candidateDigest} from '../deployment/release/candidate.mjs';
import {signProof,verifyProof} from '../deployment/release/proof.mjs';
import {candidate,approval,proof,runtimeEnv,workflowEnv} from './fixtures/release-image.mjs';
const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'pem'});
const verify=(p=proof(),env=runtimeEnv(),identity=candidate().identity)=>verifyProof(signProof(p,keys.privateKey),publicKey,env,'d'.repeat(64),{imageIdentity:identity});

test('strict v3 binds immutable image, exact build, checked candidate and retained preparation artifact',()=>{
 const p=proof();assert.deepEqual(verify(p),p);const a=approval();assert.equal(checkImageApproval(a,{sourceSha:p.sha,candidate:p.candidateDigest,reference:p.image.candidate.reference,digest:p.image.candidate.manifestDigest,identity:p.image.candidate.identity}),a);
});
for(const [name,change]of[
 ['wrong image digest',p=>p.image.candidate.manifestDigest='sha256:'+'f'.repeat(64)],
 ['mutable tag',p=>p.image.candidate.reference=imageRepository+':latest'],
 ['wrong registry',p=>p.image.candidate.reference='ghcr.io/other/game@'+p.image.candidate.manifestDigest],
 ['arm64',p=>p.image.candidate.platform='linux/arm64'],
 ['wrong commit',p=>p.image.candidate.sha='b'.repeat(40)],
 ['wrong compiled content',p=>p.image.candidate.candidateDigest='c'.repeat(64)],
 ['unbound artifact',p=>p.image.artifactId='0'],
 ['unbound definition',p=>p.image.definitionDigest='0'.repeat(64)],
 ['extra hidden image field',p=>p.image.candidate.token='synthetic-must-not-be-hashed'],
 ['missing identity',p=>delete p.image.candidate.identity],
 ['missing independent recovery',p=>p.independentRecoveryVerified=false],
 ['failed owner decryption evidence',p=>p.backupKeyVerified=false],
 ['lost preservation digest',p=>delete p.preservationSha256],
 ['expired proof',p=>p.expiresAt=new Date(0).toISOString()]
])test('even a valid signature cannot authorize '+name,()=>{const p=proof();change(p);assert.throws(()=>verify(p));});
test('image proof cannot be downgraded or accepted without the static image identity',()=>{
 const p=proof();p.protocol='kingdom-release-proof-v2';assert.throws(()=>verify(p));
 assert.throws(()=>verify(proof(),{...runtimeEnv(),KINGDOM_RELEASE_ARTIFACT_KIND:'source-v2'}));
 assert.throws(()=>verifyProof(signProof(proof(),keys.privateKey),publicKey,runtimeEnv(),'d'.repeat(64)));
 for(const key of ['sha','candidateDigest','platform','policy'])assert.throws(()=>verify(proof(),runtimeEnv(),{...candidate().identity,[key]:'wrong'}));
 assert.throws(()=>verify(proof(),{...runtimeEnv(),KINGDOM_RELEASE_IMAGE_DIGEST:'sha256:'+'0'.repeat(64)}));
});
test('legacy v2 remains valid with no image identity and does not consume v3 fields',()=>{
 const p=proof();p.protocol='kingdom-release-proof-v2';delete p.image;const env=runtimeEnv();for(const k of ['KINGDOM_RELEASE_ARTIFACT_KIND','KINGDOM_RELEASE_IMAGE_REFERENCE','KINGDOM_RELEASE_IMAGE_DIGEST'])delete env[k];
 assert.equal(verifyProof(signProof(p,keys.privateKey),publicKey,env,p.candidateDigest).protocol,'kingdom-release-proof-v2');
 assert.throws(()=>verifyProof(signProof({...p,image:approval()},keys.privateKey),publicKey,env,p.candidateDigest));
});
test('installing policy code does not enable publishing or image deployment',()=>{
 assert.equal(gameTransport({}),'source-v2');assert.throws(()=>gameTransport({KINGDOM_GAME_TRANSPORT:'oci-image-v1'}));
 assert.throws(()=>gameTransport({KINGDOM_GAME_IMAGE_ENABLED:'true'}));
 assert.equal(gameTransport(workflowEnv()),'oci-image-v1');
 for(const changed of [{KINGDOM_GAME_IMAGE_ENABLED:'false'},{GITHUB_RUN_ATTEMPT:'2'},{KINGDOM_IMAGE_EXCLUSIVE_WINDOW:'false'},{KINGDOM_GAME_TRANSPORT:'future'}])assert.throws(()=>gameTransport({...workflowEnv(),...changed}));
 const prepare={...workflowEnv(),KINGDOM_IMAGE_OPERATION:'image-prepare',KINGDOM_IMAGE_PROMOTE:'false',KINGDOM_IMAGE_RUN_ID:'',KINGDOM_IMAGE_ARTIFACT_ID:'',KINGDOM_IMAGE_MANIFEST_DIGEST:'',KINGDOM_IMAGE_PUBLICATION_ENABLED:'true',KINGDOM_IMAGE_PACKAGE_PRIVATE_CONFIRMED:'true'};
 assert.equal(checkImageRequest(prepare),'image-prepare');
 for(const changed of [{KINGDOM_IMAGE_PUBLICATION_ENABLED:'false'},{KINGDOM_IMAGE_PACKAGE_PRIVATE_CONFIRMED:'false'},{KINGDOM_IMAGE_PROMOTE:'true'},{KINGDOM_IMAGE_ARTIFACT_ID:'102'},{GITHUB_REF:'refs/heads/feature'}])assert.throws(()=>checkImageRequest({...prepare,...changed}));
 assert.throws(()=>checkImageRequest({...workflowEnv(),REGISTRAR_CONFIG_PATCH_ID:'not-empty'}));
});
test('only the explicit candidate shape enters the public definition digest',()=>{
 const c=candidate();assert.equal(definitionDigest(c),definitionDigest(Object.fromEntries(Object.entries(c).reverse())));
 assert.throws(()=>checkImageCandidate({...c,password:'synthetic'}));assert.throws(()=>checkImageIdentity({...c.identity,extra:true},c.sha,c.candidateDigest));
});
function manifestFixture(){const value={schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:{digest:candidate().configDigest},layers:[{digest:'sha256:'+'f'.repeat(64),size:10}]};const raw=Buffer.from(JSON.stringify(value)+'\n');return {value,raw,digest:'sha256:'+createHash('sha256').update(raw).digest('hex')};}
test('manifest verifies exact response bytes including whitespace; config digest is a separate identity',()=>{
 const m=manifestFixture();assert.deepEqual(checkRegistryManifest(m.raw,m.digest,m.digest,candidate().configDigest),m.value);
 assert.throws(()=>checkRegistryManifest(m.raw.subarray(0,-1),m.digest,m.digest));assert.throws(()=>checkRegistryManifest(m.raw,m.digest,candidate().configDigest));
 for(const change of [v=>v.mediaType='application/vnd.oci.image.index.v1+json',v=>v.manifests=[],v=>v.layers[0].size=-1,v=>v.config.digest='bad']){const v=structuredClone(m.value);change(v);const b=Buffer.from(JSON.stringify(v)),d='sha256:'+createHash('sha256').update(b).digest('hex');assert.throws(()=>checkRegistryManifest(b,d,d,candidate().configDigest));}
});
test('image must be non-root amd64 with the exact commit and known entrypoint, without baked credentials',()=>{
 const info={Id:candidate().configDigest,Os:'linux',Architecture:'amd64',Config:{User:'node',Entrypoint:['docker-entrypoint.sh'],WorkingDir:'/app',Cmd:['node','deployment/start.mjs'],Labels:{'org.opencontainers.image.revision':candidate().sha},Env:['NODE_ENV=production']}};
 checkImageConfiguration(info,candidate());
 for(const changed of [{Architecture:'arm64'},{Id:'sha256:'+'f'.repeat(64)},{Config:{...info.Config,User:'root'}},{Config:{...info.Config,Entrypoint:['sh','unreviewed.sh']}},{Config:{...info.Config,Env:['DATABASE_URL=synthetic-private']}}])assert.throws(()=>checkImageConfiguration({...info,...changed},candidate()));
});
test('registry reads use only fixed HTTPS hosts, reject public packages, cancel errors and never follow redirects',async()=>{
 const requests=[],m=manifestFixture();let packagePrivate=true,cancelled=false,fail=false;
 const fetcher=async(url,options)=>{requests.push({url,options});assert.equal(options.redirect,'error');
  if(fail)return {ok:false,body:{cancel:async()=>{cancelled=true;}}};
  if(url.startsWith('https://api.github.com/'))return Response.json({name:imagePackage,package_type:'container',visibility:packagePrivate?'private':'public'});
  if(url.startsWith('https://ghcr.io/token?'))return Response.json({token:'synthetic-registry-bearer'});
  return new Response(m.raw,{headers:{'docker-content-digest':m.digest}});
 };
 const client=registryClient('synthetic-read-only',{fetcher});await client.privatePackage();assert.equal((await client.manifest(m.digest)).value.config.digest,candidate().configDigest);
 packagePrivate=false;await assert.rejects(client.privatePackage());fail=true;await assert.rejects(client.privatePackage());assert.equal(cancelled,true);
 assert.equal(requests.filter(r=>r.url.includes('/token?')).length,1);
 assert.equal(requests[0].url,'https://api.github.com/users/catillatio/packages/container/'+imagePackage);
 assert.equal(new URL(requests.find(r=>r.url.includes('/token?')).url).searchParams.get('scope'),'repository:catillatio/'+imagePackage+':pull');
 assert.equal(requests.find(r=>r.url.includes('/manifests/')).url,'https://ghcr.io/v2/catillatio/'+imagePackage+'/manifests/'+m.digest);assert.ok(requests.every(r=>new URL(r.url).protocol==='https:'));
});
test('provider body size is bounded before it can enter an artifact',async()=>{await assert.rejects(boundedBody(new Response('x'.repeat(100)),10));});
test('image artifact must come from a successful exact-commit protected preparation job',()=>{
 const env=workflowEnv(),run={id:101,head_sha:env.GITHUB_SHA,head_branch:'release/production',event:'workflow_dispatch',path:'.github/workflows/production-release.yml',status:'completed',conclusion:'success',head_repository:{full_name:'catillatio/test'},run_attempt:1};
 const artifact={id:102,expired:false,digest:'sha256:'+'e'.repeat(64),size_in_bytes:1000,workflow_run:{id:101,head_sha:env.GITHUB_SHA},name:'kingdom-image-'+env.GITHUB_SHA+'-101-1'},jobs={jobs:[{name:'image-prepare',status:'completed',conclusion:'success'}]};
 assert.deepEqual(checkArtifactMetadata(run,artifact,jobs,env),{prepareRunId:'101',prepareRunAttempt:'1'});
 for(const changed of [{head_sha:'f'.repeat(40)},{event:'pull_request'},{head_branch:'feature'},{conclusion:'failure'},{path:'.github/workflows/checks.yml'}])assert.throws(()=>checkArtifactMetadata({...run,...changed},artifact,jobs,env));
 for(const changed of [{expired:true},{id:Number.MAX_SAFE_INTEGER+1},{id:'102'},{id:103},{digest:'config-not-manifest'},{size_in_bytes:3000000},{workflow_run:{id:104,head_sha:env.GITHUB_SHA}}])assert.throws(()=>checkArtifactMetadata(run,{...artifact,...changed},jobs,env));
 assert.throws(()=>checkArtifactMetadata(run,artifact,{jobs:[]},env));
});

test('the public bootstrap namespace and arbitrary replacements cannot become an image candidate',()=>{
 assert.equal(imageRepository,'ghcr.io/catillatio/kingdom-come-deploy-canary');
 for(const repo of ['ghcr.io/catillatio/kingdom-come','ghcr.io/catillatio/kingdom-come-runtime','ghcr.io/other/private']){
  const c=candidate();c.reference=repo+'@'+c.manifestDigest;assert.throws(()=>checkImageCandidate(c));
 }
});
test('missing, wrong-name or unreadable existing package never authorizes creation or another namespace',async()=>{
 for(const mode of ['missing','wrong-name','unreadable']){
  const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});
   if(mode==='missing')return new Response('',{status:404});
   if(mode==='unreadable')return new Response('',{status:403});
   return Response.json({name:'kingdom-come',package_type:'container',visibility:'private'});
  };
  await assert.rejects(registryClient('synthetic-read-only',{fetcher}).privatePackage());
  assert.equal(calls.length,1);assert.equal(calls[0].options.method,undefined);
  assert.equal(calls[0].url,'https://api.github.com/users/catillatio/packages/container/'+imagePackage);
 }
});

test('registry credential handoff requires explicit first-attempt real image promotion and never runs with source/prepare/rehearsal',()=>{
 const install={...workflowEnv(),KINGDOM_IMAGE_OPERATION:'image-release',KINGDOM_IMAGE_PROMOTE:'true',KINGDOM_IMAGE_INSTALL_REGISTRY_CREDENTIALS:'true',KINGDOM_IMAGE_REGISTRY_READ_TOKEN:'synthetic-read-token'};
 assert.equal(imageRegistrySetup(install),'install-read-only');assert.deepEqual(imageRegistryCredentials(install),{username:'catillatio',password:'synthetic-read-token'});assert.equal(checkImageRequest(install),'image-release');
 for(const changed of [{KINGDOM_IMAGE_OPERATION:'image-prepare'},{KINGDOM_IMAGE_PROMOTE:'false'},{GITHUB_RUN_ATTEMPT:'2'},{KINGDOM_IMAGE_INSTALL_REGISTRY_CREDENTIALS:'yes'}])assert.throws(()=>imageRegistrySetup({...install,...changed}));
 for(const token of [undefined,'','  ',' badvalue ','bad\nvalue'])assert.throws(()=>imageRegistryCredentials({...install,KINGDOM_IMAGE_REGISTRY_READ_TOKEN:token}));
 assert.equal(imageRegistrySetup({}),'preconfigured');assert.equal(imageRegistryCredentials({}),undefined);assert.throws(()=>checkNoImageRequest(install));
});
for(const scope of [null,'','write:packages','read:packages, write:packages','read:packages, repo','read:packages, delete:packages'])test('handoff rejects missing or excessive credential scopes before any registry mutation: '+String(scope),async()=>{
 const fetcher=async()=>Response.json({name:imagePackage,package_type:'container',visibility:'private'},{headers:scope===null?{}:{'x-oauth-scopes':scope}});
 await assert.rejects(registryClient('synthetic-only',{fetcher,requireReadOnly:true}).privatePackage());
});
test('an exact read:packages credential remains eligible for the private registry handoff',async()=>{
 const fetcher=async()=>Response.json({name:imagePackage,package_type:'container',visibility:'private'},{headers:{'x-oauth-scopes':'read:packages'}});
 assert.equal(await registryClient('synthetic-only',{fetcher,requireReadOnly:true}).privatePackage(),true);
});

test('invalid handoff scopes stop real image authentication before registry pull or any child command',async()=>{
 const c=candidate();c.candidateDigest=await candidateDigest();c.identity.candidateDigest=c.candidateDigest;
 const env={...workflowEnv(),KINGDOM_IMAGE_OPERATION:'image-release',KINGDOM_IMAGE_PROMOTE:'true',KINGDOM_IMAGE_INSTALL_REGISTRY_CREDENTIALS:'true',KINGDOM_IMAGE_REGISTRY_READ_TOKEN:'synthetic-only'};
 const urls=[],commands=[];const fetcher=async url=>{urls.push(url);return Response.json({name:imagePackage,package_type:'container',visibility:'private'},{headers:{'x-oauth-scopes':'read:packages, write:packages'}});};
 await assert.rejects(authenticateImage({candidate:c},env,{fetcher,run:async(...args)=>{commands.push(args);throw Error('No child allowed');}}));
 assert.deepEqual(urls,['https://api.github.com/users/catillatio/packages/container/'+imagePackage]);assert.deepEqual(commands,[]);
});
