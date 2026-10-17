// Presentation only. Every submitted command is still validated and committed
// on the server. Reusing a submitted form ID returns the same saved transaction.
document.querySelectorAll('form[method="post"]').forEach(form=>{
  form.addEventListener('submit',event=>{
    if(form.dataset.submitting==='true'){event.preventDefault();return;}
    form.dataset.submitting='true';form.setAttribute('aria-busy','true');
    // Do not disable the successful submitter or change hidden fields here.
    // Native navigation, validation, cookies and CSRF keep their usual behavior.
  });
});
window.addEventListener('pageshow',()=>document.querySelectorAll('form[data-submitting]').forEach(form=>{delete form.dataset.submitting;form.removeAttribute('aria-busy');}));
const target=document.querySelector('[data-combat-target]');
if(target){
  let pending=false;
  async function refreshCombat(){
    if(pending||document.hidden)return;pending=true;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch('/api/v1/players/'+encodeURIComponent(target.dataset.combatTarget)+'/combat',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if(!response.ok)return;
      const payload=await response.json(),combat=payload.combatTarget;
      const button=target.querySelector('button[data-attack-ready]');
      target.querySelector('[data-target-health]').textContent=String(combat.health);target.querySelector('[data-target-max-health]').textContent=String(combat.maxHealth);
      const meter=target.querySelector('[data-target-meter]');meter.max=combat.maxHealth;meter.value=combat.health;
      button.dataset.attackReady=combat.eligible?'true':'false';button.disabled=!combat.allowed;
      target.querySelector('[data-combat-restriction]').textContent=combat.reason||'Ready. Each attack costs 1 Spirit and starts the existing 10-second cooldown.';
      document.dispatchEvent(new CustomEvent('realm-state',{detail:payload.state}));
    }catch{/* Resource refresh displays connection failures; never guess eligibility. */}
    finally{clearTimeout(timeout);pending=false;}
  }
  setInterval(refreshCombat,10000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCombat();});
}
