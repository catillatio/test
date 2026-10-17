// Estimates countdowns; all resources, rewards and action eligibility come from
// authenticated server state. No timers create gold, Mana, Spirit or Health.
const root=document.querySelector('[data-realm-state]');
if(root){
  let serverTime=Date.parse(root.dataset.serverTime),synced=performance.now(),version=Number(root.dataset.stateVersion),inFlight=false,retryAt=0;
  let attackReady=Date.parse(root.dataset.attackReady||root.dataset.serverTime);
  const text=(selector,value)=>document.querySelectorAll(selector).forEach(element=>{element.textContent=String(value);});
  function apply(state){
    if(!state||!Number.isSafeInteger(state.stateVersion)||state.stateVersion<version||!Number.isFinite(Date.parse(state.serverTime)))return;
    version=state.stateVersion;serverTime=Date.parse(state.serverTime);synced=performance.now();attackReady=Date.parse(state.attackReadyAt);
    text('[data-wallet-gold]',Number(state.gold).toLocaleString('en'));text('[data-level]',state.level);text('[data-level-xp]',state.levelXp);text('[data-level-required]',state.levelRequirement);
    const xp=document.querySelector('[data-xp-meter]');if(xp){xp.max=state.levelRequirement;xp.value=state.levelXp;}
    for(const name of ['health','mana','spirit']){
      const maximum=state['max'+name[0].toUpperCase()+name.slice(1)];
      text('[data-resource-value="'+name+'"]',state[name]);text('[data-resource-max="'+name+'"]',maximum);
      const meter=root.querySelector('[data-resource-meter="'+name+'"]');if(meter){meter.max=maximum;meter.value=state[name];}
      const timer=root.querySelector('[data-recovery="'+name+'"]');if(timer)timer.dataset.next=state[name+'NextAt']||'';
    }
    for(const button of document.querySelectorAll('[data-quest-run]')){const quest=state.quests.find(q=>q.id===button.dataset.questRun);if(quest)button.disabled=!quest.ready;}
    text('[data-connection-status]','');tick();
  }
  async function refresh(){
    if(inFlight||document.hidden||performance.now()<retryAt)return;
    inFlight=true;retryAt=performance.now()+5000;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{const response=await fetch('/api/v1/me',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('refresh');apply((await response.json()).state);}
    catch{text('[data-connection-status]','Connection interrupted. Your progress stays on the server.');retryAt=performance.now()+15000;}
    finally{clearTimeout(timeout);inFlight=false;}
  }
  function tick(){
    const now=serverTime+performance.now()-synced;let due=false;
    for(const timer of root.querySelectorAll('[data-recovery]')){
      const next=Date.parse(timer.dataset.next||'');if(!Number.isFinite(next)){timer.textContent='Full';continue;}
      const seconds=Math.max(0,Math.ceil((next-now)/1000));timer.textContent=seconds?String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):'Checking…';if(!seconds)due=true;
    }
    const hp=Number(root.querySelector('[data-resource-value="health"]')?.textContent),spirit=Number(root.querySelector('[data-resource-value="spirit"]')?.textContent);
    for(const button of document.querySelectorAll('button[data-attack-ready]'))button.disabled=button.dataset.attackReady!=='true'||hp<20||spirit<1||now<attackReady;
    if(due)void refresh();
  }
  document.addEventListener('realm-state',event=>apply(event.detail));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  setInterval(tick,1000);setInterval(()=>{if(!document.querySelector('[data-land-screen]'))void refresh();},30000);tick();
}
