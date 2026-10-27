"""Read-only registry reconciliation. No publication or Railway operation."""
import base64, hashlib, io, json, os, shutil, subprocess, tarfile, tempfile
from pathlib import Path
from publish import read, manifest, platform, MEDIA, PACKAGE, SPEC

DIGEST = 'sha256:b49d4df2ca6e4959dcdaf1235d8705d1b2f012380d5a2991fce414ac2acda000'
CONFIG = 'sha256:4eee41c0a59aef69fa373485c2043c85c009027f35e90a1d8024e06c852fd689'
NONCE = 'b50e39c20eec8c6e96658194266cf430'
p = Path(__file__).resolve().parent
stage, folder = 'CONTEXT', None
receipt = {'kind': 'independent-canary-registry-reconciliation-v1', 'passed': False}
try:
    assert os.environ['GITHUB_REPOSITORY'] == 'catillatio/test'
    assert os.environ['GITHUB_REF'] == 'refs/heads/canary/immutable-image-evidence-20261027'
    assert os.environ['GITHUB_EVENT_NAME'] == 'create' and os.environ['GITHUB_ACTOR'] == 'catillatio'
    assert os.environ['GITHUB_RUN_ATTEMPT'] == '1'
    token = os.environ['GITHUB_TOKEN']
    stage = 'MANIFEST'
    basic = base64.b64encode(('catillatio:' + token).encode()).decode()
    status, _, raw = read('https://ghcr.io/token?service=ghcr.io&scope=repository%3Acatillatio%2Fkingdom-come-deploy-canary%3Apull', {'Authorization': 'Basic ' + basic})
    assert status == 200
    bearer = json.loads(raw)['token']
    status, headers, raw = read('https://ghcr.io/v2/catillatio/kingdom-come-deploy-canary/manifests/' + DIGEST, {'Authorization': 'Bearer ' + bearer, 'Accept': ', '.join(MEDIA)})
    assert status == 200
    value = manifest(raw, headers.get('docker-content-digest'), DIGEST, CONFIG)
    (p / 'reconciled-manifest.json').write_bytes(raw)
    receipt.update({'manifestDigest': DIGEST, 'manifestResponseDigestMatches': True, 'manifestBytesMatchDigest': True,
                    'configDigest': CONFIG, 'singlePlatformManifest': True, 'layers': len(value['layers'])})
    stage = 'CONFIGURATION'
    folder = tempfile.mkdtemp(prefix='canary-read-', dir=os.environ['RUNNER_TEMP'])
    env = dict(os.environ)
    for key in ['GITHUB_TOKEN', 'GH_TOKEN']: env.pop(key, None)
    def docker(*args, stdin=None, binary=False):
        r = subprocess.run(['docker', '--config', folder, *args], input=stdin,
                           capture_output=True, text=not binary, env=env, timeout=120)
        assert r.returncode == 0 and len(r.stdout) + len(r.stderr) < 4000000
        return r.stdout
    docker('login', 'ghcr.io', '--username', 'catillatio', '--password-stdin', stdin=token + '\n')
    image = PACKAGE + '@' + DIGEST
    docker('pull', image)
    info = json.loads(docker('image', 'inspect', image))[0]
    platform(info, CONFIG)
    archive = docker('save', image, binary=True)
    with tarfile.open(fileobj=io.BytesIO(archive)) as t:
        paths = [CONFIG[7:] + '.json', 'blobs/sha256/' + CONFIG[7:]]
        selected = [m for m in t.getmembers() if m.name in paths]
        assert len(selected) == 1 and selected[0].isfile()
        config_raw = t.extractfile(selected[0]).read(2000001)
    assert 'sha256:' + hashlib.sha256(config_raw).hexdigest() == CONFIG
    config = json.loads(config_raw)
    assert config['architecture'] == 'amd64' and config['os'] == 'linux'
    assert config['config']['User'] == '65532:65532' and config['config']['Entrypoint'] == ['/canary']
    (p / 'reconciled-config.json').write_bytes(config_raw)
    stage = 'RUNTIME'
    actual = json.loads(docker('run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', image, '--self-test'))
    assert actual == {'kind': 'kingdom-image-canary-v1', 'os': 'linux', 'architecture': 'amd64', 'uid': 65532,
                      'nonce': NONCE, 'sourceSpecSha256': SPEC, 'maximumLifetimeSeconds': 120}
    receipt.update({'passed': True, 'imageRef': image, 'platform': 'linux/amd64', 'runtimeReport': actual,
                    'verificationCommit': os.environ['GITHUB_SHA'], 'verificationRun': os.environ['GITHUB_RUN_ID'],
                    'configurationBytesMatchDigest': True, 'runnerDigestPullVerified': True, 'registryWrites': 0,
                    'railwayRequests': 0, 'productionRequests': 0})
    print('CANARY_REGISTRY_RECONCILIATION: PASS')
except Exception:
    receipt['failureCategory'] = stage
    print('CANARY_REGISTRY_RECONCILIATION: FAIL_' + stage)
finally:
    if folder: shutil.rmtree(folder, ignore_errors=True)
    (p / 'registry-reconciliation.json').write_text(json.dumps(receipt, indent=2) + '\n')
raise SystemExit(0 if receipt['passed'] else 1)
