"""Package the four owner-approved recordings; no synthesis or musical edits.

Offline only: pinned FLAC masters and existing original routine action assets.
Requires Python/NumPy and FFmpeg. Never imports application/database code.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/audio'
SOURCE = ROOT / 'docs/phase49/audio-orchestral-audition'
RATE = 48000
VERSION = 'phase49-orchestral-1'
APPROVAL = 'https://github.com/catillatio/test/pull/12#issuecomment-6303697572'
APPROVED_COMMIT = '087e1a8530f8e683a2a97dac938e22005c2663c3'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(args):
    return subprocess.run(['ffmpeg', '-v', 'error', *args], check=True, capture_output=True).stdout

def decode(path):
    return np.frombuffer(run(['-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', str(RATE), '-']), dtype='<f4').reshape(-1, 2).copy()

audition = json.loads((SOURCE / 'inventory.json').read_text())
inventory = json.loads((OUT / 'inventory.json').read_text())
assert sha(SOURCE / 'sources.json') == audition['sourceManifestSha256']
assert sha(SOURCE / 'score.json') == audition['scoreSha256']
approved = {cue['id']: cue for cue in audition['cues']}
assert set(approved) == {'victory', 'defeat', 'quest', 'level'}
for cue in approved.values():
    assert sha(SOURCE / cue['master']) == cue['masterSha256']
    assert sha(SOURCE / cue['file']) == cue['sha256']

segments, index, sounds = [], {}, []
frames = 0
with tempfile.TemporaryDirectory(prefix='kingdom-approved-audio-') as scratch:
    for entry in inventory['sounds']:
        name = entry['id']
        if name == 'decisive':
            # A visual distinction must not introduce a fifth unreviewed cue.
            (OUT / entry['file']).write_bytes((OUT / 'victory.m4a').read_bytes())
            index[name] = dict(index['victory'])
            sounds.append({**next(s for s in sounds if s['id'] == 'victory'), 'id': name,
                           'file': entry['file'], 'aliasOf': 'victory'})
            continue
        if name in approved:
            cue = approved[name]
            audio = decode(SOURCE / cue['master'])
            run(['-y', '-i', str(SOURCE / cue['master']), '-map_metadata', '-1',
                 '-c:a', 'aac', '-b:a', '128k', '-ar', str(RATE), '-ac', '2',
                 '-movflags', '+faststart', str(OUT / entry['file'])])
        else:
            # Do not re-encode or replace the unrelated individual action files.
            audio = decode(OUT / entry['file'])
        segment = {'start': round(frames / RATE, 6), 'duration': round(len(audio) / RATE, 6)}
        index[name] = segment
        segments.extend([audio, np.zeros((int(.09 * RATE), 2), dtype=np.float32)])
        frames += len(audio) + int(.09 * RATE)
        decoded = decode(OUT / entry['file'])
        info = {**entry, 'seconds': round(len(audio) / RATE, 6),
                'bytes': (OUT / entry['file']).stat().st_size,
                'sha256': sha(OUT / entry['file']),
                'peak': round(float(np.max(np.abs(decoded))), 6),
                'rms': round(float(np.sqrt(np.mean(decoded ** 2))), 6)}
        if name in approved:
            info.update(voice='recorded-orchestra', license='CC0-1.0', sourceMaster=approved[name]['master'],
                        sourceMasterSha256=approved[name]['masterSha256'],
                        approvedMp3Sha256=approved[name]['sha256'], ownerApproval=APPROVAL)
        sounds.append(info)
    pcm = Path(scratch) / 'sprite.f32'
    pcm.write_bytes(np.concatenate(segments).astype('<f4').tobytes())
    run(['-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '2', '-i', str(pcm),
         '-map_metadata', '-1', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', str(OUT / 'realm.m4a')])

(OUT / 'index.js').write_text('export const soundIndex=' + json.dumps(index, separators=(',', ':')) + ';\n')
manifest = {
    'version': VERSION,
    'origin': 'Four owner-approved recorded-orchestra cues; other individual Phase 4.7 original action assets retained unchanged.',
    'ownerApproval': APPROVAL, 'approvedSourceCommit': APPROVED_COMMIT,
    'sourceManifest': 'orchestral-sources.json', 'sourceManifestSha256': audition['sourceManifestSha256'],
    'sourceScoreSha256': audition['scoreSha256'],
    'packaging': 'scripts/adopt-orchestral-phase49.py; full approved masters, no musical edits; stereo AAC at 48 kHz / 128 kbit/s; 90 ms sprite gaps.',
    'sounds': sounds,
    'sprite': {'file': 'realm.m4a', 'bytes': (OUT / 'realm.m4a').stat().st_size,
               'sha256': sha(OUT / 'realm.m4a'), 'seconds': round(frames / RATE, 6)},
    'silentEvents': ['click', 'navigate'],
    'aliases': {'decisive': 'victory'},
}
(OUT / 'inventory.json').write_text(json.dumps(manifest, indent=2) + '\n')
(OUT / 'orchestral-sources.json').write_bytes((SOURCE / 'sources.json').read_bytes())
for source, destination in [('LICENSE-VSCO-CC0.txt', 'LICENSE-VSCO-CC0.txt'), ('LICENSE-CUES-CC0.txt', 'LICENSE-ORCHESTRAL-CUES-CC0.txt')]:
    (OUT / destination).write_bytes((SOURCE / source).read_bytes())
print(f'Packaged four approved cues; decisive aliases victory. Sprite {manifest["sprite"]["bytes"]} bytes / {manifest["sprite"]["seconds"]} seconds.')
