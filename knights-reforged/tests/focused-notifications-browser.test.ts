import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {realm} from './helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {notificationSummary,acknowledgeNotifications,unreadNotificationPage} from '../src/notifications.js';
import {mkdir,writeFile} from 'node:fs/promises';

test('viewed historical notifications recover failed acknowledgments and reconcile other tabs without clearing invitations',{timeout:90000},async()=>{
 let now=new Date('2032-02-01T12:00:00Z');const r=await realm({isolated:true,clock:()=>now}),browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config});const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
 const out='test-results/focused-followup';await mkdir(out,{recursive:true});
 try{
  const owner=await r.player('Notification Knight'),other=await r.player('Messenger Knight'),inviter=await r.player('Waiting Ally');
  for(const p of [owner,other,inviter])await r.prepare(p,1000,30);
  await r.ok(inviter,'/api/v1/army/invitations',{targetCharacterId:owner.id});
  const time=new Date(+now+1000),ids:string[]=[];
  async function letter(body:string,profile=owner.id,at=time){const id=randomUUID();await r.db.query("INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$3,'comment',$4,'community-0.1',$5,$6)",[id,other.id,profile,body,randomUUID(),at]);return id;}
  for(let i=0;i<5;i++)ids.push(await letter('Older incoming letter '+(i+1)));
  for(let i=0;i<25;i++)await r.db.query("INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$2,'comment',$3,'community-0.1',$4,$5)",[randomUUID(),owner.id,'Newer own journal '+i,randomUUID(),new Date(+time+1000)]);
  now=new Date(+now+3600000);
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await context.addCookies([{name:'kr_session',value:owner.cookie.slice('kr_session='.length),url:origin,httpOnly:true,sameSite:'Lax'}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();await page.goto(origin+'/game/home');assert.equal(await page.locator('[data-notification-badge=home] [data-notification-number]').innerText(),'5');assert.equal(await page.locator('[data-notification-event]').count(),0);
  await page.screenshot({path:out+'/notifications-5-home.png'});
  const requests:string[][]=[];let failTransport=true;
  await page.route('**/api/v1/notifications/read',async route=>{const events=route.request().postDataJSON().events as {id:string}[];requests.push(events.map(e=>e.id));if(failTransport){await route.abort('failed');}else await route.continue();});
  await page.getByRole('link',{name:/View 5 unread personal events/}).click();for(const heading of await page.locator('[data-notification-event] h3').all()){await heading.scrollIntoViewIfNeeded();await page.waitForTimeout(150);}
  await page.waitForTimeout(600);assert.ok(requests.length>0);failTransport=false;
  await page.waitForFunction(()=>document.querySelector('[data-notification-badge=home]')?.hasAttribute('hidden'),{},{timeout:9000});
  assert.ok(requests.length>=2,'The same visible document retries after a failed transport without navigation/online events');assert.ok(requests.flat().every(id=>ids.includes(id)));
  assert.equal((await notificationSummary(r.db,owner.id)).home,0);assert.equal((await notificationSummary(r.db,owner.id)).army,1);assert.equal((await r.db.query('SELECT count(*)::int n FROM notification_reads WHERE character_id=$1',[owner.id])).rows[0]!.n,5);
  await page.screenshot({path:out+'/notifications-0-viewed.png'});await page.unroute('**/api/v1/notifications/read');
  // A stale read in one visible tab must wake another visible document. The
  // synthetic visibility shim models side-by-side windows, not a navigation.
  const watch=await context.newPage();await watch.addInitScript(()=>Object.defineProperty(document,'hidden',{get:()=>false}));
  const lost=await letter('Lost acknowledgment');await watch.goto(origin+'/game/home?feed=battles');assert.equal(await watch.locator('[data-notification-badge=home] [data-notification-number]').innerText(),'1');
  let lostOnce=false;await page.route('**/api/v1/notifications/read',async route=>{if(!lostOnce){lostOnce=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await page.bringToFront();await page.goto(origin+'/game/notifications');await page.waitForFunction(()=>document.querySelector('[data-notification-badge=home]')?.hasAttribute('hidden'),{},{timeout:9000});
  await watch.waitForFunction(()=>document.querySelector('[data-notification-badge=home]')?.hasAttribute('hidden'),{},{timeout:4000});assert.equal((await r.db.query('SELECT count(*)::int n FROM notification_reads WHERE character_id=$1 AND event_id=$2',[owner.id,lost])).rows[0]!.n,1);
  // Foreign IDs and stale page cursors cannot acknowledge another account.
  const late=await letter('Late commit shares earlier timestamp');await acknowledgeNotifications(r.db,other.id,[{kind:'comment',id:late}]);assert.equal((await notificationSummary(r.db,owner.id)).home,1);
  assert.deepEqual((await unreadNotificationPage(r.db,owner.id)).entries.map(e=>e.id),[late]);
  await context.close();const restarted=await browser.newContext({viewport:{width:390,height:844}});await restarted.addCookies([{name:'kr_session',value:owner.cookie.slice('kr_session='.length),url:origin,httpOnly:true,sameSite:'Lax'}]);const fresh=await restarted.newPage();await fresh.goto(origin+'/game/notifications');await fresh.waitForFunction(()=>document.querySelector('[data-notification-badge=home]')?.hasAttribute('hidden'));assert.equal((await notificationSummary(r.db,owner.id)).army,1);
  await restarted.close();
  // Persistent provider failures stop after the initial attempt + three bounded
  // retries. A visible owner action retries the same IDs without marking all.
  const blocked=await letter('Temporary server failure');const retryContext=await browser.newContext({viewport:{width:390,height:844}});await retryContext.addCookies([{name:'kr_session',value:owner.cookie.slice('kr_session='.length),url:origin,httpOnly:true,sameSite:'Lax'}]);const retryPage=await retryContext.newPage();let failures=0,unavailable=true;
  await retryPage.route('**/api/v1/notifications/read',route=>{failures++;return unavailable?route.fulfill({status:failures===2||failures===3?200:503,contentType:'application/json',body:failures===3?'{':'{}'}):route.continue();});
  await retryPage.goto(origin+'/game/notifications');await retryPage.locator('[data-notification-read-status]').waitFor({state:'visible',timeout:12000});assert.equal(failures,4);await retryPage.waitForTimeout(1000);assert.equal(failures,4);assert.equal((await notificationSummary(r.db,owner.id)).home,1);
  await retryPage.screenshot({path:out+'/notifications-bounded-retry.png'});unavailable=false;await retryPage.locator('[data-notification-read-retry]').click();await retryPage.waitForFunction(()=>document.querySelector('[data-notification-badge=home]')?.hasAttribute('hidden'));assert.equal((await r.db.query('SELECT count(*)::int n FROM notification_reads WHERE character_id=$1 AND event_id=$2',[owner.id,blocked])).rows[0]!.n,1);await retryContext.close();
  await writeFile(out+'/notification-evidence.json',JSON.stringify({oldOffPage:5,viewed:0,markAllUsed:false,failedTransportRetried:true,lostAcknowledgmentIdempotent:true,otherVisibleTabReconciled:true,lateSameTimestampPreserved:true,foreignReadRejected:true,sessionRestart:true,pendingInvitations:1,boundedAttempts:4,explicitRetryWorks:true,productionBadgeInspected:false},null,2)+'\n');
 }finally{await browser.close();await app.close();await r.close();}
});

test('unread keyset pages retain exact IDs across duplicate timestamps, stale cursors and a late commit',{timeout:30000},async()=>{
 const now=new Date('2032-02-01T12:00:00Z'),r=await realm({isolated:true,clock:()=>now});
 try{
  const owner=await r.player('Page Knight'),other=await r.player('Page Messenger'),ids:string[]=[];
  for(let i=0;i<45;i++){const id=randomUUID();ids.push(id);await r.db.query("INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$3,'comment','Synthetic letter','community-0.1',$4,$5)",[id,other.id,owner.id,randomUUID(),now]);}
  const first=await unreadNotificationPage(r.db,owner.id);assert.equal(first.entries.length,20);assert.ok(first.nextCursor);
  await acknowledgeNotifications(r.db,owner.id,first.entries.map(e=>({id:e.id,kind:e.kind})));
  const second=await unreadNotificationPage(r.db,owner.id,first.nextCursor!);assert.equal(second.entries.length,20);assert.ok(second.nextCursor);
  const third=await unreadNotificationPage(r.db,owner.id,second.nextCursor!);assert.equal(third.entries.length,5);assert.equal(third.nextCursor,null);
  assert.deepEqual([...first.entries,...second.entries,...third.entries].map(e=>e.id).sort(),ids.sort());
  assert.equal((await unreadNotificationPage(r.db,other.id,first.nextCursor!)).entries.length,0);
  const late=randomUUID(),client=await r.db.connect();
  try{await client.query('BEGIN');await client.query("INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$3,'comment','Late letter','community-0.1',$4,$5)",[late,other.id,owner.id,randomUUID(),now]);
   await acknowledgeNotifications(r.db,owner.id,[...second.entries,...third.entries].map(e=>({id:e.id,kind:e.kind})));assert.equal((await notificationSummary(r.db,owner.id)).home,0);await client.query('COMMIT');
  }finally{await client.query('ROLLBACK');client.release();}
  assert.deepEqual((await unreadNotificationPage(r.db,owner.id)).entries.map(e=>e.id),[late]);
  await acknowledgeNotifications(r.db,owner.id,first.entries.map(e=>({id:e.id,kind:e.kind})));assert.equal((await notificationSummary(r.db,owner.id)).home,1,'Old page replay cannot consume the late commit');
 }finally{await r.close();}
});
