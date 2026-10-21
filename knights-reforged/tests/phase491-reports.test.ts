import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';import {soundFeedback} from '../src/sound.js';
test('saved attacker/defender equipment and rewards remain authoritative; details do not invent historical information',{skip:!testDatabaseUrl},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Report Attacker'),b=await r.player('Report Defender'),other=await r.player('No Access');for(const p of[a,b])await r.prepare(p,3000);
  await r.ok(a,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:2});await r.ok(b,'/api/v1/inventory/purchases',{itemId:'padded-coat',quantity:1});
  const hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});const before=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
  await r.ok(b,'/api/v1/inventory/sales',{itemId:'padded-coat',quantity:1});
  for(const p of[a,b]){const response=await r.app.inject({url:'/game/battles/'+hit.battleId,headers:{cookie:p.cookie}});assert.equal(response.statusCode,200,response.body);assert.match(response.body,/<details open class="encounter-equipment enemy-equipment/);assert.match(response.body,/<details open class="encounter-equipment own-equipment/);assert.match(response.body,/Padded Coat/);assert.ok(response.body.indexOf('class="battle-rewards"')<response.body.indexOf('class="battle-damage"'));assert.ok(response.body.indexOf('class="battle-armies"')<response.body.indexOf('class="panel follow-up-combat"'));}
  assert.equal((await r.app.inject({url:'/game/battles/'+hit.battleId,headers:{cookie:other.cookie}})).statusCode,404);assert.deepEqual((await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result,before);
  const id=randomUUID();await r.db.query(`INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,'alpha-0.3','attacker_win','{}',$4)`,[id,a.id,b.id,{attackerName:'Historical Name',defenderName:'Historical Rival',loot:0}]);
  const legacy=await r.app.inject({url:'/game/battles/'+id,headers:{cookie:a.cookie}});assert.equal(legacy.statusCode,200,legacy.body);assert.match(legacy.body,/Equipment quantities were not recorded/);assert.match(legacy.body,/Spirit cost not recorded/);assert.match(legacy.body,/Not recorded/);assert.doesNotMatch(legacy.body,/×undefined|of undefined|NaN/);
 }finally{await r.close();}
});
test('ordinary legacy button/navigation action hints have no fallback sound, while actual rewards retain orchestral mappings',()=>{
 for(const kind of['click','navigate','profile','sound','skill','calling','tutorial'])assert.equal(soundFeedback({commandId:'saved',kind,data:{}},null,'a'),null);
 for(const [kind,cue]of[['quest','quest'],['attack','victory']])assert.equal(kind==='attack'?soundFeedback(null,{commandId:'saved',winnerId:'a'},'a')?.cue:soundFeedback({commandId:'saved',kind,data:{}},null,'a')?.cue,cue);
});

test('large recorded loadouts preview each category once and disclose remaining real quantities without inventing archived items',async()=>{
 const {renderFile}=await import('ejs');const {alpha}=await import('../src/alpha-rules.js');
 const equipment=[{itemId:'squires-blade',category:'weapon',name:"Saved Squire's Blade",quantity:2},{itemId:'iron-sword',category:'weapon',name:'Saved Iron Sword',quantity:3},{itemId:'padded-coat',category:'armor',name:'Saved Coat',quantity:4},{itemId:'ember-word',category:'spell',name:'Saved Ember',quantity:1},{itemId:'archived-item',category:'spell',name:'<script>not executable</script>',quantity:5}];
 const html=await renderFile(new URL('../views/partials/battle-equipment.ejs',import.meta.url).pathname,{alpha,equipment,participants:10,enemy:true,ownerId:'saved-id',ownerName:'Saved Rival',heading:'Enemy Equipment'});
 const fold=html.indexOf('<details class="additional-equipment">');assert.ok(fold>0);assert.match(html.slice(0,fold),/Saved Squire&#39;s Blade/);assert.match(html.slice(0,fold),/Saved Coat/);assert.match(html.slice(0,fold),/Saved Ember/);assert.doesNotMatch(html.slice(0,fold),/Saved Iron Sword/);
 assert.match(html,/See 2 more equipment types/);assert.match(html,/×5/);assert.match(html,/unknown-equipment/);assert.doesNotMatch(html,/<script>not executable/);assert.match(html,/&lt;script&gt;not executable/);
});
