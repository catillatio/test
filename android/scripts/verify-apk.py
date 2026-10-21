#!/usr/bin/env python3
"""Inspect the built debug artifact without contacting the game or reading secrets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--apk', type=Path, required=True)
parser.add_argument('--tools', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
android = '{http://schemas.android.com/apk/res/android}'
manifest = ET.parse(root / 'app/src/main/AndroidManifest.xml').getroot()
assert [p.attrib[android + 'name'] for p in manifest.findall('uses-permission')] == ['android.permission.INTERNET']
app = manifest.find('application')
assert app.attrib[android + 'allowBackup'] == 'false'
assert app.attrib[android + 'usesCleartextTraffic'] == 'false'
assert len(app.findall('activity')) == 1
assert [p.attrib for p in manifest.findall('.//intent-filter/data')] == [{android+'scheme':'https',android+'host':'test-production-995c.up.railway.app'}]
security = ET.parse(root / 'app/src/main/res/xml/network_security_config.xml').getroot()
assert security.find('base-config').attrib['cleartextTrafficPermitted'] == 'false'
assert [p.attrib['src'] for p in security.findall('.//certificates')] == ['system']
assert security.find('debug-overrides') is None

def run(tool, *values):
    return subprocess.check_output([str(args.tools / tool), *map(str, values)], text=True, stderr=subprocess.STDOUT)

badging = run('aapt', 'dump', 'badging', args.apk)
assert "package: name='game.kingdomcome.alpha'" in badging
assert "sdkVersion:'26'" in badging and "targetSdkVersion:'36'" in badging
assert re.findall(r"uses-permission: name='([^']+)'", badging) == ['android.permission.INTERNET']
assert 'testOnly' not in badging
compiled = run('aapt', 'dump', 'xmltree', args.apk, 'AndroidManifest.xml')
for attribute in ['allowBackup', 'usesCleartextTraffic']:
    assert re.search(r'android:'+attribute+r'\([^)]*\)=\(type 0x12\)0x0', compiled), attribute
signature = run('apksigner', 'verify', '--verbose', '--print-certs', args.apk)
fingerprint = re.search(r'Signer #1 certificate SHA-256 digest: ([a-fA-F0-9]{64})', signature)
assert fingerprint is not None
with zipfile.ZipFile(args.apk) as archive:
    assert 'classes.dex' in archive.namelist()
    assert not any(name.endswith(('.keystore', '.jks', '.pem', '.key', '.env')) for name in archive.namelist())
out = root / 'dist'
out.mkdir(exist_ok=True)
artifact = out / 'kingdom-come-alpha-debug.apk'
shutil.copyfile(args.apk, artifact)
digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
(out / 'SHA256SUMS.txt').write_text(digest + '  ' + artifact.name + '\n')
report = {'package':'game.kingdomcome.alpha','version':'0.1.0-alpha.1','minSdk':26,'targetSdk':36,
          'permissions':['android.permission.INTERNET'],'sha256':digest,'bytes':artifact.stat().st_size,
          'signerCertificateSha256':fingerprint[1].lower(),'signing':'Ephemeral Android debug key; not stable release signing.',
          'sourceCommit':os.environ.get('GITHUB_SHA'),'productionContacted':False}
(out / 'verification.json').write_text(json.dumps(report, indent=2)+'\n')
print('PASS: APK signature, package, SDKs, sole INTERNET permission, cleartext/backup restrictions and checksum.')
