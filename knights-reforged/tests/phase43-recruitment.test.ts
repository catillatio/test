import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {provisionBots} from '../src/development.js';
import {getState} from '../src/game.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
const skip=!testDatabaseUrl;

test('profile army requests use persistent consent, expose pending/accepted/declined states, and preserve replay and self-invitation protection',{skip},async()=>{
 let now=new Date('2045-03-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now});try{
  const a=await r.player('Ally Leader'),b=await r.player('Consenting Ally'),c=await r.player('Declining Ally');
  const profile=async(id:string)=>r.app.inject({method:'GET',url:'/game/players/'+id,headers:{cookie:a.cookie}});
  assert.match((await profile(b.id)).body,/Invite to Army/);
  const key=randomUUID();await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id},key);
  assert.match((await profile(b.id)).body,/request pending their acceptance/);
  assert.equal((await r.me(a)).army.allies,0);assert.equal((await r.me(b)).army.allies,0);
  assert.equal((await r.command(a,'/api/v1/army/invitations',{targetCharacterId:b.id})).statusCode,409);
  await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id},key);
  await r.ok(b,'/api/v1/army/acceptances',{targetCharacterId:a.id});
  assert.match((await profile(b.id)).body,/Already in your army/);assert.equal((await r.me(a)).army.allies,1);
  now=new Date(+now+30000);await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:c.id});
  await r.ok(c,'/api/v1/army/rejections',{targetCharacterId:a.id});assert.match((await profile(c.id)).body,/Previous request declined/);
  assert.equal((await r.command(a,'/api/v1/army/invitations',{targetCharacterId:a.id})).statusCode,422);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM army_links')).rows[0]!.n,2);
 }finally{await r.close();}
});

test('bot profile recruitment immediately accepts once, uses normal army/equipment limits, and disables safely without deleting links',{skip},async()=>{
 let now=new Date('2045-03-02T00:00:00Z');
 const r=await realm({isolated:true,clock:()=>now,developmentBotsEnabled:true,developmentBotRecruitmentEnabled:true});try{
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  const a=await r.player('Rival Recruiter');
  const bots=(await r.db.query("SELECT c.id,c.account_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=1 AND b.tier='green' ORDER BY b.variant")).rows;
  const target=bots[0]!,beforeBot=await getState(r.db,target.account_id),key=randomUUID();
  const page=await r.app.inject({method:'GET',url:'/game/players/'+target.id,headers:{cookie:a.cookie}});assert.match(page.body,/immediately accepts/);
  const hits=await Promise.all([r.ok(a,'/api/v1/army/invitations',{targetCharacterId:target.id},key),r.ok(a,'/api/v1/army/invitations',{targetCharacterId:target.id},key)]);
  assert.equal(hits[0].state.army.allies,1);assert.equal(hits[1].state.army.allies,1);assert.equal(hits[0].state.army.participants,2);
  assert.equal((await r.db.query("SELECT count(*)::int AS n FROM army_links WHERE status='accepted'")).rows[0]!.n,1);
  const bot=await getState(r.db,target.account_id,{developmentBotRecruitmentEnabled:true});assert.equal(bot.army.participants,beforeBot.army.participants);assert.equal(bot.army.allies,0);assert.ok(bot.army.total<=10);
  assert.equal((await r.command(a,'/api/v1/army/invitations',{targetCharacterId:target.id})).statusCode,409);
  now=new Date(+now+30000);await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:bots[1]!.id});
  now=new Date(+now+30000);const full=await r.command(a,'/api/v1/army/invitations',{targetCharacterId:bots[2]!.id});assert.equal(full.statusCode,409);assert.equal(full.json().error.code,'ARMY_FULL');
  assert.equal((await r.me(a)).army.participants,3);assert.equal((await r.me(a)).army.allies,2);
  await r.prepare(a,100);await r.ok(a,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});
  assert.equal((await r.me(a)).attackEquipment.selected.reduce((n,i)=>n+i.quantity,0),1);
  const disabled=await createApp({db:r.db,config:loadConfig({NODE_ENV:'test',ENABLE_DEV_BOTS:'1'})});try{
   const state=await disabled.inject({method:'GET',url:'/api/v1/me',headers:{cookie:a.cookie}});assert.equal(state.json().state.army.allies,0);
   const page=await disabled.inject({method:'GET',url:'/game/players/'+bots[2]!.id,headers:{cookie:a.cookie}});assert.match(page.body,/recruitment is disabled/);
  }finally{await disabled.close();}
  assert.equal((await r.db.query("SELECT count(*)::int AS n FROM army_links WHERE status='accepted'")).rows[0]!.n,2);
 }finally{await r.close();}
});

test('development bot recruitment cannot be enabled in production, staging or without active development rivals',()=>{
 for(const env of [{NODE_ENV:'production',APP_ORIGIN:'https://realm.example',ENABLE_DEV_BOTS:'1',ENABLE_DEV_BOT_RECRUITMENT:'1'},{NODE_ENV:'staging',ENABLE_DEV_BOTS:'1',ENABLE_DEV_BOT_RECRUITMENT:'1'},{NODE_ENV:'test',ENABLE_DEV_BOT_RECRUITMENT:'1'}])assert.equal(loadConfig(env).developmentBotRecruitmentEnabled,false);
 assert.equal(loadConfig({NODE_ENV:'test',ENABLE_DEV_BOTS:'1',ENABLE_DEV_BOT_RECRUITMENT:'1'}).developmentBotRecruitmentEnabled,true);
});
