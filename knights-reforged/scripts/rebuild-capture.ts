import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const fixture=JSON.parse(await readFile('/dev/shm/kc-rebuild-preview.json','utf8'));
const out=process.env.REBUILD_CAPTURE_DIR??'/dev/shm/kc-rebuild-review/foundation';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const checks:unknown[]=[];
try{
 for(const width of [320,390,1280]){
  const context=await browser.newContext({viewport:{width,height:width===1280?900:844},deviceScaleFactor:1,javaScriptEnabled:false,reducedMotion:'reduce'});
  const page=await context.newPage();
  const scenes=[['home','/game/home',''],['achievements','/game/achievements',''],['health','/game/home','.resource-disclosure.health'],['mana','/game/home','.resource-disclosure.mana'],['stamina','/game/home','.resource-disclosure.spirit'],['profile','/game/profile',''],['comments','/game/profile?tab=comments',''],['armory','/game/armory',''],['land','/game/land',''],['battle','/game/battle','']];
  for(const [name,path,open] of scenes)for(let side=0;side<2;side++){
   const origin=fixture.origins[side];await context.clearCookies();await context.addCookies([{name:'kr_session',value:fixture.owner.cookie.split('=')[1],url:origin,httpOnly:true,sameSite:'Lax'}]);
   const response=await page.goto(origin+path);assert.equal(response?.status(),200,path);
   await page.evaluate(async()=>{await document.fonts.ready;for(const i of document.images){i.loading='eager';await i.decode();}});
   if(open)await page.locator(open).evaluate((e:any)=>{e.open=true;});
   const info=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,coins:[...document.querySelectorAll('use')].filter(e=>/#coins?$/.test(e.getAttribute('href')??'')).map(e=>({href:e.getAttribute('href'),visible:(e.closest('svg')?.getBoundingClientRect().width??0)>0&&getComputedStyle(e.closest('svg')!).display!=='none'})),art:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute('src'))}));
   await page.screenshot({path:out+'/'+width+'-'+name+'-'+(side?'after':'before')+'.png'});checks.push({width,name,side:side?'after':'before',...info});
   if(side)assert.equal(info.overflow,false,'Horizontal overflow: '+width+' '+name);
  }
  await context.close();
 }
 await writeFile(out+'/checks.json',JSON.stringify(checks,null,2)+'\n');console.log('REBUILD_BROWSER_FOUNDATION: PASS '+checks.length+' real app captures');
}finally{await browser.close();}
