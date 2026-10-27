// GitHub/GHCR preparation and verification only. No Railway, SQL, signing or
// backup credentials. Provider output stays private; the CLI prints fixed stages.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdir,readFile,writeFile,mkdtemp,rm,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {candidateDigest} from './candidate.mjs';
import {checkImageRequest,checkNoImageRequest,checkImageCandidate,checkImageIdentity,imageRepository,imageDigest,imagePolicy,definitionDigest} from './image-policy.mjs';

const media=['application/vnd.oci.image.manifest.v1+json','application/vnd.docker.distribution.manifest.v2+json'];
const sha256=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const packageApi='https://api.github.com/users/catillatio/packages/container/kingdom-come';
const packageScope='repository:catillatio/kingdom-come:pull';
export async function boundedBody(response,max=2000000){
 const chunks=[];let count=0;
 try{for await(const part of response.body){count+=part.length;assert.ok(count<=max);chunks.push(part);}return Buffer.concat(chunks);}
 catch{await response.body?.cancel().catch(()=>{});throw new Error('Image response rejected.');}
}
async function checkedResponse(response,max){
 if(!response.ok){await response.body?.cancel();throw new Error('Image evidence unavailable.');}
 return boundedBody(response,max);
}
export function checkRegistryManifest(raw,expected,header,configDigest){
 assert.match(expected,imageDigest);assert.equal(header,expected);assert.equal(sha256(raw),expected);
 const value=JSON.parse(raw.toString('utf8'));assert.equal(value.schemaVersion,2);assert.ok(media.includes(value.mediaType));assert.equal(value.manifests,undefined);
 assert.match(value.config?.digest??'',imageDigest);if(configDigest!==undefined)assert.equal(value.config.digest,configDigest);
 assert.ok(Array.isArray(value.layers)&&value.layers.length>0&&value.layers.length<=64);
 for(const layer of value.layers){assert.match(layer.digest??'',imageDigest);assert.ok(Number.isSafeInteger(layer.size)&&layer.size>0);}
 return value;
}
export function checkImageConfiguration(info,definition){
 assert.equal(info.Os,'linux');assert.equal(info.Architecture,'amd64');assert.equal(info.Id,definition.configDigest);
 assert.equal(info.Config.User,'node');assert.deepEqual(info.Config.Entrypoint,['docker-entrypoint.sh']);assert.deepEqual(info.Config.Cmd,['node','deployment/start.mjs']);
 assert.equal(info.Config.Labels?.['org.opencontainers.image.revision'],definition.sha);
 assert.equal(info.Config.WorkingDir,'/app');
 assert.ok(Array.isArray(info.Config.Env));
 for(const entry of info.Config.Env)assert.doesNotMatch(entry,/^(?:DATABASE_URL|RAILWAY_TOKEN|GH_TOKEN|GITHUB_TOKEN|[^=]*(?:PASSWORD|SECRET|SIGNING_KEY|BACKUP_PROOF))=/i);
 return info;
}
export function command(executable,args,{input,timeout=120000,maxBuffer=2000000,trim=true}={}){
 return new Promise((resolve,reject)=>{
  const env={...process.env};for(const k of Object.keys(env))if(/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|SIGNING_KEY|ACCESS_KEY|DATABASE_URL|BACKUP_PROOF/i.test(k))delete env[k];
  const task=execFile(executable,args,{env,encoding:'utf8',timeout,maxBuffer},(error,stdout)=>error?reject(new Error('Image command rejected.')):resolve(trim?stdout.trim():stdout));
  task.stdin.on('error',()=>reject(new Error('Image command input rejected.')));
  if(input===undefined)task.stdin.end();else task.stdin.end(input);
 });
}
export async function checkBuildTree(root=new URL('../../',import.meta.url).pathname,{run=command}={}){
 const dirs=['src','views','public','rulesets','migrations','deployment'],files=['Dockerfile','.dockerignore','package.json','package-lock.json','tsconfig.json'];
 const text=await run('git',['-C',root,'ls-tree','-rz','HEAD','--',...dirs,...files],{trim:false}),tracked=new Map();
 for(const row of text.split('\0').filter(Boolean)){
  const match=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(row);assert.ok(match);tracked.set(match[3],{mode:match[1]==='100755'?0o755:0o644,hash:match[2]});
 }
 assert.ok(tracked.size>0);const seen=new Set();
 async function visit(relative){
  const path=join(root,relative),stat=await lstat(path);assert.equal(stat.isSymbolicLink(),false);
  if(stat.isDirectory()){for(const entry of await readdir(path))await visit(relative+'/'+entry);return;}
  assert.equal(stat.isFile(),true);const expected=tracked.get(relative);assert.ok(expected,'Uncommitted build input rejected.');
  const bytes=await readFile(path);assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),expected.hash);
  // Git records executable/non-executable, not umask-derived read/write bits.
  assert.equal((stat.mode&0o111)!==0,expected.mode===0o755);seen.add(relative);
 }
 for(const entry of [...dirs,...files])await visit(entry);
 assert.deepEqual([...seen].sort(),[...tracked.keys()].sort());
}
export function registryClient(token,{fetcher=globalThis.fetch}={}){
 assert.ok(typeof token==='string'&&token.trim()&&!/[\r\n]/.test(token));
 let bearer;
 const get=async(url,headers={})=>fetcher(url,{headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
 return {
  async privatePackage(){
   const response=await get(packageApi,{authorization:'Bearer '+token,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
   const value=JSON.parse((await checkedResponse(response)).toString('utf8'));
   assert.equal(value.name,'kingdom-come');assert.equal(value.package_type,'container');assert.equal(value.visibility,'private');return true;
  },
  async manifest(digest){
   assert.match(digest,imageDigest);
   if(!bearer){
    const response=await get('https://ghcr.io/token?service=ghcr.io&scope='+encodeURIComponent(packageScope),{authorization:'Basic '+Buffer.from('catillatio:'+token).toString('base64')});
    const value=JSON.parse((await checkedResponse(response)).toString('utf8'));assert.ok(typeof value.token==='string'&&value.token&&!/[\r\n]/.test(value.token));bearer=value.token;
   }
   const response=await get('https://ghcr.io/v2/catillatio/kingdom-come/manifests/'+digest,{authorization:'Bearer '+bearer,accept:media.join(', ')});
   const raw=await checkedResponse(response);return {raw,value:checkRegistryManifest(raw,digest,response.headers.get('docker-content-digest'))};
  }
 };
}
export async function probeImage(reference,definition,{run=command,dockerConfig}={}){
 const prefix=dockerConfig?['--config',dockerConfig]:[];
 const info=JSON.parse(await run('docker',[...prefix,'image','inspect',reference]))[0];checkImageConfiguration(info,definition);
 const probe="import fs from 'node:fs';import {candidateDigest} from './deployment/release/candidate.mjs';console.log(JSON.stringify({identity:JSON.parse(fs.readFileSync('deployment/image-identity.json','utf8')),candidate:await candidateDigest(),uid:process.getuid(),arch:process.arch,os:process.platform,cwd:process.cwd()}));";
 const value=JSON.parse(await run('docker',[...prefix,'run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node',reference,'--input-type=module','-e',probe]));
 assert.equal(value.uid,1000);assert.equal(value.arch,'x64');assert.equal(value.os,'linux');assert.equal(value.cwd,'/app');assert.equal(value.candidate,definition.candidateDigest);
 assert.deepEqual(checkImageIdentity(value.identity,definition.sha,definition.candidateDigest),definition.identity);return info;
}
async function dockerAccess(token,operation,{run=command}={}){
 assert.ok(token&&!/[\r\n]/.test(token));const folder=await mkdtemp(join(process.env.RUNNER_TEMP,'image-registry-'));
 try{
  await run('docker',['--config',folder,'login','ghcr.io','--username','catillatio','--password-stdin'],{input:token+'\n'});
  return await operation(folder);
 }finally{await rm(folder,{recursive:true,force:true});}
}
export async function authenticateImage(approval,env,{run=command,fetcher=globalThis.fetch}={}){
 const definition=checkImageCandidate(approval.candidate,{sourceSha:env.GITHUB_SHA,candidate:await candidateDigest()});
 const registry=registryClient(env.KINGDOM_IMAGE_REGISTRY_READ_TOKEN,{fetcher});await registry.privatePackage();
 const {raw,value}=await registry.manifest(definition.manifestDigest);assert.equal(value.config.digest,definition.configDigest);
 await dockerAccess(env.KINGDOM_IMAGE_REGISTRY_READ_TOKEN,async folder=>{
  await run('docker',['--config',folder,'pull',definition.reference]);await probeImage(definition.reference,definition,{run,dockerConfig:folder});
 },{run});return raw;
}
async function githubJson(path,token,fetcher){
 const response=await fetcher('https://api.github.com/repos/catillatio/test'+path,{headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(30000)});
 return JSON.parse((await checkedResponse(response)).toString('utf8'));
}
export function checkArtifactMetadata(run,artifact,jobs,env){
 for(const value of [run.id,run.run_attempt,artifact.id,artifact.workflow_run?.id])assert.ok(Number.isSafeInteger(value)&&value>0);
 assert.equal(run.id.toString(),env.KINGDOM_IMAGE_RUN_ID);assert.equal(run.head_sha,env.GITHUB_SHA);assert.equal(run.head_branch,'release/production');
 assert.equal(run.event,'workflow_dispatch');assert.equal(run.path,'.github/workflows/production-release.yml');assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
 assert.equal(run.head_repository.full_name,'catillatio/test');assert.equal(artifact.id.toString(),env.KINGDOM_IMAGE_ARTIFACT_ID);assert.equal(artifact.expired,false);
 assert.match(artifact.digest,imageDigest);assert.ok(Number.isSafeInteger(artifact.size_in_bytes)&&artifact.size_in_bytes>0&&artifact.size_in_bytes<=2000000);
 assert.equal(artifact.workflow_run.id,run.id);assert.equal(artifact.workflow_run.head_sha,env.GITHUB_SHA);
 assert.equal(artifact.name,'kingdom-image-'+env.GITHUB_SHA+'-'+run.id+'-'+run.run_attempt);
 const prepare=jobs.jobs.filter(j=>j.name==='image-prepare');assert.equal(prepare.length,1);assert.equal(prepare[0].status,'completed');assert.equal(prepare[0].conclusion,'success');
 return {prepareRunId:String(run.id),prepareRunAttempt:String(run.run_attempt)};
}
export async function readImageArtifact(env,{fetcher=globalThis.fetch,runCommand=command}={}){
 checkImageRequest({...env,KINGDOM_IMAGE_OPERATION:'image-release'});
 const get=path=>githubJson(path,env.GH_TOKEN,fetcher),run=await get('/actions/runs/'+env.KINGDOM_IMAGE_RUN_ID),artifact=await get('/actions/artifacts/'+env.KINGDOM_IMAGE_ARTIFACT_ID),jobs=await get('/actions/runs/'+env.KINGDOM_IMAGE_RUN_ID+'/jobs?per_page=100');
 const provenance=checkArtifactMetadata(run,artifact,jobs,env);
 const response=await fetcher('https://api.github.com/repos/catillatio/test/actions/artifacts/'+env.KINGDOM_IMAGE_ARTIFACT_ID+'/zip',{headers:{authorization:'Bearer '+env.GH_TOKEN,accept:'application/vnd.github+json'},redirect:'manual',signal:AbortSignal.timeout(30000)});
 assert.ok([302,307].includes(response.status));const location=new URL(response.headers.get('location'));await response.body?.cancel();
 assert.equal(location.protocol,'https:');assert.ok(!location.username&&!location.password);
 assert.ok(/^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(location.hostname)||location.hostname==='results-receiver.actions.githubusercontent.com'||location.hostname==='run-artifacts.githubusercontent.com');
 // Signed download location stays in memory; NEVER forward the GitHub token.
 const download=await fetcher(location.href,{redirect:'error',signal:AbortSignal.timeout(30000)}),zip=await checkedResponse(download,2000000);assert.equal(sha256(zip),artifact.digest);
 const folder=await mkdtemp(join(env.RUNNER_TEMP,'image-artifact-'));
 try{
  const path=join(folder,'candidate.zip');await writeFile(path,zip,{mode:0o600});
  const entries=(await runCommand('unzip',['-Z1',path])).split(/\r?\n/);assert.deepEqual(entries.slice().sort(),['candidate.json','manifest.json']);
  const candidate=JSON.parse(await runCommand('unzip',['-p',path,'candidate.json'])),raw=Buffer.from(await runCommand('unzip',['-p',path,'manifest.json'],{trim:false}));
  checkImageCandidate(candidate,{sourceSha:env.GITHUB_SHA,candidate:await candidateDigest()});assert.deepEqual({prepareRunId:candidate.prepareRunId,prepareRunAttempt:candidate.prepareRunAttempt},provenance);
  assert.equal(candidate.manifestDigest,env.KINGDOM_IMAGE_MANIFEST_DIGEST);checkRegistryManifest(raw,candidate.manifestDigest,candidate.manifestDigest,candidate.configDigest);
  return {candidate,artifactId:String(artifact.id),artifactDigest:artifact.digest,definitionDigest:definitionDigest(candidate)};
 }finally{await rm(folder,{recursive:true,force:true});}
}
async function publish(env){
 checkImageRequest({...env,KINGDOM_IMAGE_OPERATION:'image-prepare'});
 assert.equal(await command('git',['rev-parse','HEAD']),env.GITHUB_SHA);assert.equal(await command('git',['status','--porcelain','--untracked-files=no']),'');
 await checkBuildTree();
 const registry=registryClient(env.KINGDOM_IMAGE_REGISTRY_READ_TOKEN);await registry.privatePackage(); // must exist and already be private, before any game push
 const local='kingdom-come:image-candidate',info=JSON.parse(await command('docker',['image','inspect',local]))[0];
 const definition={policy:imagePolicy,repository:'catillatio/test',branch:'release/production',sha:env.GITHUB_SHA,candidateDigest:await candidateDigest(),platform:'linux/amd64',
  reference:'',manifestDigest:'',configDigest:info.Id,prepareRunId:env.GITHUB_RUN_ID,prepareRunAttempt:env.GITHUB_RUN_ATTEMPT,
  identity:{policy:imagePolicy,repository:'catillatio/test',sha:env.GITHUB_SHA,candidateDigest:await candidateDigest(),platform:'linux/amd64'}};
 await probeImage(local,definition);
 await dockerAccess(env.GITHUB_TOKEN,async folder=>{
  const tag=imageRepository+':'+env.GITHUB_SHA+'-'+env.GITHUB_RUN_ID+'-'+env.GITHUB_RUN_ATTEMPT;
  await command('docker',['--config',folder,'tag',local,tag]);await command('docker',['--config',folder,'push',tag],{timeout:180000});
  const uploaded=JSON.parse(await command('docker',['--config',folder,'image','inspect',tag]))[0];
  const refs=uploaded.RepoDigests.filter(ref=>ref.startsWith(imageRepository+'@'));assert.equal(refs.length,1);
  definition.reference=refs[0];definition.manifestDigest=refs[0].slice(imageRepository.length+1);checkImageCandidate(definition);
 });
 const raw=await authenticateImage({candidate:definition},env);const out=join(env.GITHUB_WORKSPACE,'.image-candidate');await mkdir(out,{recursive:true,mode:0o700});
 await writeFile(join(out,'candidate.json'),JSON.stringify(definition,null,2)+'\n',{mode:0o600});await writeFile(join(out,'manifest.json'),raw,{mode:0o600});
}
async function main(){
 const mode=process.argv[2];process.umask(0o077);
 try{
  assert.ok(['validate-request','validate-source-request','check-build','publish','verify'].includes(mode));
  if(mode==='validate-source-request'){checkNoImageRequest(process.env);console.log('IMAGE_REQUEST_SEPARATION: PASS');return;}
  checkImageRequest(process.env);
  if(mode==='check-build'){assert.equal(await command('git',['rev-parse','HEAD']),process.env.GITHUB_SHA);await checkBuildTree();}
  if(mode==='publish')await publish(process.env);
  if(mode==='verify'){
   const approval=await readImageArtifact(process.env);await authenticateImage(approval,process.env);
   await writeFile(join(process.env.RUNNER_TEMP,'verified-image-candidate.json'),JSON.stringify(approval),{mode:0o600});
  }
  console.log('IMAGE_PIPELINE: PASS');
 }catch{console.error('IMAGE_PIPELINE: FAIL — no publication, mutation or recovery retry is authorized; reconcile state read-only.');process.exitCode=1;}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await main();
