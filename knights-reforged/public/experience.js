// Reward totals remain exactly as rendered by the server. No count-up,
// pulsing celebration or other automatic presentation motion.
for(const button of document.querySelectorAll('[data-back-to-market]'))button.addEventListener('click',()=>history.back());
for(const picker of document.querySelectorAll('.region-filter')){
 picker.querySelector('summary')?.addEventListener('keydown',event=>{if(event.key==='Escape'){picker.open=false;event.currentTarget.focus();}});
 picker.addEventListener('keydown',event=>{if(event.key==='Escape'){picker.open=false;picker.querySelector('summary')?.focus();}});
 document.addEventListener('click',event=>{if(picker.open&&!picker.contains(event.target))picker.open=false;});
}
