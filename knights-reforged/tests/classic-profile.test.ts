import test from 'node:test';import assert from 'node:assert/strict';
import {classicProfileFixture,profileBusinessSnapshot} from './classic-profile-fixture.js';import {realm,testDatabaseUrl} from './helpers.js';import {competitiveProfile} from '../src/competitive-records.js';
const skip=!testDatabaseUrl;
const labels=(html:string)=>[...html.matchAll(/<dt(?:\s[^>]*)?>([^<]+)<\/dt>/g)].map(m=>m[1]);
const values=(html:string)=>[...html.matchAll(/<dd(?:\s[^>]*)?>([^<]+)<\/dd>/g)].map(m=>m[1]);
const section=(body:string,attribute:string)=>{const start=body.indexOf(attribute);assert.ok(start>0,attribute);return body.slice(start,body.indexOf('</section>',start));};
test('Classic self/public profile shows exactly six Stats and three saved Income values without changing equipment, private state or competitive history',{skip},async()=>{const r=await classicProfileFixture();try{
 const state=await r.me(r.owner),record=(await competitiveProfile(r.db,r.owner.id))!;assert.equal(record.kills,'1');assert.equal(record.deaths,'1');const before=await profileBusinessSnapshot(r.db);
 for(const own of[true,false]){const page=await r.app.inject({url:own?'/game/profile':'/game/players/'+r.owner.id,headers:{cookie:own?r.owner.cookie:r.rival.cookie}});assert.equal(page.statusCode,200,page.body);
  const stats=section(page.body,'data-profile-stats'),income=section(page.body,'data-profile-income');
  assert.deepEqual(labels(stats),['Kills','Battles Won','Deaths','Battles Lost','Quests','Initiated for']);assert.deepEqual(values(stats),['1',String(state.battleStats.wins),'1',String(state.battleStats.losses),String(state.questsCompleted),'1,084 days']);
  assert.deepEqual(labels(income),['Total Income','Upkeep','Net Income']);assert.deepEqual(values(income),[state.economy.grossHourlyIncome,state.economy.totalUpkeep,state.economy.netHourlyIncome].map(n=>n.toLocaleString('en')+' / hr'));
  assert.ok(page.body.indexOf('data-profile-stats')<page.body.indexOf('data-profile-income'));assert.ok(page.body.indexOf('data-profile-income')<page.body.indexOf('class="panel profile-inventory"'));
  for(const removed of ['Competitive Record','Claim credits','Claims against you','Army participating','Verified human bounty finishing','Historical claims retain','id="rivalry"','class="next-level-strip"'])assert.ok(!page.body.includes(removed),removed);
  const inventory=page.body.slice(page.body.indexOf('class="panel profile-inventory"'),page.body.indexOf('class="panel profile-estate"'));for(const category of['Weapons','Armor','Spells'])assert.ok(inventory.includes('>'+category+' <span>'));
  for(const item of state.inventory)assert.ok(inventory.includes('Inspect '+item.name.replaceAll('&','&amp;').replaceAll("'",'&#39;')+', owned '+item.quantity),item.id);
  if(!own){assert.ok(!page.body.includes(r.owner.accountId));assert.ok(!page.body.includes(state.invitationCode));assert.ok(!page.body.includes('name="resource"'));assert.ok(!page.body.includes('action="/logout"'));
   const publicData=(await r.app.inject({url:'/api/v1/players/'+r.owner.id,headers:{cookie:r.rival.cookie}})).json().character;for(const privateField of ['gold','accountId','account_id','accountCreatedAt','maintenance','invitationCode','csrf'])assert.equal(Object.hasOwn(publicData,privateField),false,privateField);
  }
 }
 const history=await r.app.inject({url:'/game/players/'+r.owner.id+'?tab=battles',headers:{cookie:r.rival.cookie}});assert.equal(history.statusCode,200,history.body);assert.match(history.body,/id="rivalry"/);
 const skills=await r.app.inject({url:'/game/profile?tab=skills',headers:{cookie:r.owner.cookie}});assert.equal(skills.statusCode,200);assert.match(skills.body,/id="skills"/);
 const publicSkills=await r.app.inject({url:'/game/players/'+r.owner.id+'?tab=skills',headers:{cookie:r.rival.cookie}});assert.equal(publicSkills.statusCode,200);assert.ok(!publicSkills.body.includes('name="resource"'));
 assert.deepEqual(await profileBusinessSnapshot(r.db),before,'layout reads preserve all saved business rows');
 await r.db.query('UPDATE characters SET name=$2 WHERE id=$1',[r.owner.id,'Éowyn & <img src=x onerror=alert(1)>']);const escaped=await r.app.inject({url:'/game/players/'+r.owner.id,headers:{cookie:r.rival.cookie}});assert.equal(escaped.statusCode,200);assert.ok(!escaped.body.includes('<img src=x onerror=alert(1)>'));assert.match(escaped.body,/Éowyn &amp; &lt;img/);
 }finally{await r.close();}});
test('Classic Income keeps zero, negative, prepaid and suspended-upkeep values authoritative, with no extra explanatory rows',{skip},async()=>{const r=await realm({isolated:true,clock:()=>new Date('2038-05-01T00:00:00Z')});try{
 const p=await r.player('Income Reference');const income=async()=>section((await r.app.inject({url:'/game/profile',headers:{cookie:p.cookie}})).body,'data-profile-income');assert.deepEqual(values(await income()),['0 / hr','0 / hr','0 / hr']);
 await r.prepare(p,1000,30);await r.ok(p,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});await r.ok(p,'/api/v1/inventory/purchases',{itemId:'ransackers-axe',quantity:8});assert.deepEqual(values(await income()),['8 / hr','9 / hr','-1 / hr']);assert.equal((await r.me(p)).maintenance.paused,false);
 await r.db.query('UPDATE wallets SET balance=0 WHERE character_id=$1',[p.id]);await r.db.query('UPDATE maintenance_accounts SET settled_at=$2 WHERE character_id=$1',[p.id,new Date(Date.parse('2038-05-01T00:00:00Z')-100*3600000)]);
 const state=await r.me(p);assert.equal(state.maintenance.paused,true);assert.equal(state.economy.scheduledEquipmentUpkeep,8);assert.deepEqual(values(await income()),['8 / hr','1 / hr','7 / hr']);assert.deepEqual(labels(await income()),['Total Income','Upkeep','Net Income']);
 }finally{await r.close();}});
