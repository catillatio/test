import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
const executable=process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium',skip=!existsSync(executable);
const source=readFileSync(new URL('../public/preferences.js',import.meta.url),'utf8');
const origin='http://127.0.0.1:48148';
async function fixture(t,options={}){
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage(),posts=[],errors=[];let active=0,maximum=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin);
  if(url.pathname==='/api/v1/me')return route.fulfill({status:options.readStatus??200,contentType:'application/json',body:JSON.stringify({csrfToken:'test-fresh',state:{id:options.identity??'actor'}})});
  if(request.method()==='POST'){
   const body=request.postDataJSON();posts.push({body,headers:request.headers()});active++;maximum=Math.max(maximum,active);
   try{if(options.post)await options.post(route,posts.length,body);else await route.fulfill({contentType:'application/json',body:JSON.stringify({kind:'sound',commandId:body.commandId})});}finally{active--;}
   return;
  }
  return route.fulfill({contentType:'text/html',body:`<div data-character-id="actor"></div><form data-sound-settings><select name="enabled"><option value="0">Muted</option><option value="1">Enabled</option></select><input name="volume" type="range" value="55"><button type="submit" data-preference-save>Save</button><p data-sound-status></p></form>`});
 });
 await page.goto(origin+'/game/settings');await page.addScriptTag({type:'module',content:source});
 await page.waitForFunction(()=>document.querySelector('form').dataset.autosave==='ready');
 t.after(()=>assert.deepEqual(errors,[]));
 const volume=async value=>page.locator('[name=volume]').evaluate((n,v)=>{n.value=String(v);n.dispatchEvent(new Event('change',{bubbles:true}));},value);
 const saved=()=>page.waitForFunction(()=>document.querySelector('[data-sound-status]').textContent==='Sound settings saved.');
 return {page,posts,volume,saved,maximum:()=>maximum};
}
test('sound autosave makes no initial write, debounces changes and uses fresh CSRF/idempotency',{skip},async t=>{
 const f=await fixture(t);await f.page.waitForTimeout(250);assert.equal(f.posts.length,0);
 await f.volume(36);await f.volume(37);await f.saved();assert.equal(f.posts.length,1);
 const {body,headers}=f.posts[0];assert.equal(body.volume,37);assert.equal(body.enabled,'0');assert.equal(headers['x-csrf-token'],'test-fresh');assert.equal(headers['idempotency-key'],body.commandId);
 assert.match(body.commandId,/^[a-f0-9-]{36}$/);assert.equal(await f.page.locator('[data-preference-save]').isVisible(),false);
});
test('changes made during a pending save serialize behind the original receipt',{skip},async t=>{
 let release;const wait=new Promise(resolve=>release=resolve);
 const f=await fixture(t,{post:async(route,n,body)=>{if(n===1)await wait;await route.fulfill({contentType:'application/json',body:JSON.stringify({kind:'sound',commandId:body.commandId})});}});
 await f.volume(20);await f.page.waitForFunction(()=>document.querySelector('form').hasAttribute('aria-busy'));
 await f.volume(30);release();await f.saved();assert.deepEqual(f.posts.map(p=>p.body.volume),[20,30]);assert.equal(f.maximum(),1);assert.notEqual(f.posts[0].body.commandId,f.posts[1].body.commandId);
});
test('ambiguous save retries the identical command and payload before saving a newer choice',{skip},async t=>{
 const f=await fixture(t,{post:async(route,n,body)=>n===1?route.abort():route.fulfill({contentType:'application/json',body:JSON.stringify({kind:'sound',commandId:body.commandId})})});
 await f.volume(25);await f.page.getByRole('button',{name:'Retry Save'}).waitFor();await f.volume(40);
 await f.page.getByRole('button',{name:'Retry Save'}).click();await f.saved();
 assert.equal(f.posts.length,3);assert.deepEqual(f.posts[0].body,f.posts[1].body);assert.equal(f.posts[2].body.volume,40);assert.notEqual(f.posts[2].body.commandId,f.posts[1].body.commandId);
});
for(const [name,options,expected] of [['expired session',{readStatus:401},/Sign in again/],['changed player',{identity:'other'},/signed-in player changed/]]){
 test('sound autosave fails safely on '+name+' and retains the selected value',{skip},async t=>{
  const f=await fixture(t,options);await f.volume(43);await f.page.getByRole('button',{name:'Retry Save'}).waitFor();assert.equal(f.posts.length,0);assert.equal(await f.page.locator('[name=volume]').inputValue(),'43');assert.match(await f.page.locator('[data-sound-status]').innerText(),expected);
 });
}
