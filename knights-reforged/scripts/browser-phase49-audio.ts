// Approved local audio and synthetic accounts only. Block all external requests.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
if(!testDatabaseUrl)throw new Error('A designated disposable *_test database is required.');
const r=await realm({isolated:true}),config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'});
const app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',headless:true,args:process.env.CHROMIUM_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
await context.addInitScript(()=>{
 (window as any).audioChecks={played:[],started:[],ended:0,contexts:0};
 document.addEventListener('kingdom-sound-played',(event:any)=>(window as any).audioChecks.played.push(event.detail.cue));
 const Constructor=window.AudioContext;
 window.AudioContext=new Proxy(Constructor,{construct(target,args){(window as any).audioChecks.contexts++;return Reflect.construct(target,args);}});
 const original=Constructor.prototype.createBufferSource;
 Constructor.prototype.createBufferSource=function(){const source=original.call(this),start=source.start.bind(source);
  source.start=((...args:any[])=>{(window as any).audioChecks.started.push({offset:args[1],duration:args[2],at:performance.now()});source.addEventListener('ended',()=>{(window as any).audioChecks.ended++;});(start as any)(...args);}) as typeof source.start;return source;
 };
});
const page=await context.newPage(),errors:string[]=[],requests:string[]=[],checks:string[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>{if(request.url().includes('/assets/audio/realm.m4a'))requests.push(request.url());});
const probe=()=>page.evaluate(()=>(window as any).audioChecks);
const cue=async(id:string,name:string)=>page.evaluate(({id,name})=>document.dispatchEvent(new CustomEvent('kingdom-action-result',{detail:{id,cue:name}})),{id,name});
try{
 const actor=await r.player('Recorded Orchestra Review');await r.ok(actor,'/api/v1/settings/sound',{enabled:'1',volume:42});
 await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 await page.goto(origin+'/game/settings');await page.waitForTimeout(150);
 assert.equal(requests.length,0);assert.equal((await probe()).contexts,0);assert.deepEqual((await probe()).played,[]);
 checks.push('Saved enabled preference creates no audio engine, network load or sound before the first page gesture.');
 await Promise.all([page.waitForResponse(response=>response.url().includes('/assets/audio/realm.m4a')),page.keyboard.press('Tab')]);await page.waitForFunction(()=>!!sessionStorage.getItem('kingdom-audio-interaction'));
 assert.deepEqual((await probe()).played,[]);assert.ok(requests.every(url=>url.endsWith('?v=phase49-orchestral-1')));
 const inventory=JSON.parse(await readFile('public/audio/inventory.json','utf8'));
 for(const name of['victory','defeat','quest','level','decisive']){
  const before=await probe();await cue('approved-recording-'+name,name);
  await page.waitForFunction(({name,count})=>(window as any).audioChecks.played.filter((n:string)=>n===name).length===count+1,{name,count:before.played.filter((n:string)=>n===name).length});
  const started=(await probe()).started.at(-1),asset=inventory.sounds.find((s:any)=>s.id===name);
  assert.equal(started.duration,asset.seconds,'Full approved arrangement, including its tail, is retained.');
  await page.waitForFunction(count=>(window as any).audioChecks.ended>count,before.ended,{timeout:7000});
  assert.ok(await page.evaluate(at=>performance.now()-at,started.at)>=asset.seconds*1000-80,'No early truncation.');
 }
 assert.equal(requests.length,1,'Only one sprite request within a document.');
 checks.push('Four approved cues play to completion (3.9/3.9/4.0/5.3 seconds); decisive uses the approved 3.9-second victory; one cached AAC sprite.');
 const beforeDuplicate=(await probe()).played.length;await cue('approved-recording-level','level');await page.waitForTimeout(150);assert.equal((await probe()).played.length,beforeDuplicate);
 const beforeBurst=(await probe()).played.length;await page.evaluate(()=>{for(let i=0;i<15;i++)document.dispatchEvent(new CustomEvent('kingdom-action-result',{detail:{id:'one-confirmed-receipt',cue:'victory'}}));});await page.waitForTimeout(250);assert.equal((await probe()).played.length,beforeBurst+1);
 await page.locator('#sound-enabled').selectOption('0');await page.waitForFunction(()=>document.querySelector('[data-sound-status]')?.textContent==='Sound settings saved.');
 const muted=(await probe()).played.length;await cue('muted-reward','level');await page.waitForTimeout(150);assert.equal((await probe()).played.length,muted);
 await page.reload();assert.equal(await page.locator('body').getAttribute('data-sound-enabled'),'0');assert.equal(await page.locator('#sound-volume').inputValue(),'42');assert.deepEqual((await probe()).played,[]);
 await cue('approved-recording-level','level');assert.deepEqual((await probe()).played,[]);
 checks.push('Receipt deduplication, rapid duplicate events, immediate mute, saved volume and refresh suppression remain intact.');
 await page.locator('#sound-enabled').selectOption('1');await page.waitForFunction(()=>document.querySelector('[data-sound-status]')?.textContent==='Sound settings saved.');
 await page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:function(){return true;}})");await cue('background-reward','quest');await page.waitForTimeout(150);assert.deepEqual((await probe()).played,[]);
 await page.evaluate(()=>{delete (document as any).hidden;});await page.waitForTimeout(150);assert.deepEqual((await probe()).played,[]);
 checks.push('Hidden-page reward is suppressed and does not replay on foregrounding. This simulates visibility, not mobile OS suspension.');
 // A fresh document has no decoded sprite; a failed fetch must recover only via
 // an explicit result-play tap, without retrying any gameplay command.
 await page.route('**/assets/audio/realm.m4a*',route=>route.abort());await page.reload();await page.keyboard.press('Tab');await cue('interrupted-audio-receipt','quest');
 const retry=page.getByRole('button',{name:'♫ Play result sound',exact:true});await retry.waitFor();assert.deepEqual((await probe()).played,[]);
 await page.unroute('**/assets/audio/realm.m4a*');await retry.click();await page.waitForFunction(()=>(window as any).audioChecks.played.includes('quest'));
 assert.equal(await retry.count(),0);checks.push('An interrupted audio fetch offers an explicit local playback retry; it cannot resubmit or duplicate a game action.');
 assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/phase49-audio-browser.json',JSON.stringify({passed:true,checks,errors,version:inventory.version,spriteBytes:inventory.sprite.bytes,productionContacted:false,limitations:['Headless Chromium with AAC decoding and real Web Audio; physical Android Chrome/iPhone Safari, speakers, hardware mute and OS interruptions remain owner device checks.']},null,2)+'\n');
 console.log('PASS: approved orchestral playback, gesture gating, silence, deduplication, preferences and interrupted-fetch recovery.');
}finally{await browser.close();await app.close();await r.close();}
