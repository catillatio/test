"""One synthetic GHCR package bootstrap; no game source/build, Railway or recovery.
Reuses only the exact independently verified canary image. No mutation retries.
"""
import base64,hashlib,json,os,re,shutil,subprocess,tempfile,urllib.error,urllib.request
from pathlib import Path
PACKAGE='ghcr.io/catillatio/kingdom-come'
SOURCE='ghcr.io/catillatio/kingdom-come-deploy-canary@sha256:b49d4df2ca6e4959dcdaf1235d8705d1b2f012380d5a2991fce414ac2acda000'
CONFIG='sha256:4eee41c0a59aef69fa373485c2043c85c009027f35e90a1d8024e06c852fd689'
BRANCH='refs/heads/bootstrap/private-ghcr-kingdom-come-20261027'
BASE='7515ac1af7dc349f3eca0d926db16e367e89c331'
API='https://api.github.com/users/catillatio/packages/container/kingdom-come'
SETTINGS='https://github.com/users/catillatio/packages/container/kingdom-come/settings'
MEDIA='application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json'
DIGEST=re.compile(r'sha256:[a-f0-9]{64}\Z')
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): raise RuntimeError('Redirect refused')
def read(url,headers):
 try:
  with urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url,headers=headers),timeout=30) as r:
   raw=r.read(2000001);assert len(raw)<=2000000
   return r.status,{k.lower():v for k,v in r.headers.items()},raw
 except urllib.error.HTTPError as e:
  status=e.code;e.close();return status,{},b''
def manifest(raw,header,expected):
 assert DIGEST.fullmatch(expected) and header==expected
 assert 'sha256:'+hashlib.sha256(raw).hexdigest()==expected
 m=json.loads(raw);assert m['schemaVersion']==2 and m['mediaType'] in MEDIA.split(', ')
 assert 'manifests' not in m and m['config']['digest']==CONFIG
 assert len(m['layers'])==1 and DIGEST.fullmatch(m['layers'][0]['digest'])
 assert 0<m['layers'][0]['size']<1024*1024
 return m

def platform(info):
 assert info['Id']==CONFIG and info['Architecture']=='amd64' and info['Os']=='linux'
 c=info['Config'];assert c['User']=='65532:65532' and c['Entrypoint']==['/canary']
 assert set(x.split('=',1)[0] for x in c['Env'])=={'PATH','PORT'}

def result(value):
 assert value=={'kind':'kingdom-image-canary-v1','os':'linux','architecture':'amd64','uid':65532,
 'nonce':'b50e39c20eec8c6e96658194266cf430',
 'sourceSpecSha256':'0938562107c48d2e51e0116ce4d31c8e3b1f1d8cef3e23b5b4b3f39de6800c73','maximumLifetimeSeconds':120}

def privacy_metadata(status,raw):
 if status!=200: return 'UNVERIFIED'
 v=json.loads(raw);assert v['name']=='kingdom-come' and v['package_type']=='container'
 return 'PRIVATE' if v['visibility']=='private' else 'NOT_PRIVATE'

def main():
 folder=None;stage='CONTEXT'
 receipt={'kind':'owner-authorized-synthetic-package-bootstrap-v1','package':PACKAGE,'settings':SETTINGS,
  'publicationState':'NOT_STARTED','privateVerified':False,'gameCodePublished':False,
  'railwayRequests':0,'recoveryRequests':0,'sourceImage':SOURCE,'configDigest':CONFIG}
 env=dict(os.environ)
 for k in list(env):
  if re.search('TOKEN|PASSWORD|SECRET|PRIVATE_KEY|ACCESS_KEY|DATABASE_URL|SIGNING_KEY',k,re.I): del env[k]
 def command(*args,stdin=None,timeout=120):
  r=subprocess.run(args,input=stdin,capture_output=True,text=True,env=env,timeout=timeout)
  assert len(r.stdout)+len(r.stderr)<=2000000 and r.returncode==0
  return r.stdout.strip()
 def docker(*args,**kwargs): return command('docker','--config',folder,*args,**kwargs)
 try:
  assert os.environ['GITHUB_REPOSITORY']=='catillatio/test' and os.environ['GITHUB_REF']==BRANCH
  assert os.environ['GITHUB_EVENT_NAME']=='create' and os.environ['GITHUB_RUN_ATTEMPT']=='1'
  assert os.environ['GITHUB_ACTOR']==os.environ['GITHUB_TRIGGERING_ACTOR']=='catillatio'
  sha,run=os.environ['GITHUB_SHA'],os.environ['GITHUB_RUN_ID']
  assert re.fullmatch('[a-f0-9]{40}',sha) and re.fullmatch('[1-9][0-9]{0,24}',run)
  assert command('git','rev-parse','HEAD')==sha and command('git','rev-parse','HEAD^')==BASE
  receipt.update(sourceCommit=sha,runId=run,runAttempt=1)
  token=os.environ['GITHUB_TOKEN'];assert token and '\n' not in token and '\r' not in token
  headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}
  stage='PACKAGE_PRECHECK';status,_,_=read(API,headers)
  assert status==404 # Owner observed absence; never append to an existing visible package.
  folder=tempfile.mkdtemp(prefix='synthetic-package-bootstrap-',dir=os.environ['RUNNER_TEMP'])
  docker('login','ghcr.io','--username','catillatio','--password-stdin',stdin=token+'\n')
  stage='EXACT_SYNTHETIC_SOURCE'
  docker('pull',SOURCE)
  platform(json.loads(docker('image','inspect',SOURCE))[0])
  result(json.loads(docker('run','--rm','--network','none','--read-only','--cap-drop','ALL',
   '--security-opt','no-new-privileges',SOURCE,'--self-test')))
  # Token is used only in this process and password-stdin; never argv/artifacts.
  basic=base64.b64encode(('catillatio:'+token).encode()).decode()
  def registry(name,digest,authenticated):
   auth={'Authorization':'Basic '+basic} if authenticated else {}
   url='https://ghcr.io/token?service=ghcr.io&scope=repository%3Acatillatio%2F'+name+'%3Apull'
   status,_,raw=read(url,auth)
   if status!=200:return status,{},b''
   bearer=json.loads(raw)['token'];assert isinstance(bearer,str) and bearer and '\n' not in bearer
   return read('https://ghcr.io/v2/catillatio/'+name+'/manifests/'+digest,
    {'Authorization':'Bearer '+bearer,'Accept':MEDIA})
  status,h,raw=registry('kingdom-come-deploy-canary',SOURCE.split('@')[1],True);assert status==200
  source=manifest(raw,h.get('docker-content-digest'),SOURCE.split('@')[1])
  tag=PACKAGE+':synthetic-bootstrap-'+run+'-1'
  stage='ONE_SYNTHETIC_PUSH';docker('tag',SOURCE,tag)
  receipt['publicationState']='UNKNOWN' # Lost acknowledgment is HOLD, never retry.
  docker('push',tag,timeout=180);receipt['publicationState']='PUSHED'
  refs=[x for x in json.loads(docker('image','inspect',tag))[0]['RepoDigests'] if x.startswith(PACKAGE+'@')]
  assert len(refs)==1 and DIGEST.fullmatch(refs[0].split('@')[1])
  ref=refs[0];digest=ref.split('@')[1];receipt.update(imageReference=ref,manifestDigest=digest,tag=tag)
  stage='PRIVATE_VISIBILITY'
  status,_,raw=read(API,headers);privacy=privacy_metadata(status,raw)
  receipt.update(packageMetadataHttpStatus=status,metadataVisibility=privacy)
  if privacy=='NOT_PRIVATE':
   receipt['publicationState']='PUSHED_NOT_PRIVATE';raise RuntimeError('Stop')
  status,_,_=registry('kingdom-come',digest,False)
  receipt['anonymousAccess']='DENIED' if status in [401,403,404] else 'PUBLIC' if status==200 else 'UNVERIFIED'
  receipt['anonymousHttpStatus']=status
  if status==200:
   receipt['publicationState']='PUSHED_PUBLIC';raise RuntimeError('Stop')
  if privacy!='PRIVATE' or receipt['anonymousAccess']!='DENIED':
   receipt['publicationState']='PUSHED_PRIVACY_UNVERIFIED';raise RuntimeError('Stop')
  receipt['privateVerified']=True
  stage='DESTINATION_DIGEST_VERIFICATION'
  status,h,raw=registry('kingdom-come',digest,True);assert status==200
  destination=manifest(raw,h.get('docker-content-digest'),digest)
  assert destination['layers']==source['layers'] and destination['config']==source['config']
  Path('bootstrap-manifest.json').write_bytes(raw)
  docker('pull',ref);platform(json.loads(docker('image','inspect',ref))[0])
  receipt.update(publicationState='VERIFIED_PRIVATE',authenticatedManifestVerified=True,passed=True)
  print('GHCR_BOOTSTRAP: PASS_PRIVATE');return 0
 except Exception:
  receipt.update(passed=False,failureCategory=stage)
  print('GHCR_BOOTSTRAP: HOLD_'+stage);return 1
 finally:
  if folder:shutil.rmtree(folder,ignore_errors=True)
  Path('bootstrap-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
if __name__=='__main__':raise SystemExit(main())
