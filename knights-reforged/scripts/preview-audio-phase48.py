"""Build an unserved audition. Never replace runtime audio without owner approval.

Input: verified Kenney CC0 packs extracted under /tmp/phase48-audio-sources.
The provenance manifest records the official download URLs and archive hashes.
Requires numpy and ffmpeg. No database, application or deployment operations.
"""
from pathlib import Path
import hashlib, json, subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/phase48/audio-audition'
SOURCE = Path('/tmp/phase48-audio-sources')
RATE = 44100
OUT.mkdir(parents=True, exist_ok=True)
PACKS = {
 'interface': ('https://kenney.nl/assets/interface-sounds', 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip', 'f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232'),
 'rpg': ('https://kenney.nl/assets/rpg-audio', 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip', '6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b'),
 'impact': ('https://kenney.nl/assets/impact-sounds', 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip', '029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8'),
}
cache = {}
def sample(pack, name, seconds=1., pitch=1.):
 key=(pack,name)
 if key not in cache:
  path=SOURCE/pack/'Audio'/name
  raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ac','1','-ar',str(RATE),'-f','f32le','-'])
  cache[key]=np.frombuffer(raw,dtype='<f4').copy()
 original=cache[key]
 y=np.interp(np.arange(0,len(original),pitch),np.arange(len(original)),original).astype(float)
 y=y[:int(seconds*RATE)].copy()
 if len(y)>200:
  fade=min(int(.035*RATE),len(y)//4);y[:120]*=np.linspace(0,1,120);y[-fade:]*=np.linspace(1,0,fade)
 return y
def layer(name, parts, seconds, level=.5):
 y=np.zeros(int(seconds*RATE))
 for pack,file,at,gain,pitch in parts:
  sound=sample(pack,file,seconds-at,pitch);start=int(at*RATE);end=min(len(y),start+len(sound));y[start:end]+=sound[:end-start]*gain
 # Very short early reflections, no long tails or synthetic horn oscillators.
 dry=y.copy()
 for delay,gain in [(.023,.07),(.049,.035)]:
  offset=int(delay*RATE);y[offset:]+=dry[:-offset]*gain
 peak=float(abs(y).max());y*=level/max(.25,peak)
 if len(y)>200:y[-200:]*=np.linspace(1,0,200)
 output=OUT/(name+'.mp3')
 subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','1','-i','-','-c:a','libmp3lame','-b:a','128k',str(output)],input=y.astype('<f4').tobytes(),check=True)
 return dict(id=name,file=output.name,seconds=seconds,sha256=hashlib.sha256(output.read_bytes()).hexdigest(),parts=[dict(pack=p,file=f,offset=a,gain=g,pitch=r) for p,f,a,g,r in parts]),y
def p(pack,file,at=0,gain=1.,pitch=1.):return(pack,file,at,gain,pitch)
def bells(offset=0, stronger=False):
 return [p('impact','impactBell_heavy_000.ogg',offset+i*.105,.38 if stronger else .25,pitch) for i,pitch in enumerate([1,1.25,1.5])]
designs={
 'click':(.13,.23,[p('rpg','metalClick.ogg',gain=.7)]),
 'navigate':(.25,.22,[p('rpg','bookFlip1.ogg')]),
 'coins':(.48,.42,[p('rpg','handleCoins2.ogg')]),
 'spend':(.35,.35,[p('rpg','handleCoins.ogg',pitch=.88)]),
 'equipment':(.48,.45,[p('rpg','drawKnife2.ogg'),p('impact','impactMetal_light_000.ogg',.10,.3)]),
 'sale':(.40,.39,[p('rpg','handleCoins.ogg'),p('rpg','metalLatch.ogg',.09,.22)]),
 'land':(.59,.48,[p('impact','impactWood_heavy_000.ogg',gain=.65),p('rpg','metalLatch.ogg',.12,.45)]),
 'income':(.70,.46,[p('rpg','handleCoins2.ogg')]+bells(.12)),
 'quest':(.78,.48,[p('rpg','bookClose.ogg',gain=.5)]+bells(.07)),
 'victory':(.88,.53,[p('impact','impactPlate_medium_000.ogg',gain=.45)]+bells(.08,True)),
 'decisive':(1.05,.56,[p('impact','impactMetal_heavy_000.ogg',gain=.45)]+bells(.08,True)+[p('impact','impactBell_heavy_000.ogg',.38,.3,2)]),
 'defeat':(.55,.32,[p('impact','impactMetal_medium_001.ogg',gain=.5,pitch=.72)]),
 'level':(1.25,.58,[p('impact','impactPlate_heavy_000.ogg',gain=.3)]+bells(.07,True)+[p('impact','impactBell_heavy_000.ogg',.50,.5,2)]),
 'achievement':(.95,.51,bells(.04,True)+[p('interface','glass_001.ogg',.32,.22,1.2)]),
 'healing':(.65,.35,[p('interface','glass_001.ogg',gain=.35,pitch=.8),p('interface','glass_002.ogg',.15,.3,1.2)]),
 'bounty':(1.00,.55,[p('rpg','drawKnife1.ogg',gain=.6),p('impact','impactMetal_heavy_000.ogg',.12,.3)]+bells(.22,True)),
 'alliance':(.58,.42,[p('rpg','metalLatch.ogg',gain=.5)]+bells(.04)),
 'error':(.17,.20,[p('interface','close_001.ogg',gain=.6,pitch=.7)]),
 'tutorial':(.97,.51,[p('rpg','bookClose.ogg',gain=.35)]+bells(.07,True)+[p('impact','impactBell_heavy_000.ogg',.4,.25,2)]),
}
inventory=[];reel=[]
for name,(seconds,level,parts) in designs.items():
 record,y=layer(name,parts,seconds,level);inventory.append(record);reel.extend([y,np.zeros(int(.75*RATE))])
subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','1','-i','-','-c:a','libmp3lame','-b:a','128k',str(OUT/'audition.mp3')],input=np.concatenate(reel).astype('<f4').tobytes(),check=True)
for pack in PACKS:(OUT/(pack+'-LICENSE.txt')).write_bytes((SOURCE/pack/'License.txt').read_bytes())
(OUT/'inventory.json').write_text(json.dumps(dict(status='Owner audition only. Not served or adopted.',license='CC0-1.0',credit='Kenney (kenney.nl); edited and layered for Kingdom Come',sources={k:dict(page=v[0],download=v[1],archiveSha256=v[2]) for k,v in PACKS.items()},cues=inventory),indent=2)+'\n')
rows=''.join('<li><strong>'+r['id']+'</strong><audio controls preload="none" src="'+r['file']+'"></audio></li>' for r in inventory)
(OUT/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Kingdom Come sound audition</title><style>body{background:#171714;color:#eee3c5;font:18px Georgia;margin:20px;max-width:700px}li{padding:10px;display:grid;gap:8px}audio{max-width:100%}</style><h1>Phase 4.8 sound audition</h1><p>Preview only. Tap to listen; start at low volume. Kenney CC0 samples, edited and layered. No background music.</p><ol>'+rows+'</ol></html>')
print(json.dumps(dict(cues=len(inventory),previewOnly=True,license='CC0-1.0',runtimeAssetsChanged=False)))
