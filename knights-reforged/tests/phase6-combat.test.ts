import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl,type Player} from './helpers.js';import {bountyBoard} from '../src/bounties.js';import {rivalryHistory,hallOfChampions} from '../src/competition.js';import {competitiveProfile} from '../src/competitive-records.js';import {notificationSummary,acknowledgeNotifications} from '../src/notifications.js';import {activityFeed} from '../src/feeds.js';
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
 await assert.rejects(r.db.query('UPDATE competitive_deaths SET killer_id=$1',[second.id]),/append-only/);await assert.rejects(r.db.query('DELETE FROM competitive_deaths'),/append-only/);
 const raw=await r.app.inject({url:'/game/players/'+winner.id,headers:{cookie:sponsor.cookie}});assert.equal(raw.statusCode,200);assert.ok(raw.body.includes('Competitive Record'));assert.ok(!raw.body.includes(winner.accountId));
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
test('Phase 6 army invitations to different people work in the same second; retry, membership, same-player and daily safeguards remain',{skip},async()=>{const r=await competitionFixture();try{
 const a=await r.player('Quick Inviter'),b=await r.player('First Ally'),c=await r.player('Second Ally');
 const key=randomUUID();await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id},key);await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:c.id});await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id},key);
 assert.equal((await r.db.query("SELECT count(*)::int n FROM army_events WHERE actor_id=$1 AND kind='invited'",[a.id])).rows[0]!.n,2);
 await r.ok(b,'/api/v1/army/acceptances',{targetCharacterId:a.id});assert.equal((await r.command(a,'/api/v1/army/invitations',{targetCharacterId:b.id})).statusCode,409);
 const page=await r.app.inject({url:'/game/army?tab=dashboard',headers:{cookie:a.cookie}});assert.equal(page.statusCode,200);assert.ok(!page.body.includes('30 seconds apart'));
 }finally{await r.close();}});
