import {soundIndex} from './audio/index.js?v=phase49-orchestral-1';
// One short cue per confirmed action. Server-owned opt-in/mute; no music, third-party
// requests, predicted rewards or financial writes. AAC works in mobile Safari.
const body=document.body,identity=document.querySelector('[data-character-id]')?.dataset.characterId||'anonymous';
let enabled=body.dataset.soundEnabled==='1',volume=Math.max(0,Math.min(100,Number(body.dataset.soundVolume)||0)),context=null,active=null,activeGain=null,lastAt=-Infinity,lastReward=-Infinity,lastRoutine=-Infinity,interacted=false,waiting=null,generation=0,departing=false;
const sounds=new Set(['coins','spend','equipment','sale','land','income','quest','victory','decisive','defeat','level','achievement','healing','bounty','alliance','error','tutorial']);
const seenKey='kingdom-sounds:'+identity;
let seen=[];try{seen=JSON.parse(localStorage.getItem(seenKey)||'[]');if(!Array.isArray(seen))seen=[];}catch{}
const remember=id=>{if(!id||seen.includes(id))return false;seen.push(id);seen=seen.slice(-128);try{localStorage.setItem(seenKey,JSON.stringify(seen));}catch{}return true;};
function engine(){if(!context){const Constructor=window.AudioContext||window.webkitAudioContext;if(!Constructor)return null;try{context=new Constructor({latencyHint:'interactive'});}catch{return null;}}return context;}
let spritePromise=null;
async function load(cue){
 if(!spritePromise)spritePromise=(async()=>{const ctx=engine();if(!ctx)throw new Error('Audio unavailable');const response=await fetch('/assets/audio/realm.m4a?v=phase49-orchestral-1',{cache:'force-cache'});if(!response.ok)throw new Error('Audio unavailable');return ctx.decodeAudioData(await response.arrayBuffer());})().catch(error=>{spritePromise=null;throw error;});
 return spritePromise;
}
function offer(cue){waiting=cue;let button=document.querySelector('[data-play-result]');if(!button){button=document.createElement('button');button.type='button';button.className='button button-outline sound-unlock';button.dataset.playResult='';button.textContent='♫ Play result sound';const panel=document.querySelector('.reward-celebration,.purchase-receipt,.notice-success')||document.querySelector('main');panel?.append(button);button.addEventListener('click',()=>{const next=waiting;waiting=null;button.remove();void play(next,{reward:true});});}}
async function play(cue,{reward=false,preview=false}={}){
 if(!sounds.has(cue)||(!enabled&&!preview)||!volume||document.hidden||departing)return false;
 const attempt=generation;
 const now=performance.now();if(!reward&&now-lastRoutine<90)return false;if(reward&&now-lastReward<100)return false;
 let previousInteraction=false;try{previousInteraction=!!sessionStorage.getItem('kingdom-audio-interaction');}catch{}if(!interacted&&!previousInteraction)return false;
 const ctx=engine();if(!ctx)return false;
 try{
  // resume() is invoked synchronously from the gesture before any fetch/await.
  const resume=ctx.resume();const bufferPromise=load(cue);bufferPromise.catch(()=>{});
  await Promise.race([resume,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tap required')),700))]);
  if(ctx.state!=='running')throw new Error('Tap required');const buffer=await bufferPromise;if(!buffer||document.hidden||departing||attempt!==generation||(!enabled&&!preview)||!volume)return false;
  if(reward&&performance.now()-lastReward<100)return false;if(!reward&&active)return false;
  if(active){try{active.stop();}catch{}} // no stacked horn/click spam
  const node=ctx.createBufferSource(),gain=ctx.createGain();node.buffer=buffer;gain.gain.value=volume/100*.74;node.connect(gain);gain.connect(ctx.destination);node.start(0,soundIndex[cue].start,soundIndex[cue].duration);active=node;activeGain=gain;
  lastAt=performance.now();if(reward)lastReward=lastAt;else lastRoutine=lastAt;
  node.onended=()=>{if(active===node){active=null;activeGain=null;}node.disconnect();gain.disconnect();};
  document.dispatchEvent(new CustomEvent('kingdom-sound-played',{detail:{cue}}));return true;
 }catch{if(reward&&enabled&&!departing&&!document.hidden&&attempt===generation)offer(cue);return false;}
}
// A routine gesture records consent to the browser gesture gate only. It must
// not create/resume an AudioContext, fetch a sprite, or resume a prior sound.
function unlock(){interacted=true;try{sessionStorage.setItem('kingdom-audio-interaction','1');}catch{}}
document.addEventListener('pointerdown',unlock,{capture:true,passive:true});document.addEventListener('keydown',unlock,{capture:true});
const pendingKey='kingdom-sound-action:'+identity;
document.addEventListener('submit',event=>{const form=event.target;if(!(form instanceof HTMLFormElement))return;const id=form.querySelector('[name="commandId"]')?.value;if(id)try{sessionStorage.setItem(pendingKey,JSON.stringify({id,at:Date.now()}));}catch{}},true);
document.addEventListener('kingdom-action-result',event=>{
 const {id,cue}=event.detail||{};if(sounds.has(cue)&&remember(id))void play(cue,{reward:true});
});
function result(){
 let event=null,pending=null;try{event=JSON.parse(body.dataset.soundEvent||'null');pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');}catch{}
 if(!event?.id||pending?.id!==event.id||Date.now()-pending.at>120000)return;
 try{sessionStorage.removeItem(pendingKey);}catch{}
 if(remember(event.id))void play(event.cue,{reward:true});
}
result();
// Decode lazily for a confirmed reward or an explicit Settings preview.
const settings=document.querySelector('[data-sound-settings]');
if(settings){
 const choice=settings.querySelector('[name="enabled"]'),range=settings.querySelector('[name="volume"]'),output=settings.querySelector('[data-sound-volume]');
 range.addEventListener('input',()=>{volume=Number(range.value);output.textContent=volume+'%';if(activeGain)activeGain.gain.value=volume/100*.74;});
 choice.addEventListener('change',()=>{enabled=choice.value==='1';if(!enabled&&active)try{active.stop();}catch{}unlock();});
 settings.querySelector('[data-sound-preview]')?.addEventListener('click',()=>{unlock();if(choice.value==='1')void play('achievement',{preview:true,reward:true});else settings.querySelector('[data-sound-status]').textContent='Choose Enabled to preview sound. Changes save automatically.';});
}
// Income is sounded only for a newly observed, committed Land journal after
// this page opened. Initial/historical receipts and ordinary gold changes do not.
let incomeCursor=document.querySelector('[data-income-receipt]')?.dataset.incomeReceipt||null;const openedAt=Date.parse(document.querySelector('[data-server-time]')?.dataset.serverTime||'');
document.addEventListener('realm-state',event=>{const receipt=event.detail?.incomeReceipt;if(!receipt)return;const prior=incomeCursor;incomeCursor=receipt.id;if(prior!==receipt.id&&Date.parse(receipt.createdAt)>=openedAt&&remember('income:'+receipt.id))void play('income',{reward:true});});
document.addEventListener('kingdom-action-error',()=>void play('error'));
const preferenceKey='kingdom-sound-preference:'+identity;
try{localStorage.setItem(preferenceKey,JSON.stringify({enabled,volume}));}catch{}
document.addEventListener('kingdom-preference-saved',event=>{const saved=event.detail;if(!['0','1'].includes(saved?.enabled)||!Number.isInteger(saved.volume)||saved.volume<0||saved.volume>100)return;try{localStorage.setItem(preferenceKey,JSON.stringify({enabled:saved.enabled==='1',volume:saved.volume}));}catch{}});
function savedPreference(){try{const saved=JSON.parse(localStorage.getItem(preferenceKey)||'null');if(typeof saved?.enabled==='boolean'&&Number.isInteger(saved.volume)&&saved.volume>=0&&saved.volume<=100){enabled=saved.enabled;volume=saved.volume;if(activeGain)activeGain.gain.value=enabled?volume/100*.74:0;if(!enabled&&active)active.stop();if(settings){settings.querySelector('[name="enabled"]').value=enabled?'1':'0';settings.querySelector('[name="volume"]').value=String(volume);settings.querySelector('[data-sound-volume]').textContent=volume+'%';}}}catch{}}
window.addEventListener('storage',event=>{if(event.key===preferenceKey)savedPreference();});
window.addEventListener('pageshow',event=>{departing=false;if(event.persisted)savedPreference();});
window.addEventListener('pagehide',()=>{departing=true;generation++;waiting=null;document.querySelector('[data-play-result]')?.remove();if(active)try{active.stop();}catch{}active=null;activeGain=null;const old=context;context=null;spritePromise=null;if(old&&old.state!=='closed')void old.close().catch(()=>{});});

// Cancel pending decode/resume work on suspension; foreground/history restoration
// never resumes a cue. A subsequent confirmed event needs a new playback attempt.
document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;if(active)try{active.stop();}catch{}active=null;activeGain=null;}});
