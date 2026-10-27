"""One owner-approved synthetic image; no Railway or production credentials.
All provider/command output is private. Failure output is a fixed stage only.
"""
import base64, hashlib, json, os, re, shutil, subprocess, tempfile, urllib.error, urllib.request
from pathlib import Path

PACKAGE = 'ghcr.io/catillatio/kingdom-come-deploy-canary'
GH_PACKAGE = 'https://api.github.com/users/catillatio/packages/container/kingdom-come-deploy-canary'
BRANCH = 'refs/heads/canary/immutable-image-pull-20261027'
BASE = 'd100a9a03b413b1947d1606db7c73cd37be278e3'
SPEC = '0938562107c48d2e51e0116ce4d31c8e3b1f1d8cef3e23b5b4b3f39de6800c73'
MEDIA = ['application/vnd.docker.distribution.manifest.v2+json', 'application/vnd.oci.image.manifest.v1+json']
DIGEST = re.compile(r'sha256:[a-f0-9]{64}\Z')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('Redirect refused')

def read(url, headers):
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(urllib.request.Request(url, headers=headers), timeout=30) as r:
            data = r.read(2000001)
            assert len(data) <= 2000000
            return r.status, {k.lower(): v for k, v in r.headers.items()}, data
    except urllib.error.HTTPError as e:
        status = e.code
        e.close()  # never inspect or log an error body
        return status, {}, b''

def manifest(raw, header_digest, expected_digest, expected_config):
    assert DIGEST.fullmatch(expected_digest) and DIGEST.fullmatch(expected_config)
    assert header_digest == expected_digest
    assert 'sha256:' + hashlib.sha256(raw).hexdigest() == expected_digest
    value = json.loads(raw)
    assert value['schemaVersion'] == 2 and value['mediaType'] in MEDIA
    assert 'manifests' not in value and value['config']['digest'] == expected_config
    assert len(value['layers']) == 1 and all(DIGEST.fullmatch(v['digest']) for v in value['layers'])
    return value

def platform(info, expected_config):
    assert info['Id'] == expected_config and info['Architecture'] == 'amd64' and info['Os'] == 'linux'
    assert info['Config']['User'] == '65532:65532'
    assert info['Config']['Entrypoint'] == ['/canary']
    assert set(x.split('=', 1)[0] for x in info['Config']['Env']) == {'PATH', 'PORT'}

def main():
    p = Path(__file__).resolve().parent
    stage, config_dir = 'CONTEXT', None
    receipt = {'kind': 'approved-synthetic-canary-publication-v1', 'publicationState': 'NOT_STARTED',
               'privateVerified': False, 'railwayDeploymentTested': False}
    child_env = dict(os.environ)
    for key in ['GITHUB_TOKEN', 'GH_TOKEN']:
        child_env.pop(key, None)
    def command(*args, stdin=None, timeout=45):
        r = subprocess.run(args, input=stdin, capture_output=True, text=True, env=child_env, timeout=timeout)
        assert len(r.stdout) + len(r.stderr) <= 2000000 and r.returncode == 0
        return r.stdout.strip()
    def docker(*args, **kwargs):
        return command('docker', '--config', config_dir, *args, **kwargs)
    try:
        assert os.environ['GITHUB_REPOSITORY'] == 'catillatio/test'
        assert os.environ['GITHUB_REF'] == BRANCH and os.environ['GITHUB_EVENT_NAME'] == 'create'
        assert os.environ['GITHUB_ACTOR'] == 'catillatio' and os.environ['GITHUB_TRIGGERING_ACTOR'] == 'catillatio'
        assert os.environ['GITHUB_RUN_ATTEMPT'] == '1'
        sha, run = os.environ['GITHUB_SHA'], os.environ['GITHUB_RUN_ID']
        assert re.fullmatch('[a-f0-9]{40}', sha) and re.fullmatch('[1-9][0-9]{0,24}', run)
        assert command('git', 'rev-parse', 'HEAD') == sha and command('git', 'rev-parse', 'HEAD^') == BASE
        assert not command('git', 'status', '--porcelain', '--untracked-files=no')
        h = hashlib.sha256()
        for name in ['Dockerfile', 'canary.c']:
            b = (p / name).read_bytes(); h.update((name + '\0' + str(len(b)) + '\0').encode() + b)
        assert h.hexdigest() == SPEC
        build = json.loads((p / 'local-build.json').read_bytes())
        checks = json.loads((p / 'local-validation.json').read_bytes())
        assert build['sourceSpecSha256'] == SPEC and checks['passed'] is True and checks['checksPassed'] == 7
        config_id = checks['localConfigDigest']; assert DIGEST.fullmatch(config_id)
        receipt.update({'sourceCommit': sha, 'runId': run, 'runAttempt': 1, 'sourceSpecSha256': SPEC,
                        'nonce': build['nonce'], 'configDigest': config_id, 'platform': 'linux/amd64'})
        stage = 'REGISTRY_ACCESS'
        token = os.environ['GITHUB_TOKEN']; assert token and '\n' not in token
        gh_headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
        status, _, _ = read(GH_PACKAGE, gh_headers)
        assert status == 404, 'Never replace an existing package or repeat publication'
        config_dir = tempfile.mkdtemp(prefix='canary-docker-', dir=os.environ['RUNNER_TEMP'])
        docker('login', 'ghcr.io', '--username', 'catillatio', '--password-stdin', stdin=token + '\n')
        tag = PACKAGE + ':' + sha + '-' + run + '-1'
        info = json.loads(docker('image', 'inspect', 'kingdom-come:isolated-digest-canary'))[0]
        platform(info, config_id)
        stage = 'PUBLICATION'
        docker('tag', 'kingdom-come:isolated-digest-canary', tag)
        receipt['publicationState'] = 'UNKNOWN'  # a lost acknowledgement never permits retry
        docker('push', tag, timeout=180)
        receipt['publicationState'] = 'PUSHED'
        stage = 'MANIFEST'
        info = json.loads(docker('image', 'inspect', tag))[0]
        refs = [v for v in info['RepoDigests'] if v.startswith(PACKAGE + '@')]
        assert len(refs) == 1
        image_ref = refs[0]; digest = image_ref.split('@', 1)[1]; assert DIGEST.fullmatch(digest)
        basic = base64.b64encode(('catillatio:' + token).encode()).decode()
        status, _, raw = read('https://ghcr.io/token?service=ghcr.io&scope=repository%3Acatillatio%2Fkingdom-come-deploy-canary%3Apull', {'Authorization': 'Basic ' + basic})
        assert status == 200
        bearer = json.loads(raw)['token']; assert isinstance(bearer, str) and bearer
        url = 'https://ghcr.io/v2/catillatio/kingdom-come-deploy-canary/manifests/' + digest
        status, headers, raw = read(url, {'Authorization': 'Bearer ' + bearer, 'Accept': ', '.join(MEDIA)})
        assert status == 200
        manifest(raw, headers.get('docker-content-digest'), digest, config_id)
        receipt.update({'imageRef': image_ref, 'manifestDigest': digest, 'authenticatedRegistryManifestVerified': True})
        stage = 'PRIVATE_VISIBILITY'
        status, _, raw = read(GH_PACKAGE, gh_headers)
        assert status == 200
        package = json.loads(raw)
        assert package['visibility'] == 'private' and package['name'] == 'kingdom-come-deploy-canary'
        status, _, raw = read('https://ghcr.io/token?service=ghcr.io&scope=repository%3Acatillatio%2Fkingdom-come-deploy-canary%3Apull', {})
        denied = status in [401, 403, 404]
        if status == 200:
            anonymous = json.loads(raw)['token']
            status, _, _ = read(url, {'Authorization': 'Bearer ' + anonymous, 'Accept': ', '.join(MEDIA)})
            denied = status in [401, 403, 404]
        assert denied
        receipt['privateVerified'] = True
        stage = 'DIGEST_PULL'
        docker('pull', image_ref, timeout=120)
        info = json.loads(docker('image', 'inspect', image_ref))[0]; platform(info, config_id)
        result = json.loads(docker('run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                                 '--security-opt', 'no-new-privileges', image_ref, '--self-test'))
        assert result['nonce'] == build['nonce'] and result['sourceSpecSha256'] == SPEC
        assert result['architecture'] == 'amd64' and result['os'] == 'linux' and result['uid'] == 65532
        receipt.update({'publicationState': 'VERIFIED_PRIVATE', 'runnerDigestPullVerified': True, 'passed': True})
        print('CANARY_PUBLISH: PASS')
        return 0
    except Exception:
        receipt.update({'passed': False, 'failureCategory': stage})
        print('CANARY_PUBLISH: FAIL_' + stage)
        return 1
    finally:
        if config_dir:
            shutil.rmtree(config_dir, ignore_errors=True)
        (p / 'publication-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')

if __name__ == '__main__':
    raise SystemExit(main())
