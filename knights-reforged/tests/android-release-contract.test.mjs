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
