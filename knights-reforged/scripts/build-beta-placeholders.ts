// Mechanical reuse of five original project SVG silhouettes, not new AI art.
// Authoring-only: requires Chromium and Python Pillow; runtime uses five WebPs.
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const root='docs/level100-launch/beta-art',runtime='public/art/level100-beta-1';
await mkdir(root+'/sources',{recursive:true});await mkdir(runtime,{recursive:true});
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
async function writeVersioned(path:string,bytes:Buffer|string){try{if(sha(await readFile(path))!==sha(bytes))throw new Error('Existing artwork versions are immutable; create a reviewed new version.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await writeFile(path,bytes,{flag:'wx'});}}
const temp=await mkdtemp('/tmp/kingdom-beta-icons-');
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox']});
const assets:{role:string;path:string;sha256:string;bytes:number;width:number;height:number;source:string;sourceSha256:string;vector:string;vectorSha256:string;use:string}[]=[];
try{const page=await browser.newPage();await page.route('**/*',r=>r.abort());
 for(const [role,source]of [['weapon','blade'],['armor','mail'],['shield','buckler'],['spell','storm'],['land','tower']] as const){
  const input=await readFile('public/art/alpha/'+source+'.svg','utf8'),width=role==='land'?192:128,height=128;
  const defs=input.match(/<defs>([\s\S]*?)<\/defs>/)![1]!;
  const shape=input.slice(input.indexOf('</defs>')+7).replace(/^<rect[^>]+\/><path d="M8 8[^>]+\/>/,'').replace('</svg>','');
  if(shape.includes('M8 8')||shape.includes('126'))throw new Error('Remove the historical decorative frame.');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}<linearGradient id="charcoal" x2="1" y2="1"><stop stop-color="#242222"/><stop offset=".6" stop-color="#121313"/><stop offset="1" stop-color="#1c1b1a"/></linearGradient><pattern id="grain" width="32" height="32" patternUnits="userSpaceOnUse"><path d="m0 7 12-4m5 12 15-6M2 28l12-7m8 10 10-6" stroke="#827969" stroke-width="1" opacity=".055"/><path d="m3 12 9-4m3 14 13-8" stroke="#050606" stroke-width="2" opacity=".15"/></pattern></defs><path d="M0 0H${width}V128H0Z" fill="url(#charcoal)"/><path d="M0 0H${width}V128H0Z" fill="url(#grain)"/><g transform="translate(${width/2} 64) scale(.78) translate(-64 -64)">${shape}</g></svg>`;
  const sourcePath=root+'/sources/'+role+'.svg';await writeVersioned(sourcePath,svg+'\n');
  await page.setViewportSize({width,height});await page.setContent('<body style="margin:0">'+svg+'</body>');await page.screenshot({path:temp+'/'+role+'.png'});
  const path=runtime+'/'+role+'.webp',encoded=temp+'/'+role+'.webp';execFileSync('python',['-c','from PIL import Image;import sys;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],quality=76,method=6)',temp+'/'+role+'.png',encoded]);await writeVersioned(path,await readFile(encoded));
  const bytes=await readFile(path);if(bytes.length>8192)throw new Error('Placeholder exceeds the per-file budget.');
  assets.push({role,path:'/assets/art/level100-beta-1/'+role+'.webp',sha256:sha(bytes),bytes:bytes.length,width,height,source:'public/art/alpha/'+source+'.svg',sourceSha256:sha(input),vector:sourcePath,vectorSha256:sha(svg+'\n'),use:'temporary-beta'});
 }
}finally{await browser.close();await rm(temp,{recursive:true,force:true});}
const policy={id:'temporary-beta-artwork-1',use:'temporary-beta',ownerAuthorization:'Owner explicitly requested reusable temporary beta placeholders for PR #35; final-art approval is not claimed. Production activation still requires a separate reviewed exact-target plan.',maximumAssets:6,maximumTotalBytes:32768,maximumAssetBytes:8192,prestigeCeiling:'existing-approved-level-50',provenance:'Five original project SVG silhouettes, mechanically rasterized on full-bleed dark charcoal texture. No new illustrations, rejected-design reuse or third-party artwork.'};
const historic=JSON.parse(await readFile('rulesets/level100-artwork-2/rules.json','utf8'));
const normalize=(v:any):any=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort().map(([k,x])=>[k,normalize(x)])):v;
const manifest={id:'level100-beta-artwork-1',policyId:policy.id,purpose:'temporary-beta',finalArtwork:false,predecessorId:historic.id,predecessorDigest:sha(JSON.stringify(normalize(historic))),changedEntryIds:historic.entries.map((e:any)=>e.id).sort(),assets,entries:historic.entries.map((e:any)=>{const role=e.id==='king-hudsons-shield'?'shield':e.kind==='property'?'land':e.kind,a=assets.find(a=>a.role===role)!;return {id:e.id,name:e.name,kind:e.kind,level:e.level,brief:'Temporary generic '+role+' silhouette on dark charcoal. Final level 81-100 visual prestige is capped at the existing approved level-50 style; catalog definitions are unchanged.',use:'temporary-beta',status:'temporary-beta-approved',path:a.path,sha256:a.sha256,fullBleedRequired:true,license:'Original project-authored vector derivative; no third-party stock or historical game art.',provenanceEvidence:'docs/level100-launch/beta-art/README.md',ownerApproval:policy.ownerAuthorization,framingApproval:'Full-bleed proportional cover; actual supported crops verified by browser regression; temporary beta use only.'};})};
for(const def of [policy,manifest]){await mkdir('rulesets/'+def.id,{recursive:true});await writeVersioned('rulesets/'+def.id+'/rules.json',JSON.stringify(def,null,2)+'\n');}
await writeVersioned(runtime+'/provenance.json',JSON.stringify({policy:policy.id,manifest:manifest.id,totalImageBytes:assets.reduce((n,a)=>n+a.bytes,0),assets},null,2)+'\n');
console.log('BETA_PLACEHOLDERS: PASS ('+assets.length+' WebPs, '+assets.reduce((n,a)=>n+a.bytes,0)+' bytes)');
