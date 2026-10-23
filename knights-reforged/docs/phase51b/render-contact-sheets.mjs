import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const require=createRequire(resolve(root,'package.json'));
const ejs=require('ejs');
const {chromium}=require('playwright-core');
const out=resolve(root,'docs/phase51b/artwork-review');
const catalog=JSON.parse(readFileSync(resolve(root,'rulesets/alpha-0.3/rules.json')));
const base=JSON.parse(readFileSync(resolve(root,'docs/phase51b/artwork-review/base.json'))).commit;
const styles=['styles','kingdoms-live','alpha','refinements','strategy','community','phase41','phase42','phase43','phase44','phase45','phase46','phase47','remaster','realm-theme','land-review','phase49'];
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const server=createServer((req,res)=>{try{const p=resolve(root,'public',decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/assets\//,''));if(!p.startsWith(resolve(root,'public')+'/'))throw Error();res.setHeader('Content-Type',({'css':'text/css','webp':'image/webp','svg':'image/svg+xml'})[extname(p).slice(1)]??'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port, origin=`http://127.0.0.1:${port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1120,height:900},deviceScaleFactor:1});
const metadata=[];
mkdirSync(resolve(out,'tiles'),{recursive:true});
const selected=new Set(['oathbound-greatsword','crown-of-ash-blade','eclipse-greatsword','sovereigns-bastion','eclipse-citadel-plate','dawnforge-panoply','ember-word','hearth-ward','lantern-mote','thorn-hex','tempest-port','crown-harbour']);
for(const kind of ['weapon','armor','spell','property']){
 const land=kind==='property';
 const entries=(land?catalog.properties:catalog.items.filter(i=>i.category===kind)).slice().sort((a,b)=>a.level-b.level||a.price-b.price);
 const cards=[];
 for(const raw of entries){
  const entry={...raw,name:raw.id==='moonwell-sanctuary'?'Gold Mine':raw.name};
  const partial=resolve(root,'views/partials/'+(land?'land-review-art.ejs':'catalog-art.ejs'));
  const art=await ejs.renderFile(partial,{entry,small:false});
  cards.push(`<article class="review-card" data-id="${entry.id}"><div class="large-tile">${art}</div><div class="small-pair"><div class="native-tile">${art}</div><span>76px ${land?'wide frame':'thumbnail'}<br>L${entry.level}${land?' · '+entry.price.toLocaleString('en')+' base gold':''}</span></div><h2>${safe(entry.name)}</h2><code>${entry.id}</code></article>`);
 }
 const title=land?'Current Land • real marketplace overrides':`Current ${kind==='armor'?'armor':kind+'s'} • live CSS atlas mapping`;
 const html=`<!doctype html><html><head><meta charset="utf-8">${styles.map(n=>`<link rel="stylesheet" href="${origin}/assets/${n}.css">`).join('')}<style>
 html,body{scroll-behavior:auto!important;margin:0!important;background:#11100f!important;color:#eee4cd!important;font:14px/1.4 system-ui!important;min-width:0!important}body{padding:24px!important}.review-header{margin-bottom:20px}.review-header h1{font:700 27px/1.2 Georgia!important;margin:0 0 8px!important}.review-header p{font:13px/1.4 system-ui!important;margin:0!important;color:#b5ad9c!important}.review-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.review-card{padding:12px;background:#1b1916;border:1px solid #62513a;border-radius:3px;min-width:0}.large-tile{width:210px;height:${land?'148':'210'}px;overflow:hidden;margin:auto;background:#13120f;border:1px solid #77654a}.large-tile .catalog-art{display:block!important;width:210px!important;height:210px!important;border:0!important;border-radius:0!important;margin:0!important;max-width:none!important;filter:${land?'saturate(.78) brightness(.82) contrast(1.07)':'contrast(1.02) saturate(.85)'}!important;transform:${land?'translateY(-31px)':'none'}!important}.small-pair{display:flex;align-items:center;gap:12px;margin-top:10px}.small-pair>span{font:12px/1.5 system-ui;color:#c6bca7}.native-tile{width:76px;height:${land?'54':'76'}px;overflow:hidden;border:1px solid #77654a;flex:none}.native-tile .catalog-art{display:block!important;width:76px!important;height:76px!important;border:0!important;border-radius:0!important;max-width:none!important;margin:0!important;filter:${land?'saturate(.78) brightness(.82) contrast(1.07)':'contrast(1.02) saturate(.85)'}!important;transform:${land?'translateY(-11px)':'none'}!important}.review-card h2{padding:0!important;text-align:left!important;text-indent:0!important;transform:none!important;position:static!important;font:700 16px/1.3 Georgia!important;margin:10px 0 4px!important;color:#f1e8d5!important}.review-card code{display:block;font:10px/1.4 monospace;color:#a69a84;overflow-wrap:anywhere}
 .property-art-49{background-size:cover!important;background-position:center!important}.large-tile :is(.land-review-art,.property-art-49),.native-tile :is(.land-review-art,.property-art-49){filter:saturate(.82) brightness(.9) contrast(1.04)!important}.review-card .land-review-art{background-image:url('${origin}/assets/art/land-review/painted-properties.webp');background-size:auto 300%;background-repeat:no-repeat;background-position:calc((var(--frame-width) - var(--frame-height) * 2.25) / 2 - var(--tile-column) * var(--frame-height) * 2.25) calc(-1 * var(--tile-row) * var(--frame-height))}.large-tile .land-review-art{--frame-width:210px;--frame-height:148px;width:210px!important;height:148px!important;transform:none!important}.native-tile .land-review-art{--frame-width:76px;--frame-height:54px;width:76px!important;height:54px!important;transform:none!important}.review-tile-0{--tile-column:0;--tile-row:0}.review-tile-1{--tile-column:1;--tile-row:0}.review-tile-2{--tile-column:0;--tile-row:1}.review-tile-3{--tile-column:1;--tile-row:1}.review-tile-4{--tile-column:0;--tile-row:2}.review-tile-5{--tile-column:1;--tile-row:2}.large-tile .property-art-49{height:148px!important;transform:none!important}.native-tile .property-art-49{height:54px!important;transform:none!important}
 </style></head><body><header class="review-header"><h1>${title}</h1><p>Kingdom Come • base 2e05e1c • unmodified project artwork • enlarged view + 76px check • no gameplay changes</p></header><main class="review-grid">${cards.join('')}</main></body></html>`;
 await page.setContent(html);await page.waitForLoadState('networkidle');await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(100);
 const metrics=await page.locator('.review-card').evaluateAll(cards=>cards.map(c=>{const a=c.querySelector('.native-tile .catalog-art'),s=getComputedStyle(a),r=a.getBoundingClientRect();return{id:c.dataset.id,url:s.backgroundImage.replace(/http:\/\/127\.0\.0\.1:\d+/g,''),size:s.backgroundSize,position:s.backgroundPosition,width:r.width,height:r.height,filter:s.filter};}));
 metadata.push({kind,count:entries.length,entries:entries.map(x=>({id:x.id,name:x.id==='moonwell-sanctuary'?'Gold Mine':x.name,level:x.level,illustration:x.illustration,price:x.price,...land?{hourlyIncome:x.hourlyIncome,hourlyUpkeep:x.hourlyUpkeep}: {}})),rendering:metrics});
 await page.screenshot({path:resolve(out,`current-${kind}.png`),fullPage:true});
 for(const entry of entries.filter(x=>selected.has(x.id))){const a=page.locator(`[data-id="${entry.id}"] .large-tile`);await a.screenshot({path:resolve(out,`tiles/${entry.id}.png`)});}
 console.log(kind,entries.length,'rendered and labeled');
}
writeFileSync(resolve(out,'current-art-inventory.json'),JSON.stringify({base,note:'Review-only EJS/CSS gallery; not game screenshots. 76px normalized samples, not literal mobile row geometry.',groups:metadata},null,2)+'\n');
await browser.close();await new Promise(r=>server.close(r));
