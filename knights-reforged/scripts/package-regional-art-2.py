"""Mechanical exports/review sheets for genuinely image-generated redesigns.

Never paints, recolors, pads, filters, stretches or changes game definitions.
Old registry/assets and seven carried-forward entries remain byte-for-byte.
"""
import copy,hashlib,io,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps

def digest(data): return hashlib.sha256(data).hexdigest()
def canonical(obj): return digest(json.dumps(obj,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode())
def immutable_write(path,data):
    if path.exists() and path.read_bytes()!=data: raise SystemExit('Existing version differs; prepare a new candidate: '+str(path))
    if not path.exists(): path.write_bytes(data)

d=Path('docs/regional-art-2');out=Path('public/art/regional-weapon-land-2');out.mkdir(exist_ok=True)
old_path=Path('rulesets/regional-weapon-land-art-1/rules.json');old_bytes=old_path.read_bytes();old=json.loads(old_bytes)
baseline=json.loads((d/'preservation-baseline.json').read_text());assert digest(old_bytes)==baseline['baseManifestSha256']
spec=json.loads((d/'specifications.json').read_text());assert len(spec['entries'])==15
entries=copy.deepcopy(old['entries']);sources=[]
for brief in spec['entries']:
    e=next(e for e in entries if e['id']==brief['id']);assert e['category']=='weapon' and e['id']!='king-hudsons-sword'
    assert (e['name'],e['level'],e['region'])==(brief['name'],brief['level'],brief['region'])
    source=d/'sources'/(e['id']+'.png');im=Image.open(source).convert('RGB');assert im.width==im.height
    encoded=io.BytesIO();im.resize((512,512),Image.Resampling.LANCZOS).save(encoded,'WEBP',quality=90,method=6)
    payload=encoded.getvalue();dest=out/(e['id']+'.webp');immutable_write(dest,payload)
    e.update(path='/assets/art/regional-weapon-land-2/'+e['id']+'.webp',sha256=digest(payload),bytes=len(payload),source=str(source),sourceSha256=digest(source.read_bytes()),sourceWidth=im.width,sourceHeight=im.height,elementalIdentity=brief['element'],designBrief=brief['brief'],processing='Original OpenAI image-generated redesign, with image-generation framing/background refinements where recorded. Mechanical proportional Lanczos resize and WebP encoding only; no pixel recolor, filters, artificial matte/padding, mirror or stretch.',framingReview='prepared-for-owner-frame-review')
for e in baseline['preservedEntries']:
    assert next(n for n in entries if n['id']==e['id'])==e
    assert digest(Path('public/'+e['path'].removeprefix('/assets/')).read_bytes())==e['sha256']
m=copy.deepcopy(old);m.update(id='regional-weapon-land-art-2',supersedesCandidateId=old['id'],supersedesCandidateDigest=canonical(old),candidateBaseCommit=baseline['baseCommit'],entries=entries)
reg=Path('rulesets')/m['id'];reg.mkdir(exist_ok=True)
raw=(json.dumps(m,ensure_ascii=False,indent=2)+'\n').encode();immutable_write(reg/'rules.json',raw);immutable_write(out/'provenance.json',raw)
for source in sorted((d/'sources').glob('*.png')):
    im=Image.open(source);sources.append(dict(path=str(source),sha256=digest(source.read_bytes()),bytes=source.stat().st_size,width=im.width,height=im.height,stage='rejected-similar-construction' if 'rejected-similar' in source.name else 'initial-framing' if '-initial' in source.name else 'finished-redesign'))
(d/'source-inventory.json').write_text(json.dumps({'tool':'OpenAI image_gen.imagegen','sourceImages':sources,'artworkMethod':'Genuine image generation and image-generation refinements. No procedural weapon drawing, stock shapes, recolor or CSS filters.','referenceRights':'Previously approved project equipment artwork. Hudson retained solely as a quality benchmark, never a rainbow design template. Applicable OpenAI output terms; no third-party stock/APK assets or exclusivity claim.'},indent=2)+'\n')
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
weapons=[next(e for e in entries if e['id']==b['id']) for b in spec['entries']]
def image(e): return Image.open('public/'+e['path'].removeprefix('/assets/')).convert('RGB')
def save(sheet,name): sheet.save(d/name,'WEBP',lossless=True)
sheet=Image.new('RGB',(1160,8*230),'#101111');draw=ImageDraw.Draw(sheet)
for i,e in enumerate(weapons):
    x=(i%2)*580;y=(i//2)*230
    draw.text((x+10,y+7),e['name']+' / L'+str(e['level'])+' / weapon',font=font,fill='#ebdfc6')
    draw.text((x+10,y+27),e['region']+' — '+e['elementalIdentity'],font=small,fill='#bebdb8')
    before=image(next(n for n in old['entries'] if n['id']==e['id']));after=image(e)
    for xx,im,label,size in [(10,before,'Original 76',76),(105,after,'Redesign 76',76),(215,before,'Original 60',60),(305,after,'Redesign 60',60)]:
        sheet.paste(im.resize((size,size),Image.Resampling.LANCZOS),(x+xx,y+58));draw.text((x+xx,y+143),label,font=small,fill='#c9c9c3')
    # Real non-square equipment crops, no padding/stretch.
    for xx,size in [(400,(64,72)),(475,(90,60))]:
        sheet.paste(ImageOps.fit(after,size,method=Image.Resampling.LANCZOS),(x+xx,y+58));draw.text((x+xx,y+143),str(size[0])+'×'+str(size[1]),font=small,fill='#c9c9c3')
save(sheet,'comparison-actual-size.webp')
sheet=Image.new('RGB',(5*260,3*320),'#101111');draw=ImageDraw.Draw(sheet)
for i,e in enumerate(weapons):
    x=(i%5)*260;y=(i//5)*320;sheet.paste(image(e).resize((252,252),Image.Resampling.LANCZOS),(x+4,y))
    draw.text((x+5,y+256),e['name'],font=small,fill='#ebdfc6');draw.text((x+5,y+273),'L'+str(e['level'])+' · '+e['region'],font=small,fill='#c1c0bb');draw.text((x+5,y+290),e['elementalIdentity'],font=small,fill='#c1c0bb')
save(sheet,'full-gallery.webp')
for region in dict.fromkeys(e['region'] for e in weapons):
    group=[e for e in weapons if e['region']==region];sheet=Image.new('RGB',(max(2,len(group))*280,362),'#101111');draw=ImageDraw.Draw(sheet);draw.text((8,7),region+' / '+group[0]['elementalIdentity'],font=font,fill='#ebdfc6')
    for i,e in enumerate(group):
        x=i*280;sheet.paste(image(e).resize((264,264),Image.Resampling.LANCZOS),(x+8,34));draw.text((x+8,304),e['name'],font=small,fill='#ebdfc6');draw.text((x+8,324),'Level '+str(e['level'])+' / weapon',font=small,fill='#c1c0bb')
    save(sheet,'region-'+region.lower().replace(' ','-')+'.webp')
hud=next(e for e in old['entries'] if e['id']=='king-hudsons-sword');sheet=Image.new('RGB',(540,330),'#101111');draw=ImageDraw.Draw(sheet);sheet.paste(image(hud).resize((280,280),Image.Resampling.LANCZOS),(0,0));draw.multiline_text((290,35),'King Hudson Sword\nQUALITY REFERENCE ONLY\n\nUnchanged source / bytes\nUnique prismatic identity\nSeparate framing review\nNo new rainbow weapons',font=small,fill='#ebdfc6',spacing=9);save(sheet,'hudson-quality-reference.webp')
inventory={'registryId':m['id'],'registryDigest':canonical(m),'supersedesCandidateDigest':canonical(old),'entries':22,'redesignedWeapons':15,'unchangedProperties':6,'unchangedHudson':1,'newRuntimeImageBytes':sum(e['bytes'] for e in weapons),'selectedImageBytes':sum(e['bytes'] for e in entries),'active':False}
(d/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
print(json.dumps(inventory))
