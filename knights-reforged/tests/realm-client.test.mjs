import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/realm.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const timestamp='2026-10-17T12:00:00.000Z';
const node=(extra={})=>({textContent:'',dataset:{},...extra});
function browser(fetch,{land=false}={}){
  let elapsed=0;const intervals=[],listeners=new Map(),requests=[];
  const root=node({dataset:{serverTime:timestamp,stateVersion:'5',attackReady:timestamp}}),wallet=node({textContent:'60'});
  const values={health:node({textContent:'60'}),mana:node({textContent:'10'}),spirit:node({textContent:'0'})};
  const timers=Object.fromEntries(['health','mana','spirit'].map(name=>[name,node({dataset:{next:name==='mana'?'2026-10-17T12:00:05.000Z':''}})]));
  const meters=Object.fromEntries(['health','mana','spirit'].map(name=>[name,node()]));
  const xp=node(),level=node(),quest=node({dataset:{questRun:'border-patrol'},disabled:false}),attack=node({dataset:{attackReady:'true'},disabled:true}),status=node();
  root.querySelector=selector=>{
    for(const name of ['health','mana','spirit']){
      if(selector==='[data-resource-value="'+name+'"]')return values[name];
      if(selector==='[data-resource-meter="'+name+'"]')return meters[name];
      if(selector==='[data-recovery="'+name+'"]')return timers[name];
    }
    return null;
  };
  root.querySelectorAll=selector=>selector==='[data-recovery]'?Object.values(timers):[];
  const document={hidden:false,querySelector:selector=>selector==='[data-realm-state]'?root:selector==='[data-land-screen]'&&land?{}:selector==='[data-xp-meter]'?xp:null,
    querySelectorAll:selector=>{
      if(selector==='[data-wallet-gold]')return [wallet];if(selector==='[data-level]')return [level];
      if(selector==='[data-quest-run]')return [quest];if(selector==='button[data-attack-ready]')return [attack];
      if(selector==='[data-connection-status]')return [status];
      for(const name of ['health','mana','spirit'])if(selector==='[data-resource-value="'+name+'"]')return [values[name]];
      return [];
    },addEventListener:(name,fn)=>listeners.set(name,fn)};
  runInNewContext(source,{document,performance:{now:()=>elapsed},AbortController,
    fetch:async(url,options)=>{requests.push({url,options});return fetch();},
    setTimeout:()=>1,clearTimeout:()=>{},setInterval:(callback,delay)=>intervals.push({callback,delay})});
  return {wallet,values,timers,meters,xp,level,quest,attack,status,requests,document,listeners,
    tick(ms){elapsed+=ms;intervals.find(t=>t.delay===1000).callback();},
    poll(){intervals.find(t=>t.delay===30000).callback();},
    apply(state){listeners.get('realm-state')({detail:state});}};
}
const state=(extra={})=>({stateVersion:6,serverTime:'2026-10-17T12:00:05.000Z',attackReadyAt:timestamp,gold:72,level:2,levelXp:3,levelRequirement:18,
  health:70,maxHealth:110,mana:11,maxMana:21,spirit:1,maxSpirit:3,healthNextAt:null,manaNextAt:'2026-10-17T12:05:05.000Z',spiritNextAt:null,
  quests:[{id:'border-patrol',ready:true}],...extra});
const response=body=>({ok:true,json:async()=>({state:body})});

test('resource countdowns never mint resources; overlapping due ticks send one authenticated read',async()=>{
  let finish;const page=browser(()=>new Promise(resolve=>{finish=resolve;}));
  page.tick(5000);page.tick(1000);assert.equal(page.requests.length,1);assert.equal(page.values.mana.textContent,'10');assert.equal(page.wallet.textContent,'60');
  finish(response(state()));await flush();
  assert.equal(page.wallet.textContent,'72');assert.equal(page.values.mana.textContent,'11');assert.equal(page.meters.mana.max,21);assert.equal(page.attack.disabled,false);
  assert.equal(page.requests[0].url,'/api/v1/me');assert.equal(page.requests[0].options.credentials,'same-origin');
});
test('stale or malformed state cannot rewind the resource header or quest eligibility',()=>{
  const page=browser(async()=>response(state()));page.apply(state());page.apply(state({stateVersion:4,gold:0,mana:0}));page.apply(state({stateVersion:undefined,gold:0}));
  assert.equal(page.wallet.textContent,'72');assert.equal(page.values.mana.textContent,'11');assert.equal(page.quest.disabled,false);
  page.apply(state({stateVersion:7,mana:0,spirit:0,quests:[{id:'border-patrol',ready:false}]}));assert.equal(page.quest.disabled,true);assert.equal(page.attack.disabled,true);
});
test('offline fetch errors preserve state and reconnect uses a bounded retry',async()=>{
  let online=false;const page=browser(async()=>{if(!online)throw new Error('offline');return response(state());});page.poll();await flush();
  assert.equal(page.wallet.textContent,'60');assert.match(page.status.textContent,/Connection interrupted/);
  page.poll();assert.equal(page.requests.length,1);online=true;page.tick(16000);await flush();assert.equal(page.wallet.textContent,'72');
});
test('Land polling supplies header state without a duplicate periodic request',()=>{
  const page=browser(async()=>response(state()),{land:true});page.poll();assert.equal(page.requests.length,0);page.apply(state());assert.equal(page.level.textContent,'2');
});
