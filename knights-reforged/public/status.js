// Context panels and one explicitly requested, idempotent healing transaction.
// No timer or animation awards resources. An interrupted heal keeps its action ID.
const statusRoot=document.querySelector('[data-realm-state]');
if(statusRoot){
 const form=statusRoot.querySelector('[data-heal-form]'),message=statusRoot.querySelector('[data-heal-message]');
 const put=(selector,value)=>statusRoot.querySelectorAll(selector).forEach(element=>element.textContent=String(value));
 const number=value=>Number(value).toLocaleString('en');
 let version=Number(statusRoot.dataset.stateVersion),latest=Date.parse(statusRoot.dataset.serverTime);
 function paint(state){
  const stamp=Date.parse(state?.serverTime);if(!Number.isSafeInteger(state?.stateVersion)||state.stateVersion<version||!Number.isFinite(stamp)||(state.stateVersion===version&&stamp<latest))return;
  version=state.stateVersion;latest=stamp;const hp=state.healing,p=state.payment;if(!hp||!p)return;
  put('[data-heal-current]',hp.health);put('[data-heal-maximum]',hp.maxHealth);put('[data-heal-missing]',hp.missing);put('[data-heal-cost]',number(hp.cost));put('[data-heal-unit]',hp.unitCost);
  if(form){form.querySelector('[name="maxCost"]').value=String(hp.cost);form.querySelector('[type="submit"]').disabled=!hp.missing||!hp.affordable;}
  for(const [selector,value] of [['gross',p.gross],['property-upkeep',p.propertyUpkeep],['equipment-upkeep',p.equipmentUpkeep],['prepaid',p.prepaidUpkeep],['net',p.gold],['economic-net',p.economicNet]])put('[data-payment-'+selector+']',number(value));
  put('[data-payment-retained]',p.retainedGold);put('[data-payment-partial]',p.partial?'New holdings earn a prorated first period.':'');
  const time=statusRoot.querySelector('[data-payment-time]');if(time){time.dateTime=p.nextAt||'';time.textContent=p.nextAt?new Date(p.nextAt).toLocaleString('en-GB',{timeZone:'UTC'}):'No Land owned';}
  const empty=statusRoot.querySelector('[data-payment-no-land]');if(empty)empty.hidden=!!p.nextAt;
 }
 document.addEventListener('realm-state',event=>paint(event.detail));
 const disclosures=[...statusRoot.querySelectorAll('.status-disclosure')];
 for(const panel of disclosures)panel.addEventListener('toggle',()=>{if(panel.open)for(const other of disclosures)if(other!==panel)other.open=false;});
 document.addEventListener('click',event=>{if(!statusRoot.contains(event.target))disclosures.forEach(panel=>panel.open=false);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const panel of disclosures)if(panel.open){panel.open=false;panel.querySelector('summary')?.focus();}});
 if(form){
  const pendingKey='kingdom-come-healing:'+statusRoot.dataset.characterId;
  const retry=document.createElement('button');retry.type='button';retry.className='button button-outline healing-retry';retry.textContent='Retry safely';retry.hidden=true;message.after(retry);
  let busy=false,pending=null;
  try{const stored=JSON.parse(sessionStorage.getItem(pendingKey)||'null');if(stored&&/^[a-f0-9-]{36}$/.test(stored.commandId)&&Number.isSafeInteger(stored.maxCost)&&stored.maxCost>=0){pending=stored;retry.hidden=false;message.textContent='An earlier healing request was not confirmed. Retry with the same action ID to check it safely.';}}catch{}
  const forget=()=>{pending=null;retry.hidden=true;try{sessionStorage.removeItem(pendingKey);}catch{}};
  async function heal(retrying=false){
   if(busy)return;busy=true;form.setAttribute('aria-busy','true');retry.disabled=true;
   if(!retrying||!pending)pending={commandId:form.querySelector('[name="commandId"]').value,maxCost:Number(form.querySelector('[name="maxCost"]').value)};
   try{sessionStorage.setItem(pendingKey,JSON.stringify(pending));}catch{}
   const body=new URLSearchParams({csrf:form.querySelector('[name="csrf"]').value,commandId:pending.commandId,maxCost:String(pending.maxCost)});
   message.textContent='Restoring Health…';
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
   try{
    const response=await fetch('/api/v1/health/restorations',{method:'POST',credentials:'same-origin',headers:{accept:'application/json','content-type':'application/x-www-form-urlencoded'},body,signal:controller.signal});
    const result=await response.json();
    if(!response.ok){forget();form.querySelector('[name="commandId"]').value=crypto.randomUUID();message.textContent=result.error?.message||'Healing could not complete. Refresh to review your current resources.';return;}
    document.dispatchEvent(new CustomEvent('realm-state',{detail:result.state}));message.textContent=result.message;forget();form.querySelector('[name="commandId"]').value=crypto.randomUUID();
   }catch{retry.hidden=false;message.textContent='Connection interrupted. Retry safely to confirm this same request; you will not be charged twice.';}
   finally{clearTimeout(timeout);busy=false;form.removeAttribute('aria-busy');retry.disabled=false;}
  }
  form.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();void heal(false);},true);
  retry.addEventListener('click',()=>void heal(true));
 }
}
