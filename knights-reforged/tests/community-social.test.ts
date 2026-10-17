import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {moderateMessage} from '../src/community.js';
import {activityFeed} from '../src/feeds.js';
import {provisionBots} from '../src/development.js';
const skip=!testDatabaseUrl;
async function setup(){let now=new Date('2037-01-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now});return {...r,advance:(n:number)=>{now=new Date(+now+n*1000);}};}
test('profile comments and Home Comments share one persistent record, escape HTML, and cannot award resources',{skip},async()=>{
  const r=await setup();try{
    const author=await r.player('Comment Author'),host=await r.player('Profile Host'),outsider=await r.player();
    const before=await r.me(author),key=randomUUID(),body='<script>alert("realm")</script>\nHello & welcome';
    const posts=await Promise.all([r.ok(author,'/api/v1/comments',{profileId:host.id,body},key),r.ok(author,'/api/v1/comments',{profileId:host.id,body},key)]);
    assert.equal(posts[0].data.messageId,posts[1].data.messageId);
    const after=await r.me(author);assert.equal(after.gold,before.gold);assert.equal(after.xp,before.xp);assert.equal(after.mana,before.mana);
    for(const [viewer,path] of [[author,'/game/home?feed=comments'],[host,'/game/home?feed=comments'],[outsider,'/game/players/'+host.id+'?tab=comments']] as const){
      const response=await r.app.inject({method:'GET',url:path,headers:{cookie:viewer.cookie}});assert.equal(response.statusCode,200,response.body);
      assert.ok(response.body.includes('&lt;script&gt;')&&!response.body.includes('<script>alert'));assert.ok(response.body.includes('/game/players/'+author.id));
    }
    const rows=(await r.db.query('SELECT * FROM realm_messages WHERE author_id=$1',[author.id])).rows;assert.equal(rows.length,1);assert.equal(rows[0]!.body,body);
    assert.equal((await r.command(author,'/api/v1/comments',{profileId:host.id,body:'changed'},key)).statusCode,409);
  }finally{await r.close();}
});
test('message validation, concurrent cooldowns, deletion and rolling limits cannot be bypassed',{skip},async()=>{
  const r=await setup();try{
    const p=await r.player();
    for(const body of ['   ','x'.repeat(501),'Hi\u0000there','\u202Espoof'])assert.ok((await r.command(p,'/api/v1/comments',{profileId:p.id,body})).statusCode>=400);
    const posts=await Promise.all([r.command(p,'/api/v1/comments',{profileId:p.id,body:'First'}),r.command(p,'/api/v1/comments',{profileId:p.id,body:'Second'})]);
    assert.deepEqual(posts.map(p=>p.statusCode).sort(),[200,429]);
    const id=posts.find(p=>p.statusCode===200)!.json().data.messageId;
    await r.ok(p,'/api/v1/social/removals',{messageId:id});assert.equal((await r.command(p,'/api/v1/comments',{profileId:p.id,body:'Still cooling down'})).statusCode,429);
    r.advance(30);for(let i=1;i<40;i++){await r.ok(p,'/api/v1/comments',{profileId:p.id,body:'A diary entry '+i});r.advance(30);}
    assert.equal((await r.command(p,'/api/v1/comments',{profileId:p.id,body:'Over the limit'})).json().error.code,'SOCIAL_DAILY_LIMIT');
    r.advance(86400);assert.equal((await r.command(p,'/api/v1/comments',{profileId:p.id,body:'A new day'})).statusCode,200);
  }finally{await r.close();}
});
test('broadcasts are public newest-first, eligibility/cooldowns/limits apply, and messages never create gold or XP',{skip},async()=>{
  const r=await setup();try{
    const p=await r.player('Realm Herald'),viewer=await r.player();
    assert.equal((await r.command(p,'/api/v1/broadcasts',{body:'Too early'})).json().error.code,'BROADCAST_ELIGIBILITY');
    for(let i=0;i<3;i++)await r.ok(p,'/api/v1/quests/border-patrol/runs');const before=await r.me(p);
    for(let i=0;i<12;i++){await r.ok(p,'/api/v1/broadcasts',{body:'Herald message '+i});if(i===0)assert.equal((await r.command(p,'/api/v1/broadcasts',{body:'Too soon'})).statusCode,429);r.advance(120);}
    assert.equal((await r.command(p,'/api/v1/broadcasts',{body:'Thirteenth'})).json().error.code,'SOCIAL_DAILY_LIMIT');
    const feed=await activityFeed(r.db,viewer.id,'broadcasts');assert.equal(feed.entries.length,12);assert.equal(feed.entries[0]!.data.body,'Herald message 11');
    const after=await r.me(p);assert.equal(after.gold,before.gold);assert.equal(after.xp,before.xp);
    const page=await r.app.inject({method:'GET',url:'/game/home?feed=broadcasts',headers:{cookie:viewer.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/Herald message 11/);
  }finally{await r.close();}
});
test('author removal, profile-owner hiding, reports, and operator moderation enforce authority and retain audit records',{skip},async()=>{
  const r=await setup();try{
    const a=await r.player(),host=await r.player(),other=await r.player();
    const post=await r.ok(a,'/api/v1/comments',{profileId:host.id,body:'Review this message'}),messageId=post.data.messageId;
    assert.equal((await r.command(other,'/api/v1/social/removals',{messageId})).statusCode,403);
    assert.equal((await r.command(a,'/api/v1/social/reports',{messageId,reason:'spam'})).statusCode,422);
    await Promise.all([r.ok(other,'/api/v1/social/reports',{messageId,reason:'abuse'}),r.ok(other,'/api/v1/social/reports',{messageId,reason:'abuse'})]);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM social_reports WHERE message_id=$1',[messageId])).rows[0]!.n,1);
    assert.equal((await activityFeed(r.db,host.id,'comments')).entries.length,1); // report does not let brigades hide posts
    await r.ok(host,'/api/v1/social/removals',{messageId});assert.equal((await activityFeed(r.db,host.id,'comments')).entries.length,0);
    await moderateMessage(r.db,{messageId,action:'restore',operator:'Test operator',reason:'Reviewed acceptable'});
    assert.equal((await activityFeed(r.db,host.id,'comments')).entries.length,1);
    await moderateMessage(r.db,{messageId,action:'hide',operator:'Test operator',reason:'Review decision'});
    await moderateMessage(r.db,{characterId:a.id,action:'mute',operator:'Test operator',reason:'Repeated spam',hours:24});r.advance(30);
    assert.equal((await r.command(a,'/api/v1/comments',{profileId:host.id,body:'Muted'})).statusCode,403);
    // A mute restricts social writing, not the player's existing gameplay.
    await r.ok(a,'/api/v1/quests/border-patrol/runs');
    await moderateMessage(r.db,{characterId:a.id,action:'unmute',operator:'Test operator',reason:'Appeal resolved'});
    const second=await r.ok(a,'/api/v1/comments',{profileId:host.id,body:'Restored access'});
    await r.ok(a,'/api/v1/social/removals',{messageId:second.data.messageId});
    await assert.rejects(moderateMessage(r.db,{messageId:second.data.messageId,action:'restore',operator:'Test operator',reason:'Cannot undo deletion'}),/cannot be restored/);
    assert.ok((await r.db.query('SELECT count(*)::int AS n FROM social_moderation')).rows[0]!.n>=6);
  }finally{await r.close();}
});
test('message and mixed feeds paginate without repeats, keep incoming attacks relevant, and reject invalid cursors',{skip},async()=>{
  const r=await setup();try{
    const a=await r.player('Feed Knight'),b=await r.player('Feed Rival'),outsider=await r.player();
    for(let i=0;i<24;i++){await r.ok(b,'/api/v1/comments',{profileId:a.id,body:'Record '+i});r.advance(30);}
    const first=await activityFeed(r.db,a.id,'comments'),second=await activityFeed(r.db,a.id,'comments',first.nextCursor!);
    assert.equal(first.entries.length,20);assert.equal(second.entries.length,4);assert.equal(new Set([...first.entries,...second.entries].map(e=>e.id)).size,24);
    const incoming=await r.ok(b,'/api/v1/battles',{targetCharacterId:a.id});
    assert.ok((await activityFeed(r.db,a.id,'all')).entries.some(e=>e.id===incoming.battleId));
    assert.equal((await activityFeed(r.db,a.id,'battles')).entries.length,0);assert.equal((await activityFeed(r.db,b.id,'battles')).entries.length,1);
    assert.equal((await activityFeed(r.db,outsider.id,'all')).entries.length,0);
    for(const tab of ['all','battles','comments','broadcasts']){
      const page=await r.app.inject({method:'GET',url:'/game/home?feed='+tab,headers:{cookie:a.cookie}});assert.equal(page.statusCode,200,page.body);assert.ok(page.body.includes('aria-label="Activity categories"'));
    }
    await assert.rejects(activityFeed(r.db,a.id,'comments','bad'),/Invalid activity page/);
  }finally{await r.close();}
});
test('temporary rivals cannot post social content, receive profile comments or invitations',{skip},async()=>{
  const r=await setup();try{
    await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});const a=await r.player();
    const bot=(await r.db.query('SELECT character_id FROM development_bots LIMIT 1')).rows[0]!.character_id;
    assert.equal((await r.command(a,'/api/v1/comments',{profileId:bot,body:'No fake conversation'})).json().error.code,'BOT_COMMENTS');
    assert.equal((await r.command(a,'/api/v1/army/invitations',{targetCharacterId:bot})).json().error.code,'BOT_ARMY_LINK');
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM realm_messages')).rows[0]!.n,0);
  }finally{await r.close();}
});
