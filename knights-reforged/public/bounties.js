// Quotes come from the server. This script never calculates fees or moves gold.
const form=document.querySelector('[data-bounty-quote]');
if(form){
  const input=form.querySelector('input[name="amount"]'),fee=form.querySelector('[data-bounty-fee]'),total=form.querySelector('[data-bounty-total]'),status=form.querySelector('[data-bounty-quote-status]'),quotaBox=document.querySelector('[data-bounty-quotas]');
  function showQuota(quota){
    if(!quotaBox)return;
    const line=document.createElement('p');
    line.textContent=quota?'Your placements on this target: '+quota.sponsorTarget.remaining+' / '+quota.sponsorTarget.limit+' remaining. All sponsors on this target: '+quota.target.remaining+' / '+quota.target.limit+' remaining in the rolling 24 hours.':'Reload for current remaining placements; availability must be checked again.';
    quotaBox.replaceChildren(line);
    if(quota)for(const [bucket,label] of [[quota.sponsorTarget,'Your sponsor-target limit'],[quota.target,'The target-wide limit']])if(bucket.nextAvailableAt){const next=document.createElement('p'),time=document.createElement('time');time.dateTime=bucket.nextAvailableAt;time.textContent=new Date(bucket.nextAvailableAt).toLocaleString('en-GB',{timeZone:'UTC'})+' UTC';next.append(label+' next permits a placement at ',time,', subject to a fresh server check.');quotaBox.append(next);}
  }
  let timer,controller,revision=0;
  async function quote(version){
    const current=new AbortController();controller=current;const timeout=setTimeout(()=>current.abort(),8000);
    try{
      const query=new URLSearchParams({targetCharacterId:form.dataset.bountyQuote,amount:input.value});
      const response=await fetch('/api/v1/bounties/quote?'+query,{credentials:'same-origin',cache:'no-store',signal:current.signal});
      const payload=await response.json();if(version!==revision)return;
      if(!response.ok){status.textContent=payload.error?.message||'Review availability before confirming.';fee.textContent='Shown on Review';total.textContent='Shown on Review';showQuota(null);return;}
      fee.textContent=payload.quote.fee.toLocaleString('en')+' gold';total.textContent=payload.quote.total.toLocaleString('en')+' gold';
      showQuota(payload.quote.quotas);
      status.textContent='Server quote. Nothing is charged until confirmation.';
    }catch{
      if(version!==revision)return;
      fee.textContent='Shown on Review';total.textContent='Shown on Review';
      showQuota(null);
      status.textContent='Quote unavailable. Review will recheck the exact total.';
    }finally{clearTimeout(timeout);}
  }
  function changed(){
    clearTimeout(timer);controller?.abort();const version=++revision;
    fee.textContent='Shown on Review';total.textContent='Shown on Review';status.textContent='';
    if(input.disabled||!input.validity.valid)return;
    status.textContent='Requesting server quote…';timer=setTimeout(()=>void quote(version),250);
  }
  input.addEventListener('input',changed);changed();
  window.addEventListener('pagehide',()=>{clearTimeout(timer);revision++;controller?.abort();});
  window.addEventListener('pageshow',changed);
}
