"""Generated foregrounds + one actual-live-art background; no RGB weapon edits."""
import copy,hashlib,io,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from collections import deque

def hash_bytes(b):return hashlib.sha256(b).hexdigest()
def canonical(x):return hash_bytes(json.dumps(x,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode())
def immutable(path,b):
    if path.exists() and path.read_bytes()!=b:raise SystemExit('Existing candidate differs; prepare a new version: '+str(path))
    if not path.exists():path.write_bytes(b)
def encoded(im,fmt='WEBP',**opts):
    b=io.BytesIO();im.save(b,fmt,**opts);return b.getvalue()

# A few generated alpha cutouts contain disconnected specks at the canvas edge.
# Remove only tiny edge-connected components, never a substantial weapon part.
# RGB illustration pixels stay unchanged; the raw generated PNG is retained.
def clean_alpha(im):
    alpha=im.getchannel('A');w,h=im.size;pix=alpha.load();seen=set();removed=[]
    seeds=[(x,y) for y in [0,h-1] for x in range(w)]+[(x,y) for x in [0,w-1] for y in range(h)]
    for seed in seeds:
        if seed in seen or pix[seed]<=8:continue
        q=deque([seed]);component=[];local={seed}
        while q and len(component)<=256:
            x,y=q.popleft();component.append((x,y))
            for nx,ny in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if 0<=nx<w and 0<=ny<h and (nx,ny) not in local and pix[nx,ny]>8:local.add((nx,ny));q.append((nx,ny))
        if len(component)<=256 and not q:
            seen.update(local)
            for xy in component:pix[xy]=0
            removed+=component
    im.putalpha(alpha);return im,len(removed)

d=Path('docs/regional-art-4');out=Path('public/art/regional-weapon-land-3');out.mkdir(exist_ok=True)
spec=json.loads((d/'briefs.json').read_text());first=json.loads(Path('rulesets/regional-weapon-land-art-1/rules.json').read_text());second=json.loads(Path('rulesets/regional-weapon-land-art-2/rules.json').read_text())
audit=json.loads((d/'live-background-reference.json').read_text());atlas=Path(audit['background']['source']);assert hash_bytes(atlas.read_bytes())==audit['assets'][0]['sha256']
bg=Image.open(atlas).convert('RGB').crop(tuple(audit['background']['crop'])).resize((512,512),Image.Resampling.LANCZOS)
assert encoded(bg,'PNG')==(d/'references/shared-live-background.png').read_bytes()
background_bytes=encoded(bg,lossless=True,method=6);immutable(out/'background.webp',background_bytes)
background={'path':'/assets/art/regional-weapon-land-3/background.webp','sha256':hash_bytes(background_bytes),'bytes':len(background_bytes),'width':512,'height':512,'sourceAtlas':'public/art/fantasy-0.2/weapons.webp','sourceAtlasSha256':hash_bytes(atlas.read_bytes()),'crop':[8,8,108,108],'method':'One unoccupied actual-live-atlas sample, proportionally scaled. Shared unchanged behind all fifteen weapons. No generated backdrop, tint, painted fill, mirroring or blurred sidebars.'}
briefs={e['id']:e for e in spec['remainingTwelve']}
proofs=json.loads(Path('docs/regional-art-3-proofs/briefs.json').read_text())['entries']
for e in proofs:briefs[e['id']]={**e,'magicTreatment':{'eclipse-greatsword':'contained sapphire accent','royal-warblade':'three amber inscriptions','eclipse-gatehammer':'protected violet core with slight local glow'}[e['id']],'slightGlow':e['id']=='eclipse-gatehammer'}
assert len(briefs)==15
entries=copy.deepcopy(first['entries']);weapons=[]
for e in entries:
    if e['id'] not in briefs:continue
    b=briefs[e['id']];assert (e['name'],e['level'],e['region'])==(b['name'],b['level'],b['region'])
    source=d/'foreground'/(e['id']+'.png');im=Image.open(source);assert im.mode=='RGBA' and im.getchannel('A').getextrema()==(0,255)
    im,removed=clean_alpha(im.copy());a=im.getchannel('A');physical=a.point(lambda v:255 if v>=128 else 0).getbbox();assert physical and min(physical[0],physical[1],im.width-physical[2],im.height-physical[3])>=2,('Clipped physical silhouette needs image-generation correction',e['id'],physical)
    box=a.point(lambda v:255 if v>8 else 0).getbbox();fg=im.crop(box);scale=430/max(fg.size);size=tuple(round(v*scale) for v in fg.size);fg=fg.resize(size,Image.Resampling.LANCZOS);offset=((512-size[0])//2,(512-size[1])//2)
    composite=bg.convert('RGBA');composite.alpha_composite(fg,offset);composite=composite.convert('RGB');png=encoded(composite,'PNG');immutable(d/'composites'/(e['id']+'.png'),png)
    payload=encoded(composite,quality=90,method=6);immutable(out/(e['id']+'.webp'),payload)
    e.update(path='/assets/art/regional-weapon-land-3/'+e['id']+'.webp',sha256=hash_bytes(payload),bytes=len(payload),source=str(source),sourceSha256=hash_bytes(source.read_bytes()),sourceWidth=im.width,sourceHeight=im.height,sourceKind='image-generated-transparent-foreground',designBrief=b['brief'],magicTreatment=b['magicTreatment'],slightGlow=b['slightGlow'],foregroundTransform={'alphaBoundsThreshold':8,'bounds':list(box),'physicalBounds':list(physical),'removedEdgeSpeckPixels':removed,'placedSize':list(size),'offset':list(offset),'scale':scale},backgroundSha256=background['sha256'],compositeSource=str(d/'composites'/(e['id']+'.png')),compositeSha256=hash_bytes(png),processing='Actual image-generated foreground; raw PNG retained. Only tiny disconnected edge-alpha specks removed, proportional scale and alpha composite onto the same actual-live-atlas background; no RGB recolor/filter, stretched geometry, artificial matte or sidebar fill.',framingReview='prepared-for-owner-frame-review')
    weapons.append(e)
assert len(weapons)==15
for e in entries:
    if e['id'] not in briefs:
        assert e==next(p for p in first['entries'] if p['id']==e['id']);assert hash_bytes(Path('public/'+e['path'].removeprefix('/assets/')).read_bytes())==e['sha256']
m=copy.deepcopy(first);m.update(id='regional-weapon-land-art-3',candidateBaseCommit=spec['baseCommit'],supersedesCandidateId=second['id'],supersedesCandidateDigest=canonical(second),background=background,entries=entries)
reg=Path('rulesets')/m['id'];reg.mkdir(exist_ok=True);raw=(json.dumps(m,ensure_ascii=False,indent=2)+'\n').encode();immutable(reg/'rules.json',raw);immutable(out/'provenance.json',raw)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
def art(e):return Image.open('public/'+e['path'].removeprefix('/assets/')).convert('RGB')
def save(im,name):immutable(d/name,encoded(im,lossless=True))
gallery=Image.new('RGB',(1300,960),'#141412');g=ImageDraw.Draw(gallery)
sheet=Image.new('RGB',(1200,8*220),'#141412');sd=ImageDraw.Draw(sheet)
for i,e in enumerate(weapons):
    x=i%5*260;y=i//5*320;gallery.paste(art(e).resize((252,252),Image.Resampling.LANCZOS),(x+4,y));g.text((x+5,y+256),e['name'],font=small,fill='#eadfc6');g.text((x+5,y+274),'L'+str(e['level'])+' · '+e['region'],font=small,fill='#c5c3b9');g.text((x+5,y+292),'Slight local glow' if e['slightGlow'] else 'Contained accent',font=small,fill='#c5c3b9')
    x=i%2*600;y=i//2*220;sd.text((x+8,y+6),e['name']+' / L'+str(e['level'])+' / '+e['region'],font=font,fill='#eadfc6')
    old=next(a for a in second['entries'] if a['id']==e['id'])
    for xx,image,label,size in [(8,art(old),'Previous 76',76),(104,art(e),'Current 76',76),(206,art(e),'Current 60',60),(292,art(e),'64×72',None),(382,art(e),'128×112',None)]:
        if size:img=image.resize((size,size),Image.Resampling.LANCZOS)
        else:
            from PIL import ImageOps
            img=ImageOps.fit(image,(64,72) if xx==292 else (128,112),method=Image.Resampling.LANCZOS)
        sheet.paste(img,(x+xx,y+36));sd.text((x+xx,y+154),label,font=small,fill='#c5c3b9')
save(gallery,'full-gallery.webp');save(sheet,'actual-size-comparison.webp')
for region in dict.fromkeys(e['region'] for e in weapons):
    rows=[e for e in weapons if e['region']==region];s=Image.new('RGB',(len(rows)*280,340),'#141412');draw=ImageDraw.Draw(s)
    for n,e in enumerate(rows):s.paste(art(e).resize((264,264),Image.Resampling.LANCZOS),(n*280+8,8));draw.text((n*280+8,282),e['name'],font=small,fill='#eadfc6');draw.text((n*280+8,302),'L'+str(e['level'])+' / '+region,font=small,fill='#c5c3b9')
    save(s,'region-'+region.lower().replace(' ','-')+'.webp')
inventory={'registryId':m['id'],'registryDigest':canonical(m),'redesignedWeapons':15,'newDesigns':12,'adaptedProofDesigns':3,'preservedProperties':6,'preservedHudson':1,'entries':22,'selectedImageBytes':sum(e['bytes'] for e in entries),'newWeaponBytes':sum(e['bytes'] for e in weapons),'sharedBackgroundBytes':len(background_bytes),'newRuntimeImageBytes':sum(e['bytes'] for e in weapons)+len(background_bytes),'slightGlowTargets':spec['slightExternalGlowTargets'],'active':False}
(d/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n');print(json.dumps(inventory))
