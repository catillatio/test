// Inspection/disclosures only; authoritative stats and ownership are rendered by the server.
const previews=[...document.querySelectorAll('[data-equipment-preview]')];
for(const item of previews){
 const summary=item.querySelector('summary'),panel=item.querySelector('.equipment-preview-content');if(!summary||!panel)continue;
 let restoring=false;
 const place=()=>{if(!item.open)return;panel.style.transform='none';const rect=panel.getBoundingClientRect(),bottom=window.innerHeight-(document.querySelector('.primary-nav')?.getBoundingClientRect().height||64)-8;
  const x=rect.right>innerWidth-8?innerWidth-8-rect.right:rect.left<8?8-rect.left:0;
  const y=rect.bottom>bottom?-(rect.height+summary.getBoundingClientRect().height):0;
  panel.style.transform=`translate(${x}px,${y}px)`;
 };
 const open=()=>{for(const other of previews)if(other!==item)other.open=false;item.open=true;place();};
 const close=(focus=false)=>{restoring=true;item.open=false;if(focus)summary.focus({preventScroll:true});restoring=false;};
 summary.addEventListener('focus',()=>{if(!restoring&&summary.matches(':focus-visible'))open();});
 item.addEventListener('pointerenter',()=>{if(matchMedia('(hover:hover) and (pointer:fine)').matches)open();});
 item.addEventListener('pointerleave',()=>{if(!item.contains(document.activeElement))close();});
 item.addEventListener('focusout',event=>{if(!item.contains(event.relatedTarget))close();});
 item.addEventListener('toggle',()=>{if(item.open){for(const other of previews)if(other!==item)other.open=false;place();}});
 item.querySelector('[data-equipment-close]')?.addEventListener('click',()=>close(true));
 item.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(true);}});
 document.addEventListener('click',event=>{if(!item.contains(event.target))close();});
 window.addEventListener('resize',place);
}

// Home unread means a real incoming attack or comment, not an outgoing action.
// Recruitment badges remain until the pending request is acted on or canceled.
const badges=[...document.querySelectorAll('[data-notification-badge]')];
const paintAttention=data=>{for(const badge of badges){const key=badge.dataset.notificationBadge,count=Number(data[key])||0;badge.hidden=count===0;badge.querySelector('[data-notification-number]').textContent=count>99?'99+':String(count);badge.querySelector('[data-notification-label]').textContent=count+' '+(key==='army'?'pending incoming requests':'unread personal events');}};
let refreshing=false;
async function refreshAttention(){if(document.hidden||refreshing||reading)return;refreshing=true;try{const response=await fetch('/api/v1/notifications',{credentials:'same-origin',cache:'no-store'});if(response.ok)paintAttention(await response.json());}catch{}finally{refreshing=false;if(pendingRead.size&&!readTimer)readTimer=setTimeout(readSeen,350);}}
const pendingRead=new Map();let readTimer=null,reading=false;
async function readSeen(){
 readTimer=null;if(reading||refreshing||document.hidden||!pendingRead.size)return;
 const csrf=document.querySelector('input[name="csrf"]')?.value;if(!csrf)return;
 const entries=[...pendingRead.entries()].slice(0,40);let delivered=false;reading=true;
 try{const response=await fetch('/api/v1/notifications/read',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json','x-csrf-token':csrf},body:JSON.stringify({events:entries.map(([,e])=>e)})});
  if(response.ok){delivered=true;paintAttention(await response.json());for(const [id] of entries)pendingRead.delete(id);for(const element of document.querySelectorAll('[data-notification-event]')){try{const e=JSON.parse(element.dataset.notificationEvent);if(entries.some(([key])=>key===e.kind+':'+e.id))delete element.dataset.notificationEvent;}catch{}}if(!document.querySelector('[data-notification-event]'))for(const form of document.querySelectorAll('.notification-read-form'))form.hidden=true;}
 }catch{}finally{reading=false;if(delivered&&pendingRead.size)readTimer=setTimeout(readSeen,250);}
}
let attentionObserver=null;
if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting||document.hidden)continue;try{const event=JSON.parse(entry.target.dataset.notificationEvent);pendingRead.set(event.kind+':'+event.id,event);observer.unobserve(entry.target);}catch{}}if(pendingRead.size&&!readTimer)readTimer=setTimeout(readSeen,350);},{threshold:0.5});attentionObserver=observer;for(const entry of document.querySelectorAll('[data-notification-event]'))observer.observe(entry);}
function rescanAttention(){if(attentionObserver)for(const entry of document.querySelectorAll('[data-notification-event]')){attentionObserver.unobserve(entry);attentionObserver.observe(entry);}}
window.addEventListener('pageshow',event=>{if(event.persisted){rescanAttention();void refreshAttention();void readSeen();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){rescanAttention();void refreshAttention();void readSeen();}});
window.addEventListener('online',()=>{void refreshAttention();void readSeen();});

// Switch direction without discarding either quantity, command ID or recovery state.
for(const panel of document.querySelectorAll('.market-bulk-panel')){
 const tabs=panel.querySelector('[data-bulk-tabs]'),buttons=[...panel.querySelectorAll('[data-bulk-mode-tab]')],forms=[...panel.querySelectorAll('[data-bulk-mode]')];if(!tabs||buttons.length!==2||forms.length!==2)continue;
 const key='kingdom-bulk-mode:'+document.querySelector('[data-character-id]')?.dataset.characterId+':'+location.pathname+':'+forms[0].querySelector('[data-definition-id]')?.dataset.definitionId;
 function choose(mode,focus=false){for(const button of buttons){const current=button.dataset.bulkModeTab===mode;button.setAttribute('aria-selected',String(current));button.tabIndex=current?0:-1;if(current&&focus)button.focus();}for(const form of forms){form.hidden=form.dataset.bulkMode!==mode;form.setAttribute('role','tabpanel');form.setAttribute('aria-labelledby','bulk-tab-'+form.dataset.bulkMode);}try{sessionStorage.setItem(key,mode);}catch{}}
 tabs.hidden=false;panel.classList.add('bulk-enhanced');let initial='buy';try{if(sessionStorage.getItem(key)==='sell')initial='sell';}catch{}choose(initial);
 for(const button of buttons){button.addEventListener('click',()=>choose(button.dataset.bulkModeTab));button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();choose(event.key==='Home'?'buy':event.key==='End'?'sell':button.dataset.bulkModeTab==='buy'?'sell':'buy',true);}});}
}
