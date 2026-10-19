// Keep the marketplace in place on expiry, offline errors and an ambiguous POST.
// Retrying a pending purchase uses its original immutable command/intent.
const actor=document.querySelector('[data-character-id]')?.dataset.characterId;
for(const form of document.querySelectorAll('form:has([data-quantity-control])')){
 const control=form.querySelector('[data-quantity-control]'),button=form.querySelector('[type="submit"]');
 const key='kingdom-market-pending:'+actor+':'+form.getAttribute('action')+':'+control.dataset.definitionId;
 let busy=false,pending=null;
 const message=document.createElement('p');message.className='market-feedback field-hint';message.setAttribute('role','status');form.append(message);
 const retry=document.createElement('button');retry.type='button';retry.className='button button-outline';retry.textContent='Check / Retry Safely';retry.hidden=true;form.append(retry);
 try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.id&&saved?.fields){pending=saved;retry.hidden=false;message.textContent='An earlier action needs confirmation. Check it safely before buying or selling again.';}}catch{}
 const forget=()=>{pending=null;retry.hidden=true;try{sessionStorage.removeItem(key);}catch{}};
 function feedback(text,error=false){message.textContent=text;if(error)document.dispatchEvent(new CustomEvent('kingdom-action-error'));}
 async function run(retrying=false){
  if(busy)return;if(pending&&!retrying){feedback('Check the earlier request first. It may already have completed.');return;}
  busy=true;form.setAttribute('aria-busy','true');retry.disabled=true;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
   feedback('Checking your current balance and purchase details…');
   const response=await fetch('/api/v1/me',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
   if(!response.ok){
    if(response.status===401){feedback('Your session ended. Sign in, then return here; your quantity is saved.');const link=document.createElement('a');link.className='text-link';link.href='/login?returnTo='+encodeURIComponent(location.pathname+location.search+location.hash);link.textContent='Sign in and return';message.append(' ',link);return;}
    throw new Error('State unavailable');
   }
   const current=await response.json();if(current.state?.id!==actor){feedback('A different character is signed in. Open this marketplace again before continuing.',true);return;}
   if(!pending){
    const fields=Object.fromEntries(new FormData(form));delete fields.csrf;
    pending={id:fields.commandId,fields};try{sessionStorage.setItem(key,JSON.stringify(pending));}catch{}
   }
   document.dispatchEvent(new CustomEvent('realm-state',{detail:current.state}));
   const fields=new URLSearchParams({...pending.fields,csrf:current.csrfToken});
   feedback('Completing your trade…');
   const resultResponse=await fetch(form.getAttribute('action'),{method:'POST',credentials:'same-origin',headers:{accept:'application/json','content-type':'application/x-www-form-urlencoded'},body:fields,signal:controller.signal});
   if(resultResponse.status>=500)throw new Error('Completion unknown');
   const result=await resultResponse.json();
   if(!resultResponse.ok){forget();form.querySelector('[name="commandId"]').value=crypto.randomUUID();feedback(result.error?.message||'Review the current price and try again.',true);return;}
   feedback(result.message);forget();
   // Native destination uses the durable receipt. Its sound marker was saved
   // by the initial user submission, so historical visits remain silent.
   const destination=result.kind==='buy'||result.kind==='land_buy'?'/game/purchases/'+result.commandId:
    result.kind==='land_sell'?'/game/land?command='+result.commandId:'/game/armory?category='+encodeURIComponent(result.data?.category||'weapon')+'&command='+result.commandId;
   location.assign(destination);
  }catch{retry.hidden=false;feedback(pending?'Connection interrupted. This action may have completed. Check / Retry Safely uses the same request, so it cannot charge twice.':'Connection interrupted. Your menu and quantity are still here.',true);}
  finally{clearTimeout(timeout);busy=false;form.removeAttribute('aria-busy');delete form.dataset.submitting;retry.disabled=false;}
 }
 form.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();void run();},true);
 retry.addEventListener('click',()=>void run(true));
}
