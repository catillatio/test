// Design-only compositions. Original concept pixels are clipped/scaled, never repainted.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const require=createRequire(resolve(root,'package.json'));
const {chromium}=require('playwright-core');
const dir=resolve(root,'docs/phase51b/artwork-review');
const data=(p,type)=>`data:image/${type};base64,${readFileSync(resolve(dir,p)).toString('base64')}`;
const equipment=data('concepts/equipment.webp','webp'),magic=data('concepts/magic-and-port.webp','webp');
const inventory=JSON.parse(readFileSync(resolve(dir,'current-art-inventory.json'))).groups.flatMap(g=>g.entries);
const entry=id=>inventory.find(i=>i.id===id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let clipSequence=0;
function proposed(atlas,col,row,size=210,land=false){
 const bounds=atlas==='equipment'?[0,461,1024]:[0,512,1024];const rect=[col*512,bounds[row],512,bounds[row+1]-bounds[row]];
 const clip='concept-clip-'+(++clipSequence);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${land?Math.round(size*.71):size}" viewBox="${rect.join(' ')}" preserveAspectRatio="xMidYMid ${land?'slice':'meet'}" aria-label="Proposed concept"><defs><clipPath id="${clip}"><rect x="${rect[0]}" y="${rect[1]}" width="${rect[2]}" height="${rect[3]}"/></clipPath></defs><image clip-path="url(#${clip})" href="${atlas==='equipment'?equipment:magic}" width="1536" height="1024"/></svg>`;
}
function current(id,size=210,land=false){return `<img alt="Current ${esc(entry(id).name)}" width="${size}" height="${land?Math.round(size*.71):size}" src="${data('tiles/'+id+'.png','png')}">`;}
function panel(content,small,label){return `<div class="art-panel"><div>${content}</div><div class="thumb">${small}<span>${label}<br>76px check</span></div></div>`;}
const groups=[
 {file:'compare-equipment.png',title:'Equipment • construction before glow',note:'Current at left; original proposal at right. Equal-size samples. Concepts are not approved runtime assets.',rows:[
 ['oathbound-greatsword','equipment',0,0,'Parallel-edged steel, broad fuller, straight brass guard and crimson oath ribbon.'],
 ['crown-of-ash-blade','equipment',1,0,'Clipped heavy blade, broken-crown guard, dark copper and dull red enamel.'],
 ['eclipse-greatsword','equipment',2,0,'Tapered black-and-silver blade, crescent quillons, physical polished bevel.'],
 ['sovereigns-bastion','equipment',0,1,'Stepped squared shoulders, severe helm, riveted black steel and oxblood cloth.'],
 ['eclipse-citadel-plate','equipment',1,1,'Crescent shoulders, articulated silver plates; inlaid medallion replaces luminous void.']
 ]},
 {file:'compare-spells.png',title:'Starter spells • small, local magic',note:'Current at left; original proposal at right. Later spells stay elaborate. No runtime art or rules changed.',rows:[
 ['ember-word','magic',0,0,'One breath-sized ember, two sparks; muted copper on charcoal.'],
 ['hearth-ward','magic',1,0,'A protected threshold, warm amber seam; remove the whole-house energy dome.'],
 ['lantern-mote','magic',2,0,'One tiny ivory light near a twig; short soft trail and dark negative space.'],
 ['thorn-hex','magic',0,1,'Few tactile briars, three readable thorns; muted bark, moss and burgundy.']
 ]}
];
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1040,height:900},deviceScaleFactor:1});
const css=`*{box-sizing:border-box}html,body{margin:0;background:#11100f;color:#e8ddc7;font:14px/1.4 system-ui;scroll-behavior:auto}body{padding:24px}h1{font:700 27px/1.2 Georgia;margin:0 0 8px}header p{color:#b5ab99;font-size:13px;margin:0 0 20px}.row{display:grid;grid-template-columns:240px 240px 1fr;gap:18px;padding:16px 0;border-top:1px solid #584b38}.art-panel{padding:10px;border:1px solid #69553a;background:#1a1714}.art-panel>div:first-child{width:210px;height:210px;background:#13110f;display:flex;align-items:center;justify-content:center}.art-panel img,.art-panel svg{display:block}.thumb{display:flex;gap:12px;align-items:center;margin-top:10px}.thumb span{font-size:12px;color:#c9baa0}.copy h2{font:700 20px/1.3 Georgia;margin:8px 0}.copy code{font-size:11px;color:#b2a58d}.copy p{color:#d2c6b1}.tag{font:12px system-ui;letter-spacing:.08em;color:#e7c88d}.ports{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.ports article{padding:12px;border:1px solid #69553a;background:#1a1714}.ports h2{font:700 19px Georgia}.ports p{font-size:13px;color:#c9baa0}.ports img,.ports svg{display:block}.port-context{display:flex;gap:18px;align-items:center;border-top:1px solid #584b38;margin-top:24px;padding-top:16px}.port-context p{max-width:630px}footer{margin-top:20px;font-size:12px;color:#b5ab99}`;
for(const group of groups){
 const rows=group.rows.map(([id,a,c,r,d])=>`<section class="row">${panel(current(id),current(id,76),'CURRENT')}${panel(proposed(a,c,r),proposed(a,c,r,76),'PROPOSED')}<div class="copy"><span class="tag">L${entry(id).level} · DESIGN STUDY</span><h2>${esc(entry(id).name)}</h2><code>${id}</code><p>${d}</p>${group.file.includes("spells")?"<p>Localized intent and a simple shape establish the starter tier; spectacle stays with later magic.</p>":"<p>Shape, material and construction carry the identity; effects remain secondary.</p>"}</div></section>`).join('');
 await page.setContent(`<html><head><meta charset="utf-8"><style>${css}</style></head><body><header><h1>${group.title}</h1><p>${group.note}</p></header>${rows}<footer>Kingdom Come • Phase 5.1B review only • base 2e05e1c • original generated studies; owner approval required</footer></body></html>`);
 await page.screenshot({path:resolve(dir,group.file),fullPage:true});
}
const port='tempest-port',crown='crown-harbour';
await page.setContent(`<html><head><meta charset="utf-8"><style>${css}</style></head><body><header><h1>Tempest Port • architecture, scale and working harbor</h1><p>Actual ID: tempest-port · unlock L21 · base price 11,000 gold · gross 700/hr · property upkeep 100/hr. Data unchanged.</p></header><div class="ports"><article><h2>Current • ship dominates</h2>${current(port,294,true)}<div class="thumb">${current(port,76,true)}<span>76px frame<br>CURRENT</span></div><p>One blue-sailed vessel in front of twin storm towers; close visual cousin of the beginner harbor.</p></article><article><h2>A • fortified sea gate</h2>${proposed('magic',1,1,294,true)}<div class="thumb">${proposed('magic',1,1,76,true)}<span>76px frame<br>PROPOSED A</span></div><p>Broad C-shaped breakwater and paired defensive towers; small ships give scale. Recommended direction.</p></article><article><h2>B • cliff drydock</h2>${proposed('magic',2,1,294,true)}<div class="thumb">${proposed('magic',2,1,76,true)}<span>76px frame<br>PROPOSED B</span></div><p>Terraced shipyard, crane and warehouse tiers. Richer working-port story, but more detail competes at small size.</p></article></div><section class="port-context">${current(crown,152,true)}<div><h2>Crown Harbour • L7 comparator, keep</h2><code>crown-harbour</code><p>${entry(crown).price.toLocaleString("en")} base gold · gross ${entry(crown).hourlyIncome}/hr · upkeep ${entry(crown).hourlyUpkeep}/hr. A calm inlet, modest lighthouse and one merchant ship remain appropriate here. Tempest Port is ${(entry(port).price/entry(crown).price).toFixed(1)}× the base purchase price and ${(entry(port).hourlyIncome/entry(crown).hourlyIncome).toFixed(1)}× the gross income; its structure should visibly reflect that scale.</p><p>There is no later harbor property in alpha-0.3. Runekeeper Academy, Oathbound Citadel and later holdings are different catalog identities, not ports.</p></div></section><footer>Original project assets and new concepts only • same-scale comparisons • no adoption, catalog change or deployment</footer></body></html>`);
await page.screenshot({path:resolve(dir,'compare-port.png'),fullPage:true});
await browser.close();console.log('Three current/proposed comparison boards rendered.');
