import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {experienceView} from '../src/experience.js';
import {guideSteps} from '../src/guide.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {listBroadcasts,reviewBroadcasts,hideReviewedBroadcasts} from '../src/broadcast-moderation.js';
import {moderateMessage} from '../src/community.js';
const skip=!testDatabaseUrl;
test('clear tutorial entry, every Show Me destination, persistent Next/Back/Skip/Resume, voluntary finish and explicit replay give no rewards',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Young Adventurer'),headers={cookie:a.cookie};const before=await r.me(a);
  const home=await r.app.inject({url:'/game/home',headers});assert.match(home.body,/New to Kingdom Come\?/);assert.match(home.body,/>Start Tutorial</);assert.doesNotMatch(home.body,/Your short adventure guide is ready/);
  await r.ok(a,'/api/v1/tutorial',{action:'start'});assert.equal((await r.command(a,'/api/v1/tutorial',{action:'finish'})).statusCode,409);
  for(let index=0;index<8;index++){
   const state=await experienceView(r.db,a.id);assert.equal(state.tutorial.position,index+1);
   const page=await r.app.inject({url:'/game/tutorial',headers});assert.equal(page.statusCode,200,page.body);assert.match(page.body,new RegExp('Step '+(index+1)+' of 8'));
   assert.ok(page.body.includes('href="'+guideSteps[index]!.href.replaceAll('&','&amp;')+'"'));
   const destination=guideSteps[index]!.href,html=await r.app.inject({url:destination.split('#')[0]!,headers});assert.equal(html.statusCode,200,html.body);assert.ok(html.body.includes('id="'+guideSteps[index]!.target+'"'));
   if(index===3){
    const back=await r.command(a,'/game/tutorial',{action:'back'});assert.equal(back.statusCode,303);assert.ok(back.headers.location!.startsWith('/game/tutorial?command='));
    assert.equal((await experienceView(r.db,a.id)).tutorial.position,3);await r.ok(a,'/api/v1/tutorial',{action:'next'});
    await r.ok(a,'/api/v1/tutorial',{action:'skip'});assert.equal((await experienceView(r.db,a.id)).tutorial.status,'skipped');
    assert.match((await r.app.inject({url:'/game/home',headers})).body,/>Continue Tutorial</);
    const replacement=await createApp({db:r.db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000'})});
    try{assert.equal((await replacement.inject({url:'/game/tutorial',headers})).statusCode,200);}finally{await replacement.close();}
    await r.ok(a,'/api/v1/tutorial',{action:'resume'});assert.equal((await experienceView(r.db,a.id)).tutorial.position,4);
   }
   if(index<7)await r.ok(a,'/api/v1/tutorial',{action:'next'});
  }
  const key=randomUUID();await r.ok(a,'/api/v1/tutorial',{action:'finish'},key);await r.ok(a,'/api/v1/tutorial',{action:'finish'},key);
  const finished=await experienceView(r.db,a.id);assert.equal(finished.tutorial.status,'completed');assert.ok(finished.tutorial.completedAt);assert.equal(finished.tutorial.completed,0,'Reading the guide does not fabricate gameplay evidence.');
  const page=await r.app.inject({url:'/game/tutorial',headers});assert.match(page.body,/TUTORIAL COMPLETE!/);assert.match(page.body,/Continue Playing/);
  const completeHome=await r.app.inject({url:'/game/home',headers});assert.doesNotMatch(completeHome.body,/New to Kingdom Come\?|Start Tutorial|Continue Tutorial/);
  await r.ok(a,'/api/v1/tutorial',{action:'skip'});assert.equal((await experienceView(r.db,a.id)).tutorial.status,'completed');
  await r.ok(a,'/api/v1/tutorial',{action:'replay'});assert.equal((await experienceView(r.db,a.id)).tutorial.position,1);assert.equal((await experienceView(r.db,a.id)).tutorial.status,'completed');assert.equal((await experienceView(r.db,a.id)).tutorial.replaying,true);
  const after=await r.me(a);for(const key of ['gold','xp','inventory','army','skillPoints','bankedGold','land'] as const)assert.deepEqual(after[key],before[key]);assert.equal(finished.achievements.filter(a=>a.earnedAt).length,0);
  assert.match((await r.app.inject({url:'/rules',headers})).body,/href="\/game\/tutorial"/);assert.match((await r.app.inject({url:'/game/profile',headers})).body,/href="\/game\/tutorial"/);
 }finally{await r.close();}
});
test('Put Down Roots goes straight to Land, highlights a real purchase, recognizes purchases and returns to Land with Buy More',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player(),headers={cookie:a.cookie};await r.prepare(a,1000);await r.ok(a,'/api/v1/tutorial',{action:'start'});
  for(let i=0;i<6;i++)await r.ok(a,'/api/v1/tutorial',{action:'next'});
  const step=await r.app.inject({url:'/game/tutorial',headers});assert.match(step.body,/Put Down Roots/);assert.match(step.body,/href="\/game\/land#property-smallholding"/);
  const land=await r.app.inject({url:'/game/land',headers});assert.match(land.body,/id="property-smallholding"/);
  const bought=await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});
  const guide=await experienceView(r.db,a.id);assert.ok(guide.tutorial.steps.find(step=>step.id==='land')!.done);assert.equal(guide.tutorial.position,8);
  const receipt=await r.app.inject({url:'/game/purchases/'+bought.commandId,headers});assert.equal(receipt.statusCode,200,receipt.body);assert.match(receipt.body,/class="button button-outline return-to-market" href="\/game\/land">Return to Land/);assert.match(receipt.body,/>Buy More</);assert.doesNotMatch(receipt.body,/Continue your adventure/);
  await r.ok(a,'/api/v1/land/sales',{propertyId:'smallholding',quantity:1});assert.ok((await experienceView(r.db,a.id)).tutorial.steps.find(step=>step.id==='land')!.done);
  const legacy=await r.player('Existing Adventurer');await r.ok(legacy,'/api/v1/quests/border-patrol/runs');await r.ok(legacy,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});await r.ok(legacy,'/api/v1/tutorial',{action:'start'});
  const resume=await experienceView(r.db,legacy.id);assert.equal(resume.tutorial.position,5);assert.equal((await r.me(legacy)).inventory.find(item=>item.id==='squires-blade')!.quantity,1);
 }finally{await r.close();}
});
test('broadcast cleanup reviews exactly two immutable IDs; explicit owner confirmation hides only those records atomically and reversibly',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Realm Herald');const ids:string[]=[];
  for(const [channel,body] of [['broadcast','First old broadcast'],['broadcast','Second old broadcast'],['broadcast','Keep this new broadcast'],['comment','Keep this profile comment']]){
   const id=randomUUID();ids.push(id);await r.db.query(`INSERT INTO realm_messages(id,author_id,profile_id,channel,body,command_id,ruleset_id,created_at)
    VALUES($1,$2,$3,$4,$5,$6,'community-0.1',clock_timestamp())`,[id,a.id,channel==='comment'?a.id:null,channel,body,randomUUID()]);
  }
  const selected=ids.slice(0,2),before=(await r.db.query('SELECT * FROM realm_messages ORDER BY id')).rows;
  assert.equal((await listBroadcasts(r.db)).length,3);const reviewed=await reviewBroadcasts(r.db,selected);assert.deepEqual(reviewed.records.map(row=>row.id).sort(),selected.sort());
  assert.deepEqual((await r.db.query('SELECT * FROM realm_messages ORDER BY id')).rows,before,'Listing/review must be read-only.');
  await assert.rejects(reviewBroadcasts(r.db,[selected[0]!,selected[0]!]),/two distinct/);await assert.rejects(reviewBroadcasts(r.db,[selected[0]!,ids[3]!]),/reviewable broadcasts/);
  const env={NODE_ENV:'production',DATABASE_URL:'postgres://fixture@postgres.railway.internal/railway',KINGDOM_PRIVATE_ALPHA:'1',RAILWAY_SERVICE_ID:randomUUID(),RAILWAY_ENVIRONMENT_ID:randomUUID(),ALLOW_REALM_MODERATION:'1',REALM_MODERATOR_LABEL:'Realm owner',KINGDOM_BROADCAST_REVIEW:reviewed.reviewSha256,KINGDOM_BROADCAST_CONFIRM:'HIDE_REVIEWED_BROADCASTS'};
  await assert.rejects(hideReviewedBroadcasts(r.db,selected,{}),/environment/);await assert.rejects(hideReviewedBroadcasts(r.db,selected,{...env,KINGDOM_BROADCAST_CONFIRM:''}),/confirmation/);await assert.rejects(hideReviewedBroadcasts(r.db,selected,{...env,KINGDOM_BROADCAST_REVIEW:'0'.repeat(64)}),/changed/);
  await assert.rejects(hideReviewedBroadcasts(r.db,selected,{...env,REALM_MODERATOR_LABEL:''}),/operator label/);assert.deepEqual((await r.db.query('SELECT * FROM realm_messages ORDER BY id')).rows,before,'Failed moderation rolls back both rows.');
  const results=await Promise.all([hideReviewedBroadcasts(r.db,selected,env),hideReviewedBroadcasts(r.db,selected,env)]);assert.equal(results.reduce((n,result)=>n+result.hidden,0),2);assert.equal((await listBroadcasts(r.db)).length,1);
  const audit=(await r.db.query("SELECT * FROM social_moderation WHERE action='operator_hide'")).rows;assert.equal(audit.length,2);assert.ok(audit.every(row=>selected.includes(row.message_id)));
  for(const id of ids.slice(2))assert.equal((await r.db.query('SELECT status FROM realm_messages WHERE id=$1',[id])).rows[0]!.status,'visible');
  for(const id of selected)await moderateMessage(r.db,{messageId:id,action:'restore',operator:'Realm owner',reason:'Owner reversal test'});assert.equal((await listBroadcasts(r.db)).length,3);
  const bad=await r.command(a,'/api/v1/broadcasts/hide',{ids:selected});assert.equal(bad.statusCode,404,'No browser administrative endpoint exists.');
 }finally{await r.close();}
});
