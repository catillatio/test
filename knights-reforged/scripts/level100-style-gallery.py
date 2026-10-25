"""Review-only comparison; composes existing images, never generates/repaints art.
No production assets, catalogs, stats, stylesheets or gameplay records are edited.
"""
import pathlib,json,hashlib,textwrap
from PIL import Image,ImageOps,ImageDraw,ImageFont
root=pathlib.Path(__file__).resolve().parents[1];out=root/'docs/level100-launch/art/style-review';out.mkdir(parents=True,exist_ok=True)
classic=json.loads((root/'rulesets/alpha-0.3/rules.json').read_text());expanded=json.loads((root/'rulesets/level100-content-1/rules.json').read_text());items={i['id']:i for i in expanded['items']}
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11);heading=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',19)
evidence=[]
atlas_bounds=json.loads((root/'public/art/fantasy-0.2/provenance.json').read_text())['observed_row_bounds']
def approved(id):
 p=root/'public/art/equipment-51b-current-1'/(id+'.webp')
 if p.exists():image=Image.open(p).convert('RGB')
 else:
  i=items[id];a=i['illustration'];p=root/'public/art/fantasy-0.2'/(a['atlas']+'.webp');atlas=Image.open(p).convert('RGB');w=atlas.width//4;bounds=atlas_bounds[a['atlas']];image=atlas.crop((a['column']*w,bounds[a['row']],(a['column']+1)*w,bounds[a['row']+1]))
 evidence.append({'id':id,'role':'APPROVED_CURRENT','source':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()});return image
def pending(id):return Image.open(root/'docs/level100-launch/art/archived-runtime-level100-1'/(id+'.webp')).convert('RGB')
def label(d,xy,text,fill='#ddcfb4'):
 x,y=xy
 for line in textwrap.wrap(text,40):d.text((x,y),line,font=small,fill=fill);y+=15
def tile(sheet,xy,im,name,level,role,width=260):
 x,y=xy;d=ImageDraw.Draw(sheet);d.text((x,y),role,font=small,fill='#bfa77a');sheet.paste(ImageOps.fit(im,(188,188),method=Image.Resampling.LANCZOS),(x,y+24));sheet.paste(ImageOps.fit(im,(76,76),method=Image.Resampling.LANCZOS),(x+196,y+24));label(d,(x,y+220),name+' · level '+str(level));d.text((x+196,y+106),'76×76',font=small,fill='#b7afa2')
authority=['cinderwyrm-cleaver','moonthorn-recurve','oathbound-greatsword','gravewarden-scythe','sun-etched-warhammer','dragonwake-falchion','astral-conductor','crown-of-ash-blade','eclipse-greatsword','sovereigns-bastion','astral-archon-robes','eclipse-citadel-plate','oathfire-nova','moonwell-veil','astral-tempest','seraphs-rebuke','eclipse-invocation','wyrmscale-aegis']
sheet=Image.new('RGB',(920,50+6*264),(31,29,27));d=ImageDraw.Draw(sheet);d.text((12,12),'APPROVED CURRENT GAME ART — primary style authority',font=heading,fill='#f0e1bd')
for n,id in enumerate(authority):tile(sheet,(12+(n%3)*304,52+n//3*264),approved(id),items[id]['name'],items[id]['level'],'APPROVED / unchanged')
sheet.save(out/'approved-current-authority.webp',quality=94)
pairs=[('oathbound-greatsword','marcher-greatsword'),('crown-of-ash-blade','royal-warblade'),('gravewarden-scythe','fortress-glaive'),('dragonwake-falchion','guard-captains-halberd'),('sovereigns-bastion','captains-brigandine'),('eclipse-citadel-plate','siegeguard-plate'),('oathfire-nova','battlebrand'),('moonwell-veil','rampart-ward')]
sheet=Image.new('RGB',(950,52+len(pairs)*272),(31,29,27));d=ImageDraw.Draw(sheet);d.text((12,12),'APPROVED reference / PENDING draft / REJECTED study',font=heading,fill='#f0e1bd')
for n,(old,id)in enumerate(pairs):
 y=52+n*272;tile(sheet,(12,y),approved(old),items[old]['name'],items[old]['level'],'APPROVED CURRENT');tile(sheet,(326,y),pending(id),items[id]['name'],items[id]['level'],'PENDING EXPANSION DRAFT')
 study=pathlib.Path('/dev/shm/kingdom-generated-images')/('standard-'+id+'.png')
 retained=out/('rejected-'+id+'.webp')
 if study.exists():
  im=Image.open(study).convert('RGB');tile(sheet,(640,y),im,items[id]['name'],items[id]['level'],'REJECTED — DO NOT ADOPT');im.resize((256,256),Image.Resampling.LANCZOS).save(out/('rejected-'+id+'.webp'),quality=90);evidence.append({'id':id,'role':'REJECTED_STUDY','sourceSha256':hashlib.sha256(study.read_bytes()).hexdigest(),'publicAssetAdopted':False})
 elif retained.exists():
  tile(sheet,(640,y),Image.open(retained).convert('RGB'),items[id]['name'],items[id]['level'],'REJECTED — DO NOT ADOPT');evidence.append({'id':id,'role':'REJECTED_STUDY','retainedThumbnail':str(retained.relative_to(root)),'publicAssetAdopted':False})
 else:label(d,(640,y+40),'No completed study retained. No new illustration generated for this comparison.')
sheet.save(out/'approved-draft-rejected-comparison.webp',quality=94)
rows=[['imperial-greatblade','ash-crowned-warblade','imperial-eclipse-greatsword'],['high-castellans-hammer','throneguard-polehammer','eclipse-gatehammer'],['imperial-assault-harness','ashen-marshal-harness','eclipse-war-marshal-plate'],['crownwall-bastion-plate','sovereigns-war-bastion','imperial-eclipse-bastion'],['astral-siegefire','ashen-coronation','astral-war-invocation'],['sanctuary-of-banners','crown-of-wards','eclipse-aegis']]
sheet=Image.new('RGB',(920,54+len(rows)*264),(31,29,27));d=ImageDraw.Draw(sheet);d.text((12,12),'LEVELS 80 / 90 / 100 — existing PENDING drafts, not approved',font=heading,fill='#f0e1bd')
for y,row in enumerate(rows):
 for x,id in enumerate(row):tile(sheet,(12+x*304,54+y*264),pending(id),items[id]['name'],items[id]['level'],'PENDING — redesign held')
sheet.save(out/'level80-100-pending-audit.webp',quality=94)
selected=json.loads((root/'docs/level100-launch/art/hudson-selection.json').read_text())
sheet=Image.new('RGB',(920,330),(31,29,27));d=ImageDraw.Draw(sheet);d.text((12,10),'EXACT OWNER-SELECTED HUDSON PNGS — no repaint',font=heading,fill='#f0e1bd')
for n,e in enumerate(selected['items']):tile(sheet,(12+n*304,54),Image.open(root/e['ownerOriginal']).convert('RGB'),items[e['id']]['name'],items[e['id']]['level'],'EXACT OWNER SOURCE')
sheet.save(out/'hudson-exact-selected.webp',quality=96)
(out/'evidence.json').write_text(json.dumps({'reviewOnly':True,'newArtGeneratedForGallery':False,'productionArtworkChangedByGallery':False,'sourcePolicy':'Approved in-game project artwork is the authority. Drafts and rejected studies are clearly labelled and never promoted by this script. Normalized proportional square source thumbnails, including unfiltered atlas tiles; separate real browser captures document native UI framing.','sources':evidence},indent=2)+'\n')
print('PASS: comparison galleries created from existing artwork only; no production assets changed.')
