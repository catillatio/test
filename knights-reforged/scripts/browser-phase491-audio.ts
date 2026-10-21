// Disposable local realm only. Log every Web Audio source start, not just named navigation cues.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
if(!testDatabaseUrl)throw new Error('Disposable test database required');
const r=await realm({isolated:true});const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config});
const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
await context.addInitScript(`(()=>{
 const record=(kind,detail={})=>{const events=JSON.parse(localStorage.getItem('phase491-trace')||'[]');events.push({kind,path:location.pathname,...detail});localStorage.setItem('phase491-trace',JSON.stringify(events));};
 document.addEventListener('kingdom-sound-played',e=>record('cue',e.detail));
 document.addEventListener('pointerdown',e=>record('gesture',{pointerType:e.pointerType}),true);
 const Original=window.AudioContext||window.webkitAudioContext;
 if(Original){window.AudioContext=class extends Original{constructor(...args){super(...args);record('context');}resume(){record('resume');return super.resume();}createBufferSource(){const node=super.createBufferSource(),start=node.start.bind(node);node.start=(...args)=>{record('start',{offset:args[1],duration:args[2]});return start(...args);};return node;}};}
})();`);
const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const trace=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('phase491-trace')||'[]'));
try{
 const actor=await r.player('Quiet Navigator');await r.ok(actor,'/api/v1/tutorial',{action:'skip'});await r.ok(actor,'/api/v1/settings/sound',{enabled:'1',volume:38});
 await context.addCookies([{name:'kr_session',value:actor.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 await page.goto(origin+'/game/home');await page.locator('.primary-nav').waitFor();
 for(let cycle=0;cycle<2;cycle++)for(const name of['Quests','Battle','Armory','Recruit','Home']){
  const link=page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name,exact:true});if(cycle===0)await link.tap();else await link.click();await page.waitForLoadState('load');await page.waitForTimeout(180);
 }
 await page.goBack({waitUntil:'load'});await page.goForward({waitUntil:'load'});await page.reload();await page.waitForTimeout(300);
 const navigation=await trace();assert.ok(navigation.some((e:any)=>e.kind==='gesture'&&e.pointerType==='touch'));assert.ok(navigation.some((e:any)=>e.kind==='gesture'&&e.pointerType==='mouse'));assert.equal(navigation.filter((e:any)=>e.kind==='start'||e.kind==='cue').length,0);
 if(!process.env.PHASE491_BASELINE)assert.equal(navigation.filter((e:any)=>e.kind==='context'||e.kind==='resume').length,0,'Ordinary navigation must not even resume the audio engine');
 await mkdir('test-results',{recursive:true});
 if(process.env.PHASE491_BASELINE){await writeFile('test-results/phase491-baseline-navigation.json',JSON.stringify({navigation,errors,liveContacted:false},null,2));console.log('BASELINE trace: '+navigation.length+' Web Audio operations, zero source starts');}
 else{
  await page.goto(origin+'/game/settings');await page.getByRole('button',{name:'Preview',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('phase491-trace')||'[]').some((e:any)=>e.kind==='start'));
  const previous=(await trace()).filter((e:any)=>e.kind==='start').length;
  await page.waitForTimeout(160);await page.evaluate(()=>{for(let i=0;i<12;i++)document.dispatchEvent(new CustomEvent('kingdom-action-result',{detail:{id:'confirmed-once',cue:'victory'}}));});
  await page.waitForFunction(n=>JSON.parse(localStorage.getItem('phase491-trace')||'[]').filter((e:any)=>e.kind==='start').length===n,previous+1);
  await page.waitForTimeout(160);const count=(await trace()).filter((e:any)=>e.kind==='start').length;
  await page.evaluate(()=>{for(const cue of['click','navigate'])document.dispatchEvent(new CustomEvent('kingdom-action-result',{detail:{id:'forbidden-'+cue,cue}}));});await page.waitForTimeout(180);assert.equal((await trace()).filter((e:any)=>e.kind==='start').length,count);
  await page.reload();await page.waitForTimeout(250);assert.equal((await trace()).filter((e:any)=>e.kind==='start').length,count,'Historical refresh stays silent');
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Home',exact:true}).click();await page.waitForLoadState('load');await page.goBack({waitUntil:'load'});await page.goForward({waitUntil:'load'});await page.waitForTimeout(200);assert.equal((await trace()).filter((e:any)=>e.kind==='start').length,count);
  // A delayed decode must not start after mute, navigation or suspension.
  await page.goto(origin+'/game/settings');await page.keyboard.press('Tab');
  let releaseFetch:(()=>void)|undefined;const delayed=new Promise<void>(resolve=>{releaseFetch=resolve;});
  await page.route('**/assets/audio/realm.m4a*',async route=>{await delayed;try{await route.continue();}catch{}});
  const requested=page.waitForRequest(request=>request.url().includes('/assets/audio/realm.m4a'));
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('kingdom-action-result',{detail:{id:'pending-muted',cue:'quest'}})));await requested;
  await page.locator('#sound-enabled').selectOption('0');await page.waitForFunction(()=>document.querySelector('[data-sound-status]')?.textContent==='Sound settings saved.');releaseFetch!();await page.waitForTimeout(450);assert.equal((await trace()).filter((e:any)=>e.kind==='start').length,count,'Mute during decode prevents playback');
  await page.unroute('**/assets/audio/realm.m4a*');const enabledSaved=page.waitForResponse(response=>response.url().endsWith('/api/v1/settings/sound')&&response.request().method()==='POST');await page.locator('#sound-enabled').selectOption('1');await enabledSaved;await page.waitForFunction(()=>document.querySelector('[data-sound-status]')?.textContent==='Sound settings saved.');
  await page.reload();await page.keyboard.press('Tab');let releaseNavigation:(()=>void)|undefined;const navigationDelay=new Promise<void>(resolve=>{releaseNavigation=resolve;});
  await page.route('**/assets/audio/realm.m4a*',async route=>{await navigationDelay;try{await route.continue();}catch{}});
  const pending=page.waitForRequest(request=>request.url().includes('/assets/audio/realm.m4a'));await page.evaluate(()=>document.dispatchEvent(new CustomEvent('kingdom-action-result',{detail:{id:'pending-navigation',cue:'victory'}})));await pending;
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Home',exact:true}).click();await page.waitForLoadState('load');releaseNavigation!();await page.unroute('**/assets/audio/realm.m4a*');await page.waitForTimeout(350);assert.equal((await trace()).filter((e:any)=>e.kind==='start').length,count,'Departure cancels pending reward audio');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForTimeout(180);assert.equal((await trace()).filter((e:any)=>e.kind==='start').length,count,'History restore cannot resume a prior cue');
  assert.deepEqual(errors,[]);await writeFile('test-results/phase491-audio-browser.json',JSON.stringify({passed:true,navigation,completeTrace:await trace(),errors,liveContacted:false},null,2));console.log('PASS: silent real five-tab navigation, history, reload, no audio-engine unlock; AAC preview and victory playback, deduplication, legacy cue rejection');
 }
}finally{await browser.close();await app.close();await r.close();}
