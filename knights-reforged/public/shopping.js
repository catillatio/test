// Display-only quantity selection. Server-owned prices and limits guide the
// controls; every POST rechecks wallet, level, ownership and the immutable catalog.
for(const control of document.querySelectorAll('[data-quantity-control]')){
 const form=control.closest('form'),input=control.querySelector('input[name="quantity"]'),minus=control.querySelector('[data-quantity-minus]'),plus=control.querySelector('[data-quantity-plus]'),total=control.querySelector('[data-quantity-total]'),submit=form?.querySelector('button[type="submit"]');
 if(!form||!input||!minus||!plus||!total||!submit)continue;
 const paint=()=>{const max=Number(control.dataset.max)||0,quantity=Math.max(1,Math.min(Math.max(1,max),Number(input.value)||1));input.value=String(quantity);input.max=String(Math.max(1,max));minus.disabled=quantity<=1;plus.disabled=quantity>=max;submit.disabled=max<1;const costs=JSON.parse(control.dataset.costSteps||'[]'),cost=costs[quantity-1];total.textContent=Number.isSafeInteger(cost)?cost.toLocaleString('en'):'—';};
 minus.addEventListener('click',()=>{input.value=String(Number(input.value)-1);paint();});plus.addEventListener('click',()=>{input.value=String(Number(input.value)+1);paint();});
 document.addEventListener('realm-state',event=>{const state=event.detail;if(!state)return;let max=0,costs=[];
  if(control.dataset.purchaseType==='land'){const property=state.land?.properties.find(p=>p.id===control.dataset.definitionId);if(!property)return;max=property.unlocked?property.maxAffordable:0;costs=property.priceSteps.map((_,i)=>property.priceSteps.slice(0,i+1).reduce((n,p)=>n+p,0));}
  else{const price=Number(control.dataset.unitPrice),owned=state.inventory.find(i=>i.id===control.dataset.definitionId)?.quantity??0;max=state.level>=Number(control.dataset.level)?Math.max(0,Math.min(100,1000-owned,Math.floor(state.gold/price))):0;costs=Array.from({length:Math.max(1,max)},(_,i)=>price*(i+1));}
  control.dataset.max=String(max);control.dataset.costSteps=JSON.stringify(costs);paint();
 });paint();
}
