import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {createDatabase} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {testDatabaseUrl} from './helpers.js';
import {registerAccount,createSession} from '../src/auth.js';
import {realm} from './helpers.js';

const origin='https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev';
const environment={NODE_ENV:'test',PORT:'3001',APP_ORIGIN:origin,CODESPACES:'true',
  CODESPACE_NAME:'super-winner-4r7ppp6g7p4hq4rv',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev'};
const forwarded={host:new URL(origin).host,'x-forwarded-host':new URL(origin).host,'x-forwarded-proto':'https',
  origin:'http://localhost:3001',referer:origin+'/register','sec-fetch-site':'same-origin'};
const cookie=(response:{headers:Record<string,unknown>})=>{
  const value=response.headers['set-cookie'];
  const line=(Array.isArray(value)?value.map(String):[String(value)]).find(line=>line.startsWith('kr_session='));
  assert.ok(line);assert.match(line,/; Secure/);assert.match(line,/; HttpOnly/);assert.match(line,/; SameSite=Lax/);
  return line.split(';')[0]!;
};

test('Phase 4 social and invitation POST routes keep Codespaces Origin, CSRF and authentication boundaries',{skip:!testDatabaseUrl},async()=>{
  const r=await realm({isolated:true}),a=await r.player(),b=await r.player();
  const app=await createApp({db:r.db,config:loadConfig(environment)});
  try{
    const routes:[string,Record<string,unknown>][]=[
      ['/api/v1/comments',{profileId:b.id,body:'A safe forwarded message'}],
      ['/api/v1/broadcasts',{body:'A safe realm message'}],
      ['/api/v1/army/code-invitations',{code:(await r.me(b)).invitationCode}],
      ['/api/v1/social/reports',{messageId:randomUUID(),reason:'spam'}],
      ['/api/v1/social/removals',{messageId:randomUUID()}],
    ];
    for(const [url,payload] of routes){
      for(const patch of [{origin:'https://foreign.app.github.dev'},{origin:'null'},{'x-csrf-token':'0'.repeat(64)}]){
        const response=await app.inject({method:'POST',url,payload,headers:{...forwarded,cookie:a.cookie,'x-csrf-token':a.csrf,'idempotency-key':randomUUID(),...patch}});
        assert.equal(response.statusCode,403,response.body);
      }
      const anonymous=await app.inject({method:'POST',url,payload,headers:{...forwarded,'x-csrf-token':a.csrf}});assert.equal(anonymous.statusCode,403);
    }
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM realm_messages')).rows[0]!.n,0);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM army_events')).rows[0]!.n,0);
    const posted=await app.inject({method:'POST',url:'/api/v1/comments',payload:routes[0]![1],headers:{...forwarded,cookie:a.cookie,'x-csrf-token':a.csrf,'idempotency-key':randomUUID()}});
    assert.equal(posted.statusCode,200,posted.body);
    const invitation=await app.inject({method:'POST',url:'/api/v1/army/code-invitations',payload:routes[2]![1],headers:{...forwarded,cookie:a.cookie,'x-csrf-token':a.csrf,'idempotency-key':randomUUID()}});
    assert.equal(invitation.statusCode,200,invitation.body);
  }finally{await app.close();await r.close();}
});

test('Codespaces port 3001 registration and authenticated POSTs survive Origin rewriting',
  {skip:!testDatabaseUrl?'Set TEST_DATABASE_URL to a disposable *_test database.':false},async()=>{
  const db=createDatabase(testDatabaseUrl!);await migrate(db);
  const app=await createApp({db,config:loadConfig(environment)});
  try{
    const form=await app.inject({method:'GET',url:'/register'});
    assert.equal(form.headers['referrer-policy'],'same-origin');
    const csrf=/name="csrf" value="([a-f0-9]{64})"/.exec(form.body)![1]!;
    const username='origin_'+randomUUID().replaceAll('-','').slice(0,12);
    const password=randomUUID()+'Aa1!';
    const registered=await app.inject({method:'POST',url:'/register',headers:{...forwarded,cookie:cookie(form)},
      payload:{csrf,username,name:'Forwarded Knight',password}});
    assert.equal(registered.statusCode,303,registered.body);
    const authenticated=cookie(registered);
    assert.notEqual(authenticated,cookie(form));
    const me=await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:authenticated}});
    assert.equal(me.statusCode,200,me.body);
    const commandId=randomUUID();
    const command={method:'POST' as const,url:'/api/v1/quests/border-patrol/runs',headers:{...forwarded,
      referer:origin+'/game/quests',cookie:authenticated,'x-csrf-token':me.json().csrfToken,'idempotency-key':commandId},payload:{}};
    const quest=await app.inject(command);assert.equal(quest.statusCode,200,quest.body);
    const repeated=await app.inject({...command,headers:{...command.headers,origin:'https://localhost:3001'}});
    assert.equal(repeated.statusCode,200,repeated.body);
    assert.equal(repeated.json().commandId,quest.json().commandId);
    const state=await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:authenticated}});
    assert.equal(state.json().state.questsCompleted,1);
    const loggedOut=await app.inject({method:'POST',url:'/logout',headers:{...forwarded,cookie:authenticated},payload:{csrf:me.json().csrfToken}});
    assert.equal(loggedOut.statusCode,303,loggedOut.body);
    assert.equal((await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:authenticated}})).statusCode,401);
    const loginForm=await app.inject({method:'GET',url:'/login'});
    const login=await app.inject({method:'POST',url:'/login',headers:{...forwarded,referer:origin+'/login',cookie:cookie(loginForm)},
      payload:{username,password,csrf:/name="csrf" value="([a-f0-9]{64})"/.exec(loginForm.body)![1]!}});
    assert.equal(login.statusCode,303,login.body);
    const restored=await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:cookie(login)}});
    assert.equal(restored.json().state.id,state.json().state.id);
    assert.equal(restored.json().state.questsCompleted,1);
  }finally{await app.close();await db.end();}
});

test('rewritten registration and existing-account commands reject forged Origins and invalid CSRF without mutations',
  {skip:!testDatabaseUrl?'Set TEST_DATABASE_URL to a disposable *_test database.':false},async()=>{
  const db=createDatabase(testDatabaseUrl!);await migrate(db);
  // This player and session predate the application instance, as on upgrade.
  const suffix=randomUUID().replaceAll('-','').slice(0,12);
  const account=await registerAccount(db,{username:'return_'+suffix,name:'Established Knight',password:randomUUID()});
  const session=await createSession(db,account.accountId);
  const snapshot=async()=>({
    character:(await db.query('SELECT * FROM characters WHERE id=$1',[account.characterId])).rows,
    wallet:(await db.query('SELECT * FROM wallets WHERE character_id=$1',[account.characterId])).rows,
    inventory:(await db.query('SELECT * FROM inventory_entries WHERE character_id=$1 ORDER BY 1,2',[account.characterId])).rows,
    holdings:(await db.query('SELECT * FROM land_holdings WHERE character_id=$1 ORDER BY id',[account.characterId])).rows,
    quests:(await db.query('SELECT * FROM quest_runs WHERE character_id=$1 ORDER BY id',[account.characterId])).rows,
    receipts:(await db.query('SELECT * FROM command_receipts WHERE account_id=$1 ORDER BY command_id',[account.accountId])).rows,
  });
  const before=await snapshot();
  const app=await createApp({db,config:loadConfig(environment)});
  try{
    const form=await app.inject({method:'GET',url:'/register'});
    const csrf=/name="csrf" value="([a-f0-9]{64})"/.exec(form.body)![1]!;
    const username='blocked_'+suffix;
    const patches=[{origin:'https://evil.app.github.dev'},{origin:'null'},{origin:'http://localhost:3000'},
      {referer:undefined},{referer:'https://evil.app.github.dev/register'},
      {referer:origin+'.evil.invalid/register'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':undefined},
      {origin:'https://evil.invalid',referer:origin+'/register','x-forwarded-host':new URL(origin).host,'x-forwarded-proto':'https'}];
    for(const patch of patches){
      const requestHeaders=Object.fromEntries(Object.entries({...forwarded,...patch}).filter(([,value])=>value!==undefined));
      for(const authenticated of [false,true]){
        const rejected=await app.inject({method:'POST',url:authenticated?'/api/v1/quests/border-patrol/runs':'/register',
          headers:{...requestHeaders,cookie:authenticated?'kr_session='+session.token:cookie(form),accept:'application/json',
            'x-csrf-token':authenticated?session.session.csrf_token:csrf,'idempotency-key':randomUUID()},
          payload:authenticated?{}:{username,name:'Blocked Knight',password:randomUUID()}});
        assert.equal(rejected.statusCode,403,JSON.stringify(patch)+' '+rejected.body);
        assert.equal(rejected.json().error.code,'ORIGIN_REJECTED');
      }
    }
    for(const authenticated of [false,true]){
      for(const token of [undefined,'0'.repeat(64)]){
        const rejected=await app.inject({method:'POST',url:authenticated?'/api/v1/quests/border-patrol/runs':'/register',
          headers:{...forwarded,cookie:authenticated?'kr_session='+session.token:cookie(form),accept:'application/json',
            ...(token?{'x-csrf-token':token}:{})},payload:authenticated?{}:{username,name:'Blocked Knight',password:randomUUID()}});
        assert.equal(rejected.statusCode,403,rejected.body);assert.equal(rejected.json().error.code,'CSRF_REJECTED');
      }
    }
    const noSession=await app.inject({method:'POST',url:'/api/v1/quests/border-patrol/runs',headers:{...forwarded,'x-csrf-token':session.session.csrf_token},payload:{}});
    assert.equal(noSession.statusCode,403);assert.equal(noSession.json().error.code,'CSRF_REJECTED');
    assert.deepEqual(await snapshot(),before);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM accounts WHERE username=$1',[username])).rows[0]!.n,0);
  }finally{await app.close();await db.end();}
});
