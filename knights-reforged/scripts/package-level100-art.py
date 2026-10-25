"""Package imagegen paintings into existing full-bleed shared art slots.
No painting, padding, filters or synthetic borders: proportional encoding only.
Usage: python scripts/package-level100-art.py /private/source-path-map.json
The path map is local build input and never committed or read by the game.
"""
import hashlib,json,pathlib,sys,shutil
from PIL import Image,ImageOps,ImageDraw,ImageFont
root=pathlib.Path(__file__).resolve().parents[1]
if sys.argv[1:]!=['--previews-only']:raise SystemExit('Frozen historical art: runtime packaging is disabled. Use the reviewed beta registry or a new approved artwork version.')
previews_only=sys.argv[1]=='--previews-only'
if previews_only:
 runtime=root/'docs/level100-launch/art/archived-runtime-level100-1';previews=root/'docs/level100-launch/art/previews';previews.mkdir(parents=True,exist_ok=True)
 entries=json.loads((root/'rulesets/level100-artwork-2/rules.json').read_text())['entries']
else:
 from_masters=sys.argv[1]=='--from-masters'
 sources={} if from_masters else json.loads(pathlib.Path(sys.argv[1]).read_text())
 previous=json.loads((root/'rulesets/level100-artwork-2/rules.json').read_text()) if from_masters else None
 old=json.loads((root/'rulesets/level100-artwork-1/rules.json').read_text())
 runtime=root/'docs/level100-launch/art/archived-runtime-level100-1';masters=root/'docs/level100-launch/art/masters';previews=root/'docs/level100-launch/art/previews'
 for p in [runtime,masters,previews,root/'rulesets/level100-artwork-2']:p.mkdir(parents=True,exist_ok=True)
 sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
 entries=[]
 for e in old['entries']:
  land=e['kind']=='property';hudson=e['id'].startswith('king-hudsons-')
  owner_ids={'king-hudsons-shield':'1df90978-1cde-4080-8bba-dc25fd86b9df','king-hudsons-meteor-shower':'2e7522e3-4f93-40d6-84c6-5e6cfbbce96c','king-hudsons-sword':'ccb25e5e-239c-4194-b1e7-23d913641f44'}
  master=masters/(e['id']+'.webp');native=runtime/(e['id']+'.webp')
  if from_masters:
   prior=next(i for i in previous['entries'] if i['id']==e['id']);source_hash=prior['sourceSha256'];dimensions=prior['sourceDimensions'];assert sha(master)==prior['masterSha256']
  else:
   source=pathlib.Path(sources[e['id']]);image=Image.open(source).convert('RGB');assert image.width>= (1536 if land else 1024) and image.height>=1024
   source_hash=sha(source);dimensions=[image.width,image.height]
   if hudson:
    assert source.name==owner_ids[e['id']]+'.png','HUDSON SOURCE MUST BE THE EXACT RANDOMIZED-NAME OWNER PNG'
    original=root/'docs/level100-launch/art/owner-originals'/source.name;original.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,original)
    image.save(master,lossless=True,method=6)
   else:image.resize((1536,1024) if land else (1024,1024),Image.Resampling.LANCZOS).save(master,quality=94,method=6)
  # Runtime bytes are reproducible from the committed authoritative WebP master.
  Image.open(master).convert('RGB').resize((768,512) if land else (512,512),Image.Resampling.LANCZOS).save(native,lossless=hudson,quality=88,method=6)
  entry={**e,'status':'prepared','path':'/assets/art/level100-1/'+native.name,'sha256':sha(native),'license':'Original project-generated artwork; applicable OpenAI output terms; no exclusivity claimed. Owner-supplied Hudson reference use subject to final owner rights confirmation.','provenanceEvidence':'docs/level100-launch/art/PROVENANCE.md','focalPosition':[.5,0] if land else [.5,.5],'sourceSha256':source_hash,'sourceDimensions':dimensions,'masterSha256':sha(master),'ownerApproval':None,'framingApproval':None}
  if hudson:
   original=root/'docs/level100-launch/art/owner-originals'/(owner_ids[e['id']]+'.png');assert sha(original)==source_hash
   entry.update({'ownerOriginal':'docs/level100-launch/art/owner-originals/'+original.name,'ownerReferenceCommit':'3721dc4595e237f6f5bf8632e70b60a0e6c157a7','ownerSelection':'Owner explicitly requested these exact randomized-name PNGs on 2026-10-24.','processing':'Exact owner PNG preserved byte-for-byte. Lossless WebP master retains the full original decoded RGB pixels; runtime uses proportional Lanczos 512x512 resize and lossless WebP, no repaint, filter, extension or substitution.','masterRgbSha256':hashlib.sha256(Image.open(master).convert('RGB').tobytes()).hexdigest()})
   assert entry['masterRgbSha256']==hashlib.sha256(Image.open(original).convert('RGB').tobytes()).hexdigest()
  entries.append(entry)
 manifest={**old,'id':'level100-artwork-2','status':'prepared-pending-owner-review','provenance':'42 original project-generated expansion drafts and three exact owner-selected Hudson PNGs prepared for the 2026-10-24 review. Legacy artwork-1 remains installed unchanged. Latest rejected charcoal studies are review-only, not runtime assets. Activation requires explicit final art/framing/rights approval for every entry.','entries':entries}
 (root/'rulesets/level100-artwork-2/rules.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
 (runtime/'provenance.json').write_text(json.dumps({'version':'level100-1','date':'2026-10-24','reviewStatus':'pending-owner-approval','processing':'Proportional Lanczos downsampling and WebP encoding. No padding, mattes, filters, stretching or changes to legacy images.','manifest':'rulesets/level100-artwork-2/rules.json','assets':entries},indent=2,ensure_ascii=False)+'\n')
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
for kind in ['weapon','armor','spell','property']:
 group=[e for e in entries if e['kind']==kind];cols=3;cellw=290;cellh=230 if kind=='property' else 240
 sheet=Image.new('RGB',(cols*cellw,((len(group)+cols-1)//cols)*cellh),(27,25,23));d=ImageDraw.Draw(sheet)
 for n,e in enumerate(group):
  x=n%cols*cellw;y=n//cols*cellh;im=Image.open(runtime/(e['id']+'.webp'))
  display=ImageOps.fit(im,(264,154) if kind=='property' else (180,180),method=Image.Resampling.LANCZOS)
  sheet.paste(display,(x+12,y+8));d.text((x+12,y+(168 if kind=='property' else 194)),e['name'],font=small,fill='#eadcc1');d.text((x+12,y+(187 if kind=='property' else 213)),f"Level {e['level']} · owner review pending",font=small,fill='#bfa77a')
 sheet.save(previews/(kind+'-sheet.webp'),quality=92)
# Every actual slot is shown at its native CSS pixel dimensions, no magnification.
for kind,dimensions in [('equipment',[(36,36),(60,60),(64,72),(76,76),(62,60),(68,61),(128,112)]),('land',[(68,49),(80,58),(90,60),(198,116),(60,60),(64,72)]),('hudson',[(36,36),(60,60),(64,72),(76,76),(128,112)])]:
 group=[e for e in entries if (e['id'].startswith('king-hudsons-') if kind=='hudson' else (e['kind']=='property')==(kind=='land'))];w=sum(x for x,y in dimensions)+len(dimensions)*12+230;h=152*len(group)
 sheet=Image.new('RGB',(w,h),(30,27,25));d=ImageDraw.Draw(sheet)
 for n,e in enumerate(group):
  y=n*152;d.text((8,y+8),e['name'],font=small,fill='#eadcc1');im=Image.open(runtime/(e['id']+'.webp'));x=225
  for width,height in dimensions:
   d.text((x,y+5),f'{width}×{height}',font=small,fill='#bfa77a');sheet.paste(ImageOps.fit(im,(width,height),method=Image.Resampling.LANCZOS,centering=(.5,0) if kind=='land' else (.5,.5)),(x,y+25));x+=width+12
 sheet.save(previews/(kind+'-actual-slots.webp'),quality=94)
print('PASS: review sheets refreshed without asset changes.' if previews_only else 'PASS: 45 source paintings, versioned full-bleed WebP assets, masters and actual-size review sheets.')
