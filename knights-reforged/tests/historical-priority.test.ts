import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {renderFile} from 'ejs';
import {ownedProperties} from '../src/profiles.js';
import {expandedContent} from '../src/expansion-content.js';
import {coordinatedArt} from '../src/coordinated-artwork.js';
import {regionalArt} from '../src/regional-artwork.js';
import {approvedEquipmentArt} from '../src/equipment-artwork.js';
import {presentationArt,presentedItem,equipmentPresentation} from '../src/equipment-presentation.js';
import {preparedExpansionArt} from '../src/expansion-artwork.js';
import {alpha} from '../src/alpha-rules.js';
import type {CharacterState} from '../src/game.js';
import {competitionFixture} from './phase6-fixtures.js';
import {testDatabaseUrl} from './helpers.js';
import {researchReward} from '../scripts/historical-xp-study.js';
const skip=!testDatabaseUrl;
const art=(entry:unknown,small=false)=>renderFile('views/partials/catalog-art.ejs',{entry,small,coordinatedArt,regionalArt,approvedEquipmentArt,presentationArt,preparedExpansionArt});

test('offline XP alternatives preserve caps, bot scaling, human win budgets and explicit easy-repeat protection',()=>{
 for(const policy of ['current','continuous-v1','bands-v1','hybrid-v1'] as const)for(const level of[1,10,25,50,75,100]){
  assert.equal(researchReward(policy,level,level,.01,'bot',5),1);
  assert.equal(researchReward(policy,level,level,1,'human',4),1);
  assert.ok(researchReward(policy,level,level,1,'bot',1)<=365);
  for(const ratio of [.1,.2,.3499,.35,.7,1])assert.ok(Number.isSafeInteger(researchReward(policy,level,level,ratio,'bot')));
 }
 assert.equal(researchReward('current',50,50,.3499,'bot'),1);
 assert.ok(Math.abs(researchReward('continuous-v1',50,50,.3499,'bot')-researchReward('continuous-v1',50,50,.35,'bot'))<=1);
 assert.equal(researchReward('hybrid-v1',50,50,.2,'bot',5),1);
 assert.equal(researchReward('current',50,50,.7,'bot'),researchReward('hybrid-v1',50,50,.7,'bot'));
});

test('every catalog property retains the metadata needed by the shared artwork resolver and its saved finances',async()=>{
 const holdings=expandedContent.properties.map((p,i)=>({propertyId:p.id,name:p.name,quantity:2,hourlyIncome:100+i,hourlyUpkeep:7+i}));
 const state={rulesetId:expandedContent.id,land:{holdings}} as unknown as CharacterState,before=structuredClone(state);
 const properties=ownedProperties(state);
 assert.equal(properties.length,expandedContent.properties.length);
 for(const property of properties){
  const definition=expandedContent.properties.find(p=>p.id===property.id)!;
  assert.equal(property.level,definition.level);
  assert.deepEqual(coordinatedArt(property),coordinatedArt(definition));
  const html=await art(property);assert.ok(!html.includes('equipment-art-frame'),'Land keeps its own framing');
  const approved=coordinatedArt(definition);
  if(approved){assert.ok(html.includes(approved.path!));assert.ok(existsSync('public/'+approved.path!.replace('/assets/','')));}
  const holding=holdings.find(h=>h.propertyId===property.id)!;
  assert.deepEqual([property.quantity,property.grossIncome,property.upkeep],[2,holding.hourlyIncome,holding.hourlyUpkeep]);
 }
 assert.match(await art(properties.find(p=>p.id==='marcher-stronghold')!),/regional-weapon-land-1\/marcher-stronghold/);
 const retired=ownedProperties({land:{holdings:[{propertyId:'retired-estate',name:'Inherited estate',quantity:1,hourlyIncome:17,hourlyUpkeep:3}]}} as unknown as CharacterState)[0]!;
 assert.equal(retired.level,undefined);assert.equal(retired.name,'Inherited estate');assert.match(await art(retired),/fields.svg/);
 assert.deepEqual(state,before);
});

test('atlas, SVG, approved and expansion equipment all render exactly one shared frame, preserving source identities',async()=>{
 for(const catalog of [alpha,expandedContent])for(const definition of catalog.items){
  for(const entry of [definition,presentedItem(definition,equipmentPresentation.id)]){
   const html=await art(entry);
   assert.equal((html.match(/class="equipment-art-frame"/g)??[]).length,1,entry.id);
   assert.equal((html.match(/class="catalog-art/g)??[]).length,1,entry.id);
   assert.ok(html.includes(entry.name.replaceAll('&','&amp;').replaceAll("'",'&#39;'))||html.includes(entry.id),entry.id);
  }
 }
 assert.match(await art(alpha.items[0]!,true),/equipment-art-frame equipment-art-small/);
});

test('cross-level placement uses the same backend quote, profile link, HTML confirmation and API transaction in both directions',{skip},async()=>{
 const r=await competitionFixture();try{
  for(const [from,to] of [[10,50],[50,10],[100,5],[5,100],[25,25]]){
   const a=await r.player('Patron '+from,from),b=await r.player('Target '+to,to);
   const page=await r.app.inject({url:'/game/players/'+b.id,headers:{cookie:a.cookie}});
   assert.equal(page.statusCode,200,page.body);assert.ok(page.body.includes('/game/bounties/new?target='+b.id));
   const form=await r.app.inject({url:'/game/bounties/new?target='+b.id,headers:{cookie:a.cookie}});assert.equal(form.statusCode,200,form.body);
   const preview=await r.app.inject({method:'POST',url:'/game/bounties/preview',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{csrf:a.csrf,targetCharacterId:b.id,amount:100}});
   assert.equal(preview.statusCode,200,preview.body);assert.match(preview.body,/Confirm bounty/);
   const gold=(await r.me(a)).gold,key=randomUUID(),intent={targetCharacterId:b.id,amount:100};
   const [one,two]=await Promise.all([r.ok(a,'/api/v1/bounties/placements',intent,key),r.ok(a,'/api/v1/bounties/placements',intent,key)]);
   assert.equal(one.data.bountyId,two.data.bountyId);assert.equal((await r.me(a)).gold,gold-110);
   if(from!==to)assert.equal((await r.command(a,'/api/v1/battles',{targetCharacterId:b.id})).json().error.code,'RIVAL_LEVEL_RANGE');
  }
 }finally{await r.close();}
});

test('cross-level sponsorship retains nonexistent, self, disabled, novice, ally and affordability protections',{skip},async()=>{
 const r=await competitionFixture();try{
  const a=await r.player('Patron',5),b=await r.player('Established Target',100),novice=await r.player('New Target',1);
  const before=(await r.me(a)).gold;
  for(const targetCharacterId of [randomUUID(),a.id,novice.id])assert.ok((await r.command(a,'/api/v1/bounties/placements',{targetCharacterId,amount:100})).statusCode>=400);
  await r.db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[b.accountId]);
  assert.equal((await r.command(a,'/api/v1/bounties/placements',{targetCharacterId:b.id,amount:100})).json().error.code,'BOUNTY_ELIGIBILITY');
  await r.db.query('UPDATE accounts SET login_disabled=false WHERE id=$1',[b.accountId]);
  await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id});await r.ok(b,'/api/v1/army/acceptances',{targetCharacterId:a.id});
  assert.equal((await r.command(a,'/api/v1/bounties/placements',{targetCharacterId:b.id,amount:100})).json().error.code,'BOUNTY_ALLY');
  await r.ok(a,'/api/v1/army/removals',{targetCharacterId:b.id});assert.equal((await r.me(a)).gold,before);
  await r.db.query('UPDATE wallets SET balance=100 WHERE character_id=$1',[a.id]);
  assert.equal((await r.command(a,'/api/v1/bounties/placements',{targetCharacterId:b.id,amount:100})).statusCode,409);
  assert.equal((await r.me(a)).gold,100);assert.equal((await r.db.query('SELECT count(*)::int n FROM bounties')).rows[0]!.n,0);
  assert.equal((await r.db.query("SELECT count(*)::int n FROM economy_transactions WHERE reason IN ('bounty_fee','bounty_escrow')")).rows[0]!.n,0);
 }finally{await r.close();}
});

test('simultaneous cross-level sponsors retain one active listing and rollback the losing debit',{skip},async()=>{
 const r=await competitionFixture();try{
  const a=await r.player('Small Patron',5),b=await r.player('Great Patron',100),t=await r.player('Middle Target',50);
  const before=await Promise.all([r.me(a),r.me(b)]),players=[a,b];
  const results=await Promise.all(players.map(p=>r.command(p,'/api/v1/bounties/placements',{targetCharacterId:t.id,amount:100})));
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
  for(let n=0;n<2;n++)assert.equal((await r.me(players[n]!)).gold,before[n]!.gold-(results[n]!.statusCode===200?110:0));
  assert.equal((await r.db.query("SELECT count(*)::int n FROM bounties WHERE target_id=$1 AND status='active'",[t.id])).rows[0]!.n,1);
 }finally{await r.close();}
});

test('three real losses do not consume human successful-win XP; mixed wins, concurrent submissions and retries retain the three-win safeguard',{skip},async()=>{
 const r=await competitionFixture();try{
  const a=await r.player('Persistent Attacker',25),b=await r.player('Training Rival',25);
  await r.legacyArmy(b,20);await r.ok(b,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});await r.ok(b,'/api/v1/inventory/purchases',{itemId:'padded-coat',quantity:20});
  const refill=()=>r.db.query('UPDATE characters SET health=max_health,spirit=max_spirit,health_updated_at=$2,spirit_updated_at=$2 WHERE id=ANY($1::uuid[])',[[a.id,b.id],r.now()]);
  const battle=async()=>{await refill();const hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});return (await r.db.query('SELECT * FROM battles WHERE id=$1',[hit.battleId])).rows[0]!;};
  const losses=[];for(let n=0;n<3;n++){const loss=await battle();assert.equal(loss.outcome,'defender_win');assert.equal(loss.result.attackerXp,0);losses.push(loss);}
  // Controlled fixture gear change: the eventual win remains nontrivial.
  await r.legacyArmy(a,20);await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});
  await r.db.query('UPDATE characters SET attack_training=25 WHERE id=$1',[a.id]);
  const state=await r.me(a),target=await r.me(b);assert.ok(target.defense/state.attack>=.35&&target.defense/state.attack<.81,JSON.stringify({attack:state.attack,defense:target.defense}));
  const first=await battle();assert.equal(first.outcome,'attacker_win');assert.ok(first.result.attackerXp>1);assert.equal(first.result.xpDetails.reason,'matched_victory');
  await battle();await refill();
  const keys=[randomUUID(),randomUUID()],parallel=await Promise.all(keys.map(key=>r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key)));
  const saved=(await r.db.query('SELECT result FROM battles WHERE id=ANY($1::uuid[])',[parallel.map(p=>p.battleId)])).rows.map(row=>row.result);
  assert.deepEqual(saved.map(s=>s.xpDetails.reason).sort(),['matched_victory','repeat_budget']);
  const count=(await r.db.query('SELECT count(*)::int n FROM battles')).rows[0]!.n;
  assert.equal((await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},keys[0]!)).battleId,parallel[0]!.battleId);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM battles')).rows[0]!.n,count);
  assert.deepEqual((await r.db.query("SELECT * FROM battles WHERE id=ANY($1::uuid[]) ORDER BY id",[losses.map(l=>l.id)])).rows,losses.sort((a,b)=>a.id.localeCompare(b.id)));
  r.advance(86400);const reset=await battle();assert.equal(reset.result.xpDetails.reason,'matched_victory');
 }finally{await r.close();}
});

test('historical rewarded losses remain immutable while only rewarded successful wins count at the exact rolling boundary',{skip},async()=>{
 const r=await competitionFixture();try{
  const a=await r.player('Legacy Attacker',25),b=await r.player('Legacy Target',25);
  await r.legacyArmy(a,20);await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});
  await r.legacyArmy(b,20);await r.ok(b,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});await r.ok(b,'/api/v1/inventory/purchases',{itemId:'padded-coat',quantity:20});
  const cutoff=new Date(+r.now()-86400000);
  for(const [outcome,at] of [['defender_win',r.now()],['defender_win',r.now()],['defender_win',r.now()],['attacker_win',cutoff],['attacker_win',cutoff],['attacker_win',cutoff]] as const)
   await r.db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,rewarded,created_at) VALUES($1,$2,$3,'alpha-0.3',$4,'{}','{}',true,$5)",[randomUUID(),a.id,b.id,outcome,at]);
  const before=(await r.db.query('SELECT * FROM battles ORDER BY id')).rows;
  const hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});
  const result=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;assert.equal(result.xpDetails.reason,'matched_victory');assert.ok(result.attackerXp>1);
  assert.deepEqual((await r.db.query('SELECT * FROM battles WHERE id=ANY($1::uuid[]) ORDER BY id',[before.map(b=>b.id)])).rows,before);
 }finally{await r.close();}
});
