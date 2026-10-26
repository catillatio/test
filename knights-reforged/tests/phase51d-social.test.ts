import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';import {notificationSummary} from '../src/notifications.js';
import {createApp} from '../src/app.js';import {createSession} from '../src/auth.js';import {loadConfig} from '../src/config.js';
import {provisionBots} from '../src/development.js';
const skip=!testDatabaseUrl;

test('human acceptance notifies only the inviter, survives retries/sessions/restarts and acknowledges exact owned events',{skip},async()=>{
 const r=await realm({isolated:true,clock:()=>new Date('2038-01-01')});try{
  const inviter=await r.player('Éowyn ⚔️'),acceptor=await r.player('勇者 🐉'),outsider=await r.player('Spectator');
  await r.ok(inviter,'/api/v1/army/invitations',{targetCharacterId:acceptor.id});
  assert.equal((await notificationSummary(r.db,acceptor.id)).army,1);
  const key=randomUUID(),accepted=await Promise.all([r.ok(acceptor,'/api/v1/army/acceptances',{targetCharacterId:inviter.id},key),r.ok(acceptor,'/api/v1/army/acceptances',{targetCharacterId:inviter.id},key)]);
  assert.equal(accepted[0].commandId,accepted[1].commandId);
  const events=(await r.db.query("SELECT * FROM army_events WHERE kind='accepted' AND command_id=$1",[key])).rows;assert.equal(events.length,1);
  const event=events[0]!;assert.equal(event.actor_id,acceptor.id);assert.equal(event.target_id,inviter.id);
  assert.equal((await notificationSummary(r.db,inviter.id)).home,1);assert.equal((await notificationSummary(r.db,acceptor.id)).home,0);assert.equal((await notificationSummary(r.db,acceptor.id)).army,0);
  const home=await r.app.inject({url:'/game/home',headers:{cookie:inviter.cookie}});assert.match(home.body,/勇者 🐉<\/a> accepted your army invitation/);assert.ok(home.body.includes('/game/players/'+acceptor.id));assert.match(home.body,/\/game\/army\?tab=dashboard/);assert.ok(home.body.includes('army_accepted'));
  assert.equal((await notificationSummary(r.db,inviter.id)).home,1,'GET never acknowledges');
  const ack={kind:'army_accepted',id:event.id};
  await r.ok(outsider,'/api/v1/notifications/read',{events:[ack],characterId:inviter.id});assert.equal((await notificationSummary(r.db,inviter.id)).home,1);
  const bad=await r.app.inject({method:'POST',url:'/api/v1/notifications/read',headers:{cookie:inviter.cookie,origin:'https://evil.invalid','x-csrf-token':inviter.csrf},payload:{events:[ack]}});assert.equal(bad.statusCode,403);
  const noCsrf=await r.app.inject({method:'POST',url:'/api/v1/notifications/read',headers:{cookie:inviter.cookie,origin:'http://localhost:3000'},payload:{events:[ack]}});assert.equal(noCsrf.statusCode,403);
  await Promise.all([r.ok(inviter,'/api/v1/notifications/read',{events:[ack]}),r.ok(inviter,'/api/v1/notifications/read',{events:[ack]})]);
  assert.equal((await notificationSummary(r.db,inviter.id)).home,0);assert.equal((await r.db.query("SELECT count(*)::int n FROM notification_reads WHERE character_id=$1 AND kind='army_accepted'",[inviter.id])).rows[0]!.n,1);
  const session=await createSession(r.db,inviter.accountId),next=await createApp({db:r.db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000'})});
  try{const response=await next.inject({url:'/api/v1/notifications',headers:{cookie:'kr_session='+session.token}});assert.equal(response.statusCode,200);assert.equal(response.json().home,0);}finally{await next.close();}
  assert.equal((await r.command(acceptor,'/api/v1/army/acceptances',{targetCharacterId:inviter.id})).statusCode,403);
 }finally{await r.close();}
});

test('Recruit navigation opens the intact Dashboard with invitations, allies, statistics and readable activity',{skip},async()=>{
 const r=await realm({isolated:true,clock:()=>new Date('2038-01-01')});try{
  const a=await r.player('Dashboard Owner'),b=await r.player('Invited Ally'),c=await r.player('Incoming Ally');
  await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id});await r.ok(b,'/api/v1/army/acceptances',{targetCharacterId:a.id});await r.ok(c,'/api/v1/army/invitations',{targetCharacterId:a.id});
  const home=await r.app.inject({url:'/game/home',headers:{cookie:a.cookie}});assert.match(home.body,/href="\/game\/army\?tab=dashboard" data-notification-tab="army"/);assert.match(home.body,/1 pending incoming requests/);
  const page=await r.app.inject({url:'/game/army?tab=dashboard',headers:{cookie:a.cookie}});assert.equal(page.statusCode,200);for(const text of ['Army Dashboard','accepted allies','incoming invitations','participating','Recent Army Activity','Invited Ally','Incoming Ally'])assert.ok(page.body.includes(text),text);
  assert.ok(page.body.includes('army_accepted'));assert.match(page.body,/Mark shown events read/);
  for(const tab of ['recruit','army','dashboard'])assert.equal((await r.app.inject({url:'/game/army?tab='+tab,headers:{cookie:a.cookie}})).statusCode,200);
  const event=(await r.db.query("SELECT id FROM army_events WHERE actor_id=$1 AND target_id=$2 AND kind='accepted'",[b.id,a.id])).rows[0]!;
  const posted=await r.app.inject({method:'POST',url:'/game/notifications/read',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{csrf:a.csrf,events:JSON.stringify([{kind:'army_accepted',id:event.id}]),returnTo:'/game/army?tab=dashboard'}});assert.equal(posted.statusCode,303);assert.equal(posted.headers.location,'/game/army?tab=dashboard');
  assert.equal((await notificationSummary(r.db,a.id)).home,0);assert.equal((await notificationSummary(r.db,a.id)).army,1,'unresolved invitation remains separate');
 }finally{await r.close();}
});

test('immediate development-bot acceptance never creates redundant Home unread events',{skip,timeout:90000},async()=>{
 const r=await realm({isolated:true,clock:()=>new Date('2038-01-01'),developmentBotsEnabled:true,developmentBotRecruitmentEnabled:true});try{
  const a=await r.player('Bot Ally Reader');await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  const bot=(await r.db.query('SELECT character_id FROM development_bots WHERE active ORDER BY character_id LIMIT 1')).rows[0]!.character_id;
  const result=await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:bot});assert.equal(result.data.armyEvent,'accepted');
  assert.equal((await notificationSummary(r.db,a.id)).home,0);assert.equal((await notificationSummary(r.db,a.id)).army,0);
  const event=(await r.db.query("SELECT id,actor_id,target_id FROM army_events WHERE command_id=$1",[result.commandId])).rows[0]!;assert.equal(event.actor_id,a.id);assert.equal(event.target_id,bot);
  await r.ok(a,'/api/v1/notifications/read',{events:[{kind:'army_accepted',id:event.id}]});assert.equal((await r.db.query("SELECT count(*)::int n FROM notification_reads WHERE kind='army_accepted'")).rows[0]!.n,0);
 }finally{await r.close();}
});

test('new Unicode names and social validation share authoritative rules, audited refusal and safe HTML/API rendering',{skip},async()=>{
 const r=await realm({isolated:true,clock:()=>new Date('2038-01-01')});try{
  const a=await r.player('E\u0301owyn ⚔️'),b=await r.player('Social Visitor');assert.equal((await r.me(a)).name,'Éowyn ⚔️');await r.prepare(a,0,100);for(let i=0;i<5;i++)await r.ok(a,'/api/v1/quests/border-patrol/runs');
  const key=randomUUID();for(let i=0;i<2;i++){const bad=await r.command(a,'/api/v1/comments',{profileId:b.id,body:'f\u200bag'},key);assert.equal(bad.statusCode,422);assert.equal(bad.json().error.code,'CONTENT_POLICY');}
  assert.equal((await r.db.query('SELECT count(*)::int n FROM content_policy_rejections WHERE command_id=$1',[key])).rows[0]!.n,1);assert.equal((await r.db.query('SELECT count(*)::int n FROM realm_messages')).rows[0]!.n,0);
  assert.equal((await r.command(a,'/api/v1/broadcasts',{body:'SH1T'})).statusCode,422);
  const allowed=await r.ok(a,'/api/v1/comments',{profileId:b.id,body:'Scunthorpe, Nigel & <img onerror="bad()"> 🐉'});assert.ok(allowed.data.messageId);
  const profile=await r.app.inject({url:'/game/players/'+b.id+'?tab=comments',headers:{cookie:a.cookie}});assert.match(profile.body,/Scunthorpe, Nigel &amp; &lt;img/);assert.doesNotMatch(profile.body,/<img onerror/);
  const publicProfile=await r.app.inject({url:'/api/v1/players/'+a.id,headers:{cookie:b.cookie}});assert.ok(publicProfile.body.includes('Éowyn ⚔️'));assert.ok(!publicProfile.body.includes(a.accountId));
  await r.prepare(b,0,100);const battle=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});
  for(const url of ['/game/battles/'+battle.battleId,'/game/home','/game/champions?category=level']){const view=await r.app.inject({url,headers:{cookie:a.cookie}});assert.equal(view.statusCode,200);assert.ok(view.body.includes('Éowyn ⚔️'),url);}
  const form=await r.app.inject({url:'/register'}),cookie=String(form.headers['set-cookie']).split(';')[0]!,csrf=/name="csrf" value="([a-f0-9]+)"/.exec(form.body)![1]!;
  const rejected=await r.app.inject({method:'POST',url:'/register',headers:{cookie,origin:'http://localhost:3000'},payload:{csrf,username:'blocked_'+randomUUID().slice(0,8),name:'ＦＡＧ',password:'Phase51dAccount!2026'}});assert.equal(rejected.statusCode,422);
  const audit=(await r.db.query('SELECT scope,policy_id,rule_id FROM content_policy_rejections ORDER BY scope')).rows;assert.equal(audit.length,3);assert.ok(audit.every(row=>row.policy_id==='realm-content-1'));
  for(const url of ['/login','/register','/game/home','/game/profile','/game/army?tab=dashboard','/rules']){const view=await r.app.inject({url,headers:url.startsWith('/game/')?{cookie:a.cookie}:{}});assert.equal(view.statusCode,200,url);assert.ok(view.body.includes('Kingdom Come'));assert.doesNotMatch(view.body,/>[^<]*Knights Reforged/);}
 }finally{await r.close();}
});
