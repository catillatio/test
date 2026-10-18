import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadConfig} from '../src/config.js';
import {createApp} from '../src/app.js';
import {initializePrivateAlpha,assertPrivateAlphaInitialized,assertPrivateAlphaBootstrapTarget,provisionBots,provisionDevelopmentAccount} from '../src/development.js';
import {privateAlphaConfirmation,privateAlphaInitializationId} from '../src/private-alpha-policy.js';
import {authenticate} from '../src/auth.js';
import type {Database} from '../src/db.js';
import {realm,testDatabaseUrl} from './helpers.js';
import {migrate} from '../src/migrate.js';

const environment=():NodeJS.ProcessEnv=>({NODE_ENV:'production',PORT:'8080',APP_ORIGIN:'https://private-alpha.up.railway.app',
  DATABASE_URL:'postgresql://fixture@postgres.railway.internal/railway',KINGDOM_PRIVATE_ALPHA:'1',
  RAILWAY_SERVICE_ID:randomUUID(),RAILWAY_ENVIRONMENT_ID:randomUUID(),KINGDOM_ALPHA_INITIALIZE:privateAlphaConfirmation,
  ENABLE_DEV_BOTS:'1',ENABLE_DEV_BOT_BOUNTIES:'1',ENABLE_DEV_BOT_RECRUITMENT:'1'});
const password=()=>randomUUID()+'Aa1!';
async function snapshot(db:Database){
  const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows;
  return Object.fromEntries(await Promise.all(tables.map(async row=>{
    const table=String(row.table_name);assert.match(table,/^[a-z_]+$/);
    const rows=(await db.query('SELECT row_to_json(t)::text AS row FROM "'+table+'" t')).rows.map(row=>String(row.row)).sort();
    return [table,rows];
  })));
}

test('private-alpha production controls require explicit Railway metadata/private target and retain per-feature switches',()=>{
  const env=environment(),config=loadConfig(env);
  assert.equal(config.privateAlpha,true);assert.equal(config.port,8080);assert.equal(config.secureCookies,true);
  assert.equal(config.developmentBotsEnabled,true);assert.equal(config.developmentBotBountiesEnabled,true);assert.equal(config.developmentBotRecruitmentEnabled,true);
  for(const key of ['ENABLE_DEV_BOT_BOUNTIES','ENABLE_DEV_BOT_RECRUITMENT']){
    const disabled=loadConfig({...env,[key]:'0'});
    assert.equal(key==='ENABLE_DEV_BOT_BOUNTIES'?disabled.developmentBotBountiesEnabled:disabled.developmentBotRecruitmentEnabled,false);
  }
  const off=loadConfig({...env,ENABLE_DEV_BOTS:'0'});
  assert.equal(off.developmentBotsEnabled,false);assert.equal(off.developmentBotBountiesEnabled,false);assert.equal(off.developmentBotRecruitmentEnabled,false);
  for(const patch of [{NODE_ENV:'development'},{RAILWAY_SERVICE_ID:undefined},{RAILWAY_ENVIRONMENT_ID:''},
    {CODESPACE_NAME:'super-winner'},{CODESPACES:'true'},{DATABASE_URL:'postgresql://node@127.0.0.1:5433/kingdom_come'},
    {DATABASE_URL:'postgresql://node@public.proxy.rlwy.net:12345/railway'},
    {DATABASE_URL:'postgresql://node@postgres.railway.internal/railway?host=127.0.0.1'},
    {DATABASE_URL:'postgresql://node@postgres.railway.internal/railway?options=-csearch_path=other'},
    {KINGDOM_PRIVATE_ALPHA:'true'},{KINGDOM_ALPHA_INITIALIZE:'reset'}]){
    assert.throws(()=>loadConfig({...env,...patch}),/alpha|Railway|Codespaces/i);
  }
  const normal=loadConfig({...env,KINGDOM_PRIVATE_ALPHA:'0',KINGDOM_ALPHA_INITIALIZE:undefined});
  assert.equal(normal.privateAlpha,false);assert.equal(normal.developmentBotsEnabled,false);
});

test('unauthorized initialization is rejected before any SQL, and general development provisioning remains forbidden in production',async()=>{
  let queries=0;
  const db:Database={query:async()=>{queries++;throw new Error('Unexpected SQL');},connect:async()=>{queries++;throw new Error('Unexpected connection');},end:async()=>{}};
  for(const patch of [{KINGDOM_PRIVATE_ALPHA:'0'},{KINGDOM_ALPHA_INITIALIZE:undefined},{RAILWAY_SERVICE_ID:undefined},
    {DATABASE_URL:'postgresql://node@127.0.0.1:5433/kingdom_come'}]){
    await assert.rejects(initializePrivateAlpha(db,{...environment(),...patch}),/alpha|Railway/i);
  }
  await assert.rejects(provisionBots(db,{nodeEnv:'production',allowProvisioning:true}),/prohibited/);
  await assert.rejects(provisionDevelopmentAccount(db,{nodeEnv:'production',allowProvisioning:true},password()),/prohibited/);
  assert.equal(queries,0);
});

test('fresh initialization requires a secret, rolls back partial funding, and refuses unmarked existing players',{skip:!testDatabaseUrl},async()=>{
  const r=await realm({isolated:true}),env=environment();
  try{
    await assert.rejects(assertPrivateAlphaInitialized(r.db),/not initialized/);
    await assert.rejects(initializePrivateAlpha(r.db,env),/sealed secret/);
    const failure:Database={query:r.db.query.bind(r.db),end:async()=>{},connect:async()=>{
      const client=await r.db.connect();return {release:()=>client.release(),query:async(statement,values)=>{
        if(statement.startsWith('INSERT INTO development_bots'))throw new Error('Synthetic seed failure');
        return client.query(statement,values);
      }};
    }};
    await assert.rejects(initializePrivateAlpha(failure,{...env,KINGDOM_DEV_PASSWORD:password()}),/Synthetic seed failure/);
    for(const table of ['accounts','characters','wallets','economy_transactions','development_accounts','development_bots','private_alpha_initializations'])
      assert.equal((await r.db.query('SELECT count(*)::int AS n FROM '+table)).rows[0]!.n,0,table);
    await r.player('Existing Knight');const before=await snapshot(r.db);
    await assert.rejects(assertPrivateAlphaBootstrapTarget(r.db,{...env,KINGDOM_DEV_PASSWORD:password()}),/empty player realm/);
    await assert.rejects(initializePrivateAlpha(r.db,{...env,KINGDOM_DEV_PASSWORD:password()}),/empty player realm/);
    assert.deepEqual(await snapshot(r.db),before);
  }finally{await r.close();}
});

test('concurrent private-alpha initialization creates one durable dev and 450 unchanged rivals; production gameplay and redeploy preserve progress',
  {skip:!testDatabaseUrl},async()=>{
  let now=new Date('2033-01-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now});
  const secret=password(),env={...environment(),KINGDOM_DEV_PASSWORD:secret},config=loadConfig(env);
  let app=await createApp({db:r.db,config});
  try{
    const initialized=await Promise.all([initializePrivateAlpha(r.db,env),initializePrivateAlpha(r.db,env)]);
    assert.equal(initialized.filter(result=>result.initialized).length,1);
    assert.equal(initialized.filter(result=>result.alreadyInitialized).length,1);
    const account=await authenticate(r.db,'dev',secret);
    const character=(await r.db.query('SELECT id FROM characters WHERE account_id=$1',[account.accountId])).rows[0]!.id;
    assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[character])).rows[0]!.balance,50000);
    assert.equal((await r.db.query("SELECT quantity+1 AS army FROM army_stacks WHERE character_id=$1 AND unit_definition_id='militia'",[character])).rows[0]!.army,10);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM accounts')).rows[0]!.n,451);
    const population=(await r.db.query(`SELECT c.attained_level,count(*)::int AS n FROM development_bots b JOIN characters c ON c.id=b.character_id GROUP BY c.attained_level ORDER BY c.attained_level`)).rows;
    assert.equal(population.length,50);for(const level of population)assert.equal(level.n,9);
    const limits=(await r.db.query(`SELECT min(w.balance)::int AS gold,max(a.quantity+1)::int AS army,
      (SELECT min(n)::int FROM (SELECT sum(quantity) AS n FROM land_holdings WHERE character_id IN(SELECT character_id FROM development_bots) GROUP BY character_id) q) AS land
      FROM development_bots b JOIN wallets w ON w.character_id=b.character_id JOIN army_stacks a ON a.character_id=b.character_id`)).rows[0]!;
    assert.ok(limits.gold>=2500);assert.ok(limits.army<=10);assert.ok(limits.land>=3);
    assert.equal((await r.db.query('SELECT count(DISTINCT name)::int AS n FROM characters WHERE id IN(SELECT character_id FROM development_bots)')).rows[0]!.n,450);
    await assertPrivateAlphaInitialized(r.db);
    const origin=config.origin,forwarding={host:'game.railway.internal:8080','x-forwarded-proto':'https','x-forwarded-host':new URL(origin).host,origin};
    const form=await app.inject({method:'GET',url:'/login',headers:forwarding});
    const cookieOf=(response:{headers:Record<string,unknown>})=>{
      const line=String(response.headers['set-cookie']);assert.match(line,/; Secure/);assert.match(line,/; HttpOnly/);return line.split(';')[0]!;
    };
    const login=await app.inject({method:'POST',url:'/login',headers:{...forwarding,cookie:cookieOf(form)},payload:{username:'dev',password:secret,csrf:/name="csrf" value="([a-f0-9]{64})"/.exec(form.body)![1]}});
    assert.equal(login.statusCode,303,login.body);const cookie=cookieOf(login);
    const me=async()=>{const response=await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie}});assert.equal(response.statusCode,200,response.body);return response.json();};
    const initial=await me();assert.equal(initial.state.army.participants,10);
    const post=async(url:string,payload:Record<string,unknown>={})=>{
      const result=await app.inject({method:'POST',url,payload,headers:{...forwarding,cookie,'x-csrf-token':initial.csrfToken,'idempotency-key':randomUUID()}});
      assert.equal(result.statusCode,200,result.body);return result.json();
    };
    const opponents=await app.inject({method:'GET',url:'/api/v1/opponents',headers:{cookie}});assert.equal(opponents.statusCode,200);assert.ok(opponents.json().opponents.some((o:{botTier:string|null})=>o.botTier));
    const recruits=(await r.db.query("SELECT b.character_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=1 AND b.tier='green' ORDER BY b.variant LIMIT 2")).rows;
    // The baseline dev army is legitimately full. A new ordinary player can
    // recruit a passive ally; preserve capacity rules rather than bypass them.
    const recruit=await r.player('Alpha Recruit');
    const invited=await app.inject({method:'POST',url:'/api/v1/army/invitations',payload:{targetCharacterId:recruits[0]!.character_id},
      headers:{...forwarding,cookie:recruit.cookie,'x-csrf-token':recruit.csrf,'idempotency-key':randomUUID()}});
    assert.equal(invited.statusCode,200,invited.body);
    for(let i=0;i<8;i++)await post('/api/v1/quests/border-patrol/runs');
    await post('/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:2});
    await post('/api/v1/land/purchases',{propertyId:'smallholding',quantity:2});
    await post('/api/v1/vault/deposits',{amount:10});
    await post('/api/v1/bounties/placements',{targetCharacterId:recruits[1]!.character_id,amount:1});
    await post('/api/v1/battles',{targetCharacterId:recruits[1]!.character_id});
    for(const patch of [{origin:'https://foreign.invalid'},{origin:'http://localhost:8080'},{'x-csrf-token':'0'.repeat(64)}]){
      const denied=await app.inject({method:'POST',url:'/api/v1/quests/border-patrol/runs',payload:{},headers:{...forwarding,cookie,'x-csrf-token':initial.csrfToken,...patch}});
      assert.equal(denied.statusCode,403);
    }
    const progressed=await me();const before=await snapshot(r.db);
    const noSecret:NodeJS.ProcessEnv={...env};delete noSecret.KINGDOM_DEV_PASSWORD;
    assert.equal((await initializePrivateAlpha(r.db,noSecret)).alreadyInitialized,true);
    assert.equal((await initializePrivateAlpha(r.db,{...env,KINGDOM_DEV_PASSWORD:password()})).alreadyInitialized,true);
    // Pre-deploy runs migrations before its initialization check. New level-50
    // seed accounts must already have their existing milestone entitlements.
    await migrate(r.db);
    assert.deepEqual(await snapshot(r.db),before);
    await authenticate(r.db,'dev',secret);
    await assert.rejects(r.db.query('DELETE FROM private_alpha_initializations WHERE id=$1',[privateAlphaInitializationId]),/immutable/);
    await app.close();app=await createApp({db:r.db,config});
    const restored=await me();assert.equal(restored.state.id,initial.state.id);assert.equal(restored.state.bankedGold,10);
    assert.equal(restored.state.gold,progressed.state.gold);assert.equal(restored.state.xp,progressed.state.xp);
    const balance=restored.state.gold;now=new Date(+now+3600000+1000);
    const settled=await me();assert.equal(settled.state.gold,balance+14);assert.equal((await me()).state.gold,settled.state.gold);
    const logout=await app.inject({method:'POST',url:'/logout',headers:{...forwarding,cookie},payload:{csrf:initial.csrfToken}});
    assert.equal(logout.statusCode,303);assert.equal((await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie}})).statusCode,401);
  }finally{await app.close();await r.close();}
});
