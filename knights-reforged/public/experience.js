// Celebration replay changes presentation only, never gold, XP or achievements.
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
for(const panel of document.querySelectorAll('[data-celebration-id]')){
 const key='kingdom-come-celebration:'+panel.dataset.celebrationId;
 let seen=false;try{seen=sessionStorage.getItem(key)==='1';sessionStorage.setItem(key,'1');}catch{}
 if(!seen&&!reduced){panel.classList.add('is-celebrating');
  for(const counter of panel.querySelectorAll('[data-reward-count]')){
   const target=Number(counter.dataset.rewardCount),prefix=counter.dataset.prefix||'';if(!Number.isSafeInteger(target)||target<0)continue;
   const start=performance.now(),duration=550;
   function frame(now){const progress=Math.min(1,(now-start)/duration),value=Math.round(target*(1-(1-progress)**3));counter.textContent=prefix+value.toLocaleString('en');if(progress<1)requestAnimationFrame(frame);}
   requestAnimationFrame(frame);
  }
panel.addEventListener('animationend',()=>panel.classList.remove('is-celebrating'),{once:true});}
}
for(const button of document.querySelectorAll('[data-back-to-market]'))button.addEventListener('click',()=>history.back());
for(const picker of document.querySelectorAll('.region-filter')){
 picker.querySelector('summary')?.addEventListener('keydown',event=>{if(event.key==='Escape'){picker.open=false;event.currentTarget.focus();}});
 picker.addEventListener('keydown',event=>{if(event.key==='Escape'){picker.open=false;picker.querySelector('summary')?.focus();}});
 document.addEventListener('click',event=>{if(picker.open&&!picker.contains(event.target))picker.open=false;});
}
