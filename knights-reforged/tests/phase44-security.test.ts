import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {inspectGray,grantGray,grayAuthorization} from '../src/operator.js';
import {authenticationAttempt} from '../src/security.js';
import {registerAccount,createSession,authenticate} from '../src/auth.js';
import {loadConfig} from '../src/config.js';
import {createApp} from '../src/app.js';
const skip=!testDatabaseUrl;
const operator=():NodeJS.ProcessEnv=>({NODE_ENV:'production',DATABASE_URL:'postgresql://operator@postgres.railway.internal/railway',KINGDOM_PRIVATE_ALPHA:'1',RAILWAY_SERVICE_ID:randomUUID(),RAILWAY_ENVIRONMENT_ID:randomUUID(),KINGDOM_GRAY_GRANT_CONFIRM:'GRANT_GRAY_50000_PHASE44',KINGDOM_OPERATOR_REFERENCE:'Owner authorized Phase 4.4 release'});
test('gray grant refuses missing or mismatched identities; concurrent authorized grants credit only the exact spendable purse once',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const env=operator();await assert.rejects(inspectGray(r.db,env),/not uniquely/);
  const account=await registerAccount(r.db,{username:'gray',name:'Gray Knight',password:randomUUID()+'Aa1!'}),other=await r.player('Untouched Knight');
  const identity=await inspectGray(r.db,env);assert.equal(identity.account_id,account.accountId);
  const otherBefore=await r.me(other),rows=(await r.db.query('SELECT * FROM characters WHERE id=$1',[account.characterId])).rows;
  await assert.rejects(grantGray(r.db,{...env,KINGDOM_GRAY_ACCOUNT_ID:randomUUID()}),/mismatch/);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM authorized_gold_grants')).rows[0]!.n,0);
  const allowed={...env,KINGDOM_GRAY_ACCOUNT_ID:account.accountId};const results=await Promise.all([grantGray(r.db,allowed),grantGray(r.db,allowed)]);
  assert.equal(results.filter(r=>r.applied).length,1);assert.equal(results.filter(r=>r.alreadyApplied).length,1);
  assert.equal((await inspectGray(r.db,env)).spendable_gold,identity.spendable_gold+50000);assert.equal((await inspectGray(r.db,env)).vault_gold,identity.vault_gold);
  const changed=(await r.db.query('SELECT * FROM characters WHERE id=$1',[account.characterId])).rows;assert.equal(changed[0]!.state_version,rows[0]!.state_version+1);
  for(const field of ['xp','attained_level','health','mana','spirit','skill_points'])assert.equal(changed[0]![field],rows[0]![field]);
  const after=await r.me(other);for(const field of ['gold','xp','inventory','bankedGold','units','skillPoints'] as const)assert.deepEqual(after[field],otherBefore[field]);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM authorized_gold_grants WHERE authorization_id=$1',[grayAuthorization])).rows[0]!.n,1);
  await assert.rejects(r.db.query('DELETE FROM authorized_gold_grants'),/immutable/);
 }finally{await r.close();}
});
test('grant authorization is rejected before SQL for Codespaces, public databases, wrong metadata, or absent confirmation',async()=>{
 let calls=0;const db={query:async()=>{calls++;throw Error('SQL was called');},connect:async()=>{calls++;throw Error('SQL was called');},end:async()=>{}};
 for(const patch of [{DATABASE_URL:'postgres://node@127.0.0.1:5433/kingdom_come'},{KINGDOM_PRIVATE_ALPHA:'0'},{RAILWAY_SERVICE_ID:''},{KINGDOM_GRAY_GRANT_CONFIRM:undefined}])await assert.rejects(grantGray(db,{...operator(),...patch,KINGDOM_GRAY_ACCOUNT_ID:randomUUID()}));
 assert.equal(calls,0);
});
test('authentication throttles are atomic, persistent and independent of usernames existing; production HTTP keeps Origin, CSRF and private operator routes protected',{skip},async()=>{
 const r=await realm({isolated:true});let app:Awaited<ReturnType<typeof createApp>>|undefined;try{
  for(let i=0;i<10;i++)await authenticationAttempt(r.db,'login','unknown');
  await assert.rejects(authenticationAttempt(r.db,'login','UNKNOWN'),/Too many attempts/);
  await r.db.query("UPDATE authentication_limits SET window_start=window_start-interval '16 minutes'");await authenticationAttempt(r.db,'login','unknown');
  const username='secure_'+randomUUID().replaceAll('-','').slice(0,12),password=randomUUID()+'Aa1!';const a=await registerAccount(r.db,{username,password,name:'Secure Knight'}),session=await createSession(r.db,a.accountId);
  const config=loadConfig({NODE_ENV:'production',PORT:'8080',APP_ORIGIN:'https://kingdom-alpha.up.railway.app',DATABASE_URL:testDatabaseUrl});
  app=await createApp({db:r.db,config});const cookie='kr_session='+session.token;
  const headers={cookie,origin:config.origin,'x-csrf-token':session.session.csrf_token,'idempotency-key':randomUUID(),'x-forwarded-proto':'https'};
  const accepted=await app.inject({method:'POST',url:'/api/v1/quests/border-patrol/runs',headers,payload:{gold:999999,xp:999999,accountId:randomUUID()}});assert.equal(accepted.statusCode,200,accepted.body);assert.ok(accepted.json().state.gold<1000);
  for(const patch of [{origin:'https://foreign.invalid'},{'x-csrf-token':'0'.repeat(64)}, {cookie:''}])assert.equal((await app.inject({method:'POST',url:'/api/v1/quests/border-patrol/runs',headers:{...headers,...patch},payload:{}})).statusCode,403);
  for(const path of ['/api/v1/admin/grant','/api/v1/development/provision','/deployment/grant-gray.mjs','/deployment/moderate.mjs'])assert.equal((await app.inject({method:'GET',url:path,headers:{cookie}})).statusCode,404);
  const profile=await app.inject({method:'GET',url:'/game/profile',headers:{cookie}});assert.equal(profile.statusCode,200,profile.body);assert.doesNotMatch(profile.body,/DATABASE_URL|KINGDOM_DEV_PASSWORD|RAILWAY_SERVICE_ID|password_hash/);
  const unknown=await authenticate(r.db,'absent-user',password).catch(e=>e),wrong=await authenticate(r.db,username,'wrong-secret').catch(e=>e);assert.equal(unknown.code,wrong.code);assert.equal(unknown.message,wrong.message);
 }finally{if(app)await app.close();await r.close();}
});
test('patched static serving rejects traversal, noncanonical separators, dotfiles and provisioning files without disclosing application secrets',{skip},async()=>{
 const r=await realm({isolated:true});try{
  for(const url of ['/assets/..%2f..%2fpackage.json','/assets/%2e%2e%2f.env','/assets/%5c..%5c..%5cpackage.json','/assets/%252e%252e%252fpackage.json','/assets/.env','/assets/../deployment/grant-gray.mjs']){
   const response=await r.app.inject({method:'GET',url});assert.ok([400,403,404].includes(response.statusCode),url+' '+response.statusCode);
   assert.doesNotMatch(response.body,/"name": "kingdom-come"|DATABASE_URL|password_hash|PRIVATE KEY/);
  }
  const css=await r.app.inject({method:'GET',url:'/assets/phase44.css'});assert.equal(css.statusCode,200);
 }finally{await r.close();}
});
test('login throttling survives a new application instance and changing client addresses or forwarding headers',{skip},async()=>{
 const r=await realm({isolated:true});const config=loadConfig({NODE_ENV:'production',PORT:'8080',APP_ORIGIN:'https://kingdom-alpha.up.railway.app',DATABASE_URL:testDatabaseUrl});
 let app=await createApp({db:r.db,config});try{
  const form=await app.inject({method:'GET',url:'/login'}),line=String(form.headers['set-cookie']),cookie=line.split(';')[0]!,csrf=/name="csrf" value="([a-f0-9]{64})"/.exec(form.body)![1]!;
  const username='absent_'+randomUUID().replaceAll('-','').slice(0,10);
  const attempt=(n:number)=>app.inject({method:'POST',url:'/login',remoteAddress:'203.0.113.'+n,headers:{cookie,origin:config.origin,'x-forwarded-for':'198.51.100.'+n},payload:{username,password:'wrong-test-password',csrf}});
  for(let i=1;i<=10;i++)assert.equal((await attempt(i)).statusCode,401);
  assert.equal((await attempt(11)).statusCode,429);
  await app.close();app=await createApp({db:r.db,config});assert.equal((await attempt(12)).statusCode,429);
 }finally{await app.close();await r.close();}
});
