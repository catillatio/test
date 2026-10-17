// A real TLS-terminating reverse proxy on loopback, using a Codespaces-shaped
// HTTPS hostname. No request goes to GitHub, a live Codespace or a legacy server.
// A CONNECT fixture maps that exact hostname to the local TLS listener so the
// browser uses standard HTTPS/443, native Secure cookies and real form Origins.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer as httpServer,request as httpRequest,type Server} from 'node:http';
import {createServer as tlsServer} from 'node:https';
import {connect,type Socket} from 'node:net';
import {once} from 'node:events';
import {chromium,type Page,type Locator,type Browser} from 'playwright-core';
import {createDatabase} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {loadConfig,projectRoot} from '../src/config.js';
import {createApp} from '../src/app.js';
import {registerAccount,createSession} from '../src/auth.js';
import {testDatabaseUrl} from '../tests/helpers.js';

if(!testDatabaseUrl)throw new Error('Use TEST_DATABASE_URL for a disposable *_test database.');
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',PORT:'3000',CODESPACES:'true',CODESPACE_NAME:'knights-session-fixture',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev'});
assert.equal(config.origin,'https://knights-session-fixture-3000.app.github.dev');assert.equal(config.secureCookies,true);
const host=new URL(config.origin).hostname,db=createDatabase(testDatabaseUrl),temp=await mkdtemp(join(tmpdir(),'kr-https-'));
await migrate(db);const app=await createApp({db,config});
let browser:Browser|undefined,proxy:ReturnType<typeof tlsServer>|undefined,tunnel:Server|undefined;
const sockets=new Set<Socket>(),observed:{origin:string|undefined;forwardedProto:string;path:string}[]=[];
const track=(server:Server)=>server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
const listen=async(server:Server)=>{server.listen(0,'127.0.0.1');await once(server,'listening');return (server.address() as {port:number}).port;};
try{
  await app.listen({host:'127.0.0.1',port:0});const backend=(app.server.address() as {port:number}).port;
  const key=join(temp,'key.pem'),cert=join(temp,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN='+host,'-addext','subjectAltName=DNS:'+host],{stdio:'ignore'});
  proxy=tlsServer({key:await readFile(key),cert:await readFile(cert)},(request,response)=>{
    const headers={...request.headers,host:'127.0.0.1:'+backend,'x-forwarded-host':host,'x-forwarded-proto':'https','x-forwarded-for':'203.0.113.41'};
    if(request.method==='POST')observed.push({origin:request.headers.origin,forwardedProto:'https',path:request.url!});
    const upstream=httpRequest({hostname:'127.0.0.1',port:backend,path:request.url,method:request.method,headers},reply=>{response.writeHead(reply.statusCode!,reply.headers);reply.pipe(response);});
    upstream.on('error',()=>{response.writeHead(502);response.end();});request.pipe(upstream);
  });
  track(proxy);const tlsPort=await listen(proxy);
  tunnel=httpServer((_request,response)=>{response.writeHead(403);response.end();});track(tunnel);
  tunnel.on('connect',(request,socket,head)=>{
    if(request.url!==host+':443'){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    const upstream=connect(tlsPort,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
    upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
  });
  const tunnelPort=await listen(tunnel);
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',headless:true,
    proxy:{server:'http://127.0.0.1:'+tunnelPort},args:process.env.CHROMIUM_NO_SANDBOX==='1'?['--no-sandbox']:[]});
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('**/*',route=>new URL(route.request().url()).origin===config.origin?route.continue():route.abort());
  const suffix=randomUUID().replaceAll('-','').slice(0,8),password=randomUUID()+'!aA1',username='https_'+suffix;
  // Persisted accounts/sessions exist before the browser/proxy is used. This
  // specifically checks the returning-player case, without resetting the DB.
  const account=await registerAccount(db,{username,name:'Proxy Knight '+suffix,password});
  const rival=await registerAccount(db,{username:'rival_'+suffix,name:'Proxy Rival '+suffix,password:randomUUID()});
  const session=await createSession(db,account.accountId);
  await context.addCookies([{name:'kr_session',value:session.token,url:config.origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const state=async()=>{const response=await page.request.get(config.origin+'/api/v1/me');assert.equal(response.status(),200);return (await response.json()).state;};
  const action=async(button:Locator)=>{const prior=page.url();await Promise.all([page.waitForURL(url=>url.href!==prior),button.click()]);assert.equal(await page.getByRole('alert').count(),0,await page.locator('body').innerText());};
  await page.goto(config.origin+'/game/quests');
  const before=await state();assert.equal(before.id,account.characterId);
  await action(page.getByRole('button',{name:'Do quest Patrol the border',exact:true}));assert.equal((await state()).questsCompleted,1);
  await page.goto(config.origin+'/game/armory');await action(page.getByRole('button',{name:"Buy Squire's Blade",exact:true}));
  await page.goto(config.origin+'/game/land');await action(page.getByRole('button',{name:'Buy Smallholding',exact:true}));assert.equal((await state()).land.properties[0].owned,1);
  await action(page.getByRole('button',{name:'Sell Smallholding',exact:true}));assert.equal((await state()).land.properties[0].owned,0);
  await page.goto(config.origin+'/game/battle');
  for(let i=0;i<10&&!(await page.getByRole('button',{name:'Attack Proxy Rival '+suffix,exact:true}).count());i++)await page.getByRole('link',{name:'More rivals',exact:true}).click();
  await action(page.getByRole('button',{name:'Attack Proxy Rival '+suffix,exact:true}));
  const battleId=page.url().split('/').at(-1)!;assert.equal((await page.request.get(config.origin+'/api/v1/battles/'+battleId)).status(),200);
  const me=await page.request.get(config.origin+'/api/v1/me').then(response=>response.json());
  const cookie=(await context.cookies()).find(cookie=>cookie.name==='kr_session')!;assert.equal(cookie.secure,true);assert.equal(cookie.httpOnly,true);assert.equal(cookie.sameSite,'Lax');
  const headers={cookie:'kr_session='+cookie.value,'x-csrf-token':me.csrfToken,'idempotency-key':randomUUID(),origin:'https://evil.app.github.dev',host,'x-forwarded-host':host,'x-forwarded-proto':'https'};
  const foreign=await app.inject({method:'POST',url:'/api/v1/quests/border-patrol/runs',headers,payload:{}});assert.equal(foreign.statusCode,403);assert.equal(foreign.json().error.code,'ORIGIN_REJECTED');
  const bad=await app.inject({method:'POST',url:'/api/v1/quests/border-patrol/runs',headers:{...headers,origin:config.origin,'x-csrf-token':'0'.repeat(64)},payload:{}});assert.equal(bad.statusCode,403);assert.equal(bad.json().error.code,'CSRF_REJECTED');
  const saved=await state();await page.goto(config.origin+'/game/profile');
  await Promise.all([page.waitForURL(config.origin+'/login'),page.getByRole('button',{name:'Sign out',exact:true}).click()]);
  assert.equal((await page.request.get(config.origin+'/api/v1/me')).status(),401);
  await page.goto(config.origin+'/login');await page.getByLabel('Account name',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill(password);
  await Promise.all([page.waitForURL(config.origin+'/game/home'),page.getByRole('button',{name:'Sign in',exact:true}).click()]);
  const restored=await state();for(const field of ['id','gold','xp','inventory','questsCompleted'])assert.deepEqual(restored[field],saved[field]);
  const newCookie=(await context.cookies()).find(cookie=>cookie.name==='kr_session')!;assert.notEqual(newCookie.value,cookie.value);assert.equal(newCookie.secure,true);
  assert.equal((await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:'kr_session='+cookie.value}})).statusCode,401);
  await page.goto(config.origin+'/game/quests');await action(page.getByRole('button',{name:'Do quest Patrol the border',exact:true}));assert.equal((await state()).questsCompleted,2);
  assert.ok(observed.length>=8);observed.forEach(request=>assert.equal(request.origin,config.origin));assert.deepEqual(errors,[]);
  const out=join(projectRoot,'test-results/codespaces-https');await mkdir(out,{recursive:true});await page.screenshot({path:join(out,'phone-quest-success.png'),fullPage:true});
  const summary={passed:true,fixture:'Real local TLS reverse proxy, standard Codespaces-shaped HTTPS origin and HTTP backend',live_provider_contacted:false,
    existing_accounts_preserved:true,secure_http_only_cookie:true,session_rotation_and_logout:true,forged_origin_and_forwarded_headers_rejected:true,invalid_csrf_rejected:true,
    form_actions:['Quest','Equipment purchase','Land purchase','Land sale','PvP','Sign out','Sign in','Quest after rotated login'],browser_errors:errors.length};
  await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log('PASS: existing accounts can quest, buy, manage Land, battle, log out and log back in through a Codespaces HTTPS reverse-proxy fixture. Secure cookies, CSRF and Origin/forwarded-header forgery regressions pass.');
}finally{
  await browser?.close();for(const socket of sockets)socket.destroy();
  if(tunnel)await new Promise<void>(resolve=>tunnel!.close(()=>resolve()));if(proxy)await new Promise<void>(resolve=>proxy!.close(()=>resolve()));
  await app.close();await db.end();await rm(temp,{recursive:true,force:true});
}
