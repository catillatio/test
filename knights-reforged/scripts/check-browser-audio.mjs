// Inspect the actual selected browser, not a different downloaded executable.
// Local fixture bytes only; no audio playback, provider access or database.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';

const selected=process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath());
const candidates=[...new Set(['/usr/bin/chromium',selected])].filter(existsSync);
assert.ok(candidates.includes(selected),'The selected browser executable is missing.');
const encoded=readFileSync(new URL('../public/audio/realm.m4a',import.meta.url)).toString('base64');
for(const executablePath of candidates){
 const browser=await chromium.launch({executablePath,headless:true,args:process.env.CHROMIUM_NO_SANDBOX==='1'?['--no-sandbox']:[]});
 try{
  const page=await browser.newPage();
  const codec=await page.evaluate(async encoded=>{
   const capability=new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"');
   const context=new AudioContext();
   try{
    const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
    const buffer=await context.decodeAudioData(bytes.buffer);
    return {capability,decoded:true,duration:buffer.duration};
   }catch(error){return {capability,decoded:false,error:error.name};}
   finally{await context.close();}
  },encoded);
  console.log(JSON.stringify({executable:executablePath,version:browser.version(),selected:executablePath===selected,...codec}));
  if(executablePath===selected)assert.equal(codec.decoded,true,'The selected browser must decode the actual AAC sprite; audio tests cannot be skipped.');
 }finally{await browser.close();}
}
