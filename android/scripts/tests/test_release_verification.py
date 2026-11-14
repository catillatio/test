"""Synthetic boundary tests; never creates a production key or invokes a signer."""
import contextlib,hashlib,io,json,os,runpy,shutil,sys,tempfile,unittest,zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
SOURCE=Path(__file__).resolve().parents[1]
SHA='a'*40
CERT='b'*64
class Bundle(unittest.TestCase):
 def verify(self,change=None,signed=False,require=False,certificate=CERT,debug=False,source=SHA):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);(root/'scripts').mkdir();(root/'app/src/main/res/xml').mkdir(parents=True)
   shutil.copyfile(SOURCE/'verify-bundle.py',root/'scripts/verify-bundle.py')
   shutil.copyfile(SOURCE.parent/'app/src/main/res/xml/network_security_config.xml',root/'app/src/main/res/xml/network_security_config.xml')
   bundle=root/'input.aab';tool=root/'tool.jar';tool.write_bytes(b'synthetic bundletool')
   with zipfile.ZipFile(bundle,'w') as z:
    z.writestr('base/dex/classes.dex',b'synthetic release dex')
    if signed:z.writestr('META-INF/UPLOAD.RSA',b'synthetic signature boundary')
   fields={'package':'game.kingdomcome.rpg','versionCode':'2','versionName':'0.2.0-beta.1','targetSdkVersion':'36','compileSdkVersion':'36','minSdkVersion':'26','allowBackup':'false','usesCleartextTraffic':'false','debuggable':'false','permission':'android.permission.INTERNET'}
   if change:fields.update(change)
   f=fields
   xml=f'''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="{f['package']}" android:versionCode="{f['versionCode']}" android:versionName="{f['versionName']}" android:compileSdkVersion="{f['compileSdkVersion']}"><uses-sdk android:minSdkVersion="{f['minSdkVersion']}" android:targetSdkVersion="{f['targetSdkVersion']}"/><uses-permission android:name="{f['permission']}"/><application android:allowBackup="{f['allowBackup']}" android:usesCleartextTraffic="{f['usesCleartextTraffic']}" android:debuggable="{f['debuggable']}"><activity android:exported="true"/></application></manifest>'''
   realhash=hashlib.sha256
   def digest(data=b''):
    if data==b'synthetic bundletool':return SimpleNamespace(hexdigest=lambda:'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29')
    return realhash(data)
   def output(args,**kwargs):
    if args[0]=='git':return SHA+'\n'
    if args[0]=='java':return xml
    if args[0]=='keytool':return ('Owner: CN=Android Debug\n' if debug else 'Owner: CN=Synthetic upload\n')+'SHA256: '+CERT.upper()+'\n'
    raise AssertionError(args)
   def run(args,**kwargs):
    assert args[0] in ['java','jarsigner'];return SimpleNamespace(returncode=0,stdout='jar verified',stderr='')
   args=['verify-bundle.py','--bundle',str(bundle),'--bundletool',str(tool),'--expected-source',source]
   if require:args+=['--require-signed','--expected-certificate',certificate]
   with patch.object(sys,'argv',args),patch('hashlib.sha256',digest),patch('subprocess.check_output',output),patch('subprocess.run',run),contextlib.redirect_stdout(io.StringIO()):runpy.run_path(str(root/'scripts/verify-bundle.py'),run_name='__main__')
   return json.loads((root/'dist/bundle-verification.json').read_text())
 def test_unsigned_is_never_uploadable(self):self.assertEqual(self.verify()['signing'],'UNSIGNED_NOT_UPLOADABLE')
 def test_explicit_expected_owner_signature(self):self.assertEqual(self.verify(signed=True,require=True)['signing'],'OWNER_UPLOAD_SIGNED')
 def test_unexpected_signature(self):
  with self.assertRaises(AssertionError):self.verify(signed=True)
 def test_debug_key_rejected(self):
  with self.assertRaises(AssertionError):self.verify(signed=True,require=True,debug=True)
 def test_wrong_certificate(self):
  with self.assertRaises(AssertionError):self.verify(signed=True,require=True,certificate='c'*64)
 def test_expected_signature_missing(self):
  with self.assertRaises(AssertionError):self.verify(require=True)
 def test_manifest_boundaries(self):
  for change in [{'package':'other.app'},{'versionCode':'3'},{'versionName':'0.1.0'},{'targetSdkVersion':'35'},{'compileSdkVersion':'35'},{'minSdkVersion':'25'},{'allowBackup':'true'},{'usesCleartextTraffic':'true'},{'debuggable':'true'},{'permission':'android.permission.CAMERA'}]:
   with self.subTest(change=change),self.assertRaises(AssertionError):self.verify(change=change)
 def test_stale_source(self):
  with self.assertRaises(AssertionError):self.verify(source='c'*40)
class SourceGate(unittest.TestCase):
 def run_gate(self,change=None):
  jobs=[{'name':name,'status':'completed','conclusion':'success'}for name in ['plan','validation','recovery','checks']+['test'+str(i)for i in range(6)]]
  native=[{'name':name,'status':'completed','conclusion':'success'}for name in ['apk','webview (29)','webview (36)']]
  approvals=[{'state':'approved','user':{'login':'catillatio'},'environments':[{'name':'android-release'}]}]
  if change:change(jobs,native,approvals)
  def output(args,**kwargs):
   if args[0]=='git':return SHA+'\n'
   path=args[2]
   if 'git/ref/' in path:v={'object':{'sha':SHA}}
   elif 'checks.yml/runs' in path:v={'workflow_runs':[{'id':1,'head_sha':SHA,'status':'completed','conclusion':'success'}]}
   elif 'android-alpha.yml/runs' in path:v={'workflow_runs':[{'id':2,'head_sha':SHA,'head_branch':'release/production','event':'push','status':'completed','conclusion':'success'}]}
   elif '/runs/1/jobs' in path:v={'jobs':jobs}
   elif '/runs/2/jobs' in path:v={'jobs':native}
   elif path.endswith('/approvals'):v=approvals
   else:raise AssertionError(path)
   return json.dumps(v)
  env={'GITHUB_REPOSITORY':'catillatio/test','GITHUB_REF':'refs/heads/release/production','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_SHA':SHA,'GITHUB_RUN_ID':'3'}
  with patch.dict(os.environ,env,clear=True),patch('subprocess.check_output',output),contextlib.redirect_stdout(io.StringIO()):runpy.run_path(str(SOURCE/'verify-release-source.py'),run_name='__main__')
 def test_all_exact_gates_required(self):self.run_gate()
 def test_missing_or_failed_checks_and_owner_gate(self):
  for change in [lambda a,b,c:a.pop(),lambda a,b,c:b.pop(),lambda a,b,c:b[0].update(conclusion='failure'),lambda a,b,c:c.clear(),lambda a,b,c:c[0]['user'].update(login='other')]:
   with self.subTest(change=change),self.assertRaises(SystemExit):self.run_gate(change)
if __name__=='__main__':unittest.main()
