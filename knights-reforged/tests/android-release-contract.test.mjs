import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
test('Android release separates unsigned PR artifacts from protected owner signing and has no deployment/upload path',async()=>{
 const [ci,release,build,sign,gate]=await Promise.all(['.github/workflows/android-alpha.yml','.github/workflows/android-release.yml','android/app/build.gradle','android/scripts/sign-release.py','android/scripts/verify-release-source.py'].map(read));
 assert.ok(!ci.includes('secrets.'));assert.match(ci,/bundleRelease/);assert.match(ci,/api: \[29, 36\]/);
 assert.match(release,/environment: android-release/);assert.match(release,/github.ref == 'refs\/heads\/release\/production'/);assert.match(release,/verify-release-source.py/);
 assert.match(build,/targetSdk 36/);assert.match(build,/debuggable false/);assert.match(build,/signingConfig null/);assert.match(build,/applicationIdSuffix '.debug'/);
 assert.match(release,/value=='game.kingdomcome.rpg'/);assert.match(sign,/APPROVED_APPLICATION_ID_REQUIRED/);
 assert.match(sign,/OWNER_SETUP_REQUIRED/);assert.match(sign,/PERMANENT_ID_REQUIRED/);assert.match(sign,/--require-signed/);assert.match(sign,/--expected-certificate/);
 assert.match(gate,/EXACT_HEAD_CI_REQUIRED/);
 assert.ok(!/railway (up|deploy)|fastlane|supply|google-play|upload_to_play_store/.test(release));
});
test('release origin/security and recovery never acquire a test origin override or POST replay',async()=>{
 const [policy,security,manifest]=await Promise.all(['android/app/src/main/java/game/kingdomcome/alpha/NavigationPolicy.java','android/app/src/main/java/game/kingdomcome/alpha/WebViewSecurity.java','android/app/src/main/AndroidManifest.xml'].map(read));
 assert.match(policy,/https:\/\/test-production-995c.up.railway.app/);assert.ok(!policy.includes('BuildConfig'));assert.match(security,/MIXED_CONTENT_NEVER_ALLOW/);assert.match(security,/setAcceptThirdPartyCookies\(web, false\)/);assert.match(security,/setAllowFileAccess\(false\)/);assert.match(security,/setWebContentsDebuggingEnabled\(false\)/);assert.ok(!security.includes('addJavascriptInterface'));
 assert.equal((manifest.match(/<uses-permission /g)||[]).length,1);assert.match(manifest,/android.permission.INTERNET/);assert.match(manifest,/usesCleartextTraffic="false"/);assert.ok(!manifest.includes('FixtureActivity'));
});
test('emulator failure evidence stays sanitized and cannot silently accept an unverified install timeout',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{spawnSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'android-diagnostic-test-'));try{
  await writeFile(join(dir,'adb-state.txt'),'device\n');await writeFile(join(dir,'boot.txt'),'1\n');await writeFile(join(dir,'package-log.txt'),'verifier dexopt SYNTHETIC_SECRET_MUST_NOT_PRINT');
  const result=spawnSync('python3',[new URL('../../android/scripts/emulator-diagnostic.py',import.meta.url).pathname,'INSTALL_TEST','124',dir],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0);assert.equal(result.stderr,'');assert.ok(!result.stdout.includes('SYNTHETIC_SECRET'));
  const value=JSON.parse(result.stdout.slice('ANDROID_EMULATOR_FAILURE: '.length));assert.equal(value.exit_code,124);assert.equal(value.stage,'INSTALL_TEST');assert.equal(value.adb_online,true);assert.equal(value.verification_activity,true);assert.equal(value.dexopt_activity,true);
  const harness=await read('android/scripts/emulator-smoke.sh');assert.match(harness,/exit "\$original_status"/);assert.match(harness,/timeout 90 adb .*install --no-streaming -t/);assert.ok(!harness.includes('verifier_verify_adb_installs'));assert.match(harness,/timeout 120 adb .*am instrument/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('late installation reconciliation requires the exact app/test bytes, registered instrumentation and responsive package manager',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{spawnSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'android-installed-pair-'));const helper=new URL('../../android/scripts/emulator-diagnostic.py',import.meta.url).pathname;
 const files={'adb-state.txt':'device','boot.txt':'1','app-path.txt':'package:/data/app/app/base.apk','test-path.txt':'package:/data/app/test/base.apk','instrumentation.txt':'instrumentation:game.kingdomcome.alpha.debug.test/game.kingdomcome.alpha.ShellInstrumentation (target=game.kingdomcome.alpha.debug)','app-apk-match.txt':'MATCH','test-apk-match.txt':'MATCH','adb-state.complete':'','boot.complete':'','app-path.complete':'','test-path.complete':'','instrumentation.complete':''};
 const run=(stage='INSTALL_TEST',code='124')=>spawnSync('python3',[helper,stage,code,dir,'--verify-installed-pair'],{encoding:'utf8',timeout:10000});
 try{
  for(const [name,value] of Object.entries(files))await writeFile(join(dir,name),value);
  const success=run();assert.equal(success.status,0);assert.equal(success.stdout,'ANDROID_EMULATOR_INSTALL: VERIFIED_EXACT_APK_PAIR_AFTER_CLIENT_TIMEOUT; no_retry=true\n');
  for(const name of Object.keys(files)){await rm(join(dir,name));assert.equal(run().status,1,'Missing authoritative evidence: '+name);await writeFile(join(dir,name),files[name]);}
  await writeFile(join(dir,'test-apk-match.txt'),'DIFFERENT');assert.equal(run().status,1);await writeFile(join(dir,'test-apk-match.txt'),'MATCH');
  await writeFile(join(dir,'package-log.txt'),'INSTALL_FAILED');assert.equal(run().status,1);await writeFile(join(dir,'package-log.txt'),'FATAL EXCEPTION');assert.equal(run().status,1);await rm(join(dir,'package-log.txt'));
  await writeFile(join(dir,'instrumentation.txt'),files['instrumentation.txt'].replace('(target=game.kingdomcome.alpha.debug)','(target=other)'));assert.equal(run().status,1);await writeFile(join(dir,'instrumentation.txt'),files['instrumentation.txt']);
  assert.equal(run('INSTALL_APP').status,1);assert.equal(run('INSTALL_TEST','1').status,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('signed release rejects an unapproved permanent ID before decoding or accessing upload-key material',async()=>{
 const {spawnSync}=await import('node:child_process');
 const script=new URL('../../android/scripts/sign-release.py',import.meta.url).pathname;
 const result=spawnSync('python3',[script],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,ANDROID_APPLICATION_ID:'game.unrelated.rpg',ANDROID_UPLOAD_KEYSTORE_BASE64:'invalid-not-a-key',ANDROID_STORE_PASSWORD:'synthetic',ANDROID_KEY_PASSWORD:'synthetic',ANDROID_KEY_ALIAS:'synthetic',ANDROID_UPLOAD_CERT_SHA256:'a'.repeat(64),GITHUB_REF:'refs/heads/release/production'}});
 assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/APPROVED_APPLICATION_ID_REQUIRED/);assert.ok(!result.stderr.includes('synthetic'));
});
