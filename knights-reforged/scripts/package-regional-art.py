"""Mechanical derivatives/contact sheets only. Never paints, pads, recolors or changes catalogs."""
import json,hashlib,io
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
def immutable_write(path, data):
    if path.exists() and path.read_bytes() != data:
        raise SystemExit('Versioned artwork is immutable; prepare a new reviewed version: '+str(path))
    if not path.exists(): path.write_bytes(data)
r=Path('.');d=r/'docs/regional-art-1';out=r/'public/art/regional-weapon-land-1';out.mkdir(parents=True,exist_ok=True)
spec=json.loads((d/'specifications.json').read_text());p=json.load(open('rulesets/level100-equipment-presentation-1/rules.json'));b=json.load(open('rulesets/level100-beta-artwork-1/rules.json'))
hash=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest()
canonical=lambda o:hashlib.sha256(json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
hud=next(e for e in p['entries']if e['id']=='king-hudsons-sword');rows=spec['entries']+[dict(hud,category='weapon',oldPath='/assets/art/level100-beta-1/weapon.webp',prompt=None)]
entries=[]
for e in rows:
 id=e['id'];owner=id=='king-hudsons-sword';source=Path('docs/level100-launch/art/owner-originals/ccb25e5e-239c-4194-b1e7-23d913641f44.png') if owner else d/'sources'/(id+'.png')
 im=Image.open(source).convert('RGB');size=(768,512)if e['category']=='property'else(512,512);assert im.width*size[1]==im.height*size[0]
 dest=out/(id+'.webp')
 if owner: payload=Path('docs/level100-launch/art/archived-runtime-level100-1/king-hudsons-sword.webp').read_bytes()
 else:
  encoded=io.BytesIO();im.resize(size,Image.Resampling.LANCZOS).save(encoded,'WEBP',quality=90,method=6);payload=encoded.getvalue()
 immutable_write(dest,payload)
 a={'id':id,'name':e['name'],'level':e['level'],'category':e['category'],'region':e['region'],'oldPath':e['oldPath'],'path':'/assets/art/regional-weapon-land-1/'+id+'.webp','sha256':hash(dest),'bytes':dest.stat().st_size,'width':size[0],'height':size[1],'source':str(source),'sourceSha256':hash(source),'sourceWidth':im.width,'sourceHeight':im.height,'sourceKind':'owner-selected-original'if owner else'original-generated-art','license':'Owner-selected original PNG; reuse permission recorded in historical hudson-selection.json. No independent authorship/exclusivity claim.'if owner else'Original project artwork generated with OpenAI image generation; applicable OpenAI output terms. No stock/APK art or exclusivity claim.','reviewStatus':'pending-owner-review','ownerApproval':None,'fullBleed':True,'objectPosition':'center top'if e['category']=='property'else'center','processing':'Unchanged previously prepared exact-owner-PNG derivative; no repaint or recolor.'if owner else'Proportional Lanczos resize and WebP encoding only after image-generation framing pass. No paint, color filter, added matte, padding, mirroring, blur or stretch.','framingReview':'owner-specific-source-review-required'if owner else'prepared-for-owner-frame-review'}
 entries.append(a)
m={'id':'regional-weapon-land-art-1','reviewStatus':'pending-owner-review','activationDefault':False,'sourceCommit':spec['sourceCommit'],'presentationId':p['id'],'presentationDigest':canonical(p),'predecessorArtworkId':b['id'],'predecessorArtworkDigest':canonical(b),'scope':['weapon','property'],'preserveApprovedArt':True,'entries':entries}
reg=Path('rulesets')/m['id'];reg.mkdir(exist_ok=True);immutable_write(reg/'rules.json',(json.dumps(m,ensure_ascii=False,indent=2)+'\n').encode());immutable_write(out/'provenance.json',(json.dumps(m,ensure_ascii=False,indent=2)+'\n').encode())
# Technical comparison sheets use actual pixel dimensions, not illustration changes.
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
for kind in ['weapon','property']:
 es=[e for e in entries if e['category']==kind];cw=420 if kind=='weapon'else 520;rh=180 if kind=='weapon'else 280
 sheet=Image.new('RGB',(cw*2,((len(es)+1)//2)*rh),'#151513');draw=ImageDraw.Draw(sheet)
 for n,e in enumerate(es):
  x=(n%2)*cw;y=(n//2)*rh;draw.text((x+8,y+5),e['name']+' / L'+str(e['level']),font=font,fill='#ecdeb7');draw.text((x+8,y+22),e['region'],font=font,fill='#c6c6c0');im=Image.open(out/(e['id']+'.webp')).convert('RGB');sizes=[(76,76),(60,60),(64,72),(128,112)]if kind=='weapon'else[(68,49),(80,58),(90,60),(198,116),(60,60),(64,72)]
  xx=x+8;yy=y+43
  for w,h in sizes:
   if xx+w>x+cw-5:xx=x+8;yy+=128
   frame=ImageOps.fit(im,(w,h),method=Image.Resampling.LANCZOS,centering=(.5,0 if kind=='property'else.5));sheet.paste(frame,(xx,yy));draw.text((xx,yy+h+3),str(w)+'x'+str(h),font=font,fill='#bbbbad');xx+=w+9
 sheet.save(d/(kind+'-actual-size.webp'),lossless=True)
(d/'inventory.json').write_text(json.dumps({'registryId':m['id'],'registryDigest':canonical(m),'entries':len(entries),'newGeneratedWeapons':15,'ownerSourceWeapons':1,'generatedProperties':6,'runtimeImageBytes':sum(e['bytes']for e in entries),'active':False},indent=2)+'\n')
print('REGIONAL_PACKAGE:',len(entries),'assets;',sum(e['bytes']for e in entries),'image bytes; pending owner review')
