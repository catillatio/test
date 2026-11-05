// Rasterize original project vector branding and existing approved artwork; no AI mockups.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
const out='../android/store';await mkdir(out,{recursive:true});
const xml=await readFile('../android/app/src/main/res/drawable/kingdom_crest.xml','utf8');
const paths=[...xml.matchAll(/<path android:fillColor="([^"]+)" android:pathData="([^"]+)"/g)].map(m=>`<path fill="${m[1]}" d="${m[2]}"/>`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${paths}</svg>`;
await writeFile(out+'/kingdom-crest-original.svg',svg+'\n');
const castle=await readFile('public/art/remaster-ui/castle-illustration.webp');
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const p=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
 await p.setContent(`<style>html,body{margin:0;width:512px;height:512px;background:transparent}svg{width:512px;height:512px}</style>${svg}`);
 await p.screenshot({path:out+'/icon-512.png',omitBackground:true});
 await p.setViewportSize({width:1024,height:500});
 await p.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:1024px;height:500px;background:#100f0d;color:#ece4d5}main{height:500px;position:relative;overflow:hidden;padding:94px 54px}main:before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,#100f0d 0%,rgba(16,15,13,.91) 37%,rgba(16,15,13,.15) 100%),url(data:image/webp;base64,${castle.toString('base64')}) 100% 55%/auto 950px no-repeat}section{position:relative;max-width:690px}svg{width:108px;height:108px;float:left;margin:0 20px 0 -20px}h1{font:56px/1.15 Georgia,serif;margin:20px 0;color:#f0dfb2}p{clear:both;padding-top:20px;font:25px/1.5 Georgia,serif;color:#d4cabb;margin:0;max-width:650px}</style><main><section>${svg}<h1>Kingdom Come</h1><p>Build your realm.<br>Rally your army. Face your rivals.</p></section></main>`);
 await p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>setTimeout(r,100));});await p.screenshot({path:out+'/feature-1024x500.png'});
 const inventory=[];for(const name of ['kingdom-crest-original.svg','icon-512.png','feature-1024x500.png']){const bytes=await readFile(out+'/'+name);inventory.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await writeFile(out+'/assets.json',JSON.stringify({status:'REVIEW_DRAFT_NOT_SUBMITTED',icon:'Original project geometric crown/K vector from historical Android PR20; rasterized without new artwork',feature:'Marketing composition of approved original castle artwork and original vector; not an in-app screenshot',rights:'Owner trademark/distribution review required; see ASSET_LICENSE_AUDIT.md',assets:inventory},null,2)+'\n');
 console.log('PLAY_ASSETS: PASS — 512 icon and 1024x500 feature graphic rendered; owner rights review pending');
}finally{await browser.close();}
