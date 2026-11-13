// Matched real-app renders; never a production fixture or an image mockup.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const f=JSON.parse(await readFile('/dev/shm/kc-rebuild-preview.json','utf8'));
const out='/dev/shm/kc-rebuild-review/gallery';await mkdir(out,{recursive:true});
type Scene={name:string;path:string;width:number;anchor?:string;open?:string;actor?:string};
const scenes:Scene[]=[];
for(const width of [320,390,1280])for(const [part,anchor] of [['top',''],['middle','[data-achievement="quests-1"]'],['bottom','[data-achievement="army-1"]']])scenes.push({name:'achievements-'+part,path:'/game/achievements',width,anchor});
scenes.push(
 {name:'home',path:'/game/home',width:390},
 {name:'health',path:'/game/home',width:390,open:'.resource-disclosure.health'},
 {name:'mana',path:'/game/home',width:320,open:'.resource-disclosure.mana'},
 {name:'stamina',path:'/game/home',width:1280,open:'.resource-disclosure.spirit'},
 {name:'comments',path:'/game/profile?tab=comments',width:390,anchor:'.activity-feed'},
 {name:'tales',path:'/game/profile?tab=battles',width:320,anchor:'#battle-tales'},
 {name:'armory',path:'/game/armory',width:390},
 {name:'land',path:'/game/land',width:412},
 {name:'profile',path:'/game/profile',width:390},
 {name:'rivals',path:'/game/battle',width:390},
 {name:'quests',path:'/game/quests',width:390},
 {name:'recruit',path:'/game/army?tab=recruit',width:320},
 {name:'settings',path:'/game/settings',width:390},
 {name:'victory',path:'/game/battles/'+f.victory.battleId,width:390},
 {name:'defeat',path:'/game/battles/'+f.defeat.battleId,width:390},
);
assert.equal(scenes.length,24);
const extra:Scene[]=[{name:'crowns',path:'/game/crowns',width:390},{name:'crowns-compact',path:'/game/crowns',width:320},{name:'crowns-desktop',path:'/game/crowns',width:1280},{name:'health-insufficient',path:'/game/home',width:320,open:'.resource-disclosure.health',actor:'poor'},{name:'health-full',path:'/game/home',width:390,open:'.resource-disclosure.health',actor:'patron'},{name:'muted',path:'/game/home?feed=broadcasts',width:390,actor:'muted',anchor:'.posting-restriction'},{name:'calling',path:'/game/home?calling=1',width:390,anchor:'#calling'},{name:'bounties',path:'/game/bounties',width:1280},{name:'home-battles',path:'/game/home?feed=battles',width:390,anchor:'.activity-feed'},{name:'portrait-warden',path:'/game/players/'+f.rival.id,width:390},{name:'portrait-spellward',path:'/game/players/'+f.patron.id,width:390}];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const evidence:any[]=[];
try{
 for(const [i,s] of [...scenes,...extra].entries()){
  const context=await browser.newContext({viewport:{width:s.width,height:s.width>=768?900:844},deviceScaleFactor:1,javaScriptEnabled:true,reducedMotion:'reduce'}),page=await context.newPage();
  await page.route('**/api/v1/notifications/read',route=>route.abort());
  const pair:any={readAcknowledgments:'blocked only for frozen visual comparison; actual behavior verified separately',name:s.name,width:s.width,fixture:'shared synthetic PostgreSQL schema',zoom:1,anchor:s.anchor??'top',renders:[]};
  for(const side of i<24?[0,1]:[1]){
   const actor=s.actor==='poor'?f.coverage.poor:f[s.actor??'owner'],origin=f.origins[side];await context.clearCookies();await context.addCookies([{name:'kr_session',value:actor.cookie.slice('kr_session='.length),url:origin,httpOnly:true,sameSite:'Lax'}]);
   assert.equal((await page.goto(origin+s.path))?.status(),200,s.name);
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode();}));});
   await page.waitForTimeout(150);
   if(s.open)await page.locator(s.open).evaluate((e:any)=>{e.open=true;});
   if(s.anchor)await page.locator(s.anchor).first().evaluate(e=>{window.scrollTo(0,Math.max(0,e.getBoundingClientRect().top+scrollY-20));});
   if(side&&pair.renders.length){
    const alignedY=await page.evaluate(()=>scrollY),fixedY=pair.renders[0].scrollY;
    if(Math.abs(alignedY-fixedY)>1){const alignedFile=String(i+1).padStart(2,'0')+'-'+s.width+'-'+s.name+'-after-aligned.png';await page.screenshot({path:out+'/'+alignedFile});pair.alignedAfter={file:alignedFile,scrollY:alignedY};}
    await page.evaluate(y=>window.scrollTo(0,y),fixedY);assert.equal(await page.evaluate(()=>scrollY),fixedY,'Same absolute comparison scroll offset');
   }
   const metrics=await page.evaluate(()=>({scrollY,overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].filter(i=>!i.naturalWidth).length,coins:[...document.querySelectorAll('use')].filter(e=>/#coins?$/.test(e.getAttribute('href')??'')).length}));
   if(side){assert.equal(metrics.overflow,false,s.name);assert.equal(metrics.brokenImages,0);assert.equal(metrics.coins,1);}
   if(side&&s.name==='health-insufficient'){assert.equal(await page.locator('[data-wallet-gold]').first().innerText(),'0');assert.ok(await page.locator('[data-heal-form] button').isDisabled());assert.match(await page.locator('[data-heal-message]').innerText(),/more gold/i);}
   if(side&&s.name==='health-full'){assert.ok(await page.locator('[data-heal-form] button').isDisabled());assert.match(await page.locator('[data-heal-message]').innerText(),/full/i);}
   if(side&&s.name.startsWith('crowns')){assert.equal(await page.locator('.crown-offer').count(),3);assert.equal(await page.locator('.crown-offer button:enabled').count(),0);}
   const file=String(i+1).padStart(2,'0')+'-'+s.width+'-'+s.name+'-'+(side?'after':'before')+'.png';await page.screenshot({path:out+'/'+file});pair.renders.push({side:side?'after':'before',file,...metrics});
   if(side&&['profile','portrait-warden','portrait-spellward'].includes(s.name))await page.locator('.profile-identity>img').screenshot({path:out+'/'+s.name+'-actual-60.png'});
  }
  evidence.push(pair);await context.close();
 }
 await writeFile(out+'/captures.json',JSON.stringify(evidence,null,2)+'\n');
 const body=evidence.map(p=>'<section><h2>'+p.width+'px · '+p.name+'</h2><div>'+p.renders.map((r:any)=>'<figure><figcaption>'+r.side+' · scroll '+r.scrollY+'px</figcaption><a href="'+r.file+'"><img src="'+r.file+'"></a></figure>').join('')+'</div>'+(p.alignedAfter?'<p><a href="'+p.alignedAfter.file+'">Additional matching-content anchor view</a> · scroll '+p.alignedAfter.scrollY+'px</p>':'')+'</section>').join('');
 await writeFile(out+'/index.html','<!doctype html><html><meta charset="utf-8"><title>Kingdom Come · complete local rebuild</title><style>body{background:#151411;color:#eee5d3;font:15px Arial;margin:28px}h1{font:30px Georgia}p{max-width:950px;line-height:1.6}section{border-top:1px solid #74654b;margin:30px 0;padding:12px 0}section>div{display:flex;gap:18px;align-items:start}figure{margin:0;max-width:49%}img{max-width:100%;height:auto;border:1px solid #685c46}figcaption{margin:8px 0;color:#c9b99e}</style><h1>Kingdom Come · clean rebuild review</h1><p>24 matched before/after pairs, then additional state evidence. Both renderers use identical synthetic accounts, paid wallets, saved reports, viewport, zoom and imagery. Before is d6a0c83. Every primary before/after pair uses the same absolute document scroll offset. Additional aligned-content views are linked where redesigned row heights move a section. Every offset is recorded. No screenshot is a generated mockup. New source artwork is identified separately.</p>'+body+'</html>');
 console.log('REBUILD_GALLERY: PASS — 24 pairs and '+extra.length+' additional state captures');
}finally{await browser.close();}
