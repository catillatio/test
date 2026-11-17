import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {realm,testDatabaseUrl} from './helpers.js';
import {registerAccount,authenticate,tokenHash} from '../src/auth.js';

assert.ok(testDatabaseUrl,'Use an isolated, local *_test PostgreSQL database.');
const origin='https://realm-security.invalid';
const password='SyntheticCredentialBudget!2026';
const scopeKey=(username:string)=>createHash('sha256').update('login:'+username.trim().toLowerCase()).digest('hex');
const source=String.raw`
import {createApp} from '../src/app.ts';
import {loadConfig} from '../src/config.ts';
import {createDatabase} from '../src/db.ts';
const target=new URL(process.env.KR_TEST_DATABASE_URL);
if(target.hostname!=='127.0.0.1'||!target.pathname.endsWith('_test'))throw Error('Local synthetic fixture only');
const pool=createDatabase(target.href);let credentialReads=0;
const db={query:(sql,values)=>{if(sql==='SELECT * FROM accounts WHERE username=$1')credentialReads++;return pool.query(sql,values)},connect:()=>pool.connect(),end:()=>pool.end()};
const config=loadConfig({NODE_ENV:'production',APP_ORIGIN:'https://realm-security.invalid',DATABASE_URL:target.href});
const app=await createApp({db,config});
await app.listen({host:'127.0.0.1',port:0});
process.on('message',message=>{if(message==='stats')process.send({kind:'stats',credentialReads})});
process.once('SIGTERM',async()=>{await app.close();await pool.end();process.exit(0)});
process.send({kind:'ready',port:app.server.address().port,pid:process.pid});
`;
interface Server {url:string;pid:number;child:ChildProcess;reads:()=>Promise<number>;stop:()=>Promise<void>}
async function server(databaseUrl:string):Promise<Server>{
  const child=spawn(process.execPath,['--import=tsx','--input-type=module','-e',source],{
    cwd:new URL('.',import.meta.url),env:{PATH:process.env.PATH,KR_TEST_DATABASE_URL:databaseUrl},stdio:['ignore','pipe','pipe','ipc'],
  });
  let stderr='';child.stderr!.on('data',value=>{stderr=(stderr+String(value)).slice(-4096)});
  const ready=await Promise.race([
    once(child,'message').then(([value])=>value as {kind:string;port:number;pid:number}),
    once(child,'exit').then(([code])=>{throw Error('HTTP fixture exited '+String(code)+': '+stderr)}),
  ]);
  assert.equal(ready.kind,'ready');
  return {url:'http://127.0.0.1:'+ready.port,pid:ready.pid,child,
    reads:async()=>{const response=once(child,'message');child.send('stats');const [value]=await response;assert.equal(value.kind,'stats');return value.credentialReads as number},
    stop:async()=>{if(child.exitCode!==null||child.signalCode!==null)return;const exited=once(child,'exit');child.kill('SIGTERM');let expired=false;
      await Promise.race([exited,delay(5000).then(()=>{expired=true})]);if(expired){child.kill('SIGKILL');await exited;throw Error('HTTP fixture did not close cleanly')}
    },
  };
}
async function fixture(){
  const r=await realm({isolated:true});const schema=(await r.db.query('SELECT current_schema() AS name')).rows[0]!.name as string;
  const url=new URL(testDatabaseUrl!);url.searchParams.set('options','-c search_path='+schema);
  const servers:Server[]=[];
  try{servers.push(await server(url.href),await server(url.href))}catch(error){await Promise.all(servers.map(s=>s.stop()));await r.close();throw error}
  const username='budget_'+randomUUID().replaceAll('-','').slice(0,12);
  const account=await registerAccount(r.db,{username,password,name:'Synthetic Budget Knight'});
  const freshServer=async()=>{const s=await server(url.href);servers.push(s);return s};
  const count=async(name=username)=>(await r.db.query('SELECT attempts,window_start FROM authentication_limits WHERE scope=$1 AND key_hash=$2',['login',scopeKey(name)])).rows[0];
  const requests=async()=>Number((await r.db.query('SELECT count(*)::int AS n FROM account_deletion_requests')).rows[0]!.n);
  return {r,servers,username,account,freshServer,count,requests,close:async()=>{try{await Promise.all(servers.map(s=>s.stop()))}finally{await r.close()}}};
}
async function anonymous(s:Server){
  const response=await fetch(s.url+'/account-deletion');assert.equal(response.status,200);
  const cookie=response.headers.getSetCookie().find(value=>value.startsWith('kr_session='))!.split(';')[0]!;
  const csrf=/name="csrf" value="([a-f0-9]{64})"/.exec(await response.text())![1]!;
  return {cookie,csrf};
}
async function send(s:Server,client:{cookie:string;csrf:string},endpoint:'login'|'deletion',username:unknown,secret:unknown='incorrect-password',extra:Record<string,unknown>={},headers:Record<string,string>={}){
  const response=await fetch(s.url+(endpoint==='login'?'/login':'/account-deletion/requests'),{method:'POST',redirect:'manual',headers:{cookie:client.cookie,origin,accept:'application/json','content-type':'application/json',...headers},body:JSON.stringify({csrf:client.csrf,username,password:secret,...(endpoint==='deletion'?{confirm:'request-account-deletion'}:{}),...extra})});
  const body=await response.text();return {status:response.status,body,headers:response.headers,error:()=>JSON.parse(body).error as {code:string;message:string}};
}

test('real HTTP: login and anonymous deletion share one PostgreSQL budget across separate processes and restart',async()=>{
  const f=await fixture();try{
    assert.notEqual(f.servers[0]!.pid,f.servers[1]!.pid);const client=await anonymous(f.servers[0]!);
    for(let i=0;i<10;i++){
      const s=f.servers[Math.floor(i/2)%2]!,name=i%2?'  '+f.username.toUpperCase()+'  ':f.username;
      const response=await send(s,client,i%2?'deletion':'login',name,undefined,{}, {'x-forwarded-for':'198.51.100.'+(i+1)});
      assert.equal(response.status,401,response.body);
    }
    assert.equal((await f.count())!.attempts,10,'one budget charge per request, not twice for login');
    for(const endpoint of ['login','deletion'] as const){const response=await send(f.servers[1]!,client,endpoint,f.username,password);assert.equal(response.status,429,response.body);assert.equal(response.error().code,'AUTHENTICATION_THROTTLED')}
    assert.equal(await f.requests(),0);
    await f.servers[0]!.stop();const restarted=await f.freshServer();const newClient=await anonymous(restarted);
    const blocked=await send(restarted,newClient,'deletion',f.username,password);assert.equal(blocked.status,429,blocked.body);assert.equal(blocked.error().code,'AUTHENTICATION_THROTTLED');
    assert.equal(await restarted.reads(),0,'durable rejection precedes the password/account lookup');
    assert.equal((await f.count())!.attempts,13);assert.equal(await f.requests(),0);
  }finally{await f.close()}
});

test('real HTTP: concurrent verification across both endpoints/processes admits exactly ten attempts',async()=>{
  const f=await fixture();try{
    const client=await anonymous(f.servers[0]!);
    const results=await Promise.all(Array.from({length:20},(_,i)=>send(f.servers[Math.floor(i/2)%2]!,client,i%2?'deletion':'login',f.username)));
    assert.equal(results.filter(r=>r.status===401).length,10);assert.equal(results.filter(r=>r.status===429).length,10);
    for(const response of results.filter(r=>r.status===429))assert.equal(response.error().code,'AUTHENTICATION_THROTTLED',response.body);
    assert.equal((await f.count())!.attempts,20);assert.equal(await f.requests(),0);
    assert.equal((await Promise.all(f.servers.map(s=>s.reads()))).reduce((a,b)=>a+b,0),10,'only ten real credential queries reach PostgreSQL');
  }finally{await f.close()}
});

test('real HTTP: fixed-window expiry resets once, successes count, and blocked requests do not slide expiry',async()=>{
  const f=await fixture();try{
    const client=await anonymous(f.servers[0]!);
    for(let i=0;i<10;i++)assert.equal((await send(f.servers[i%2]!,client,'login',f.username)).status,401);
    await f.r.db.query("UPDATE authentication_limits SET window_start=clock_timestamp()-interval '14 minutes 59 seconds' WHERE scope='login' AND key_hash=$1",[scopeKey(f.username)]);
    const before=await f.count(),denied=await send(f.servers[0]!,client,'deletion',f.username,password);
    assert.equal(denied.status,429,denied.body);assert.equal((await f.count())!.window_start.toISOString(),before!.window_start.toISOString());
    await f.r.db.query("UPDATE authentication_limits SET window_start=clock_timestamp()-interval '15 minutes' WHERE scope='login' AND key_hash=$1",[scopeKey(f.username)]);
    const login=await send(f.servers[1]!,client,'login',f.username,password);assert.equal(login.status,303,login.body);assert.equal((await f.count())!.attempts,1);
    const signedCookie=login.headers.getSetCookie().find(value=>value.startsWith('kr_session='))!;assert.match(signedCookie,/HttpOnly/i);assert.match(signedCookie,/Secure/i);assert.match(signedCookie,/SameSite=Lax/i);assert.ok(!signedCookie.startsWith(client.cookie+';'));
    const anon=await anonymous(f.servers[0]!);const deletion=await send(f.servers[0]!,anon,'deletion',f.username,password);
    assert.equal(deletion.status,200,deletion.body);assert.equal((await f.count())!.attempts,2,'successful password checks do not reset the budget');assert.equal(await f.requests(),1);
  }finally{await f.close()}
});

test('real HTTP: anonymous deletion authenticates without signing in, deduplicates, and preserves game/session state',async()=>{
  const f=await fixture();try{
    const client=await anonymous(f.servers[0]!);
    const snapshot=async()=>JSON.stringify((await f.r.db.query(`SELECT (SELECT jsonb_agg(w ORDER BY character_id) FROM wallets w) AS wallets,(SELECT jsonb_agg(e ORDER BY id) FROM economy_entries e) AS ledger,(SELECT jsonb_agg(c ORDER BY id) FROM characters c) AS characters,(SELECT jsonb_agg(s ORDER BY token_hash) FROM sessions s) AS sessions`)).rows);
    const before=await snapshot();
    for(const s of f.servers){const response=await send(s,client,'deletion',f.username,password);assert.equal(response.status,200,response.body);assert.match(response.body,/Deletion is not complete/)}
    assert.equal(await f.requests(),1);assert.equal(await snapshot(),before);assert.equal((await f.count())!.attempts,2);
    const session=(await f.r.db.query('SELECT account_id FROM sessions WHERE token_hash=$1',[tokenHash(client.cookie.split('=')[1]!)])).rows[0]!;assert.equal(session.account_id,null);
  }finally{await f.close()}
});

test('real HTTP: pre-auth guards do not consume budget; wrong, absent and disabled accounts retain generic errors',async()=>{
  const f=await fixture();try{
    const client=await anonymous(f.servers[0]!);
    assert.equal((await send(f.servers[0]!,client,'deletion',f.username,password,{confirm:'wrong'})).status,422);
    assert.equal((await send(f.servers[0]!,client,'deletion',f.username,password,{csrf:'0'.repeat(64)})).status,403);
    assert.equal((await send(f.servers[0]!,client,'deletion',f.username,password,{}, {origin:'https://attacker.invalid'})).status,403);
    assert.equal(await f.count(),undefined);assert.equal(await f.requests(),0);
    const wrong=await send(f.servers[0]!,client,'login',f.username),absent=await send(f.servers[1]!,client,'deletion','missing_'+randomUUID().replaceAll('-','').slice(0,10));
    assert.equal(wrong.status,401);assert.equal(absent.status,401);assert.deepEqual(wrong.error(),absent.error());
    await f.r.db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[f.account.accountId]);
    const disabled=await send(f.servers[0]!,client,'deletion',f.username,password);assert.equal(disabled.status,401);assert.deepEqual(disabled.error(),wrong.error());
    const malformed=await send(f.servers[1]!,client,'deletion',f.username,['invalid']);assert.equal(malformed.status,401);assert.deepEqual(malformed.error(),wrong.error());
    assert.equal((await f.count())!.attempts,3);assert.equal(await f.requests(),0);
  }finally{await f.close()}
});

test('direct password verifier shares the durable gate and independent registration/account budgets remain separate',async()=>{
  const f=await fixture();try{
    for(let i=0;i<10;i++)await assert.rejects(authenticate(f.r.db,f.username,'incorrect-password'),{code:'INVALID_CREDENTIALS'});
    await assert.rejects(authenticate(f.r.db,f.username,password),{code:'AUTHENTICATION_THROTTLED'});
    const other=await registerAccount(f.r.db,{username:'other_'+randomUUID().replaceAll('-','').slice(0,12),password,name:'Other Synthetic Knight'});
    assert.equal((await authenticate(f.r.db,other.username,password)).accountId,other.accountId);
    const registration=(await f.r.db.query("SELECT count(*)::int AS n FROM authentication_limits WHERE scope='registration' AND key_hash=$1",[createHash('sha256').update('registration:'+f.username).digest('hex')])).rows[0]!;assert.equal(registration.n,0);
    assert.equal(await f.requests(),0);
  }finally{await f.close()}
});
