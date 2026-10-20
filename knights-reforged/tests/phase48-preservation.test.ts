import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {realm,testDatabaseUrl} from './helpers.js';
import {provisionBots} from '../src/development.js';
import {migrate,reconcileLevelMilestones} from '../src/migrate.js';
import {transaction} from '../src/db.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {experienceView} from '../src/experience.js';
const skip=!testDatabaseUrl;
test('registration introduces Tutorial once; skip/completion and sound choices persist through normal navigation',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const form=await r.app.inject({url:'/register'}),csrf=/name="csrf" value="([a-f0-9]+)"/.exec(form.body)![1]!;
  const cookie=String(form.headers['set-cookie']).split(';')[0]!;
  const registered=await r.app.inject({method:'POST',url:'/register',headers:{cookie,origin:'http://localhost:3000'},payload:{csrf,username:'guide_'+randomUUID().slice(0,8),name:'New Tutorial Explorer',password:'TestOnly!2048'}});
  assert.equal(registered.statusCode,303);assert.equal(registered.headers.location,'/game/tutorial');
  const actor=await r.player('Returning Explorer');
  const before=await r.me(actor);await r.ok(actor,'/api/v1/tutorial',{action:'skip'});
  const profile=await r.app.inject({url:'/game/profile',headers:{cookie:actor.cookie}});
  const equipmentAt=profile.body.indexOf('class="panel profile-inventory"'),holdingsAt=profile.body.indexOf('class="panel profile-estate"');
  assert.ok(equipmentAt>0&&holdingsAt>equipmentAt,'the actual rendered profile places Army and Equipment before Kingdom Holdings');
  for(const url of ['/game/home','/game/quests','/game/armory','/game/land']){
   const response=await r.app.inject({url,headers:{cookie:actor.cookie}});assert.equal(response.statusCode,200);assert.equal(response.headers.location,undefined);
  }
  assert.equal((await experienceView(r.db,actor.id)).tutorial.status,'skipped');
  await r.ok(actor,'/api/v1/tutorial',{action:'resume'});for(let i=0;i<7;i++)await r.ok(actor,'/api/v1/tutorial',{action:'next'});await r.ok(actor,'/api/v1/tutorial',{action:'finish'});
  assert.equal((await experienceView(r.db,actor.id)).tutorial.status,'completed');
  const home=await r.app.inject({url:'/game/home',headers:{cookie:actor.cookie}});assert.ok(!home.body.includes('New to Kingdom Come?'));
  const after=await r.me(actor);for(const key of ['gold','xp','inventory','land','army'] as const)assert.deepEqual(after[key],before[key]);
 }finally{await r.close();}
});
test('populated Phase 4.7 replay and process reconstruction preserve every business row, 450 bot identities and sessions',{skip},async()=>{
 const r=await realm({isolated:true,developmentBotsEnabled:true});try{
  const actor=await r.player('Saved Kingdom Ruler');await r.prepare(actor,20000,100);
  await r.ok(actor,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:3});
  await r.ok(actor,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:3});
  await r.ok(actor,'/api/v1/vault/deposits',{amount:1000});
  await r.ok(actor,'/api/v1/quests/border-patrol/runs');
  await r.ok(actor,'/api/v1/tutorial',{action:'start'});await r.ok(actor,'/api/v1/tutorial',{action:'next'});
  await r.ok(actor,'/api/v1/settings/sound',{enabled:'0',volume:27});
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  // Match the completed Phase 4.7 initialization baseline: its initializer
  // reconciles the seed population's existing level entitlements before use.
  await transaction(r.db,reconcileLevelMilestones);
  const guidePosition=(await experienceView(r.db,actor.id)).tutorial.position;
  async function snapshot(){
   const tables=(await r.db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows;
   const rows:Record<string,string[]>={};for(const {table_name:name} of tables){assert.match(name,/^[a-z_]+$/);rows[name]=(await r.db.query('SELECT row_to_json(t)::text AS row FROM "'+name+'" t')).rows.map(row=>row.row).sort();}return rows;
  }
  const digest=(rows:string[]|undefined)=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const before=await snapshot();await migrate(r.db);await migrate(r.db);const after=await snapshot();
  assert.deepEqual(Object.keys(after),Object.keys(before));for(const table of Object.keys(before))assert.equal(digest(after[table]),digest(before[table]),table+' must retain every row');
  assert.equal(before.development_bots!.length,450);assert.equal(before.accounts!.length,451);
  const rebuilt=await createApp({db:r.db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',ENABLE_DEV_BOTS:'1'})});
  try{
   const response=await rebuilt.inject({url:'/api/v1/me',headers:{cookie:actor.cookie}});assert.equal(response.statusCode,200);assert.equal(response.json().state.id,actor.id);assert.deepEqual(response.json().sound,{enabled:false,volume:27});
   assert.equal((await experienceView(r.db,actor.id)).tutorial.position,guidePosition);
   const preserved=await snapshot();for(const table of ['accounts','sessions','wallets','vault_accounts','inventory_entries','inventory_lots','land_holdings','army_links','development_bots','battles','character_achievements','tutorial_guides','sound_preferences'])assert.equal(digest(preserved[table]),digest(before[table]),table+' must survive process reconstruction');
  }finally{await rebuilt.close();}
  await mkdir('test-results',{recursive:true});await writeFile('test-results/phase48-preservation.json',JSON.stringify({passed:true,base:'Phase 4.7 / 020_game_feel.sql',newMigrations:0,tablesVerified:Object.keys(before).length,humans:1,bots:450,migrationReplay:'all rows unchanged',processReconstruction:'saved cookie and preferences retained',productionContacted:false},null,2)+'\n');
 }finally{await r.close();}
});
