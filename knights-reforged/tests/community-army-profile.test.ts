import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {invitationCode} from '../src/community.js';
import {activityFeed} from '../src/feeds.js';
const skip=!testDatabaseUrl;
async function setup(){let now=new Date('2038-01-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now});return {...r,now:()=>now,advance:(n:number)=>{now=new Date(+now+n*1000);}};}
test('invitation codes are unique, persistent and private; simultaneous requests cannot create duplicate alliances',{skip},async()=>{
  const r=await setup();try{
    const a=await r.player('Allied Knight'),b=await r.player('Northern Banner'),other=await r.player();
    const ac=(await r.me(a)).invitationCode,bc=(await r.me(b)).invitationCode;assert.match(ac,/^[A-F0-9]{12}$/);assert.notEqual(ac,bc);
    const codes=await Promise.all(Array.from({length:10},()=>invitationCode(r.db,a.id)));assert.ok(codes.every(c=>c===ac));
    assert.equal((await r.command(a,'/api/v1/army/code-invitations',{code:ac})).json().error.code,'SELF_INVITE');
    assert.equal((await r.command(a,'/api/v1/army/code-invitations',{code:'xyz'})).statusCode,422);
    assert.equal((await r.command(a,'/api/v1/army/code-invitations',{code:'000000000000'})).statusCode,404);
    const key=randomUUID(),send=await Promise.all([r.ok(a,'/api/v1/army/code-invitations',{code:bc.toLowerCase()},key),r.ok(a,'/api/v1/army/code-invitations',{code:bc.toLowerCase()},key)]);assert.equal(send[0].commandId,send[1].commandId);
    assert.equal((await r.me(a)).army.allies,0);assert.equal((await r.me(b)).army.allies,0);
    assert.equal((await r.command(a,'/api/v1/army/acceptances',{targetCharacterId:b.id})).statusCode,403);
    assert.equal((await r.command(other,'/api/v1/army/acceptances',{targetCharacterId:a.id})).statusCode,403);
    const accepted=await Promise.all([r.command(b,'/api/v1/army/acceptances',{targetCharacterId:a.id}),r.command(b,'/api/v1/army/acceptances',{targetCharacterId:a.id})]);assert.deepEqual(accepted.map(p=>p.statusCode).sort(),[200,403]);
    assert.equal((await r.me(a)).army.allies,1);assert.equal((await r.me(a)).army.participants,2);
    assert.equal((await r.me(b)).army.allies,1);assert.equal((await r.me(a)).invitationCode,ac);
    const api=await r.app.inject({method:'GET',url:'/api/v1/players/'+a.id,headers:{cookie:other.cookie}});assert.equal(api.statusCode,200);assert.ok(!api.body.includes(ac));
  }finally{await r.close();}
});
test('recipients can reject, senders can cancel, invitation spam and roster edits stay constrained',{skip},async()=>{
  const r=await setup();try{
    const a=await r.player(),b=await r.player(),c=await r.player();
    await r.ok(a,'/api/v1/army/code-invitations',{code:(await r.me(b)).invitationCode});
    assert.equal((await r.command(a,'/api/v1/army/rejections',{targetCharacterId:b.id})).statusCode,403);
    assert.equal((await r.command(a,'/api/v1/army/code-invitations',{code:(await r.me(c)).invitationCode})).statusCode,429);
    await r.ok(b,'/api/v1/army/rejections',{targetCharacterId:a.id});assert.equal((await r.me(a)).army.allies,0);
    r.advance(30);assert.equal((await r.command(a,'/api/v1/army/code-invitations',{code:(await r.me(b)).invitationCode})).json().error.code,'REINVITATION_COOLDOWN');
    await r.ok(a,'/api/v1/army/code-invitations',{code:(await r.me(c)).invitationCode});await r.ok(a,'/api/v1/army/removals',{targetCharacterId:c.id});
    const events=(await r.db.query('SELECT kind FROM army_events ORDER BY created_at,id')).rows.map(e=>e.kind);assert.equal(events.filter(k=>k==='invited').length,2);assert.ok(events.includes('rejected')&&events.includes('canceled'));
    const feed=await activityFeed(r.db,b.id,'all');assert.ok(feed.entries.some(e=>e.kind==='army'&&e.data.event==='rejected'));
    for(const tab of ['recruit','army','dashboard']){const page=await r.app.inject({method:'GET',url:'/game/army?tab='+tab,headers:{cookie:a.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/aria-label="Army sections"/);}
  }finally{await r.close();}
});
test('public profiles aggregate actual saved Land rates, illustrate holdings and exclude private state and battle histories',{skip},async()=>{
  const r=await setup();try{
    const owner=await r.player('Estate Owner'),viewer=await r.player();await r.prepare(owner,2000);
    await r.ok(owner,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:2});
    await r.db.query("INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through) VALUES($1,$2,'smallholding','Inherited Fields','alpha-0.2',1,1,20,17,3,3600,$3,$3)",[randomUUID(),owner.id,r.now()]);
    await r.ok(owner,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:2});
    const own=await r.me(owner),api=await r.app.inject({method:'GET',url:'/api/v1/players/'+owner.id,headers:{cookie:viewer.cookie}});assert.equal(api.statusCode,200,api.body);
    const character=api.json().character;assert.equal(character.properties.length,1);assert.equal(character.properties[0].quantity,3);
    assert.equal(character.properties[0].grossIncome,33);assert.equal(character.properties[0].upkeep,5);assert.deepEqual(character.economy,own.economy);
    for(const field of ['gold','accountId','account_id','accountCreatedAt','invitationCode','csrf','maintenance','land','quests','army.links'])assert.ok(!Object.hasOwn(character,field),field);
    assert.ok(!api.body.includes(owner.accountId));assert.ok(!api.body.includes('inventoryId'));assert.ok(!api.body.includes(own.invitationCode));
    for(const path of ['/game/players/'+owner.id,'/game/players/'+owner.id+'?tab=battles','/game/players/'+owner.id+'?tab=skills']){
      const page=await r.app.inject({method:'GET',url:path,headers:{cookie:viewer.cookie}});assert.equal(page.statusCode,200,page.body);assert.ok(!page.body.includes('name="className"'));assert.ok(!page.body.includes('name="resource"'));
      if(!path.includes('battles')){assert.match(page.body,/Kingdom Holdings/);assert.match(page.body,/33 gold\/hr/);}
    }
    const ownLink=await r.app.inject({method:'GET',url:'/game/players/'+owner.id,headers:{cookie:owner.cookie}});assert.equal(ownLink.statusCode,302);assert.ok(ownLink.headers.location!.startsWith('/game/profile'));
    const ownPage=await r.app.inject({method:'GET',url:'/game/profile',headers:{cookie:owner.cookie}});assert.equal(ownPage.statusCode,200);assert.match(ownPage.body,/Kingdom Holdings/);
  }finally{await r.close();}
});
