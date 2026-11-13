import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {homeThemeSemantics} from './home-theme-semantics.js';

const origin='http://127.0.0.1:43210';
const event={kind:'comment',id:'11111111-1111-4111-8111-111111111111'};
const batch='22222222-2222-4222-8222-222222222222';
function markup(unread:number,army=1) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <header><span data-wallet-gold>1000</span><span data-resource-value>10</span></header>
    <main><h1>Home</h1><section class="home-activity"><h2>Recent Activity</h2>
      <article ${unread?`data-notification-event='${JSON.stringify(event)}'`:''}><h3>Incoming letter</h3><p>A synthetic message.</p></article>
      ${unread?`<form method="post" action="/game/notifications/read" class="notification-read-form"><input name="csrf" value="synthetic-csrf" type="hidden"><input name="events" value="fixture" type="hidden"><button>Mark shown events read</button><small>Only the personal events displayed on this page.</small></form>
      <div data-personal-notification-tools><a href="/game/notifications" data-personal-events-link>View ${unread} unread personal events ›</a><form method="post" action="/game/notifications/read-all"><input name="csrf" value="synthetic-csrf" type="hidden"><input name="batchId" value="${batch}" type="hidden"><button type="submit">Mark all current personal events as read</button></form></div>`:''}
      <p data-notification-read-status hidden>Viewed events could not be marked read. <button data-notification-read-retry>Retry</button></p>
    </section></main>
    <nav><a href="/game/home">Home<span data-notification-badge="home" ${unread?'':'hidden'}><b data-notification-number>${unread}</b><span data-notification-label>${unread} unread personal events</span></span></a><a href="/game/army">Army<span data-notification-badge="army"><b data-notification-number>${army}</b><span data-notification-label>${army} pending incoming requests</span></span></a></nav>
  </body></html>`;
}

test('theme semantics canonicalize only correctly acknowledged notification DOM',{timeout:30000},async t=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    await t.test('actual notification client acknowledgment equals a fresh zero-unread render',async()=>{
      const context=await browser.newContext({viewport:{width:1024,height:1000}}),page=await context.newPage();
      let unread=5;
      const readRequests:unknown[]=[];
      await context.route('**/*',async route=>{
        const path=new URL(route.request().url()).pathname;
        if(path==='/')return route.fulfill({contentType:'text/html',body:markup(unread)});
        if(path==='/api/v1/notifications/read'){
          readRequests.push(route.request().postDataJSON());unread=0;
          return route.fulfill({contentType:'application/json',body:JSON.stringify({home:0,army:1})});
        }
        if(path==='/api/v1/notifications')return route.fulfill({contentType:'application/json',body:JSON.stringify({home:unread,army:1})});
        await route.abort();
      });
      try {
        await page.goto(origin);
        const live=await page.evaluate(homeThemeSemantics);
        assert.ok(live.links.some(link=>link.text==='View 5 unread personal events ›'));
        assert.ok(live.forms.some(form=>form.action==='/game/notifications/read-all'));
        await page.addScriptTag({content:await readFile('public/player-experience.js','utf8')});
        await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-personal-notification-tools]')?.hidden&&document.querySelector<HTMLFormElement>('.notification-read-form')?.hidden);
        const html=await page.content(),acknowledged=await page.evaluate(homeThemeSemantics);
        assert.equal(await page.content(),html,'snapshotting never changes the real DOM');
        assert.equal(await page.locator('[data-personal-events-link]').textContent(),'View 0 unread personal events ›');
        assert.ok(await page.locator('[data-personal-notification-tools]').isHidden());
        assert.ok(await page.locator('[data-personal-notification-tools] button').isDisabled());
        assert.equal(await page.locator('[data-notification-badge=army] [data-notification-number]').textContent(),'1');
        assert.deepEqual(readRequests,[{events:[event]}],'only the visible event is acknowledged; no mark-all command is sent');
        await page.goto(origin);
        assert.equal(await page.locator('[data-personal-notification-tools]').count(),0);
        assert.deepEqual(await page.evaluate(homeThemeSemantics),acknowledged);
      } finally {await context.close();}
    });
    await t.test('live unread controls, invitations, financial values and other hidden forms remain compared',async()=>{
      const context=await browser.newContext(),page=await context.newPage();
      await context.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:markup(5)}));
      try {
        await page.goto(origin);
        const before=await page.evaluate(homeThemeSemantics);
        await page.setContent(markup(6));assert.notDeepEqual(await page.evaluate(homeThemeSemantics),before);
        await page.setContent(markup(5,2));assert.notDeepEqual(await page.evaluate(homeThemeSemantics),before);
        await page.setContent(markup(5));
        await page.locator('[data-wallet-gold]').evaluate(e=>{e.textContent='1001';});
        assert.notDeepEqual(await page.evaluate(homeThemeSemantics),before);
        await page.setContent(markup(5));
        await page.locator('[data-personal-notification-tools] form').evaluate(e=>e.setAttribute('action','/wrong-command'));
        assert.notDeepEqual(await page.evaluate(homeThemeSemantics),before);
        await page.setContent(markup(0)+'<form hidden action="/game/vault/deposit" method="post"><input name="amount" value="7"></form>');
        assert.ok((await page.evaluate(homeThemeSemantics)).forms.some(form=>form.action==='/game/vault/deposit'));
      } finally {await context.close();}
    });
    for(const defect of ['nonzero unread','enabled action','visible Home badge','wrong action','wrong link','malformed nonce'])
      await t.test('hidden personal tools cannot hide a regression: '+defect,async()=>{
        const context=await browser.newContext(),page=await context.newPage();
        await context.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:markup(5)}));
        try {
          await page.goto(origin);
          await page.evaluate(defect=>{
            const tools=document.querySelector<HTMLElement>('[data-personal-notification-tools]')!;
            const form=tools.querySelector<HTMLFormElement>('form')!;
            tools.hidden=true;form.hidden=true;form.querySelector<HTMLButtonElement>('button')!.disabled=true;
            tools.querySelector('[data-personal-events-link]')!.textContent='View 0 unread personal events ›';
            document.querySelector<HTMLElement>('[data-notification-badge=home]')!.hidden=true;
            if(defect==='nonzero unread')tools.querySelector('[data-personal-events-link]')!.textContent='View 5 unread personal events ›';
            if(defect==='enabled action')form.querySelector<HTMLButtonElement>('button')!.disabled=false;
            if(defect==='visible Home badge')document.querySelector<HTMLElement>('[data-notification-badge=home]')!.hidden=false;
            if(defect==='wrong action')form.setAttribute('action','/wrong-command');
            if(defect==='wrong link')tools.querySelector('a')!.setAttribute('href','/wrong-destination');
            if(defect==='malformed nonce')form.querySelector<HTMLInputElement>('[name=batchId]')!.value='invalid';
          },defect);
          await assert.rejects(page.evaluate(homeThemeSemantics),/Hidden personal notification controls|Read snapshot nonce is malformed/);
        } finally {await context.close();}
      });
  } finally {await browser.close();}
});
