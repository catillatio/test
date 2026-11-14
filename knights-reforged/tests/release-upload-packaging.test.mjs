import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,mkdtempSync,mkdirSync,existsSync,rmSync,writeFileSync,copyFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';

const root=fileURLToPath(new URL('../../',import.meta.url)),app='knights-reforged/';
const folder=mkdtempSync(join(tmpdir(),'game-upload-packaging-'));
after(()=>rmSync(folder,{recursive:true,force:true}));
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
// A clean matcher repository has no worktree .git file or cached dependency
// symlinks. It uses the real ignore files and the same literal source paths.
const matcher=join(folder,'matcher');mkdirSync(matcher);execFileSync('git',['-c','init.defaultBranch=fixture','init','--quiet',matcher]);
for(const path of tracked.filter(p=>p==='.gitignore'||p.endsWith('/.gitignore'))){const target=join(matcher,path);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(root,path),target);}
// Local Git wildmatch exercises the standard ignore/negation rules used by the
// pinned CLI's ignore walker. No CLI, provider, credentials or network is used.
function ignored(paths){
 const result=spawnSync('git',['-c','core.excludesFile='+join(root,'.railwayignore'),'check-ignore','--no-index','-z','--stdin'],
  {cwd:matcher,input:paths.join('\0')+'\0',encoding:'utf8',timeout:10000});
 assert.ok(result.status===0||result.status===1,'Local ignore matcher must complete.');
 return new Set(result.stdout.split('\0').filter(Boolean));
}
function walk(path){return readdirSync(join(root,path),{withFileTypes:true}).flatMap(entry=>{
 const next=path+'/'+entry.name;assert.ok(!entry.isSymbolicLink(),'Production sources cannot be symbolic links.');
 return entry.isDirectory()?walk(next):[next];
});}

const excluded=ignored(tracked),selected=tracked.filter(path=>!excluded.has(path));
const required=[app+'deployment/privacy/journal-server.mjs',app+'deployment/privacy/initialize-journal.mjs',app+'deployment/privacy/release-window.mjs',app+'deployment/privacy/fulfill.mjs',...['Dockerfile','.dockerignore','railway.json','package.json','package-lock.json','tsconfig.json'].map(p=>app+p),
 ...['src','views','public','migrations','rulesets'].flatMap(p=>walk(app+p)),
 ...['deployment','deployment/release'].flatMap(p=>readdirSync(join(root,app+p),{withFileTypes:true})
  .filter(e=>e.isFile()&&(e.name.endsWith('.mjs')||e.name==='Dockerfile')).map(e=>app+p+'/'+e.name))];

test('game upload retains every production source, runtime asset and original monorepo prefix',()=>{
 assert.deepEqual([...selected].sort(),[...required].sort());
 assert.equal(ignored(required).size,0);
 assert.ok(selected.every(path=>path.startsWith(app)));
 for(const name of ['Dockerfile','.dockerignore','railway.json','deployment/release/proof.mjs','deployment/release/protocol.mjs'])assert.ok(selected.includes(app+name));
});

test('game upload excludes recovery, credentials, local dependencies, research, screenshots and unrelated tooling',()=>{
 const forbidden=['.git/config','.env','.release-artifacts/realm.dump.age','.release-artifacts/backup-manifest.json','.github/workflows/production-release.yml',
  ...['.env','node_modules/fixture.js','dist/server.js','test-results/fixture.json','docs/phase51c/screenshots/after/390-home.png',
   'original-reference/fixture.png','android/app/build/fixture.apk','tests/fixture.test.mjs','scripts/seed.ts','deployment/privacy/approve.mjs','deployment/privacy/ROLE_REVIEW.sql','saved-backup.dump','private.pem'].map(p=>app+p)];
 assert.equal(ignored(forbidden).size,forbidden.length);
 const archived=tracked.filter(p=>p.startsWith(app+'docs/level100-launch/art/archived-runtime-level100-1/')&&p.endsWith('.webp'));
 assert.equal(archived.length,45);assert.equal(ignored(archived).size,45,'all rejected/Hudson renderings stay outside the runtime bundle');
 assert.ok(!selected.some(p=>p.startsWith(app+'public/art/level100-1/')));
 const placeholders=selected.filter(p=>p.startsWith(app+'public/art/level100-beta-1/')&&p.endsWith('.webp'));assert.equal(placeholders.length,5);assert.equal(placeholders.reduce((n,p)=>n+statSync(join(root,p)).size,0),4000);
});

test('game upload stays bounded instead of accumulating review documents and reference artwork',()=>{
 // Available tracked files are a conservative lower bound in a sparse
 // checkout. Every selected production input still must exist and be read.
 assert.ok(selected.every(p=>existsSync(join(root,p))),'Every selected production input is materialized');
 const total=tracked.filter(p=>existsSync(join(root,p))).reduce((sum,p)=>sum+statSync(join(root,p)).size,0);
 const bytes=selected.reduce((sum,p)=>sum+statSync(join(root,p)).size,0);
 assert.ok(bytes<20*1024*1024,'Review any production source bundle above 20 MiB.');
 assert.ok(bytes<total/10,'The production upload must exclude the large nonproduction corpus.');
});

test('offline selected-file archive preserves exact bytes and all original Docker COPY inputs',()=>{
 const archive=join(folder,'game.tar.gz'),extracted=join(folder,'extracted');mkdirSync(extracted);
 execFileSync('tar',['--create','--gzip','--file',archive,'--null','--files-from','-'],{cwd:root,input:selected.join('\0')+'\0',stdio:['pipe','pipe','pipe']});
 execFileSync('tar',['--extract','--gzip','--file',archive,'--directory',extracted],{stdio:'pipe'});
 for(const path of selected)assert.deepEqual(readFileSync(join(extracted,path)),readFileSync(join(root,path)),path);
 const docker=readFileSync(join(extracted,app,'Dockerfile'),'utf8');
 for(const line of docker.split('\n').filter(s=>s.startsWith('COPY ')&&!s.includes('--from='))){
  const sources=line.slice(5).trim().split(/\s+/).filter(s=>!s.startsWith('--')).slice(0,-1);
  for(const path of sources)assert.ok(existsSync(join(extracted,app,path)),'Docker build source missing: '+path);
 }
 assert.deepEqual(readFileSync(join(extracted,app,'railway.json')),readFileSync(join(root,app,'railway.json')));
});

test('Docker context includes only the runtime erasure entry point, excluding owner signing and private inputs',()=>{
 const context=join(folder,'docker-ignore');mkdirSync(context);execFileSync('git',['init','--quiet'],{cwd:context,stdio:'pipe'});
 writeFileSync(join(context,'.gitignore'),readFileSync(join(root,app,'.dockerignore')));
 const paths=['deployment/privacy/fulfill.mjs','deployment/privacy/approve.mjs','deployment/privacy/ROLE_REVIEW.sql','deployment/privacy/private.pem'];
 const result=spawnSync('git',['-c','core.excludesFile=/dev/null','check-ignore','--no-index','-z','--stdin'],{cwd:context,input:paths.join('\0')+'\0',encoding:'utf8',timeout:10000});
 assert.equal(result.status,0);assert.deepEqual(result.stdout.split('\0').filter(Boolean),paths.slice(1));
});
