import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {soundFeedback} from '../src/sound.js';
import {moderateMessage} from '../src/community.js';

test('ordinary actions have no sound hint; confirmed rewards keep priority and actual success cues',()=>{
 for(const kind of['profile','sound','skill','tutorial','invite','invite_code','social_report','social_remove'])assert.equal(soundFeedback({commandId:'receipt',kind,data:{}},null,'a'),null,kind);
 assert.equal(soundFeedback({commandId:'receipt',kind:'buy',data:{}},null,'a')?.cue,'equipment');
 assert.equal(soundFeedback({commandId:'receipt',kind:'profile',data:{newAchievements:['first']}},null,'a')?.cue,'achievement');
 assert.equal(soundFeedback({commandId:'receipt',kind:'invite',data:{armyEvent:'accepted'}},null,'a')?.cue,'alliance');
});
test('Calling moves to Home with fixed return navigation; existing cost, cooldown, CSRF and receipt protections remain',{skip:!testDatabaseUrl},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Home Calling Review');await r.prepare(a,500,30);
  const home=await r.app.inject({url:'/game/home',headers:{cookie:a.cookie}});assert.equal(home.statusCode,200);assert.match(home.body,/calling-menu-link/);assert.doesNotMatch(home.body,/id="calling-choice"/);
  const opened=await r.app.inject({url:'/game/home?calling=1',headers:{cookie:a.cookie}});assert.equal(opened.statusCode,200);assert.match(opened.body,/id="calling-choice"/);assert.match(opened.body,/name="returnTo" value="home"/);
  const me=await r.app.inject({url:'/game/profile',headers:{cookie:a.cookie}});assert.equal(me.statusCode,200);assert.doesNotMatch(me.body,/id="calling-choice"/);assert.match(me.body,/Sign Out/);assert.match(me.body,/data-profile-stats/);assert.match(me.body,/data-profile-income/);
  const before=await r.me(a),commandId=randomUUID(),payload={csrf:a.csrf,commandId,className:'Spellward',returnTo:'home'};
  const change=()=>r.app.inject({method:'POST',url:'/game/profile/calling',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload});
  const first=await change();assert.equal(first.statusCode,303);assert.equal(first.headers.location,'/game/home?calling=1&command='+commandId+'#calling');
  assert.equal((await change()).headers.location,first.headers.location);assert.equal((await r.me(a)).gold,before.gold);
  const external=await r.app.inject({method:'POST',url:'/game/profile/calling',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{...payload,returnTo:'https://untrusted.invalid/'}});assert.equal(external.statusCode,303);assert.equal(external.headers.location,'/game/profile?command='+commandId+'#account');
  assert.equal((await r.db.query('SELECT count(*)::int n FROM calling_changes WHERE character_id=$1',[a.id])).rows[0]!.n,1);
  const denied=await r.command(a,'/api/v1/profile',{className:'Warden'});assert.equal(denied.statusCode,409);
  const csrf=await r.app.inject({method:'POST',url:'/game/profile/calling',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{...payload,commandId:randomUUID(),csrf:'bad'}});assert.equal(csrf.statusCode,403);
 }finally{await r.close();}
});
test('reported broadcasts stay visible to others; one audited operator hide removes only its exact ID from both feeds',{skip:!testDatabaseUrl},async()=>{
 const r=await realm({isolated:true});try{
  const author=await r.player('Moderation Author Fixture'),reporter=await r.player('Moderation Reporter Fixture');await r.prepare(author,1000,30);await r.prepare(reporter,1000,30);
  for(let i=0;i<5;i++)await r.ok(author,'/api/v1/quests/border-patrol/runs');
  const original=await r.ok(author,'/api/v1/broadcasts',{body:'Exact synthetic message for single-record moderation.'}),id=original.data.messageId;
  await r.ok(reporter,'/api/v1/social/reports',{messageId:id,reason:'abuse'});
  const page=await r.app.inject({url:'/game/home?feed=broadcasts',headers:{cookie:reporter.cookie}});assert.equal(page.statusCode,200);assert.match(page.body,/Reported for review/);assert.doesNotMatch(page.body,/>Remove<\/button>/);
  const own=await r.app.inject({url:'/game/home?feed=broadcasts',headers:{cookie:author.cookie}});assert.match(own.body,/>Remove<\/button>/);
  const forged=await r.command(reporter,'/api/v1/social/removals',{messageId:id});assert.equal(forged.statusCode,403);
  // Existing operator service function in an isolated synthetic test only.
  const other=randomUUID();await r.db.query("INSERT INTO realm_messages(id,author_id,channel,body,status,ruleset_id,command_id,created_at) VALUES($1,$2,'broadcast','Unrelated synthetic broadcast','visible','community-0.1',$3,now())",[other,author.id,randomUUID()]);
  const accounts=(await r.db.query('SELECT * FROM accounts ORDER BY id')).rows;
  await moderateMessage(r.db,{action:'hide',messageId:id,operator:'test-owner',reason:'Explicit synthetic single-record authorization'});
  for(const feed of['all','broadcasts']){const response=await r.app.inject({url:'/api/v1/feed?feed='+feed,headers:{cookie:reporter.cookie}});assert.equal(response.statusCode,200);assert.ok(!response.json().entries.some((e:any)=>e.id===id));assert.ok(response.json().entries.some((e:any)=>e.id===other));}
  assert.equal((await r.db.query('SELECT status FROM realm_messages WHERE id=$1',[id])).rows[0]!.status,'hidden');
  assert.equal((await r.db.query("SELECT count(*)::int n FROM social_moderation WHERE message_id=$1 AND action='operator_hide'",[id])).rows[0]!.n,1);assert.deepEqual((await r.db.query('SELECT * FROM accounts ORDER BY id')).rows,accounts);
 }finally{await r.close();}
});
