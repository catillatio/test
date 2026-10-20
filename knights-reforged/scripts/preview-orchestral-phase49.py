#!/usr/bin/env python3
"""Documentation-only musical audition. Never writes runtime assets or uses DBs.

Requires Python/NumPy/SciPy and FFmpeg. Recorded orchestra samples are pinned in
sources.json, under their publisher's CC0 licence. No rejected SFX are loaded.
"""
import hashlib
import json
import math
import subprocess
import tempfile
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/phase49/audio-orchestral-audition'
CACHE = Path(tempfile.gettempdir()) / 'phase49-orchestral-sources'
RATE = 48000
SOURCES = json.loads((OUT / 'sources.json').read_text())
SCORE = json.loads((OUT / 'score.json').read_text())
CACHE.mkdir(exist_ok=True)
decoded = {}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def recording(source):
    key = source['sha256']
    if key in decoded:
        return decoded[key]
    file = CACHE / Path(source['path']).name
    if not file.exists():
        # Only the pinned public orchestral source repository; normal TLS and
        # inherited proxy settings. Nothing authenticates to a game/provider.
        assert source['url'].startswith('https://raw.githubusercontent.com/sgossner/VSCO-2-CE/' + SOURCES['sampleCommit'] + '/')
        data = urlopen(source['url'], timeout=60).read()
        assert digest(data) == key, 'Musical source checksum mismatch'
        file.write_bytes(data)
    assert digest(file.read_bytes()) == key, 'Cached musical source checksum mismatch'
    data = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(file), '-f', 'f32le', '-ac', '2', '-ar', str(RATE), '-'])
    samples = np.frombuffer(data, dtype='<f4').reshape(-1, 2).copy()
    # Retain breath/bow/pluck onset, removing only pre-recording silence. No
    # single-note oscillator, metal hit or notification chime is substituted.
    above = np.flatnonzero(np.max(abs(samples), axis=1) > np.max(abs(samples)) * .006)
    start = max(0, int(above[0]) - int(.025 * RATE)) if len(above) else 0
    decoded[key] = samples[start:]
    return decoded[key]


def voice(event, event_index):
    options = [s for s in SOURCES['sources'] if s['instrument'] == event['instrument']
               and s['lokey'] <= event['note'] <= s['hikey']
               and s['lovel'] <= event['velocity'] <= s['hivel']]
    assert options, 'Missing licensed musical mapping'
    source = min(options, key=lambda s: (abs(s['pitch_keycenter'] - event['note']), s['path']))
    # Pitch comes from the publisher's SFZ key-centre/range, not filename octave
    # guesses. Multisampled brass/strings/harp retain their recorded articulations.
    ratio = 2 ** ((event['note'] - source['pitch_keycenter']) / 12)
    samples = recording(source)
    if ratio != 1:
        samples = resample_poly(samples, int(round(10000 / ratio)), 10000, axis=0).astype(np.float32)
    percussive = event['instrument'] in ['harp', 'glock']
    release = 1.5 if percussive else .28 if event['instrument'].endswith('stac') else .40
    duration = int(event['duration'] * RATE)
    total = min(len(samples), duration + int(release * RATE))
    samples = samples[:total].copy()
    if total > duration:
        samples[duration:] *= np.linspace(1, 0, total-duration, dtype=np.float32)[:, None] ** (1.3 if percussive else 1.8)
    # Short click-safe edge only; preserve real attacks and dynamics.
    edge = min(int(.003 * RATE), total // 2)
    samples[:edge] *= np.linspace(0, 1, edge, dtype=np.float32)[:, None]
    samples[-edge:] *= np.linspace(1, 0, edge, dtype=np.float32)[:, None]
    gain = 10 ** (source['volume'] / 20) * (event['velocity'] / 127) ** 1.35 * event['gain']
    pan = event['pan']
    samples[:, 0] *= math.sqrt(1-pan) * gain
    samples[:, 1] *= math.sqrt(1+pan) * gain
    return samples, source['sha256']


def room(dry):
    # Original deterministic small-hall impulse, with distinct early reflections
    # and frequency-damped diffuse decay. This is mixing, not a musical source.
    size = int(1.22 * RATE)
    rng = np.random.default_rng(4902)
    wet = np.zeros((len(dry)+size-1, 2), np.float32)
    for channel in [0, 1]:
        impulse = rng.normal(0, 1, size).astype(np.float32)
        impulse = sosfilt(butter(2, 4300, fs=RATE, output='sos'), impulse).astype(np.float32)
        times = np.arange(size) / RATE
        impulse *= np.exp(-times * 6.5).astype(np.float32)
        impulse[:int(.035*RATE)] = 0
        impulse /= max(float(np.sqrt(np.sum(impulse*impulse))), 1e-6)
        for delay, gain in [(.031+channel*.006,.15),(.057-channel*.004,.10),(.089+channel*.007,.06)]:
            impulse[int(delay*RATE)] += gain
        wet[:, channel] = fftconvolve(dry[:, channel], impulse, mode='full')
    padded = np.pad(dry, ((0, size-1), (0, 0)))
    return padded + .17 * wet


def ffmpeg_levels(file):
    p = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(file), '-af', 'loudnorm=I=-20:TP=-2:LRA=7:print_format=json', '-f', 'null', '-'], capture_output=True, check=True)
    text = p.stderr.decode()
    return json.loads(text[text.rfind('{'):text.rfind('}')+1])


inventory = dict(status='Owner audition pending; NOT approved or adopted',
                 runtimeAssetsChanged=False, license='CC0-1.0',
                 sourceManifest='sources.json', sourceManifestSha256=digest((OUT/'sources.json').read_bytes()),
                 score='score.json', scoreSha256=digest((OUT/'score.json').read_bytes()),
                 mix='Original short orchestral arrangements from recorded multisamples; publisher SFZ key centres/dynamics, stereo voicing, click-safe releases, gentle high/low-pass EQ, short chamber reverb. Two-pass loudness matching; no rejected SFX.',
                 loudnessTargetLUFS=-20, truePeakCeilingDBTP=-2, cues=[])
masters = []
with tempfile.TemporaryDirectory(prefix='phase49-music-') as temp:
    for cue_id, cue in SCORE['cues'].items():
        dry = np.zeros((int(cue['seconds']*RATE), 2), np.float32)
        used = set()
        for index, event in enumerate(cue['events']):
            samples, source_hash = voice(event, index)
            offset = int(event['time']*RATE)
            count = min(len(samples), len(dry)-offset)
            dry[offset:offset+count] += samples[:count]
            used.add(source_hash)
        dry = sosfilt(butter(2, 45, btype='highpass', fs=RATE, output='sos'), dry, axis=0).astype(np.float32)
        dry = sosfilt(butter(2, 14000, fs=RATE, output='sos'), dry, axis=0).astype(np.float32)
        mixed = room(dry)[:len(dry)]
        end = int(.28*RATE)
        mixed[-end:] *= np.linspace(1, 0, end, dtype=np.float32)[:, None] ** 1.2
        mixed *= .70 / max(float(np.max(abs(mixed))), 1e-6)
        raw = Path(temp) / (cue_id+'.wav')
        subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','2','-i','-','-c:a','pcm_s24le',str(raw)],input=mixed.astype('<f4').tobytes(),check=True)
        measured = ffmpeg_levels(raw)
        correction = ':'.join('measured_'+key+'='+measured[value] for key,value in [('I','input_i'),('TP','input_tp'),('LRA','input_lra'),('thresh','input_thresh')])
        normalizer = 'loudnorm=I=-20:TP=-2:LRA=7:'+correction+':offset='+measured['target_offset']+':linear=true'
        master = OUT / (cue_id+'.flac')
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-af',normalizer,'-ar',str(RATE),'-c:a','flac',str(master)],check=True)
        mp3 = OUT / (cue_id+'.mp3')
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','libmp3lame','-b:a','256k',str(mp3)],check=True)
        levels = ffmpeg_levels(mp3)
        assert abs(float(levels['input_i'])+20) <= .4, 'Audition loudness outside matching tolerance'
        assert float(levels['input_tp']) <= -1.8, 'Audition true peak above ceiling tolerance'
        inventory['cues'].append(dict(id=cue_id,name=cue['name'],description=cue['description'],file=mp3.name,
                                     seconds=cue['seconds'],bytes=mp3.stat().st_size,sha256=digest(mp3.read_bytes()),
                                     master=master.name,masterSha256=digest(master.read_bytes()),
                                     integratedLUFS=float(levels['input_i']),truePeakDBTP=float(levels['input_tp']),
                                     musicalNoteEvents=len(cue['events']),sources=sorted(used)))
        masters.append(master)
        print(cue_id, levels['input_i'], 'LUFS;', levels['input_tp'], 'dBTP')
    reel = []
    for master in masters:
        b = subprocess.check_output(['ffmpeg','-v','error','-i',str(master),'-f','f32le','-ac','2','-ar',str(RATE),'-'])
        reel.extend([np.frombuffer(b,dtype='<f4').reshape(-1,2),np.zeros((int(.8*RATE),2),np.float32)])
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','2','-i','-','-c:a','libmp3lame','-b:a','256k',str(OUT/'audition.mp3')],input=np.concatenate(reel).astype('<f4').tobytes(),check=True)
    inventory['reelSha256'] = digest((OUT/'audition.mp3').read_bytes())
(OUT/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
print('Four documentation-only musical auditions rendered; no runtime assets changed.')
