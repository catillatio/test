import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
test('Android release separates unsigned PR artifacts from protected owner signing and has no deployment/upload path',async()=>{
 const [ci,release,build,sign,gate]=await Promise.all(['.github/workflows/android-alpha.yml','.github/workflows/android-release.yml','android/app/build.gradle','android/scripts/sign-release.py','android/scripts/verify-release-source.py'].map(read));
 assert.ok(!ci.includes('secrets.'));assert.match(ci,/bundleRelease/);assert.match(ci,/api: \[29, 36\]/);
 assert.match(release,/environment: android-release/);assert.match(release,/github.ref == 'refs\/heads\/release\/production'/);assert.match(release,/verify-release-source.py/);
 assert.match(build,/targetSdk 36/);assert.match(build,/debuggable false/);assert.match(build,/signingConfig null/);assert.match(build,/applicationIdSuffix '.debug'/);
 assert.match(sign,/OWNER_SETUP_REQUIRED/);assert.match(sign,/PERMANENT_ID_REQUIRED/);assert.match(sign,/--require-signed/);assert.match(sign,/--expected-certificate/);
 assert.match(gate,/EXACT_HEAD_CI_REQUIRED/);
 assert.ok(!/railway (up|deploy)|fastlane|supply|google-play|upload_to_play_store/.test(release));
});
test('release origin/security and recovery never acquire a test origin override or POST replay',async()=>{
 const [policy,security,manifest]=await Promise.all(['android/app/src/main/java/game/kingdomcome/alpha/NavigationPolicy.java','android/app/src/main/java/game/kingdomcome/alpha/WebViewSecurity.java','android/app/src/main/AndroidManifest.xml'].map(read));
 assert.match(policy,/https:\/\/test-production-995c.up.railway.app/);assert.ok(!policy.includes('BuildConfig'));assert.match(security,/MIXED_CONTENT_NEVER_ALLOW/);assert.match(security,/setAcceptThirdPartyCookies\(web, false\)/);assert.match(security,/setAllowFileAccess\(false\)/);assert.match(security,/setWebContentsDebuggingEnabled\(false\)/);assert.ok(!security.includes('addJavascriptInterface'));
 assert.equal((manifest.match(/<uses-permission /g)||[]).length,1);assert.match(manifest,/android.permission.INTERNET/);assert.match(manifest,/usesCleartextTraffic="false"/);assert.ok(!manifest.includes('FixtureActivity'));
});
test('emulator failure evidence stays sanitized and cannot turn an install timeout into a pass',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{spawnSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'android-diagnostic-test-'));try{
  await writeFile(join(dir,'adb-state.txt'),'device\n');await writeFile(join(dir,'boot.txt'),'1\n');await writeFile(join(dir,'package-log.txt'),'verifier dexopt SYNTHETIC_SECRET_MUST_NOT_PRINT');
  const result=spawnSync('python3',[new URL('../../android/scripts/emulator-diagnostic.py',import.meta.url).pathname,'INSTALL_TEST','124',dir],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0);assert.equal(result.stderr,'');assert.ok(!result.stdout.includes('SYNTHETIC_SECRET'));
  const value=JSON.parse(result.stdout.slice('ANDROID_EMULATOR_FAILURE: '.length));assert.equal(value.exit_code,124);assert.equal(value.stage,'INSTALL_TEST');assert.equal(value.adb_online,true);assert.equal(value.verification_activity,true);assert.equal(value.dexopt_activity,true);
  const harness=await read('android/scripts/emulator-smoke.sh');assert.match(harness,/exit "\$original_status"/);assert.match(harness,/timeout 90 adb .*install --no-streaming -t/);assert.ok(!harness.includes('verifier_verify_adb_installs'));assert.match(harness,/timeout 120 adb .*am instrument/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
