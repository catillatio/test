"""Owner audition only. Verified CC0 recordings; never writes runtime assets."""
from pathlib import Path
import hashlib, io, json, subprocess, urllib.request, zipfile
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/phase49/audio-audition'
if (OUT/'inventory.json').exists() and 'REJECTED' in json.loads((OUT/'inventory.json').read_text()).get('status',''):
    raise SystemExit('This audition was rejected by the owner. Use the separate orchestral preview; do not relabel or regenerate rejected clips.')
CACHE=Path('/tmp/phase49-audition-sources')
RATE=44100
OUT.mkdir(parents=True,exist_ok=True);CACHE.mkdir(parents=True,exist_ok=True)
prior=json.loads((ROOT/'docs/phase48/audio-audition/inventory.json').read_text())
archives={}
for pack in ['rpg','impact']:
    metadata=prior['sources'][pack]
    assert metadata['download'].startswith('https://kenney.nl/')
    path=CACHE/(pack+'.zip')
    if not path.exists():
        with urllib.request.urlopen(metadata['download'],timeout=45) as stream:path.write_bytes(stream.read())
    raw=path.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==metadata['archiveSha256'], 'Source archive checksum mismatch'
    archives[pack]=zipfile.ZipFile(io.BytesIO(raw))
    license_names=[n for n in archives[pack].namelist() if n.lower().endswith('license.txt')]
    assert len(license_names)==1
    license_bytes=archives[pack].read(license_names[0])
    assert b'CC0' in license_bytes
    (OUT/(pack+'-LICENSE.txt')).write_bytes(license_bytes)

def recording(pack,name,pitch):
    names=[n for n in archives[pack].namelist() if n.endswith('Audio/'+name)]
    assert len(names)==1
    raw=archives[pack].read(names[0]);path=CACHE/name;path.write_bytes(raw)
    decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ac','1','-ar',str(RATE),'-f','f32le','-'])
    original=np.frombuffer(decoded,dtype='<f4')
    y=np.interp(np.arange(0,len(original),pitch),np.arange(len(original)),original).copy()
    fade=min(100,len(y)//3);y[:fade]*=np.linspace(0,1,fade)
    return y,hashlib.sha256(raw).hexdigest()

# Recorded metal/body accents and different bell cadences, no horn oscillators,
# click/navigation replacements or background music. Approval is still needed.
designs={
 'victory':(1.25,.075,[('impact','impactPlate_medium_000.ogg',0,.32,.95),('impact','impactBell_heavy_000.ogg',.09,.48,1),('impact','impactBell_heavy_000.ogg',.26,.36,1.25),('impact','impactBell_heavy_000.ogg',.43,.32,1.5)]),
 'defeat':(.85,.042,[('impact','impactMetal_medium_001.ogg',0,.38,.72),('impact','impactBell_heavy_000.ogg',.12,.18,.65)]),
 'quest':(.95,.065,[('rpg','bookClose.ogg',0,.28,1),('rpg','handleCoins2.ogg',.09,.22,1),('impact','impactBell_heavy_000.ogg',.12,.3,1.5),('impact','impactBell_heavy_000.ogg',.30,.24,2)]),
 'level':(1.75,.085,[('impact','impactPlate_heavy_000.ogg',0,.18,.9),('impact','impactBell_heavy_000.ogg',.07,.34,.75),('impact','impactBell_heavy_000.ogg',.24,.38,1),('impact','impactBell_heavy_000.ogg',.41,.32,1.25),('impact','impactBell_heavy_000.ogg',.58,.31,1.5),('impact','impactBell_heavy_000.ogg',.82,.24,2)])
}
inventory=[];reel=[]
for name,(duration,rms,parts) in designs.items():
    y=np.zeros(round(duration*RATE));inputs=[]
    for pack,file,offset,gain,pitch in parts:
        sample,digest=recording(pack,file,pitch);start=round(offset*RATE);end=min(len(y),start+len(sample));y[start:end]+=sample[:end-start]*gain
        inputs.append(dict(pack=pack,file=file,sourceSha256=digest,offset=offset,gain=gain,pitch=pitch))
    dry=y.copy()
    for delay,gain in [(.031,.06),(.067,.025)]:
        n=round(delay*RATE);y[n:]+=dry[:-n]*gain
    y*=min(rms/max(1e-9,float(np.sqrt(np.mean(y*y)))),.56/max(1e-9,float(np.max(np.abs(y)))))
    fade=round(.13*RATE);y[-fade:]*=np.linspace(1,0,fade)
    target=OUT/(name+'.mp3')
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','1','-i','-','-c:a','libmp3lame','-b:a','192k',str(target)],input=y.astype('<f4').tobytes(),check=True)
    decoded=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-f','f32le','-ac','1','-ar',str(RATE),'-']),dtype='<f4')
    peak=float(np.abs(decoded).max());assert 0<peak<.7
    inventory.append(dict(id=name,file=target.name,seconds=duration,bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),decodedPeak=peak,decodedRms=float(np.sqrt(np.mean(decoded*decoded))),parts=inputs))
    reel.extend([y,np.zeros(round(.8*RATE))])
subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','1','-i','-','-c:a','libmp3lame','-b:a','192k',str(OUT/'audition.mp3')],input=np.concatenate(reel).astype('<f4').tobytes(),check=True)
(OUT/'inventory.json').write_text(json.dumps(dict(status='Owner audition pending; not adopted or served by the game',license='CC0-1.0',credit='Kenney (kenney.nl); original project layering/editing also CC0',runtimeAssetsChanged=False,sources={k:prior['sources'][k] for k in archives},cues=inventory),indent=2)+'\n')
rows=''.join('<li><h2>'+r['id']+'</h2><audio controls preload="none" src="'+r['file']+'"></audio><small>'+str(r['seconds'])+' seconds</small></li>' for r in inventory)
(OUT/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kingdom Come reward audio audition</title><style>body{background:#141414;color:#f0eadc;font:16px/1.5 Georgia;margin:16px;max-width:700px}ol{padding:0;list-style:none}li{border:1px solid #706047;padding:12px;margin:10px 0}h2{margin:0 0 8px;font-size:19px}audio{display:block;width:100%;max-width:450px}small{color:#c8c0b1}</style><h1>Reward audio audition</h1><p>Preview only. Start quietly. Tap each clip to compare; nothing autoplays. No button/navigation sounds or background music.</p><ol>'+rows+'</ol><p>Recorded Kenney CC0 sources, documented in inventory.json. Awaiting owner listening approval; runtime audio is unchanged.</p></html>')
print(json.dumps(dict(clips=len(inventory),sourceArchivesVerified=True,previewOnly=True,runtimeAssetsChanged=False)))
