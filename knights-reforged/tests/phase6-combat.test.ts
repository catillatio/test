import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl,type Player} from './helpers.js';import {bountyBoard} from '../src/bounties.js';import {rivalryHistory,hallOfChampions} from '../src/competition.js';import {competitiveProfile} from '../src/competitive-records.js';import {notificationSummary,acknowledgeNotifications} from '../src/notifications.js';import {activityFeed} from '../src/feeds.js';
import {createApp} from '../src/app.js';import {loadConfig} from '../src/config.js';
const skip=!testDatabaseUrl;
import {competitionFixture} from './phase6-fixtures.js';
test('Phase 6 explicit cross-level hunts preserve ordinary PvP, exact contract identity, costs and exactly-once competitive deaths',{skip},async()=>{const r=await competitionFixture();try{
 const sponsor=await r.player('Contract Patron'),target=await r.player('Small Kingdom'),hunter=await r.player('High Hunter',100),second=await r.player('Other Hunter',100);
 const placed=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000});const bountyId=placed.data.bountyId;
 const board=await bountyBoard(r.db,hunter.id);assert.equal(board.active.find(b=>b.id===bountyId)!.claimBlockedReason,null);
 const before=await r.me(hunter);assert.equal((await r.command(hunter,'/api/v1/battles',{targetCharacterId:target.id})).json().error.code,'RIVAL_LEVEL_RANGE');
 for(const intent of [{targetCharacterId:target.id,bountyId:randomUUID()},{targetCharacterId:sponsor.id,bountyId}])assert.equal((await r.command(hunter,'/api/v1/battles',intent)).statusCode,409);
 assert.equal((await r.me(hunter)).spirit,before.spirit);
 await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
 const key=randomUUID(),attempts=await Promise.all([r.command(hunter,'/api/v1/battles',{targetCharacterId:target.id,bountyId},key),r.command(second,'/api/v1/battles',{targetCharacterId:target.id,bountyId})]);
 assert.deepEqual(attempts.map(a=>a.statusCode).sort(),[200,409]);const winning=attempts.findIndex(a=>a.statusCode===200),winner=winning===0?hunter:second,result=attempts[winning]!.json();
 const battle=(await r.db.query('SELECT result FROM battles WHERE id=$1',[result.battleId])).rows[0]!.result;assert.equal(battle.bountyClaim.reward,1000);assert.equal(battle.spiritSpent,1);assert.equal(battle.bountyHuntId,bountyId);
 if(winner.id===hunter.id)assert.equal((await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id,bountyId},key)).battleId,result.battleId);
 assert.equal((await r.db.query('SELECT count(*)::int n FROM competitive_deaths')).rows[0]!.n,1);assert.equal((await competitiveProfile(r.db,winner.id))!.kills,'1');assert.equal((await competitiveProfile(r.db,target.id))!.deaths,'1');assert.equal((await competitiveProfile(r.db,winner.id))!.ratio,null);
 const rivalry=await rivalryHistory(r.db,winner.id,target.id);assert.equal(rivalry!.attacksInitiated,'1');assert.equal(rivalry!.defensiveEncounters,'0');assert.equal(rivalry!.kills,'1');
 const kills=await hallOfChampions(r.db,winner.id,'kills');assert.equal(kills.entries[0]!.id,winner.id);assert.equal((await hallOfChampions(r.db,winner.id,'kd')).entries.length,0);
 await assert.rejects(r.db.query('INSERT INTO competitive_deaths(battle_id,bounty_id,killer_id,victim_id,created_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),bountyId,winner.id,target.id,r.now()]),/Verified human bounty finishing evidence required/);
 await assert.rejects(r.db.query('UPDATE competitive_deaths SET killer_id=$1',[second.id]),/append-only/);await assert.rejects(r.db.query('DELETE FROM competitive_deaths'),/append-only/);
 const raw=await r.app.inject({url:'/game/players/'+winner.id,headers:{cookie:sponsor.cookie}});assert.equal(raw.statusCode,200);assert.ok(!raw.body.includes('Competitive Record'));assert.ok(raw.body.includes('data-profile-stats'));assert.ok(!raw.body.includes(winner.accountId));
 const claimed=await r.app.inject({url:'/game/bounties',headers:{cookie:sponsor.cookie}});assert.equal(claimed.statusCode,200);assert.ok(claimed.body.includes('verified human bounty death'));assert.ok(claimed.body.includes(winner.id));
 const targetFeed=await activityFeed(r.db,target.id,'all'),targetUnread=await notificationSummary(r.db,target.id,targetFeed.entries);assert.ok(targetUnread.events.some(e=>e.kind==='bounty_claimed'));assert.ok(!targetUnread.events.some(e=>e.kind==='attack'),'one significant claim replaces its incoming attack badge');
 const sponsorUnread=await notificationSummary(r.db,sponsor.id,(await activityFeed(r.db,sponsor.id,'all')).entries);assert.ok(sponsorUnread.events.some(e=>e.kind==='bounty_claimed'));
 await acknowledgeNotifications(r.db,target.id,targetUnread.events);assert.equal((await notificationSummary(r.db,target.id)).home,0);await acknowledgeNotifications(r.db,target.id,targetUnread.events);assert.equal((await notificationSummary(r.db,target.id)).home,0);
 const beforeRead=(await notificationSummary(r.db,sponsor.id)).home;await acknowledgeNotifications(r.db,sponsor.id,targetUnread.events.filter(e=>e.kind==='bounty_placed'));assert.equal((await notificationSummary(r.db,sponsor.id)).home,beforeRead,'foreign event acknowledgement cannot alter owner state');
 }finally{await r.close();}});
test('Phase 6 weak cross-level hunter may lose the battle calculation yet earn the verified finishing bounty; ordinary knockouts are not deaths',{skip},async()=>{const r=await competitionFixture();try{
 const sponsor=await r.player('Imperial Patron',100),target=await r.player('Imperial Defender',100),hunter=await r.player('Bold Novice',5);
 await r.legacyArmy(target,20);await r.ok(target,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});
 const placed=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
 const response=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id,bountyId:placed.data.bountyId});const battle=(await r.db.query('SELECT * FROM battles WHERE id=$1',[response.battleId])).rows[0]!;
 assert.equal(battle.outcome,'defender_win');assert.equal(battle.result.defenderHealthAfter,0);assert.equal(battle.result.bountyClaim.reward,100);assert.equal((await competitiveProfile(r.db,hunter.id))!.kills,'1');assert.equal((await competitiveProfile(r.db,target.id))!.deaths,'1');assert.equal((await r.me(target)).health,0);
 // Reverse direction remains ordinary Revenge, with no hidden range bypass.
 const revenge=await r.app.inject({url:'/game/battles/'+response.battleId,headers:{cookie:target.cookie}});assert.equal(revenge.statusCode,200);assert.ok(!revenge.body.includes('name="bountyId"'));
 assert.equal((await r.command(target,'/api/v1/battles',{targetCharacterId:hunter.id})).json().error.code,'RIVAL_LEVEL_RANGE');
 }finally{await r.close();}});
test('Phase 6 army invitations to different people work in the same second; retry, membership and same-player safeguards remain',{skip},async()=>{const r=await competitionFixture();try{
 const a=await r.player('Quick Inviter'),b=await r.player('First Ally'),c=await r.player('Second Ally');
 const key=randomUUID();await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id},key);await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:c.id});await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id},key);
 assert.equal((await r.db.query("SELECT count(*)::int n FROM army_events WHERE actor_id=$1 AND kind='invited'",[a.id])).rows[0]!.n,2);
 await r.ok(b,'/api/v1/army/acceptances',{targetCharacterId:a.id});assert.equal((await r.command(a,'/api/v1/army/invitations',{targetCharacterId:b.id})).statusCode,409);
 const page=await r.app.inject({url:'/game/army?tab=dashboard',headers:{cookie:a.cookie}});assert.equal(page.statusCode,200);assert.ok(!page.body.includes('30 seconds apart'));
 }finally{await r.close();}});

test('Sponsor, target and shared army allies can claim exact cross-level bounties once without changing escrow or normal matchmaking',{skip},async()=>{const r=await competitionFixture();try{
 for(const relationships of [['sponsor'],['target'],['sponsor','target']] as const){
  const label=relationships.join(' and '),sponsor=await r.player(label+' patron'),target=await r.player(label+' target'),hunter=await r.player(label+' hunter',100);
  for(const owner of relationships.map(side=>side==='sponsor'?sponsor:target)){await r.ok(owner,'/api/v1/army/invitations',{targetCharacterId:hunter.id});await r.ok(hunter,'/api/v1/army/acceptances',{targetCharacterId:owner.id});}
  const ids=[sponsor.id,target.id,hunter.id],total=async()=>Number((await r.db.query('SELECT sum(balance)::text n FROM wallets WHERE character_id=ANY($1::uuid[])',[ids])).rows[0]!.n),before=await total();
  const contract=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});
  const board=await bountyBoard(r.db,hunter.id);assert.equal(board.active.find(b=>b.id===contract.data.bountyId)!.claimBlockedReason,null,label);
  const preview=await r.app.inject({url:'/api/v1/players/'+target.id+'/combat?bountyId='+contract.data.bountyId,headers:{cookie:hunter.cookie}});assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.json().combatTarget.allowed,true,label);
  assert.equal((await r.command(hunter,'/api/v1/battles',{targetCharacterId:target.id})).json().error.code,'RIVAL_LEVEL_RANGE','ordinary matching remains range-bound');
  assert.equal((await r.command(sponsor,'/api/v1/battles',{targetCharacterId:target.id,bountyId:contract.data.bountyId})).json().error.code,'BOUNTY_HUNT_UNAVAILABLE','sponsor still cannot claim its own contract');
  await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);const key=randomUUID(),intent={targetCharacterId:target.id,bountyId:contract.data.bountyId};
  const attempts=await Promise.all([r.ok(hunter,'/api/v1/battles',intent,key),r.ok(hunter,'/api/v1/battles',intent,key)]);assert.equal(attempts[0].battleId,attempts[1].battleId);
  const record=(await r.db.query('SELECT result FROM battles WHERE id=$1',[attempts[0].battleId])).rows[0]!.result;assert.equal(record.bountyClaim.reward,100);assert.equal(record.spiritSpent,1);
  assert.equal(before-await total(),10,'only the existing listing fee leaves these wallets');assert.equal((await competitiveProfile(r.db,hunter.id))!.kills,'1');assert.equal((await competitiveProfile(r.db,target.id))!.deaths,'1');
  assert.equal((await r.db.query('SELECT count(*)::int n FROM bounty_kills WHERE bounty_id=$1',[contract.data.bountyId])).rows[0]!.n,1);
 }
 const rules=await r.app.inject({url:'/rules'});assert.equal(rules.statusCode,200,rules.body);assert.ok(!rules.body.includes('accepted allies of the sponsor or target cannot claim'));
 }finally{await r.close();}});

test('Consecutive ID/code invitations exceed the old daily quota while acceptance, duplicate, retry, ownership and flood safeguards remain',{skip},async()=>{const r=await realm({isolated:true,clock:()=>new Date('2032-03-01T12:00:00Z')});try{
 const actor=await r.player('Unrestricted Inviter'),recipients=[];let lastKey=randomUUID(),lastUrl='',lastPayload:Record<string,unknown>={};
 for(let n=0;n<25;n++){
  const recipient=await r.player('Willing Recipient '+n);recipients.push(recipient);const codeMode=n%2===0,url=codeMode?'/api/v1/army/code-invitations':'/api/v1/army/invitations',payload=codeMode?{code:(await r.me(recipient)).invitationCode}:{targetCharacterId:recipient.id},key=randomUUID();
  if(n===24){const attempts=await Promise.all([r.ok(actor,url,payload,key),r.ok(actor,url,payload,key)]);assert.equal(attempts[0].commandId,attempts[1].commandId);lastKey=key;lastUrl=url;lastPayload=payload;}else await r.ok(actor,url,payload,key);
 }
 const count=async()=>Number((await r.db.query("SELECT count(*)::int n FROM army_events WHERE actor_id=$1 AND kind='invited'",[actor.id])).rows[0]!.n);assert.equal(await count(),25);
 assert.equal((await r.me(actor)).army.allies,0,'invitations do not fabricate accepted members');assert.equal((await r.me(actor)).army.participants,1);
 await r.ok(actor,lastUrl,lastPayload,lastKey);assert.equal(await count(),25,'late retry returns the original receipt');
 assert.equal((await r.command(actor,'/api/v1/army/invitations',{targetCharacterId:recipients[0]!.id})).json().error.code,'INVITATION_EXISTS');
 assert.equal((await r.command(actor,'/api/v1/army/acceptances',{targetCharacterId:recipients[0]!.id})).statusCode,403,'sender cannot accept for the recipient');
 await r.ok(recipients[0]!,'/api/v1/army/acceptances',{targetCharacterId:actor.id});assert.equal((await r.me(actor)).army.allies,1);
 await r.ok(recipients[1]!,'/api/v1/army/rejections',{targetCharacterId:actor.id});assert.equal((await r.command(actor,'/api/v1/army/invitations',{targetCharacterId:recipients[1]!.id})).json().error.code,'REINVITATION_COOLDOWN','same-person reinvitation protection is separate from the removed daily quota');
 const bad=await r.app.inject({method:'POST',url:'/api/v1/army/invitations',headers:{cookie:actor.cookie,origin:'http://localhost:3000','x-csrf-token':'wrong','idempotency-key':randomUUID()},payload:{targetCharacterId:recipients[1]!.id}});assert.equal(bad.statusCode,403);assert.equal(await count(),25);
 assert.equal((await r.app.inject({method:'POST',url:'/api/v1/army/invitations',payload:{targetCharacterId:recipients[1]!.id}})).statusCode,403,'anonymous writes fail the CSRF/session gate');
 for(const path of ['/game/army?tab=recruit','/rules']){const page=await r.app.inject({url:path,headers:{cookie:actor.cookie}});assert.equal(page.statusCode,200,page.body);assert.ok(!page.body.includes('Maximum 20 invitations/day'));assert.ok(!page.body.includes('New invitations are limited to'));assert.ok(!page.body.includes('30 seconds apart'));}
 const limited=await createApp({db:r.db,config:loadConfig({NODE_ENV:'development',APP_ORIGIN:'http://localhost:3000'})});try{
  const attempt=()=>limited.inject({method:'POST',url:'/api/v1/army/invitations',headers:{cookie:actor.cookie,origin:'http://localhost:3000','x-csrf-token':actor.csrf,'idempotency-key':randomUUID()},payload:{targetCharacterId:actor.id}});
  for(let n=0;n<90;n++)assert.equal((await attempt()).statusCode,422,'the existing self-invitation guard rejects invalid requests');
  assert.equal((await attempt()).statusCode,429,'existing per-account request-flood protection remains, without a daily gameplay quota');assert.equal(await count(),25);
 }finally{await limited.close();}
 }finally{await r.close();}});
