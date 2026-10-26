import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';import {competitionFixture} from './phase6-fixtures.js';import {hallOfChampions} from '../src/competition.js';import {competitiveProfile} from '../src/competitive-records.js';import {notificationSummary} from '../src/notifications.js';
const skip=!testDatabaseUrl;
import {historicalClaim} from './phase6-fixtures.js';import {profileBusinessSnapshot} from './classic-profile-fixture.js';import {directedRivalry} from '../src/competitive-records.js';import {migrate} from '../src/migrate.js';
test('Successful legacy and newer claims count once as Kills/Deaths across profiles, API, rankings and rivalry without modern HP evidence',{skip},async()=>{const r=await competitionFixture();try{
 const hunter=await r.player('Legacy Hunter'),target=await r.player('Legacy Target'),sponsor=await r.player('Historical Patron');
 await historicalClaim(r.db,hunter,target,sponsor,'legacy_claim');
 await historicalClaim(r.db,hunter,target,sponsor,'finishing_claim');
 await historicalClaim(r.db,target,hunter,sponsor,'legacy_claim');
 assert.equal((await r.db.query('SELECT count(*)::int n FROM competitive_deaths')).rows[0]!.n,0,'preserve the stricter historical evidence table without using it to exclude completed claims');
 assert.equal((await r.db.query('SELECT player_kills::text AS n FROM competitive_statistics WHERE character_id=$1',[hunter.id])).rows[0]!.n,'0');
 await r.db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,'alpha-0.3','attacker_win','{}',$4)",[randomUUID(),hunter.id,target.id,{defenderHealthBefore:1,defenderHealthAfter:0,spiritSpent:1}]);
 await migrate(r.db); // Reconcile the fixture's administrative level change before the replay snapshot.
 const record=(await competitiveProfile(r.db,hunter.id))!;assert.equal(record.kills,'2');assert.equal(record.deaths,'1');assert.equal(record.bountyClaims,'2');assert.equal(record.ratio,'2.00');assert.equal(record.wins,'2');assert.equal(record.losses,'2');
 const state=await r.me(hunter);assert.equal(state.battleStats.kills,2);assert.equal(state.battleStats.deaths,1);
 await r.me(target);await r.me(sponsor);const before=await profileBusinessSnapshot(r.db);
 for(const own of[true,false]){
  const response=await r.app.inject({url:own?'/game/profile':'/game/players/'+hunter.id,headers:{cookie:own?hunter.cookie:target.cookie}});assert.equal(response.statusCode,200,response.body);
  const stats=response.body.slice(response.body.indexOf('data-profile-stats'),response.body.indexOf('data-profile-income'));
  const labels=[...stats.matchAll(/<dt>([^<]+)<\/dt>/g)].map(m=>m[1]);assert.deepEqual(labels,['Kills','Battles Won','Deaths','Battles Lost','Quests','Initiated for']);
  assert.match(stats,/<dt>Kills<\/dt><dd>2<\/dd>/);assert.match(stats,/<dt>Deaths<\/dt><dd>1<\/dd>/);assert.ok(!response.body.includes('Competitive Record'));
 }
 for(const path of['/api/v1/me','/api/v1/players/'+hunter.id]){const response=await r.app.inject({url:path,headers:{cookie:hunter.cookie}});assert.equal(response.statusCode,200);const data=response.json();const stats=(data.state??data.character).battleStats;assert.equal(stats.kills,2);assert.equal(stats.deaths,1);}
 for(const category of['kills','bounties','kd']){const board=await hallOfChampions(r.db,hunter.id,category);assert.equal(board.entries[0]!.id,hunter.id);assert.equal(Number(board.own!.score),2);}
 const rivalry=await directedRivalry(r.db,hunter.id,target.id);assert.equal(rivalry.kills,'2');assert.equal(rivalry.deaths,'1');
 const history=await r.app.inject({url:'/game/bounties',headers:{cookie:hunter.cookie}});assert.equal(history.statusCode,200);assert.equal((history.body.match(/successful bounty claim/g)??[]).length,3);assert.ok(!history.body.includes('historical claim credit'));
 assert.deepEqual(await profileBusinessSnapshot(r.db),before,'accounting reads rewrite no historical, financial, equipment or player rows');
 await migrate(r.db);assert.deepEqual(await profileBusinessSnapshot(r.db),before,'restart/migration replay does not backfill or re-award a claim');assert.equal((await competitiveProfile(r.db,hunter.id))!.kills,'2');
 }finally{await r.close();}});

test('Unclaimed, expired, canceled and mismatched claim evidence never manufactures Kills/Deaths',{skip},async()=>{const r=await competitionFixture();try{
 const hunter=await r.player('Evidence Hunter'),target=await r.player('Evidence Target'),sponsor=await r.player('Evidence Patron'),other=await r.player('Other Claimant');
 for(const status of['active','expired','canceled','claimed']){
  const battle=randomUUID(),bounty=randomUUID(),at=new Date('2020-02-01T12:00:00Z');
  await r.db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,created_at) VALUES($1,$2,$3,'alpha-0.3','attacker_win','{}','{}',$4)",[battle,hunter.id,target.id,at]);
  await r.db.query("INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at,settled_at,claimant_id,battle_id) VALUES($1,$2,$3,100,10,$4,'alpha-0.3',$5,$6,$7,$8,$9,$10)",[bounty,sponsor.id,target.id,status,randomUUID(),new Date(+at-1000),new Date(+at+3600000),status==='active'?null:at,status==='claimed'?other.id:null,status==='claimed'?battle:null]);
  await r.db.query("INSERT INTO bounty_kills(bounty_id,battle_id,claimant_id,target_id,ruleset_id,source,awarded_at) VALUES($1,$2,$3,$4,'alpha-0.3','legacy_claim',$5)",[bounty,battle,hunter.id,target.id,at]);
 }
 assert.equal((await competitiveProfile(r.db,hunter.id))!.kills,'0');assert.equal((await competitiveProfile(r.db,target.id))!.deaths,'0');assert.equal((await directedRivalry(r.db,hunter.id,target.id)).kills,'0');assert.equal((await hallOfChampions(r.db,hunter.id,'kills')).entries.length,0);
 }finally{await r.close();}});
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
