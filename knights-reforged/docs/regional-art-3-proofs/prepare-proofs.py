"""Review-only mechanical resizing/contact sheets. Never edits runtime assets."""
import hashlib,io,json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

d=Path(__file__).resolve().parent;app=d.parents[1];repo=app.parent
assert d.parent==app/'docs'
digest=lambda b:hashlib.sha256(b).hexdigest()
def write_once(path,data):
    if path.exists() and path.read_bytes()!=data: raise SystemExit('Existing proof differs; use a new proof version: '+str(path))
    if not path.exists():path.write_bytes(data)
spec=json.loads((d/'briefs.json').read_text());assert [e['id'] for e in spec['entries']]==['eclipse-greatsword','royal-warblade','eclipse-gatehammer']
m1=json.loads((app/'rulesets/regional-weapon-land-art-1/rules.json').read_text());m2=json.loads((app/'rulesets/regional-weapon-land-art-2/rules.json').read_text())
hud=app/'public/art/regional-weapon-land-1/king-hudsons-sword.webp'
f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
comparison=Image.new('RGB',(1120,3*440),'#121313');draw=ImageDraw.Draw(comparison)
gallery=Image.new('RGB',(3*384,448),'#121313');gd=ImageDraw.Draw(gallery);entries=[]
for n,e in enumerate(spec['entries']):
    a=next(a for a in m1['entries'] if a['id']==e['id']);b=next(a for a in m2['entries'] if a['id']==e['id']);assert (e['name'],e['level'],e['region'])==(b['name'],b['level'],b['region'])
    source=d/'sources'/(e['id']+'.png');im=Image.open(source).convert('RGB');assert im.width==im.height
    encoded=io.BytesIO();im.resize((512,512),Image.Resampling.LANCZOS).save(encoded,'WEBP',quality=90,method=6);target=d/(e['id']+'.webp');write_once(target,encoded.getvalue())
    before=app/'public'/a['path'].removeprefix('/assets/');elemental=app/'public'/b['path'].removeprefix('/assets/');files=[before,elemental,target,hud];labels=['Original PR #37 / version 1','Elemental revision / version 2','New balanced proof / not approved','Hudson / quality reference only']
    yy=n*440;draw.text((8,yy+5),e['name']+' — Level '+str(e['level'])+' — '+e['region'],font=f,fill='#eadfc9')
    for col,(path,label) in enumerate(zip(files,labels)):
        x=col*280;image=Image.open(path).convert('RGB');draw.text((x+8,yy+30),label,font=small,fill='#c9c7c0');comparison.paste(image.resize((256,256),Image.Resampling.LANCZOS),(x+8,yy+52))
        comparison.paste(image.resize((76,76),Image.Resampling.LANCZOS),(x+8,yy+320));comparison.paste(image.resize((60,60),Image.Resampling.LANCZOS),(x+110,yy+320));draw.text((x+8,yy+402),'76×76',font=small,fill='#c9c7c0');draw.text((x+110,yy+386),'60×60',font=small,fill='#c9c7c0')
    single=io.BytesIO();comparison.crop((0,yy,1120,yy+440)).save(single,'WEBP',lossless=True);write_once(d/('compare-'+e['id']+'.webp'),single.getvalue())
    gallery.paste(im.resize((368,368),Image.Resampling.LANCZOS),(n*384+8,8));gd.text((n*384+8,386),e['name'],font=f,fill='#eadfc9');gd.text((n*384+8,410),'Level '+str(e['level'])+' · '+e['region'],font=small,fill='#c9c7c0')
    entries.append({'id':e['id'],'name':e['name'],'level':e['level'],'region':e['region'],'proof':str(target.relative_to(app)),'proofSha256':digest(target.read_bytes()),'bytes':target.stat().st_size,'width':512,'height':512,'source':str(source.relative_to(app)),'sourceSha256':digest(source.read_bytes()),'sourceDimensions':[im.width,im.height],'originalCandidate':str(before.relative_to(app)),'originalSha256':digest(before.read_bytes()),'elementalCandidate':str(elemental.relative_to(app)),'elementalSha256':digest(elemental.read_bytes()),'ownerApproved':False})
for path,image in [(d/'comparisons.webp',comparison),(d/'three-proofs.webp',gallery)]:
    encoded=io.BytesIO();image.save(encoded,'WEBP',lossless=True);write_once(path,encoded.getvalue())
preserved=[]
for line in subprocess.check_output(['git','ls-tree','-r',spec['baseCommit'],'--','knights-reforged/public/art','knights-reforged/rulesets','knights-reforged/src','knights-reforged/views','knights-reforged/deployment','knights-reforged/migrations','.github'],cwd=repo,text=True).splitlines():
    meta,path=line.split('\t',1);data=(repo/path).read_bytes();assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==meta.split()[2],path;preserved.append(path)
manifest={'scope':'Three owner-review proofs only; not an installable artwork registry','baseCommit':spec['baseCommit'],'active':False,'registryModified':False,'runtimeFilesModified':False,'otherTwelveGenerated':False,'preservedExistingFiles':len(preserved),'preservedLandEntries':6,'preservedHudsonSha256':digest(hud.read_bytes()),'preservedCandidate1Sha256':digest((app/'rulesets/regional-weapon-land-art-1/rules.json').read_bytes()),'preservedCandidate2Sha256':digest((app/'rulesets/regional-weapon-land-art-2/rules.json').read_bytes()),'entries':entries,'provenance':{'tool':'OpenAI image_gen.imagegen','method':'Three newly illustrated designs; no old-image filtering/recolor, no procedural weapon drawing. Proportional resize/WebP encoding and labeled comparison sheets only.','rights':'Approved project references; original OpenAI-generated output under applicable terms. No stock/APK art; no exclusivity claim.'},'verification':{'passed':True,'sources':3,'decodedWebPs':3,'actualSquareThumbnailSizes':[60,76],'allExistingGameAndArtFilesUnchanged':True,'productionContacted':False,'allAspectRatiosCertified':False,'limits':'This is a square-icon style proof, not final runtime integration or owner approval. Other in-game frame ratios must be verified after direction approval.'}}
write_once(d/'review-manifest.json',(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode());print('PROOF_CHECK: PASS; exactly 3 new illustrations; existing '+str(len(preserved))+' game/art/registry/release files unchanged; no runtime integration')
