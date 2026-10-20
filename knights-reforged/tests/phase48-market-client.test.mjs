import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
const executable=process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium';
const skip=!existsSync(executable);
const source=readFileSync(new URL('../public/market.js',import.meta.url),'utf8');
const origin='http://127.0.0.1:48148';
const identity='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const form=(bulk=false)=>`<form id="${bulk?'bulk':'single'}" method="post" action="/game/armory/buy" ${bulk?'':'data-market-form data-purchase-type="equipment" data-required-level="1" data-unit-price="5" data-max="20" data-definition-id="blade"'}>
<input name="csrf" value="old-token"><input name="commandId" value="${bulk?other:identity}"><input name="itemId" value="blade">
${bulk?'<div data-quantity-control data-max="20" data-definition-id="blade">':''}<input name="quantity" value="${bulk?'5':'1'}">${bulk?'</div>':''}<button type="submit">${bulk?'Buy More':'Buy'}</button></form>`;
async function fixture(t,options={}){
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage(),posts=[],reads=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin,'Synthetic test cannot contact another origin');
  if(url.pathname==='/api/v1/me'){
   reads.push(request.url());const status=options.readStatus??200;
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify({csrfToken:'fresh-token',state:{id:options.actor??'actor',level:5,gold:100,inventory:[]}})});return;
  }
  if(request.method()==='POST'){
   const fields=Object.fromEntries(new URLSearchParams(request.postData()));posts.push(fields);
   if(options.post)await options.post(route,posts.length,fields);
   else await route.fulfill({contentType:'application/json',body:JSON.stringify({kind:'buy',commandId:fields.commandId,message:'Purchased',data:{category:'weapon'}})});
   return;
  }
  await route.fulfill({contentType:'text/html',body:url.pathname.startsWith('/game/purchases/')?'<p>Receipt</p>':`<div data-character-id="actor"></div>${form()}${form(true)}`});
 });
 await page.goto(origin+'/game/armory');await page.addScriptTag({type:'module',content:source});
 await page.waitForFunction(()=>document.querySelectorAll('.market-feedback').length===2);
 t.after(()=>assert.deepEqual(errors,[]));return {page,posts,reads};
}
test('single and bulk forms share an in-flight lock and preserve the original one-item intent',{skip},async t=>{
 const f=await fixture(t);
 await f.page.evaluate(()=>{document.querySelector('#single').requestSubmit();document.querySelector('#bulk').requestSubmit();document.querySelector('#single').requestSubmit();});
 await f.page.waitForURL('**/game/purchases/**');assert.equal(f.reads.length,1);assert.equal(f.posts.length,1);
 assert.deepEqual(f.posts[0],{commandId:identity,itemId:'blade',quantity:'1',csrf:'fresh-token'});
});
test('ambiguous single-item response locks both controls; retry from bulk retains the original ID and quantity',{skip},async t=>{
 const f=await fixture(t,{post:async(route,n,fields)=>n===1?route.abort():route.fulfill({contentType:'application/json',body:JSON.stringify({kind:'buy',commandId:fields.commandId,message:'Same receipt'})})});
 await f.page.locator('#single [type=submit]').click();await f.page.locator('#single .market-retry:not([hidden])').waitFor();
 assert.equal(await f.page.locator('#bulk [type=submit]').isDisabled(),true);
 await f.page.locator('#bulk [name=quantity]').fill('10');
 await f.page.locator('#bulk .market-retry').click();await f.page.waitForURL('**/game/purchases/**');
 assert.equal(f.posts.length,2);assert.deepEqual(f.posts[1],f.posts[0]);assert.equal(f.posts[1].quantity,'1');
});
test('legacy Buy More controls retain bulk quantity and recoverable sign-in does not send a purchase',{skip},async t=>{
 const f=await fixture(t,{readStatus:401});await f.page.locator('#bulk [type=submit]').click();
 await f.page.locator('#bulk .market-feedback a').waitFor();assert.equal(f.posts.length,0);
 assert.equal(await f.page.locator('#bulk [name=quantity]').inputValue(),'5');
 assert.match(await f.page.locator('#bulk .market-feedback a').getAttribute('href'),/^\/login\?returnTo=/);
});
test('POST session expiry retains the ambiguous intent across reload, then rejects a changed signed-in identity',{skip},async t=>{
 const f=await fixture(t,{post:route=>route.fulfill({status:401,contentType:'application/json',body:'{}'})});
 await f.page.locator('#single [type=submit]').click();await f.page.locator('#single .market-feedback a').waitFor();
 assert.equal(f.posts.length,1);await f.page.reload();await f.page.addScriptTag({type:'module',content:source});
 await f.page.locator('#single .market-retry:not([hidden])').waitFor();assert.equal(await f.page.locator('#single [type=submit]').isDisabled(),true);
 await f.page.route('**/api/v1/me',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({csrfToken:'new',state:{id:'different-character'}})}));
 await f.page.locator('#single .market-retry').click();await f.page.waitForFunction(()=>document.querySelector('#single .market-feedback').textContent.includes('different character'));
 assert.equal(f.posts.length,1);
});
