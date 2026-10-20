"""Original Kingdom Come sound design. No samples or third-party compositions.
Rebuild with Python/numpy and ffmpeg. The generated assets are CC0-1.0.
Modal bells, felt impacts, plucked strings, breath-driven horns and filtered
noise, with short early reflections. Seeded synthesis; no music loop.
"""
from pathlib import Path
import json, math, subprocess, tempfile, wave
import numpy as np

RATE = 32000
OUT = Path(__file__).resolve().parents[1] / 'public/audio'
OUT.mkdir(parents=True, exist_ok=True)
if (OUT / 'inventory.json').exists() and json.loads((OUT / 'inventory.json').read_text()).get('version') != 'phase47-1':
    raise SystemExit('Historical Phase 4.7 generator cannot overwrite adopted audio. Use scripts/adopt-orchestral-phase49.py.')
rng = np.random.default_rng(4701)

def note(freq, duration, voice):
    t = np.arange(int(RATE * duration)) / RATE
    attack = 0.008 if voice != 'horn' else 0.045
    env = (1 - np.exp(-t / attack)) * np.exp(-t / (duration * .29))
    if voice == 'bell':
        y = sum(a*np.sin(2*math.pi*freq*k*t)*np.exp(-t*k/duration) for k,a in [(1,1),(2.01,.26),(2.73,.11),(4.1,.05)])
    elif voice == 'horn':
        y = sum(np.sin(2*math.pi*freq*k*t+0.008*np.sin(t*24))/k**1.6 for k in range(1,7))
        env *= np.minimum(1, (duration-t)/.055)
    elif voice == 'pluck':
        y = sum(np.sin(2*math.pi*freq*k*t)*np.exp(-t*k*5)/k**1.4 for k in range(1,7))
    elif voice == 'air':
        n=rng.normal(0,1,len(t));smooth=np.convolve(n,np.ones(22)/22,'same')
        y=.6*np.sin(2*math.pi*freq*t+1.2*np.sin(2*math.pi*freq*.5*t))*np.exp(-t*1.4)+smooth*.3
    else:
        n=rng.normal(0,1,len(t));y=.65*np.sin(2*math.pi*freq*t*np.exp(-t*5))+np.convolve(n,np.ones(8)/8,'same')*.22
    return y*env

# (duration, voice, pitches, spacing, relative level); varied cadences and timbres.
designs={
 'click':(.10,'wood',[185],0,.45), 'navigate':(.20,'pluck',[294,392],.035,.42),
 'coins':(.52,'bell',[1175,1568,1760],.045,.54), 'spend':(.36,'bell',[1319,988,784],.04,.43),
 'equipment':(.56,'bell',[440,880,1319],.045,.56), 'sale':(.40,'pluck',[587,880,1175],.045,.48),
 'land':(.65,'horn',[147,220,294],.035,.66), 'income':(.65,'bell',[784,988,1175,1568],.055,.62),
 'quest':(.83,'pluck',[392,494,587,784],.08,.67), 'victory':(.95,'horn',[294,392,494,587],.055,.73),
 'decisive':(1.08,'horn',[196,294,392,494,587,784],.045,.76), 'defeat':(.65,'horn',[294,247,220],.055,.40),
 'level':(1.35,'horn',[294,392,494,587,784],.10,.77), 'achievement':(1.02,'bell',[587,880,1175,1760],.075,.67),
 'healing':(.80,'air',[523,659,784],.065,.55), 'bounty':(1.12,'horn',[220,330,440,554,659],.065,.76),
 'alliance':(.72,'pluck',[330,440,554,659],.055,.61), 'error':(.21,'wood',[165,147],.035,.32),
 'tutorial':(1.18,'bell',[392,494,587,784,988],.07,.71),
}
inventory=[]
sprite=[]
index={}
with tempfile.TemporaryDirectory(prefix='kingdom-audio-') as scratch:
 for name,(duration,voice,pitches,spacing,level) in designs.items():
    y=np.zeros(int(RATE*(duration+.16)))
    for i,freq in enumerate(pitches):
        start=int(i*spacing*RATE);n=note(freq,max(.08,duration-i*spacing),voice)
        y[start:start+len(n)]+=n/len(pitches)**.55
    if name in ['decisive','bounty','level']:
        low=note(98,.35,'wood');y[:len(low)]+=low*.34
    dry=y.copy()
    for delay,gain in [(.031,.14),(.067,.075),(.113,.035)]:
        shift=int(delay*RATE);y[shift:]+=dry[:-shift]*gain
    y*=min(1,.68/(np.max(np.abs(y))+1e-9))*level
    y[:160]*=np.linspace(0,1,160);y[-640:]*=np.linspace(1,0,640)
    index[name]={'start':round(sum(len(part) for part in sprite)/RATE,6),'duration':round(len(y)/RATE,6)}
    sprite.extend([y,np.zeros(int(.09*RATE))])
    wav=Path(scratch)/(name+'.wav')
    with wave.open(str(wav),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes((y*32767).astype('<i2').tobytes())
    target=OUT/(name+'.m4a')
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','aac','-b:a','64k','-movflags','+faststart',str(target)],check=True)
    inventory.append(dict(id=name,file=name+'.m4a',seconds=round(len(y)/RATE,3),bytes=target.stat().st_size,voice=voice,peak=round(float(np.max(np.abs(y))),3),rms=round(float(np.sqrt(np.mean(y*y))),3),license='CC0-1.0'))
 all_audio=np.concatenate(sprite)
 wav=Path(scratch)/'realm.wav'
 with wave.open(str(wav),'wb') as w:
    w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes((all_audio*32767).astype('<i2').tobytes())
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','aac','-b:a','64k','-movflags','+faststart',str(OUT/'realm.m4a')],check=True)
(OUT/'index.js').write_text('export const soundIndex='+json.dumps(index,separators=(',',':'))+';\n')
for path in OUT.glob('*.m4a'):path.chmod(0o644)
(OUT/'inventory.json').write_text(json.dumps(dict(version='phase47-1',origin='Original deterministic synthesis, scripts/create-audio.py. No sampled recordings or copied game audio.',sounds=inventory),indent=2)+'\n')
