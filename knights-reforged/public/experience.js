// Celebration replay changes presentation only, never gold, XP or achievements.
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
for(const panel of document.querySelectorAll('[data-celebration-id]')){
 const key='kingdom-come-celebration:'+panel.dataset.celebrationId;
 let seen=false;try{seen=sessionStorage.getItem(key)==='1';sessionStorage.setItem(key,'1');}catch{}
 if(!seen&&!reduced){panel.classList.add('is-celebrating');panel.addEventListener('animationend',()=>panel.classList.remove('is-celebrating'),{once:true});}
}
for(const button of document.querySelectorAll('[data-back-to-market]'))button.addEventListener('click',()=>history.back());
for(const picker of document.querySelectorAll('.region-filter')){
 picker.querySelector('summary')?.addEventListener('keydown',event=>{if(event.key==='Escape'){picker.open=false;event.currentTarget.focus();}});
 picker.addEventListener('keydown',event=>{if(event.key==='Escape'){picker.open=false;picker.querySelector('summary')?.focus();}});
 document.addEventListener('click',event=>{if(picker.open&&!picker.contains(event.target))picker.open=false;});
}
