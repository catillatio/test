import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {experienceView} from '../src/experience.js';
import {experienceRules} from '../src/experience-rules.js';
import {migrate} from '../src/migrate.js';
const skip=!testDatabaseUrl;
test('All Regions is the first filter; chosen region persists, locks remain authoritative and GET forms contain no CSRF secrets',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player(),headers={cookie:a.cookie};
  const all=await r.app.inject({method:'GET',url:'/game/quests',headers});assert.equal(all.statusCode,200,all.body);assert.match(all.body,/All Regions/);assert.match(all.body,/Unlock at level 50/);
  const region=(await import('../src/alpha-rules.js')).alpha.content!.areas[0]!;
  const selected=await r.app.inject({method:'GET',url:'/game/quests?area='+region.id,headers});assert.equal(selected.statusCode,200,selected.body);
  const again=await r.app.inject({method:'GET',url:'/game/quests',headers});assert.match(again.body,new RegExp('<strong>'+region.name+'</strong>'));
  for(const form of all.body.matchAll(/<form method="get"[\s\S]*?<\/form>/g))assert.ok(!form[0].includes('name="csrf"'));
  const alpha=(await import('../src/alpha-rules.js')).alpha;const locked=alpha.quests.find(q=>q.level===50)!;
  assert.equal((await r.command(a,'/api/v1/quests/'+locked.id+'/runs')).statusCode,409);
  assert.equal((await r.command(a,'/api/v1/quests/'+locked.id+'/equipment')).statusCode,409);
 }finally{await r.close();}
});
test('tutorial and cosmetic achievements persist, never create resources, backfill only evidence and award once under concurrency',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player();const start=await r.me(a);
  assert.equal(experienceRules.achievements.length,23);
  assert.equal((await experienceView(r.db,a.id)).achievements.filter(a=>a.earnedAt).length,0);
  await r.ok(a,'/api/v1/tutorial',{action:'start'});await r.ok(a,'/api/v1/quests/border-patrol/runs');
  const receipt=await r.ok(a,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});
  assert.ok(Array.isArray(receipt.data.newAchievements));
  const before=await r.me(a),metrics=await experienceView(r.db,a.id);
  assert.equal(metrics.tutorial.status,'active');assert.ok(metrics.tutorial.steps.find(s=>s.id==='automatic')!.done);
  assert.ok(metrics.achievements.find(a=>a.id==='quests-1')!.earnedAt);
  const awards=(await r.db.query('SELECT * FROM character_achievements WHERE character_id=$1',[a.id])).rows;
  await Promise.all([experienceView(r.db,a.id),experienceView(r.db,a.id)]);await migrate(r.db);
  assert.deepEqual((await r.db.query('SELECT * FROM character_achievements WHERE character_id=$1',[a.id])).rows,awards);
  const after=await r.me(a);for(const key of ['gold','xp','skillPoints','inventory','bankedGold'] as const)assert.deepEqual(after[key],before[key]);
  await r.ok(a,'/api/v1/tutorial',{action:'skip'});assert.equal((await experienceView(r.db,a.id)).tutorial.status,'skipped');
  assert.ok((await r.me(a)).xp>start.xp);
  await assert.rejects(r.db.query('DELETE FROM character_achievements WHERE character_id=$1',[a.id]),/permanent/);
 }finally{await r.close();}
});
test('missing quest equipment is quoted per actual copy, bought atomically once, then requires a separate quest confirmation',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player();await r.prepare(a,20000,2000);
  const {alpha}=await import('../src/alpha-rules.js');const q=alpha.quests.find(q=>Object.values(q.items).some(n=>n>1)&&q.level<10)!;
  const state=await r.me(a);assert.ok(q);
  const required=Object.entries(q.items);const [itemId,n]=required[0]!;
  if(n>1)await r.ok(a,'/api/v1/inventory/purchases',{itemId,quantity:1});
  const before=await r.me(a);const preview=await r.app.inject({method:'GET',url:'/game/quests/'+q.id+'/requirements',headers:{cookie:a.cookie}});
  assert.equal(preview.statusCode,200,preview.body);assert.match(preview.body,/Buy Missing Equipment/);
  const missing=before.quests.find(quest=>quest.id===q.id)!,key=randomUUID();
  const purchase=await r.ok(a,'/api/v1/quests/'+q.id+'/equipment',{},key);assert.equal(purchase.data.goldSpent,missing.missingCost);
  await r.ok(a,'/api/v1/quests/'+q.id+'/equipment',{},key);
  const after=await r.me(a);assert.equal(after.questsCompleted,before.questsCompleted);assert.equal(after.mana,before.mana);assert.equal(after.gold,before.gold-missing.missingCost);
  for(const [id,quantity] of required)assert.equal(after.inventory.find(i=>i.id===id)!.quantity,quantity);
  assert.equal((await r.command(a,'/api/v1/quests/'+q.id+'/equipment')).statusCode,409);
  const ready=await r.app.inject({method:'GET',url:'/game/quests/'+q.id+'/requirements',headers:{cookie:a.cookie}});assert.match(ready.body,/Do Quest/);
 }finally{await r.close();}
});
test('quest level-up receipts and profile achievement collection render persistent awards without duplicate rewards',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player();const first=await r.ok(a,'/api/v1/quests/border-patrol/runs');let last=first;
  for(let i=0;i<8&&!last.data.celebration;i++)last=await r.ok(a,'/api/v1/quests/border-patrol/runs');
  assert.ok(last.data.celebration);const before=await r.me(a);
  const page=await r.app.inject({method:'GET',url:'/game/quests?command='+last.commandId,headers:{cookie:a.cookie}});
  assert.equal(page.statusCode,200,page.body);assert.match(page.body,/LEVEL UP!/);assert.match(page.body,/Spend Skill Points/);assert.match(page.body,/gold earned/);
  const profile=await r.app.inject({method:'GET',url:'/game/profile',headers:{cookie:a.cookie}});assert.match(profile.body,/\/game\/achievements/);
  const collection=await r.app.inject({method:'GET',url:'/game/achievements',headers:{cookie:a.cookie}});assert.equal(collection.statusCode,200,collection.body);assert.match(collection.body,/A First Deed/);assert.match(collection.body,/Earned/);
  assert.equal((await r.me(a)).gold,before.gold);
  const home=await r.app.inject({method:'GET',url:'/game/home',headers:{cookie:a.cookie}});assert.match(home.body,/PRE ALPHA BUILD, PLEASE REPORT BUGS TO @savism DISCORD/);assert.ok(!home.body.includes('THE FIRST REALM'));
 }finally{await r.close();}
});
