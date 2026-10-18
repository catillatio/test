import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {realm,testDatabaseUrl} from './helpers.js';

const origin='https://kingdom-come-production.up.railway.app';
const forwarding={host:'kingdom-come.railway.internal:32123','x-forwarded-proto':'https',
  'x-forwarded-host':new URL(origin).host,'x-forwarded-port':'443',origin,referer:origin+'/register','sec-fetch-site':'same-origin'};
const production=()=>loadConfig({NODE_ENV:'production',PORT:'32123',APP_ORIGIN:origin,DATABASE_URL:testDatabaseUrl,
  ENABLE_DEV_BOTS:'1',ENABLE_DEV_BOT_BOUNTIES:'1',ENABLE_DEV_BOT_RECRUITMENT:'1'});
function cookie(response:{headers:Record<string,unknown>}) {
  const header=response.headers['set-cookie'];
  const line=(Array.isArray(header)?header:[String(header)]).find(value=>value.startsWith('kr_session='));
  assert.ok(line);assert.match(line,/; Secure/);assert.match(line,/; HttpOnly/);assert.match(line,/; SameSite=Lax/);
  return line.split(';')[0]!;
}

test('Railway production configuration uses dynamic PORT and canonical origin without enabling development rivals',()=>{
  const config=production();
  assert.equal(config.port,32123);assert.equal(config.host,'0.0.0.0');
  assert.equal(config.origin,origin);assert.equal(config.originSource,'explicit');
  assert.equal(config.secureCookies,true);
  assert.equal(config.developmentBotsEnabled,false);assert.equal(config.developmentBotBountiesEnabled,false);
  assert.equal(config.developmentBotRecruitmentEnabled,false);
});

test('Railway HTTPS forwarding preserves registration, private pages, CSRF, purchases, login and logout',
  {skip:!testDatabaseUrl},async()=>{
  const r=await realm({isolated:true}),app=await createApp({db:r.db,config:production()});
  try {
    const health=await app.inject({method:'GET',url:'/healthz',headers:forwarding});
    assert.equal(health.statusCode,200);assert.equal(health.json().status,'ready');
    assert.equal(health.headers['set-cookie'],undefined);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM sessions')).rows[0]!.n,0);
    const form=await app.inject({method:'GET',url:'/register',headers:forwarding});
    assert.equal(form.statusCode,200);assert.equal(form.headers['referrer-policy'],'same-origin');
    const csrf=/name="csrf" value="([a-f0-9]{64})"/.exec(form.body)![1]!;
    const username='rail_'+randomUUID().replaceAll('-','').slice(0,12),password=randomUUID()+'aA1!';
    const registered=await app.inject({method:'POST',url:'/register',headers:{...forwarding,cookie:cookie(form)},
      payload:{csrf,username,password,name:'Railway Knight'}});
    assert.equal(registered.statusCode,303,registered.body);
    const authenticated=cookie(registered);assert.notEqual(authenticated,cookie(form));
    const me=await app.inject({method:'GET',url:'/api/v1/me',headers:{...forwarding,cookie:authenticated}});
    assert.equal(me.statusCode,200,me.body);
    const token=me.json().csrfToken;
    const id=me.json().state.id as string;
    const accountId=(await r.db.query('SELECT account_id FROM characters WHERE id=$1',[id])).rows[0]!.account_id as string;
    const actor={id,accountId,cookie:authenticated,csrf:token};
    await r.prepare(actor,10000);
    for(const page of ['home','profile','quests','battle','bounties','armory','army','land','vault','settings']) {
      const response=await app.inject({method:'GET',url:'/game/'+page,headers:{...forwarding,cookie:authenticated}});
      assert.equal(response.statusCode,200,response.body);
      assert.doesNotMatch(response.body,/ReferenceError|is not defined|<%/);
    }
    const routes:[string,Record<string,unknown>][]=[
      ['/api/v1/quests/border-patrol/runs',{}],
      ['/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1}],
      ['/api/v1/land/purchases',{propertyId:'smallholding',quantity:1}],
      ['/api/v1/vault/deposits',{amount:10}],
    ];
    for(const [url,payload] of routes) {
      const request={method:'POST' as const,url,payload,headers:{...forwarding,cookie:authenticated,
        'x-csrf-token':token,'idempotency-key':randomUUID()}};
      const response=await app.inject(request);assert.equal(response.statusCode,200,response.body);
      const retry=await app.inject(request);assert.equal(retry.statusCode,200,retry.body);
      assert.equal(retry.json().commandId,response.json().commandId);
    }
    const current=await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:authenticated}});
    assert.equal(current.json().state.questsCompleted,1);
    for(const patch of [{origin:'https://evil.up.railway.app'}, {origin:'null'}, {origin:'http://localhost:32123'},
      {'x-csrf-token':'0'.repeat(64)}, {origin:'https://evil.invalid','x-forwarded-host':new URL(origin).host}]) {
      const rejected=await app.inject({method:'POST',url:'/api/v1/quests/border-patrol/runs',payload:{},
        headers:{...forwarding,cookie:authenticated,'x-csrf-token':token,'idempotency-key':randomUUID(),...patch}});
      assert.equal(rejected.statusCode,403,rejected.body);
    }
    const logout=await app.inject({method:'POST',url:'/logout',headers:{...forwarding,cookie:authenticated},payload:{csrf:token}});
    assert.equal(logout.statusCode,303);cookie(logout);
    assert.equal((await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:authenticated}})).statusCode,401);
    const loginForm=await app.inject({method:'GET',url:'/login',headers:forwarding});
    const login=await app.inject({method:'POST',url:'/login',headers:{...forwarding,cookie:cookie(loginForm)},payload:{username,password,
      csrf:/name="csrf" value="([a-f0-9]{64})"/.exec(loginForm.body)![1]!}});
    assert.equal(login.statusCode,303,login.body);
    const restored=await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:cookie(login)}});
    assert.equal(restored.json().state.id,actor.id);assert.equal(restored.json().state.questsCompleted,1);
  } finally {await app.close();await r.close();}
});
