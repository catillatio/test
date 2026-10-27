import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,copyFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {candidateDigest} from '../deployment/release/candidate.mjs';

const folder=mkdtempSync(join(tmpdir(),'release-artifact-paths-'));after(()=>rmSync(folder,{recursive:true,force:true}));
const app=fileURLToPath(new URL('../',import.meta.url)),repo=fileURLToPath(new URL('../../',import.meta.url));
const controller=new URL('../deployment/release/run.mjs',import.meta.url),checker=new URL('../deployment/release/check-recovery.mjs',import.meta.url);
const preload=fileURLToPath(new URL('./fixtures/release-artifacts.mjs',import.meta.url)),keys=generateKeyPairSync('ed25519');
const ids=Array.from({length:6},(_,i)=>String(i+1).repeat(8)+'-'+String(i+1).repeat(4)+'-4'+String(i+1).repeat(3)+'-8'+String(i+1).repeat(3)+'-'+String(i+1).repeat(12));
const workflow=readFileSync(new URL('../../.github/workflows/production-release.yml',import.meta.url),'utf8');
const uploads=workflow.split(/(?=^      - )/m).filter(block=>/uses: actions\/upload-artifact@/.test(block));
const recovery=uploads.find(block=>block.includes('name: kingdom-recovery-')),verification=uploads.find(block=>block.includes('name: kingdom-release-verification-'));
const recoveryPaths=['.release-artifacts/realm.dump.age','.release-artifacts/backup-manifest.json'];
function paths(block){
 const match=/^          path: \|\n((?:^            .*(?:\n|$))+)/m.exec(block);assert.ok(match,'Artifact selection must use an explicit file allowlist.');
 return match[1].trim().split('\n').map(line=>line.trim());
}
let number=0;
const fingerprint=await candidateDigest();
function prepare(cwd){
 const root=join(folder,'case '+number++),workspace=join(root,'workspace'),runner=join(root,'runner-temp'),trace=join(root,'trace'),forbidden=join(root,'forbidden');
 mkdirSync(workspace,{recursive:true});mkdirSync(runner);writeFileSync(trace,'');
 const result=spawnSync(process.execPath,['--import',preload,fileURLToPath(controller),'prepare'],{cwd,encoding:'utf8',timeout:15000,env:{
  PATH:process.env.PATH,GITHUB_WORKSPACE:workspace,RUNNER_TEMP:runner,GITHUB_REF:'refs/heads/release/production',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',
  KINGDOM_RELEASE_ENABLED:'true',KINGDOM_RAILWAY_AUTODEPLOY_DISABLED:'true',KINGDOM_RELEASE_TRANSPORT:'private-job-v2',
  RAILWAY_PROJECT_ID:ids[0],RAILWAY_ENVIRONMENT_ID:ids[1],RAILWAY_GAME_SERVICE_ID:ids[2],RAILWAY_PG_SERVICE_ID:ids[3],RAILWAY_RELEASE_WORKER_SERVICE_ID:ids[4],RAILWAY_VERIFY_PG_SERVICE_ID:ids[5],
  KINGDOM_DATABASE_HOST:'game-db.railway.internal',KINGDOM_DATABASE_NAME:'railway',KINGDOM_RESTORE_DATABASE_HOST:'verify-db.railway.internal',KINGDOM_PRODUCTION_ORIGIN:'https://realm.fixture.invalid',
  RAILWAY_TOKEN:'synthetic-project-token-not-a-credential',KINGDOM_BACKUP_RECIPIENT:'age1'+'a'.repeat(58),
  KINGDOM_RELEASE_SIGNING_KEY:keys.privateKey.export({type:'pkcs8',format:'pem'}),KINGDOM_RELEASE_VERIFY_KEY:keys.publicKey.export({type:'spki',format:'pem'}),
  FIXTURE_MODE:'success',FIXTURE_IDS:JSON.stringify(ids),FIXTURE_CONTROLLER_URL:controller.href,FIXTURE_CANDIDATE_DIGEST:fingerprint,FIXTURE_TRACE:trace,FIXTURE_FORBIDDEN:forbidden
 }});
 assert.equal(result.error,undefined);assert.equal(existsSync(forbidden),false,'No real provider, DNS, database or subprocess operation is allowed.');
 assert.equal(result.status,0);assert.equal(result.stderr,'');
 assert.match(result.stdout,/Encrypted recovery independently exported and verified; isolated restored-copy migration\/replay passed\./);
 const out=join(workspace,'.release-artifacts');assert.deepEqual(readdirSync(out).sort(),['backup-manifest.json','realm.dump.age']);
 assert.equal(existsSync(join(runner,'.release-artifacts')),false);
 const manifest=JSON.parse(readFileSync(join(out,'backup-manifest.json'),'utf8'));
 assert.equal(manifest.request.candidateDigest,fingerprint);assert.equal(Object.hasOwn(manifest.request,'urls'),false);assert.equal(Object.hasOwn(manifest.report,'urls'),false);
 return {workspace,runner,out};
}
function retained(state,omit=[]){
 const runner=join(folder,'download-'+number++),destination=join(runner,'verified-backup');mkdirSync(destination,{recursive:true});
 for(const path of paths(recovery))if(!omit.includes(basename(path)))copyFileSync(resolve(state.workspace,path),join(destination,basename(path)));
 return {runner,destination};
}
function check(retention,sha='a'.repeat(40)){
 return spawnSync(process.execPath,[fileURLToPath(checker)],{cwd:app,encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,RUNNER_TEMP:retention.runner,GITHUB_SHA:sha}});
}

test('recovery uploads retain exact files and policy; image evidence has its own two-file allowlist',()=>{
 assert.equal(uploads.length,3);
 const image=uploads.find(block=>block.includes('name: kingdom-image-'));
 assert.deepEqual(paths(image),['.image-candidate/candidate.json','.image-candidate/manifest.json']);
 assert.match(image,/^          include-hidden-files: true$/m);assert.match(image,/^          if-no-files-found: error$/m);
 for(const block of uploads){
  assert.match(block,/uses: actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);assert.match(block,/^          retention-days: 90$/m);
  const hidden=/^          include-hidden-files: (.+)$/m.exec(block);if(hidden)assert.equal(hidden[1],block===image?'true':'false');
 }
 assert.deepEqual(paths(recovery),recoveryPaths);assert.match(recovery,/^          if-no-files-found: error$/m);
 assert.deepEqual(paths(verification),[...recoveryPaths,'.release-artifacts/post-deploy.json']);assert.match(verification,/^        if: always\(\)$/m);assert.match(verification,/^          if-no-files-found: warn$/m);
});

test('prepare writes both finalized recovery files under GITHUB_WORKSPACE from repository cwd',()=>{prepare(repo);});
test('prepare writes both finalized recovery files under GITHUB_WORKSPACE from application cwd',()=>{prepare(app);});

test('allowlisted recovery retains a flat ciphertext/manifest pair and passes the real independent verifier',()=>{
 const state=prepare(app);
 for(const name of ['.env','unexpected.dump','signing.pem','owner.agekey'])writeFileSync(join(state.out,name),'synthetic-unselected-content');
 const retention=retained(state);assert.deepEqual(readdirSync(retention.destination).sort(),['backup-manifest.json','realm.dump.age']);
 const result=check(retention);assert.equal(result.status,0);assert.equal(result.stderr,'');assert.match(result.stdout,/Independently retained recovery artifact matches the checked candidate and encrypted export\./);
});

for(const name of ['realm.dump.age','backup-manifest.json'])test('independent retention verification rejects an artifact missing '+name,()=>{
 const result=check(retained(prepare(app),[name]));assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,'Independent retained-recovery verification failed. No promotion is authorized.\n');
});

test('independent verification rejects modified retained ciphertext',()=>{
 const retention=retained(prepare(app)),path=join(retention.destination,'realm.dump.age'),bytes=readFileSync(path);bytes[0]^=255;writeFileSync(path,bytes);
 const result=check(retention);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'Independent retained-recovery verification failed. No promotion is authorized.\n');
});

test('independent verification rejects wrong-commit retained recovery',()=>{
 const result=check(retained(prepare(app)),'f'.repeat(40));assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,'Independent retained-recovery verification failed. No promotion is authorized.\n');
});

test('empty recovery cannot use the original workspace files as an independent download fallback',()=>{
 const state=prepare(app),retention=retained(state,recoveryPaths.map(path=>basename(path)));assert.equal(readdirSync(retention.destination).length,0);
 assert.match(recovery,/^          if-no-files-found: error$/m);const result=check(retention);assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,'Independent retained-recovery verification failed. No promotion is authorized.\n');
});
