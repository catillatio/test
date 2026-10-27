import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,renameSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {aggregate,classify,gitChanges,manifest,matrix,selected,shard,validateManifest} from '../scripts/ci/plan.mjs';
import {databaseLease,fixtureUrl,testProcessEnvironment} from '../scripts/ci/isolation.mjs';
import {testResult} from '../scripts/ci/result.mjs';
const change=(path,status='M',mode='100644')=>({path,status,mode});
test('independent test processes discard worker identity without changing fixture configuration or the parent',()=>{
  const parent={NODE_TEST_CONTEXT:'child-v8',NODE_TEST_WORKER_ID:'parent-worker',NODE_ENV:'test',TEST_DATABASE_URL:'postgres://fixture@127.0.0.1/fixture_test',BROWSER_EXECUTABLE:'/fixture/browser',NODE_OPTIONS:'--enable-source-maps'};
  const env=testProcessEnvironment(parent);
  assert.deepEqual(env,{NODE_ENV:parent.NODE_ENV,TEST_DATABASE_URL:parent.TEST_DATABASE_URL,BROWSER_EXECUTABLE:parent.BROWSER_EXECUTABLE,NODE_OPTIONS:parent.NODE_OPTIONS});
  assert.equal(parent.NODE_TEST_CONTEXT,'child-v8');assert.equal(parent.NODE_TEST_WORKER_ID,'parent-worker');
});
test('a runner launched inside node:test executes real child tests instead of recursively skipping them',()=>{
  const label='nested-runner-'+randomUUID().replaceAll('-',''),directory=join('test-results','ci-'+label);
  try {
    const result=spawnSync(process.execPath,['scripts/ci/run-tests.mjs','--files=tests/land-client.test.mjs','--workers=1'],{env:{...process.env,NODE_TEST_CONTEXT:'child-v8',NODE_TEST_WORKER_ID:'stale-parent',CI_BENCHMARK_LABEL:label},encoding:'utf8',timeout:20000});
    assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,result.stdout+result.stderr);
    assert.doesNotMatch(result.stdout+result.stderr,/node:test run\(\) is being called recursively/);
    const report=JSON.parse(readFileSync(join(directory,'timings.json'),'utf8'));
    assert.equal(report.expected,1);assert.equal(report.completed,1);assert.equal(report.interrupted,false);
    assert.equal(report.results[0].file,'tests/land-client.test.mjs');assert.equal(report.results[0].passed,true);
    assert.ok(report.results[0].tests>0);assert.equal(report.results[0].skipped,0);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('explicit inventory covers every test, balances disjoint shards and rejects omission/duplicates',()=>{
  validateManifest();
  assert.throws(()=>validateManifest(manifest.tests.slice(1)),/missing/);
  assert.throws(()=>validateManifest([...manifest.tests,manifest.tests[0]]),/Invalid/);
  for(const profile of ['art','ui','gameplay','full']) {
    const expected=selected(profile),actual=[];
    for(const row of matrix(profile).include)actual.push(...shard(expected.filter(e=>e.lane===row.lane),row.shard,row.shards));
    assert.deepEqual(actual.map(e=>e.file).sort(),expected.map(e=>e.file).sort());
    assert.ok(expected.some(e=>e.file==='tests/equipment-presentation.test.ts'));
    assert.ok(expected.some(e=>e.file==='tests/coordinated-art-browser.test.mjs'));
  }
  assert.equal(selected('full').length,manifest.tests.length);
  for(const args of [[0,1],[1,0],[2,1],[1,9]])assert.throws(()=>shard([], ...args));
  assert.throws(()=>selected('unknown'));
});
test('classification is conservative for migrations, release/security, JSON policy, JS, mixed/unknown and filesystem tricks',()=>{
  assert.equal(classify([change('knights-reforged/public/art/fixture/item.webp')]),'art');
  assert.equal(classify([change('knights-reforged/public/art/properties-49/provenance.json')]),'art');
  assert.equal(classify([change('knights-reforged/views/battle.ejs')]),'ui');
  assert.equal(classify([change('knights-reforged/public/styles.css')]),'ui');
  assert.equal(classify([change('knights-reforged/src/combat.ts')]),'gameplay');
  for(const path of ['knights-reforged/migrations/026_future.sql','knights-reforged/src/db.ts','knights-reforged/src/auth.ts','knights-reforged/src/artwork.ts','knights-reforged/public/sound.js','knights-reforged/rulesets/art/rules.json','knights-reforged/public/art/art-1/provenance.json','knights-reforged/deployment/release/run.mjs','.github/workflows/checks.yml','knights-reforged/package-lock.json','unknown','knights-reforged/public/art/../x.png'])assert.equal(classify([change(path)]),'full',path);
  for(const status of ['D','R','C','T','U'])assert.equal(classify([change('knights-reforged/public/art/a.webp',status)]),'full');
  for(const mode of ['120000','100755','160000'])assert.equal(classify([change('knights-reforged/public/art/a.webp','M',mode)]),'full');
  assert.equal(classify([change('knights-reforged/public/art/a.webp'),change('knights-reforged/views/home.ejs')]),'full');
  assert.equal(classify([]),'full');assert.equal(classify([change('knights-reforged/public/styles.css')],{production:true}),'full');
});
test('real Git diff preserves repository paths, exact identities, deletion and symlink modes',()=>{
  const dir=mkdtempSync(join(tmpdir(),'kc-ci-git-'));
  const git=(...args)=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false',...args],{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  try {
    git('init');git('config','user.name','Synthetic CI');git('config','user.email','fixture@example.invalid');
    mkdirSync(join(dir,'knights-reforged/public/art/demo'),{recursive:true});
    const image='knights-reforged/public/art/demo/item.webp';writeFileSync(join(dir,image),'synthetic pixels');git('add','.');git('commit','-m','base');const base=git('rev-parse','HEAD');
    writeFileSync(join(dir,image),'revised pixels');git('add','.');git('commit','-m','image');const head=git('rev-parse','HEAD');
    assert.deepEqual(gitChanges(base,head,dir),[change(image)]);assert.equal(classify(gitChanges(base,head,dir)),'art');
    renameSync(join(dir,image),join(dir,'knights-reforged/public/art/demo/renamed.webp'));git('add','.');git('commit','-m','rename');const renamed=git('rev-parse','HEAD');
    assert.equal(classify(gitChanges(head,renamed,dir)),'full');
    symlinkSync('renamed.webp',join(dir,image));git('add','.');git('commit','-m','link');const link=git('rev-parse','HEAD');
    assert.ok(gitChanges(renamed,link,dir).some(c=>c.mode==='120000'));assert.equal(classify(gitChanges(renamed,link,dir)),'full');
    assert.deepEqual(gitChanges(link,link,dir),[]);assert.throws(()=>gitChanges('HEAD; unexpected',head,dir));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('required checks reject failed, cancelled, skipped and missing shards/jobs',()=>{
  const good=()=>Object.fromEntries(['plan','validation','tests','recovery'].map(k=>[k,{result:'success'}]));
  assert.equal(aggregate(good()),true);
  for(const k of Object.keys(good())) {
    for(const result of ['failure','cancelled','skipped',undefined])assert.equal(aggregate({...good(),[k]:{result}}),false);
    const missing=good();delete missing[k];assert.equal(aggregate(missing),false);
  }
  assert.equal(aggregate({...good(),unexpected:{result:'success'}}),false);
});
test('file completion requires real test evidence and rejects failure, interruption, silent skips and truncated output',()=>{
  const entry={file:'tests/ci-plan.test.mjs'},output='# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n';
  assert.equal(testResult(entry,output,0,null).passed,true);
  for(const [text,status,signal,options] of [[output,1,null,{}],[output,0,'SIGTERM',{}],['',0,null,{}],[output.replace('skipped 0','skipped 1'),0,null,{}],[output,0,null,{overflow:true}]])assert.equal(testResult(entry,text,status,signal,options).passed,false);
  const skip=output.replace('skipped 0','skipped 1')+'ok 1 - real hosted-runner network namespace executes synthetic checks without production secrets # SKIP\n';
  assert.equal(testResult({file:'tests/release-diagnostic.test.mjs'},skip,0,null,{hosted:false}).passed,true);
  assert.equal(testResult({file:'tests/release-diagnostic.test.mjs'},skip,0,null,{hosted:true}).passed,false);
});
test('fixture database access cannot follow remote hosts, query overrides or unsafe database names',async()=>{
  for(const url of [undefined,'postgres://x@realm.internal/live_test','postgres://x@127.0.0.1/live','postgres://x@localhost/live_test?host=remote','postgres://x@localhost/live_test?options=-csearch_path=public','postgres://x@localhost/live_test#ignored','https://localhost/x_test'])assert.throws(()=>fixtureUrl(url));
  assert.throws(()=>fixtureUrl('postgres://fixture:must-not-print@'),error=>!String(error).includes('must-not-print'));
  let calls=0;const pool={query:async()=>{calls++;}};
  await assert.rejects(databaseLease(pool,'postgres://x@remote/db_test'));
  await assert.rejects(databaseLease(pool,'postgres://x@localhost/db_test','bad;DROP DATABASE x'));
  assert.equal(calls,0);
  const sql=[];const fixture=await databaseLease({query:async s=>sql.push(s)},'postgres://x@localhost/db_test','a'.repeat(32));
  await fixture.close();await fixture.close();assert.equal(sql.length,2);assert.match(sql[0],/^CREATE DATABASE "kc_ci_[a-f0-9]{32}_test" TEMPLATE template0$/);assert.match(sql[1],/^DROP DATABASE "kc_ci_[a-f0-9]{32}_test" WITH \(FORCE\)$/);
  let drops=0;
  await assert.rejects(databaseLease({query:async()=>{drops++;throw Error('already exists');}},'postgres://x@localhost/db_test','a'.repeat(32)));
  assert.equal(drops,1,'never drop or adopt a failed creation');
});
test('protected release still requires a successful push on exact production SHA and recovery guards remain present',()=>{
  const preflight=readFileSync('deployment/release/preflight.mjs','utf8');
  assert.match(preflight,/event=push&head_sha=/);assert.match(preflight,/head_sha===sha/);
  const workflow=readFileSync('../.github/workflows/checks.yml','utf8');
  assert.match(workflow,/name: checks/);assert.match(workflow,/if: always\(\)/);assert.match(workflow,/fail-fast: false/);
  const release=readFileSync('../.github/workflows/production-release.yml','utf8');
  for(const text of ['environment: production','check-recovery.mjs','run.mjs prepare','run.mjs promote','cancel-in-progress: false'])assert.ok(release.includes(text));
});
