import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';import {competitionFixture} from './phase6-fixtures.js';import {hallOfChampions} from '../src/competition.js';import {competitiveProfile} from '../src/competitive-records.js';import {notificationSummary} from '../src/notifications.js';
const skip=!testDatabaseUrl;
test('Phase 6 ranked pages preserve stable ties, privacy, escaping and authoritative ranks; forged/mismatched cursors fail',{skip},async()=>{const r=await realm({isolated:true});try{
 const viewer=await r.player('Ranking Observer'),ids=[];
 for(let i=0;i<25;i++){const p=await r.player('Ranked Knight '+i);ids.push(p.id);await r.db.query("UPDATE characters SET created_at='2020-01-01T00:00:00Z' WHERE id=$1",[p.id]);await r.db.query("UPDATE champion_standings SET created_at='2020-01-01T00:00:00Z' WHERE character_id=$1",[p.id]);await r.db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,'alpha-0.3','attacker_win','{}','{}')",[randomUUID(),p.id,viewer.id]);}
 const escaped=ids[0]!;await r.db.query('UPDATE characters SET name=$2 WHERE id=$1',[escaped,'Æsir <img src=x onerror=alert(1)>']);
 const first=await hallOfChampions(r.db,viewer.id,'victories');assert.equal(first.entries.length,20);assert.ok(first.nextCursor);
 const second=await hallOfChampions(r.db,viewer.id,'victories',first.nextCursor);assert.equal(second.entries.length,5);assert.equal(second.entries[0]!.rank,21);assert.equal(second.nextCursor,null);
 assert.deepEqual([...first.entries,...second.entries].map(r=>r.id),[...ids].sort());assert.equal(new Set([...first.entries,...second.entries].map(r=>r.id)).size,25);
 const lookup=await hallOfChampions(r.db,ids.at(-1)!,'victories');assert.ok(lookup.own);assert.equal((await competitiveProfile(r.db,viewer.id))!.deaths,'0','ordinary historical defeats never fabricate deaths');
 for(const cursor of ['not-json',Buffer.from(JSON.stringify({category:'kills',score:'1',xp:'0',at:'2020-01-01T00:00:00.000000Z',id:viewer.id})).toString('base64url')])await assert.rejects(hallOfChampions(r.db,viewer.id,'victories',cursor),/Invalid champion/);
 const page=await r.app.inject({url:'/game/champions?category=victories',headers:{cookie:viewer.cookie}});assert.equal(page.statusCode,200);assert.ok(page.body.includes('Next twenty champions'));assert.ok(!page.body.includes('<img src=x onerror=alert(1)>'));assert.ok(!page.body.includes(viewer.accountId));
 assert.equal((await r.app.inject({url:'/api/v1/champions?category=kills'})).statusCode,401);
 }finally{await r.close();}});
test('Phase 6 repeated escrow-funded bounties, K/D and wanted ranks distinguish deaths, defeats, claims and notification ownership',{skip},async()=>{const r=await competitionFixture();try{
 const sponsor=await r.player('Rivalry Patron'),target=await r.player('Recurring Rival'),hunter=await r.player('Persistent Hunter',100);
 const total=async()=>Number((await r.db.query('SELECT sum(balance)::text n FROM wallets WHERE character_id=ANY($1::uuid[])',[[sponsor.id,target.id,hunter.id]])).rows[0]!.n),before=await total();
 for(let i=0;i<3;i++){
  const contract=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});const wanted=await hallOfChampions(r.db,hunter.id,'wanted');assert.equal(wanted.entries[0]!.id,target.id);assert.equal(wanted.entries[0]!.score,'100');
  const ownBefore=(await notificationSummary(r.db,sponsor.id)).home,placedUnread=(await notificationSummary(r.db,target.id)).home;assert.ok(placedUnread>0);assert.equal((await notificationSummary(r.db,hunter.id)).home,0);
  await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);const hit=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id,bountyId:contract.data.bountyId});assert.ok(hit.battleId);
  assert.equal((await hallOfChampions(r.db,hunter.id,'wanted')).entries.length,0);assert.equal((await notificationSummary(r.db,sponsor.id)).home,ownBefore+1);
  r.advance(360);
 }
 assert.equal((await competitiveProfile(r.db,hunter.id))!.kills,'3');assert.equal((await competitiveProfile(r.db,target.id))!.deaths,'3');assert.equal((await competitiveProfile(r.db,target.id))!.bountiesReceived,'3');assert.equal(before-await total(),30,'three disclosed 10-gold fees are the only net currency sink here');
 const original=await r.me(hunter);const wrongCSRF=await r.app.inject({method:'POST',url:'/api/v1/battles',headers:{cookie:hunter.cookie,origin:'http://localhost:3000','idempotency-key':randomUUID()},payload:{targetCharacterId:target.id,bountyId:randomUUID(),csrf:'wrong'}});assert.equal(wrongCSRF.statusCode,403);assert.equal((await r.me(hunter)).gold,original.gold);
 // A matching-level sponsor can place a valid bounty on the hunter. The weak
 // target can finish it even while losing, giving the hunter a genuine death.
 const highSponsor=await r.player('Imperial Sponsor',100);const contract=await r.ok(highSponsor,'/api/v1/bounties/placements',{targetCharacterId:hunter.id,amount:100});await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[hunter.id,r.now()]);
 await r.ok(target,'/api/v1/battles',{targetCharacterId:hunter.id,bountyId:contract.data.bountyId});const kd=await competitiveProfile(r.db,hunter.id);assert.equal(kd!.ratio,'3.00');assert.equal((await hallOfChampions(r.db,target.id,'kd')).entries[0]!.id,hunter.id);
 }finally{await r.close();}});
