#!/usr/bin/env python3
"""Validate a real release AAB. Never signs, uploads or contacts the game."""
import argparse, hashlib, json, os, re, shutil, subprocess, tempfile, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
p=argparse.ArgumentParser();p.add_argument('--bundle',type=Path,required=True);p.add_argument('--bundletool',type=Path,required=True);p.add_argument('--application-id',default='game.kingdomcome.rpg');p.add_argument('--version-code',default='2');p.add_argument('--version-name',default='0.2.0-beta.1');p.add_argument('--expected-source',default=os.environ.get('KINGDOM_ANDROID_EXPECTED_SHA'));p.add_argument('--require-signed',action='store_true');p.add_argument('--expected-certificate');a=p.parse_args()
assert a.application_id=='game.kingdomcome.rpg','Approved permanent application ID required'
root=Path(__file__).resolve().parents[1]; ns='{http://schemas.android.com/apk/res/android}'
source=subprocess.check_output(['git','rev-parse','HEAD'],text=True,cwd=root).strip()
if a.expected_source:assert source==a.expected_source,'Unexpected source commit'
assert hashlib.sha256(a.bundletool.read_bytes()).hexdigest()=='a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29','Unexpected bundletool'
subprocess.run(['java','-jar',str(a.bundletool),'validate','--bundle='+str(a.bundle)],check=True,stdout=subprocess.DEVNULL)
xml=subprocess.check_output(['java','-jar',str(a.bundletool),'dump','manifest','--bundle='+str(a.bundle),'--module=base'],text=True)
m=ET.fromstring(xml);app=m.find('application');sdk=m.find('uses-sdk')
assert m.attrib['package']==a.application_id
assert m.attrib[ns+'versionCode']==a.version_code
assert m.attrib[ns+'versionName']==a.version_name
assert int(sdk.attrib[ns+'targetSdkVersion'])>=36 and int(sdk.attrib[ns+'minSdkVersion'])==26
compile_sdk=int(m.attrib.get(ns+'compileSdkVersion','0'));assert compile_sdk>=int(sdk.attrib[ns+'targetSdkVersion'])
assert [x.attrib[ns+'name'] for x in m.findall('uses-permission')]==['android.permission.INTERNET']
assert app.attrib.get(ns+'debuggable','false')=='false'
assert app.attrib.get(ns+'testOnly','false')=='false'
assert app.attrib[ns+'allowBackup']=='false' and app.attrib[ns+'usesCleartextTraffic']=='false'
assert len(app.findall('activity'))==1 and app.find('activity').attrib[ns+'exported']=='true'
assert not any(app.findall(tag) for tag in ('service','provider','receiver'))
network=ET.parse(root/'app/src/main/res/xml/network_security_config.xml').getroot()
assert network.find('base-config').attrib['cleartextTrafficPermitted']=='false'
assert [x.attrib['src'] for x in network.findall('.//certificates')]==['system']
assert network.find('debug-overrides') is None
with zipfile.ZipFile(a.bundle) as z:
 names=z.namelist();assert 'base/dex/classes.dex' in names
 assert not any(n.lower().endswith(('.jks','.keystore','.pem','.key','.env','.sql','.dump','.tar','.tgz','.so')) or '/../' in n for n in names)
 assert not any('FixtureActivity' in z.read(n).decode('latin1') for n in names if n.endswith('.dex'))
 signature_blocks=[n for n in names if re.match(r'META-INF/[^/]+\.(RSA|DSA|EC)$',n)]
 signed=bool(signature_blocks)
certificate=None
if signed:
 assert a.require_signed and a.expected_certificate,'Unexpected signed input; no owner signature may be inferred'
 assert len(signature_blocks)==1,'Exactly one owner upload signer required'
 verify=subprocess.run(['jarsigner','-verify',str(a.bundle)],capture_output=True,text=True,env={**os.environ,'LC_ALL':'C'})
 assert verify.returncode==0 and 'jar verified' in verify.stdout.lower() and 'unsigned entries' not in verify.stdout.lower(),'Invalid or partially signed JAR'
 public=subprocess.check_output(['keytool','-J-Duser.language=en','-printcert','-jarfile',str(a.bundle)],text=True)
 assert 'android debug' not in public.lower(),'Debug key is not a release upload identity'
 match=re.search(r'SHA256:\s*([0-9A-F:]+)',public);assert match
 certificate=match[1].replace(':','').lower()
 if a.expected_certificate:assert certificate==a.expected_certificate.lower().replace(':',''),'Unexpected certificate'
if a.require_signed:assert a.application_id=='game.kingdomcome.rpg','Approved permanent application ID required'
if a.require_signed:assert signed and a.expected_certificate,'Owner upload signature required'
out=root/'dist';out.mkdir(exist_ok=True);target=out/('kingdom-come-release.aab' if signed else 'kingdom-come-UNSIGNED-NOT-UPLOADABLE.aab');shutil.copyfile(a.bundle,target)
report={'sourceCommit':source,'applicationId':a.application_id,'versionCode':int(a.version_code),'versionName':m.attrib[ns+'versionName'],'minSdk':26,'compileSdk':compile_sdk,'targetSdk':int(sdk.attrib[ns+'targetSdkVersion']),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'permissions':['android.permission.INTERNET'],'debuggable':False,'nativeLibraries':False,'signing':'OWNER_UPLOAD_SIGNED' if signed else 'UNSIGNED_NOT_UPLOADABLE','signerCertificateSha256':certificate,'permanentIdOwnerConfirmed':False,'productionContacted':False}
(out/'bundle-verification.json').write_text(json.dumps(report,indent=2)+'\n');(out/'SHA256SUMS-AAB.txt').write_text(report['sha256']+'  '+target.name+'\n');print('ANDROID_BUNDLE: PASS — '+report['signing'])

print('ANDROID_BUNDLE_EVIDENCE: '+json.dumps({k:report[k] for k in ['sourceCommit','applicationId','versionCode','versionName','minSdk','targetSdk','sha256','bytes','permissions','debuggable','signing']},sort_keys=True))
