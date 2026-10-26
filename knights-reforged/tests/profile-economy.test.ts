import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {realm,testDatabaseUrl} from './helpers.js';

describe('Profile and authoritative active hourly gold',{skip:!testDatabaseUrl},()=>{
  const now=new Date('2038-05-01T00:00:00Z');
  let r:Awaited<ReturnType<typeof realm>>;before(async()=>{r=await realm({isolated:true,clock:()=>now});});after(async()=>{if(r)await r.close();});
  test('header shows the upcoming purse payment and Profile retains accurate net rates; prepaid and paused equipment are distinguished',async()=>{
    const p=await r.player();assert.equal((await r.me(p)).economy.netHourlyIncome,0);
    let page=await r.app.inject({method:'GET',url:'/game/home',headers:{cookie:p.cookie}});assert.match(page.body,/data-payment-gold[^>]*>0<\/span> Gold/);
    await r.prepare(p,1000,30);await r.ok(p,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});
    assert.equal((await r.me(p)).economy.netHourlyIncome,7);
    await r.ok(p,'/api/v1/inventory/purchases',{itemId:'ransackers-axe',quantity:8});
    let state=await r.me(p);assert.equal(state.economy.netHourlyIncome,-1);assert.equal(state.economy.equipmentUpkeep,8);
    assert.equal(state.payment.prepaidUpkeep,8);assert.equal(state.payment.automaticReserve,8);assert.equal(state.payment.economicNet,-1);
    page=await r.app.inject({method:'GET',url:'/game/home',headers:{cookie:p.cookie}});assert.match(page.body,/data-payment-gold[^>]*>-1<\/span> Gold/);assert.match(page.body,/data-flow="negative"/);
    await r.db.query('UPDATE wallets SET balance=0 WHERE character_id=$1',[p.id]);
    await r.db.query('UPDATE maintenance_accounts SET settled_at=$2 WHERE character_id=$1',[p.id,new Date(+now-100*3600000)]);
    state=await r.me(p);assert.equal(state.maintenance.paused,true);assert.equal(state.economy.equipmentUpkeep,0);assert.equal(state.economy.scheduledEquipmentUpkeep,8);assert.equal(state.economy.netHourlyIncome,7);
    page=await r.app.inject({method:'GET',url:'/game/land',headers:{cookie:p.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/data-payment-gold[^>]*>\+7<\/span> Gold/);assert.match(page.body,/data-land-net(?:\s[^>]*)?>7</);
    await r.prepare(p,16);state=(await r.ok(p,'/api/v1/maintenance')).state;assert.equal(state.economy.netHourlyIncome,-1);
  });
  test('Profile replaces header logout; its stats and account logout preserve authentication',async()=>{
    const a=await r.player(),b=await r.player();await r.prepare(a,200);
    for(const itemId of ['iron-sword','padded-coat','hearth-ward'])await r.ok(a,'/api/v1/inventory/purchases',{itemId});
    await r.legacyArmy(a,2);
    await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});await r.ok(b,'/api/v1/battles',{targetCharacterId:a.id});
    assert.deepEqual((await r.me(a)).battleStats,{total:2,wins:2,losses:0,kills:0,deaths:0,legacyKnockouts:0});assert.deepEqual((await r.me(b)).battleStats,{total:2,wins:0,losses:2,kills:0,deaths:0,legacyKnockouts:0});
    const home=await r.app.inject({method:'GET',url:'/game/home',headers:{cookie:a.cookie}}),topbar=/<header class="topbar">([\s\S]*?)<\/header>/.exec(home.body)![1]!;
    assert.match(topbar,/href="\/game\/profile"/);assert.ok(!topbar.includes('/logout'));
    const profile=await r.app.inject({method:'GET',url:'/game/profile',headers:{cookie:a.cookie}});assert.equal(profile.statusCode,200,profile.body);
    for(const label of ['Stats','Total Income','Upkeep','Net Income','Battles Won','Weapons','Armor','Spells','Sign Out'])assert.ok(profile.body.includes(label),label);
    assert.match(profile.body,/action="\/logout"[\s\S]*name="csrf"/);
    assert.equal((await r.app.inject({method:'POST',url:'/logout',headers:{cookie:a.cookie},payload:{}})).statusCode,403);
    assert.equal((await r.app.inject({method:'POST',url:'/logout',headers:{cookie:a.cookie},payload:{csrf:a.csrf}})).statusCode,303);
    assert.equal((await r.app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:a.cookie}})).statusCode,401);
  });
});
