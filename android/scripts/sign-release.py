#!/usr/bin/env python3
"""Protected owner-provided upload key only. No key generation or log forwarding."""
import base64, os, re, subprocess, tempfile
from pathlib import Path
required=['ANDROID_UPLOAD_KEYSTORE_BASE64','ANDROID_STORE_PASSWORD','ANDROID_KEY_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_UPLOAD_CERT_SHA256','ANDROID_APPLICATION_ID']
if any(not os.environ.get(k) for k in required):raise SystemExit('ANDROID_SIGNING: STOP — OWNER_SETUP_REQUIRED')
if os.environ['ANDROID_APPLICATION_ID']=='game.kingdomcome.alpha':raise SystemExit('ANDROID_SIGNING: STOP — PERMANENT_ID_REQUIRED')
if os.environ['ANDROID_APPLICATION_ID']!='game.kingdomcome.rpg':raise SystemExit('ANDROID_SIGNING: STOP — APPROVED_APPLICATION_ID_REQUIRED')
if os.environ.get('GITHUB_REF')!='refs/heads/release/production':raise SystemExit('ANDROID_SIGNING: STOP — PROTECTED_BRANCH_REQUIRED')
try:
 assert re.fullmatch(r'[1-9][0-9]{0,8}',os.environ.get('ANDROID_VERSION_CODE',''))
 assert re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+[a-zA-Z0-9.+-]*',os.environ.get('ANDROID_VERSION_NAME',''))
 assert re.fullmatch(r'[a-fA-F0-9]{64}',os.environ['ANDROID_UPLOAD_CERT_SHA256'].replace(':',''))
 with tempfile.TemporaryDirectory(prefix='kingdom-upload-key-') as d:
  key=Path(d)/'upload.jks';key.write_bytes(base64.b64decode(os.environ['ANDROID_UPLOAD_KEYSTORE_BASE64'],validate=True));key.chmod(0o600)
  bundle=Path('app/build/outputs/bundle/release/app-release.aab')
  subprocess.run(['jarsigner','-keystore',str(key),'-storepass:env','ANDROID_STORE_PASSWORD','-keypass:env','ANDROID_KEY_PASSWORD','-digestalg','SHA-256',str(bundle),os.environ['ANDROID_KEY_ALIAS']],check=True,capture_output=True)
  subprocess.run(['python3','scripts/verify-bundle.py','--bundle',str(bundle),'--bundletool',os.environ['KINGDOM_BUNDLETOOL'],'--application-id',os.environ['ANDROID_APPLICATION_ID'],'--version-code',os.environ['ANDROID_VERSION_CODE'],'--version-name',os.environ['ANDROID_VERSION_NAME'],'--expected-source',os.environ['GITHUB_SHA'],'--require-signed','--expected-certificate',os.environ['ANDROID_UPLOAD_CERT_SHA256']],check=True,capture_output=True)
except Exception:raise SystemExit('ANDROID_SIGNING: STOP — SIGN_OR_VERIFY_FAILED; no upload authorized')
print('ANDROID_SIGNING: PASS — OWNER_UPLOAD_SIGNED; no Play upload performed')
