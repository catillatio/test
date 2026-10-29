// Authenticate the existing retained ciphertext archive; never decrypt or create a copy.
import assert from 'node:assert/strict';
import {mkdtemp,open,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {adoptionInput} from './adoption-operation.mjs';
export async function authenticateAdoption(data,f,{githubToken,fetcher=globalThis.fetch,command,temp,signal}={}){
 const selected=adoptionInput(data,f),attempt=Number(selected.payload.jobId.split('_')[2]);
 const headers={authorization:'Bearer '+githubToken,accept:'application/vnd.github+json'};
 const get=async path=>{const r=await fetcher('https://api.github.com/repos/catillatio/test'+path,{headers,redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});assert.equal(r.status,200);const text=await r.text();assert.ok(Buffer.byteLength(text)<=1000000);return JSON.parse(text);};
 const run=await get('/actions/runs/'+selected.run+'/attempts/'+attempt);
 assert.equal(String(run.id),selected.run);assert.equal(run.run_attempt,attempt);assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
 assert.equal(run.path,'.github/workflows/production-release.yml');assert.equal(run.event,'workflow_dispatch');assert.equal(run.head_branch,'release/production');assert.equal(run.head_repository?.full_name,'catillatio/test');assert.equal(run.head_sha,selected.manifest.request.sha);
 assert.ok(Date.parse(run.created_at)>=Date.parse(f.adoption.futureAfter));
 const a=await get('/actions/artifacts/'+data.data.artifactId);
 assert.equal(String(a.id),data.data.artifactId);assert.equal(a.workflow_run?.id,run.id);assert.equal(a.workflow_run.head_sha,run.head_sha);
 assert.equal(a.name,'kingdom-recovery-'+run.id+'-'+attempt);assert.equal(a.expired,false);assert.match(a.digest??'',/^sha256:[a-f0-9]{64}$/);
 assert.ok(Number.isSafeInteger(a.size_in_bytes)&&a.size_in_bytes>0&&a.size_in_bytes<=2147483648);
 const r=await fetcher('https://api.github.com/repos/catillatio/test/actions/artifacts/'+a.id+'/zip',{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});
 assert.ok([302,307].includes(r.status));const u=new URL(r.headers.get('location'));await r.body?.cancel();
 assert.equal(u.protocol,'https:');assert.ok(!u.username&&!u.password);assert.ok(/^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(u.hostname)||['results-receiver.actions.githubusercontent.com','run-artifacts.githubusercontent.com'].includes(u.hostname));
 const dir=await mkdtemp(join(temp,'adoption-artifact-'));
 try{
  const download=await fetcher(u.href,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(180000)]):AbortSignal.timeout(180000)});assert.equal(download.status,200);
  const path=join(dir,'recovery.zip'),file=await open(path,'wx',0o600),digest=createHash('sha256');let bytes=0;
  try{for await(const b of download.body){signal?.throwIfAborted();bytes+=b.length;assert.ok(bytes<=a.size_in_bytes);digest.update(b);await file.writeFile(b);}}finally{await file.close();}
  assert.equal(bytes,a.size_in_bytes);assert.equal('sha256:'+digest.digest('hex'),a.digest);
  const entries=await command('unzip',['-Z1',path],{cwd:dir});assert.deepEqual(entries.trim().split(/\r?\n/).sort(),['backup-manifest.json','realm.dump.age']);
  const manifest=Buffer.from(await command('unzip',['-p',path,'backup-manifest.json'],{cwd:dir}));assert.deepEqual(manifest,selected.bytes);
  return {artifactId:String(a.id),archiveDigest:a.digest,manifestSha256:data.data.manifestSha256};
 }finally{await rm(dir,{recursive:true,force:true});}
}
