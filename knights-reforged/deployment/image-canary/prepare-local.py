#!/usr/bin/env python3
"""Offline build only. No registry login/push, Railway API, SQL or credentials."""
import hashlib, json, secrets, subprocess
from pathlib import Path

p = Path(__file__).resolve().parent
h = hashlib.sha256()
for name in ['Dockerfile', 'canary.c']:
    b = (p / name).read_bytes()
    h.update((name + '\0' + str(len(b)) + '\0').encode() + b)
nonce, spec = secrets.token_hex(16), h.hexdigest()
args = ['cc', '-static', '-Os', '-s', '-Wall', '-Wextra', '-Werror',
        '-fstack-protector-strong', '-D_FORTIFY_SOURCE=2', '-Wl,-z,relro,-z,now',
        f'-DCANARY_NONCE="{nonce}"', f'-DCANARY_SPEC_SHA256="{spec}"',
        '-o', str(p / 'canary'), str(p / 'canary.c')]
subprocess.run(args, check=True)
e = {'kind': 'unpublished-local-canary-build', 'sourceSpecSha256': spec,
     'nonce': nonce, 'platform': 'linux/amd64',
     'binaryBytes': (p / 'canary').stat().st_size,
     'binarySha256': hashlib.sha256((p / 'canary').read_bytes()).hexdigest(),
     'registryManifestDigest': None, 'registryPublished': False,
     'railwayDeploymentTested': False}
(p / 'local-build.json').write_text(json.dumps(e, indent=2) + '\n')
print('CANARY_LOCAL_BUILD: PASS')
