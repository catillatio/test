import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,chmodSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readImageArtifact,command,checkBuildTree} from '../deployment/release/image.mjs';
import {candidateDigest} from '../deployment/release/candidate.mjs';
import {candidate,workflowEnv} from './fixtures/release-image.mjs';
const folder=mkdtempSync(join(tmpdir(),'image-artifact-test-'));after(()=>rmSync(folder,{recursive:true,force:true}));
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const actualCandidate=await candidateDigest();
function fixture(mode='success'){
 const c=candidate();c.candidateDigest=actualCandidate;c.identity.candidateDigest=actualCandidate;
 const raw=Buffer.from(JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:{digest:c.configDigest},layers:[{digest:'sha256:'+'f'.repeat(64),size:10}]})+'\n');c.manifestDigest=hash(raw);c.reference='ghcr.io/catillatio/kingdom-come@'+c.manifestDigest;
 const env={...workflowEnv(),GH_TOKEN:'synthetic-only',RUNNER_TEMP:folder,KINGDOM_IMAGE_MANIFEST_DIGEST:c.manifestDigest};
 if(mode==='wrong_candidate')c.identity.candidateDigest=c.candidateDigest='0'.repeat(64);
 const entries=[['candidate.json',JSON.stringify(c)],['manifest.json',raw.toString()]];
 if(mode==='traversal')entries.push(['../unexpected','never-extracted']);
 if(mode==='duplicate')entries.push(['candidate.json',JSON.stringify(c)]);
 if(mode==='bomb')entries[0][1]='x'.repeat(2100000);
 const zip=execFileSync('python3',['-c',"import io,json,sys,zipfile;p=io.BytesIO();z=zipfile.ZipFile(p,'w',compression=zipfile.ZIP_DEFLATED);[z.writestr(n,b) for n,b in json.load(sys.stdin)];z.close();sys.stdout.buffer.write(p.getvalue())"],{input:JSON.stringify(entries),stdio:['pipe','pipe','pipe']});
 const run={id:101,head_sha:env.GITHUB_SHA,head_branch:'release/production',event:'workflow_dispatch',path:'.github/workflows/production-release.yml',status:'completed',conclusion:'success',head_repository:{full_name:'catillatio/test'},run_attempt:1};
 const artifact={id:102,expired:false,digest:hash(zip),size_in_bytes:zip.length,workflow_run:{id:101,head_sha:env.GITHUB_SHA},name:'kingdom-image-'+env.GITHUB_SHA+'-101-1'};
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url.startsWith('https://api.github.com/')){
   assert.equal(options.headers.authorization,'Bearer synthetic-only');
   if(url.endsWith('/zip')){
    assert.equal(options.redirect,'manual');let location='https://productionresultssa1.blob.core.windows.net/candidate?sig=synthetic-private-url';
    if(mode==='redirect_host')location='https://attacker.invalid/candidate';
    if(mode==='redirect_credentials')location='https://user:private@productionresultssa1.blob.core.windows.net/candidate';
    return new Response('',{status:302,headers:{location}});
   }
   if(url.includes('/jobs?'))return Response.json({jobs:[{name:'image-prepare',status:'completed',conclusion:'success'}]});
   return Response.json(url.includes('/artifacts/')?artifact:run);
  }
  assert.equal(options.headers,undefined,'GitHub bearer must never reach the artifact CDN');assert.equal(options.redirect,'error');
  return new Response(mode==='corrupt_zip'?Buffer.concat([zip,Buffer.from('changed')]):zip);
 };
 return {env,c,raw,calls,fetcher};
}
test('real ZIP artifact is hash-checked and preserves exact manifest bytes without forwarding GitHub credentials',async()=>{
 const f=fixture();const a=await readImageArtifact(f.env,{fetcher:f.fetcher});assert.deepEqual(a.candidate,f.c);assert.equal(a.artifactId,'102');assert.equal(a.artifactDigest.startsWith('sha256:'),true);
 assert.equal(f.calls.filter(c=>c.url.includes('/zip')).length,1);assert.equal(f.calls.filter(c=>c.url.includes('.blob.')).length,1);
});
for(const mode of ['traversal','duplicate','bomb','wrong_candidate','redirect_host','redirect_credentials','corrupt_zip'])test('untrusted retained artifact is rejected without source/registry/Railway fallback: '+mode,async()=>{
 const f=fixture(mode);await assert.rejects(readImageArtifact(f.env,{fetcher:f.fetcher}));assert.ok(f.calls.every(c=>!c.url.includes('railway.com')&&!c.url.includes('ghcr.io')));
 if(mode.startsWith('redirect_'))assert.ok(f.calls.every(c=>c.url.startsWith('https://api.github.com/')));
});
test('a child closing its private stdin cannot crash the runner or expose the supplied input',async()=>{
 await assert.rejects(command(process.execPath,['-e','process.stdin.destroy();process.exit(1)'],{input:'synthetic-private-input'.repeat(150000)}),error=>/^Image command (?:input )?rejected\.$/.test(error.message));
});
test('source identity rejects ignored build inputs, tracked tampering and symlinks before publication',async()=>{
 const root=mkdtempSync(join(folder,'git-build-'));
 const git=(...args)=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false',...args],{cwd:root,stdio:'pipe'});
 for(const dir of ['src','views','public','rulesets','migrations','deployment'])mkdirSync(join(root,dir));
 for(const file of ['Dockerfile','.dockerignore','package.json','package-lock.json','tsconfig.json','src/main.ts'])writeFileSync(join(root,file),'fixture\n',{mode:0o644});
 writeFileSync(join(root,'.gitignore'),'public/ignored.env\n',{mode:0o644});
 git('init');git('config','user.name','Synthetic CI');git('config','user.email','fixture@example.invalid');git('add','.');git('commit','-m','fixture');
 await checkBuildTree(root);
 writeFileSync(join(root,'public/ignored.env'),'synthetic-private',{mode:0o644});await assert.rejects(checkBuildTree(root));rmSync(join(root,'public/ignored.env'));
 writeFileSync(join(root,'src/main.ts'),'changed\n');await assert.rejects(checkBuildTree(root));writeFileSync(join(root,'src/main.ts'),'fixture\n');
 symlinkSync('../src/main.ts',join(root,'public/alias'));await assert.rejects(checkBuildTree(root));rmSync(join(root,'public/alias'));
 chmodSync(join(root,'src/main.ts'),0o755);await assert.rejects(checkBuildTree(root));chmodSync(join(root,'src/main.ts'),0o644);
 await checkBuildTree(root);
});
