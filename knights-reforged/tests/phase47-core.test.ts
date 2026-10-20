import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {equipmentResale,victoryExperience47} from '../src/game-feel-rules.js';
import {victoryExperience45} from '../src/gameplay-rules.js';
import {callingName,callingDescription} from '../src/calling-presentation.js';
import {strategy,callingFor} from '../src/strategy-rules.js';
import {soundFeedback} from '../src/sound.js';
const skip=!testDatabaseUrl;
test('new resale uses recorded cost, floors each copy and cannot create buy/sell arbitrage',()=>{
 for(const [price,sale] of [[0,0],[5,3],[75,50],[100,66],[9000,6000],[175000,116666]])assert.equal(equipmentResale(price!),sale);
 for(let price=1;price<10000;price++)assert.ok(equipmentResale(price)<price);
});
test('Calling presentation changes no keys, attributes, bonuses or recovery rules',()=>{
 const names=['Barbarian','Tank','Mage'];Object.keys(strategy.callings).forEach((key,i)=>{assert.equal(callingName(key),names[i]);assert.deepEqual(callingFor(key),strategy.callings[key as keyof typeof strategy.callings]);assert.match(callingDescription(key),/recovery/);});
 assert.equal(callingName('Historical title'),'Historical title');assert.match(callingDescription('Spellward'),/normal power/);
});
test('XP only softens non-trivial difficulty scaling; matched, weak and repeat gates remain',()=>{
 for(const level of [1,8,17,25,40,50,80]){
  assert.equal(victoryExperience47(level,level).amount,victoryExperience45(level,level).amount);
  assert.ok(victoryExperience47(level,level,true,100,40).amount>=victoryExperience45(level,level,true,100,40).amount);
  assert.equal(victoryExperience47(level,level,true,100,34).amount,1);
  assert.equal(victoryExperience47(level,level,false,100,125).amount,1);
  assert.equal(victoryExperience47(level,level,true,100,35).rulesetId,'game-feel-1');
 }
});
test('confirmed sound selects one highest-priority cue and uses immutable action identity',()=>{
 const receipt={commandId:randomUUID(),kind:'buy',data:{}};
 assert.equal(soundFeedback(receipt,null,'a')?.cue,'equipment');
 assert.equal(soundFeedback({...receipt,data:{newAchievements:['a']}},null,'a')?.cue,'achievement');
 assert.equal(soundFeedback({...receipt,data:{newAchievements:['a'],celebration:{level:2}}},null,'a')?.cue,'level');
 const battle={commandId:receipt.commandId,winnerId:'a',attackerId:'a',victoryStyle:'decisive'};
 assert.equal(soundFeedback(null,battle,'a')?.cue,'decisive');assert.equal(soundFeedback(null,battle,'b')?.cue,'defeat');
 assert.equal(soundFeedback(null,null,'a'),null);assert.equal(soundFeedback({...receipt,kind:'tutorial',data:{tutorialAction:'finish'}},null,'a')?.cue,'tutorial');
});
test('new-player sound opt-in and legacy mute persist, validate ranges, authorize and resist CSRF',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player(),b=await r.player();await r.db.query('DELETE FROM sound_preferences WHERE character_id=$1',[b.id]);let response=await r.app.inject({url:'/api/v1/me',headers:{cookie:a.cookie}});assert.deepEqual(response.json().sound,{enabled:true,volume:55});
  const key=randomUUID();await Promise.all([r.ok(a,'/api/v1/settings/sound',{enabled:'1',volume:'38'},key),r.ok(a,'/api/v1/settings/sound',{enabled:'1',volume:'38'},key)]);
  response=await r.app.inject({url:'/game/settings',headers:{cookie:a.cookie}});assert.equal(response.statusCode,200,response.body);assert.match(response.body,/data-sound-enabled="1" data-sound-volume="38"/);
  assert.deepEqual((await r.app.inject({url:'/api/v1/me',headers:{cookie:b.cookie}})).json().sound,{enabled:false,volume:55});
  for(const volume of [-1,101,'NaN'])assert.equal((await r.command(a,'/api/v1/settings/sound',{enabled:'1',volume})).statusCode,422);
  assert.equal((await r.app.inject({method:'POST',url:'/api/v1/settings/sound',headers:{cookie:a.cookie,origin:'https://evil.example'},payload:{csrf:a.csrf,commandId:randomUUID(),enabled:'0',volume:1}})).statusCode,403);
  assert.equal((await r.app.inject({method:'POST',url:'/api/v1/settings/sound',headers:{cookie:a.cookie,origin:'http://localhost:3000'},payload:{commandId:randomUUID(),enabled:'0',volume:1}})).statusCode,403);
 }finally{await r.close();}
});
test('resale quote equals actual concurrent FIFO sale, duplicate receipt pays once, Land resale unchanged',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player();await r.prepare(a,10000);await r.ok(a,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:2});
  const before=await r.me(a),item=before.inventory.find(i=>i.id==='squires-blade')!;assert.equal(item.resaleSteps![1],equipmentResale(item.price)*2);
  const key=randomUUID(),body={itemId:item.id,quantity:2};const results=await Promise.all([r.ok(a,'/api/v1/inventory/sales',body,key),r.ok(a,'/api/v1/inventory/sales',body,key)]);
  assert.equal(results[0].commandId,results[1].commandId);assert.equal((await r.me(a)).gold,before.gold+equipmentResale(item.price)*2);
  assert.equal((await r.command(a,'/api/v1/inventory/sales',body)).statusCode,409);
  assert.equal((await r.db.query("SELECT count(*)::int n FROM inventory_transactions WHERE character_id=$1 AND kind='sell'",[a.id])).rows[0]!.n,1);
 }finally{await r.close();}
});
test('expired marketplace sessions return only to an allowlisted destination and cannot cause an open redirect',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const page=await r.app.inject({url:'/login?returnTo=%2Fgame%2Fland'});assert.match(page.body,/name="returnTo" value="\/game\/land"/);
  const sale=await r.app.inject({url:'/login?returnTo='+encodeURIComponent('/game/land?command=12345678-1234-4234-8234-123456789abc#property-smallholding')});assert.match(sale.body,/name="returnTo" value="\/game\/land\?command=12345678-1234-4234-8234-123456789abc#property-smallholding"/);
  const foreign=await r.app.inject({url:'/login?returnTo=https%3A%2F%2Fevil.example'});assert.match(foreign.body,/name="returnTo" value="\/game\/home"/);
 }finally{await r.close();}
});
