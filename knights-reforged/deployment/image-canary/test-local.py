#!/usr/bin/env python3
"""Disposable cloud Docker checks. No external network or production credentials."""
import json, subprocess, time, uuid
from pathlib import Path

p = Path(__file__).resolve().parent
image = 'kingdom-come:isolated-digest-canary'
expected = json.loads((p / 'local-build.json').read_text())
checks = []
def docker(*args, timeout=20, check=True):
    return subprocess.run(['docker', *args], capture_output=True, text=True, timeout=timeout, check=check)
def passed(name): checks.append(name)
network = 'kc-digest-local-' + uuid.uuid4().hex[:8]
container = network + '-probe'
try:
    info = json.loads(docker('image', 'inspect', image).stdout)[0]
    assert info['Os'] == 'linux' and info['Architecture'] == 'amd64'
    assert info['Config']['User'] == '65532:65532'
    assert info['Config']['Entrypoint'] == ['/canary']
    image_env = dict(x.split('=', 1) for x in info['Config']['Env'])
    assert set(image_env) == {'PATH', 'PORT'} and image_env['PORT'] == '8080'
    assert len(info['RootFS']['Layers']) == 1 and info['Size'] < 1024 * 1024
    passed('single-layer sub-MiB linux/amd64 image, fixed non-root entrypoint, no credential environment')
    isolated = ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges']
    result = docker(*isolated, image, '--self-test')
    report = json.loads(result.stdout)
    assert report['nonce'] == expected['nonce'] and report['sourceSpecSha256'] == expected['sourceSpecSha256']
    assert report['uid'] == 65532 and report['os'] == 'linux' and report['architecture'] == 'amd64'
    assert report['maximumLifetimeSeconds'] == 120 and result.stderr == ''
    passed('network-disabled self-check binds source fingerprint, public challenge, runtime architecture and UID')
    for uid in ['0', '1000']:
        result = docker(*isolated, '--user', uid, image, '--self-test', check=False)
        assert result.returncode == 1 and result.stdout == '' and result.stderr == 'CANARY: FAIL\n'
    passed('root and unexpected-UID execution fail closed')
    result = docker(*isolated, '-e', 'PORT=private-fixture-must-not-appear', image, check=False)
    assert result.returncode == 1 and result.stdout == '' and result.stderr == 'CANARY: FAIL\n'
    passed('invalid configuration emits only a fixed failure, no supplied value')
    docker('network', 'create', '--internal', network)
    started = time.monotonic()
    docker('run', '-d', '--name', container, '--network', network, '--network-alias', 'canary-probe',
           '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', image)
    state = json.loads(docker('inspect', container).stdout)[0]
    assert state['HostConfig']['ReadonlyRootfs'] is True and state['HostConfig']['RestartPolicy']['Name'] == 'no'
    assert not state['HostConfig']['PortBindings'] and state['Mounts'] == []
    passed('private disposable server has no published ports, volumes or restart policy')
    code = """
const assert=require('node:assert/strict');
(async()=>{
 const r=await fetch('http://canary-probe:8080/healthz');assert.equal(r.status,200);
 const report=await r.json();assert.deepEqual(report,EXPECTED);
 for(const [path,method] of [['/other','GET'],['/healthz?env=1','GET'],['/healthz','POST']]){
  const response=await fetch('http://canary-probe:8080'+path,{method});assert.equal(response.status,404);assert.deepEqual(await response.json(),{});
 }
 console.log('CANARY_PRIVATE_HTTP: PASS');
})().catch(()=>process.exit(1));
""".replace('EXPECTED', json.dumps(report))
    result = docker('run', '--rm', '--network', network, '--read-only', '--cap-drop', 'ALL',
                    '--security-opt', 'no-new-privileges', '--entrypoint', 'node', 'node:24-bookworm-slim', '-e', code)
    assert result.stdout == 'CANARY_PRIVATE_HTTP: PASS\n'
    passed('actual internal HTTP health identity matches; unrelated, query and POST routes are rejected')
    result = docker('wait', container, timeout=150)
    duration = time.monotonic() - started
    assert result.stdout.strip() == '0' and 118 <= duration <= 130
    state = json.loads(docker('inspect', container).stdout)[0]
    assert state['State']['ExitCode'] == 0 and not state['State']['OOMKilled'] and state['RestartCount'] == 0
    result = docker('logs', container)
    assert json.loads(result.stdout) == report and result.stderr == ''
    passed('real 120-second lifetime exits cleanly once; no restart and only the fixed identity report is logged')
    output = {'kind': 'local-only-canary-checks', 'passed': True, 'checks': checks, 'checksPassed': len(checks),
              'localConfigDigest': info['Id'], 'imageBytes': info['Size'], 'observedLifetimeSeconds': round(duration, 3),
              'registryPublished': False, 'registryManifestDigest': None, 'railwayCanaryExecuted': False,
              'productionRequests': 0}
    (p / 'local-validation.json').write_text(json.dumps(output, indent=2) + '\n')
    print('CANARY_LOCAL_TESTS: PASS')
except Exception:
    print('CANARY_LOCAL_TESTS: FAIL_AFTER_CHECK_' + str(len(checks)))
    raise SystemExit(1)
finally:
    docker('rm', '-f', container, check=False)
    docker('network', 'rm', network, check=False)
