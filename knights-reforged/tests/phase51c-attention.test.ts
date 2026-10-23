import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';import {notificationSummary,acknowledgeNotifications} from '../src/notifications.js';import {activityFeed} from '../src/feeds.js';
import {createApp} from '../src/app.js';import {createSession} from '../src/auth.js';import type {Database} from '../src/db.js';import {loadConfig} from '../src/config.js';
const skip=!testDatabaseUrl;
test('personal feed excludes global/bot activity; exact microsecond/ID pagination retains mixed relevant events',{skip},async()=>{
 const r=await realm({isolated:true,clock:()=>new Date('2038-01-01T00:00:00Z')});try{
  const a=await r.player('Feed Reader'),b=await r.player('Other Reader'),c=await r.player('Elsewhere');
  for(let i=0;i<25;i++)await r.db.query(`INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$3,'comment',$4,'community-0.1',$5,'2038-01-01T00:00:00.123456Z')`,[randomUUID(),i%2?a.id:b.id,i%2?b.id:a.id,'Relevant '+i,randomUUID()]);
  for(let i=0;i<5;i++)await r.db.query(`INSERT INTO realm_messages(id,author_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,'broadcast','Global only','community-0.1',$3,'2038-01-01')`,[randomUUID(),b.id,randomUUID()]);
  await r.ok(c,'/api/v1/comments',{profileId:c.id,body:'No personal connection'});
  await r.ok(b,'/api/v1/battles',{targetCharacterId:a.id});
  const first=await activityFeed(r.db,a.id,'all'),second=await activityFeed(r.db,a.id,'all',first.nextCursor!);
  const all=[...first.entries,...second.entries];assert.equal(all.length,26);assert.equal(new Set(all.map(e=>e.id)).size,26);assert.ok(all.every(e=>e.kind!=='broadcast'));assert.ok(all.some(e=>e.kind==='battle'));assert.equal((await activityFeed(r.db,a.id,'broadcasts')).entries.length,5);
  assert.equal((await activityFeed(r.db,c.id,'all')).entries.length,1);
 }finally{await r.close();}
});
test('incoming counts, exact acknowledgements, races, CSRF/Origin/IDOR and restart state remain authoritative',{skip},async()=>{
 const r=await realm({isolated:true,clock:()=>new Date('2038-01-01T00:00:00Z')});try{
  const a=await r.player('Attention Owner'),b=await r.player('Incoming Attacker'),other=await r.player('Attention Outsider');
  assert.deepEqual(await notificationSummary(r.db,a.id),{home:0,army:0,events:[]});
  const key=randomUUID();const comments=await Promise.all([r.ok(b,'/api/v1/comments',{profileId:a.id,body:'Hello <img onerror="bad()"> & Éowyn'},key),r.ok(b,'/api/v1/comments',{profileId:a.id,body:'Hello <img onerror="bad()"> & Éowyn'},key)]);assert.equal(comments[0].data.messageId,comments[1].data.messageId);
  const hit=await r.ok(b,'/api/v1/battles',{targetCharacterId:a.id});assert.equal((await notificationSummary(r.db,a.id)).home,2);assert.equal((await notificationSummary(r.db,b.id)).home,0);
  const report=await r.app.inject({url:'/game/battles/'+hit.battleId,headers:{cookie:a.cookie}});assert.match(report.body,/data-notification-event=/);assert.ok(report.body.includes('value="/game/battles/'+hit.battleId+'"'));assert.equal((await notificationSummary(r.db,a.id)).home,2,'GET itself never acknowledges activity');
  await r.ok(a,'/api/v1/comments',{profileId:a.id,body:'Own comment'});assert.equal((await notificationSummary(r.db,a.id)).home,2);
  const feed=await activityFeed(r.db,a.id,'all'),summary=await notificationSummary(r.db,a.id,feed.entries);assert.equal(summary.events.length,2);
  const forged=await r.app.inject({method:'POST',url:'/api/v1/notifications/read',headers:{cookie:a.cookie,origin:'https://evil.invalid','x-csrf-token':a.csrf},payload:{events:summary.events}});assert.equal(forged.statusCode,403);
  const missing=await r.app.inject({method:'POST',url:'/api/v1/notifications/read',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{events:summary.events}});assert.equal(missing.statusCode,403);
  await r.ok(other,'/api/v1/notifications/read',{events:summary.events,characterId:a.id});assert.equal((await notificationSummary(r.db,a.id)).home,2);
  await Promise.all([r.ok(a,'/api/v1/notifications/read',{events:[summary.events[0]]}),r.ok(a,'/api/v1/notifications/read',{events:[summary.events[0]]})]);assert.equal((await notificationSummary(r.db,a.id)).home,1);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM notification_reads WHERE character_id=$1',[a.id])).rows[0]!.n,1);
  const session=await createSession(r.db,a.accountId);const second=await r.app.inject({url:'/api/v1/notifications',headers:{cookie:'kr_session='+session.token}});assert.equal(second.statusCode,200);assert.equal(second.json().home,1);
  // A concurrent incoming event at the SAME timestamp is never swallowed by a watermark.
  const incoming=await r.ok(other,'/api/v1/comments',{profileId:a.id,body:'Arriving during acknowledgement'});
  await r.ok(a,'/api/v1/notifications/read',{events:summary.events});assert.equal((await notificationSummary(r.db,a.id)).home,1);
  const page=await r.app.inject({url:'/game/home',headers:{cookie:a.cookie}});assert.match(page.body,/Hello &lt;img/);assert.doesNotMatch(page.body,/<img onerror/);assert.match(page.body,/1 unread personal events/);
  const inviteKey=randomUUID();await Promise.all([r.ok(b,'/api/v1/army/invitations',{targetCharacterId:a.id},inviteKey),r.ok(b,'/api/v1/army/invitations',{targetCharacterId:a.id},inviteKey)]);assert.equal((await notificationSummary(r.db,a.id)).army,1);assert.equal((await notificationSummary(r.db,b.id)).army,0);
  const {app}=r;const next=await createApp({db:r.db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000'})});try{const resp=await next.inject({url:'/api/v1/notifications',headers:{cookie:a.cookie}});assert.equal(resp.statusCode,200);assert.equal(resp.json().home,1);assert.equal(resp.json().army,1);}finally{await next.close();}
  await r.ok(a,'/api/v1/army/rejections',{targetCharacterId:b.id});assert.equal((await notificationSummary(r.db,a.id)).army,0);
  await r.ok(a,'/api/v1/social/removals',{messageId:incoming.data.messageId});assert.equal((await notificationSummary(r.db,a.id)).home,0);
  assert.equal((await r.command(a,'/api/v1/notifications/read',{events:[{kind:'attack',id:'not-a-uuid'}]})).statusCode,422);
  assert.equal((await r.app.inject({url:'/api/v1/notifications'})).statusCode,401);
 }finally{await r.close();}
});

test('display acknowledgements bind both event kind and identity even when source tables share a UUID',{skip},async()=>{
 const r=await realm({isolated:true,clock:()=>new Date('2038-01-01')});try{
  const a=await r.player('Kind Reader'),b=await r.player('Kind Writer'),hit=await r.ok(b,'/api/v1/battles',{targetCharacterId:a.id});
  await r.db.query("INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$3,'comment','Shared UUID fixture','community-0.1',$4,'2038-01-01')",[hit.battleId,b.id,a.id,randomUUID()]);
  const failing:Database={query:(statement,values)=>r.db.query(statement,values),end:()=>Promise.resolve(),connect:async()=>{const client=await r.db.connect();return {query:async(statement,values)=>{if(statement.startsWith('INSERT INTO notification_reads')&&values?.[1]==='comment')throw new Error('Synthetic acknowledgement interruption');return client.query(statement,values);},release:()=>client.release()};}};
  await assert.rejects(acknowledgeNotifications(failing,a.id,[{kind:'attack',id:hit.battleId},{kind:'comment',id:hit.battleId}]),/Synthetic acknowledgement interruption/);assert.equal((await notificationSummary(r.db,a.id)).home,2);assert.equal((await r.db.query('SELECT count(*)::int n FROM notification_reads')).rows[0]!.n,0);
  const summary=await notificationSummary(r.db,a.id,[{id:hit.battleId,kind:'comment',data:{profileId:a.id,authorId:b.id}}]);assert.equal(summary.home,2);assert.deepEqual(summary.events,[{kind:'comment',id:hit.battleId}]);
  await acknowledgeNotifications(r.db,a.id,summary.events);assert.equal((await notificationSummary(r.db,a.id)).home,1);
 }finally{await r.close();}
});
