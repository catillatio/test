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
import {urlOrigin} from '../src/request-origin.js';
import {registerAccount,createSession} from '../src/auth.js';
import {testDatabaseUrl} from '../tests/helpers.js';
import {provisionBots} from '../src/development.js';
import {transaction} from '../src/db.js';
import {ledger} from '../src/economy.js';
import {grantExperience} from '../src/progression.js';
import {lockCharacters,clock} from '../src/game.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {executeCommand} from '../src/commands.js';

if(!testDatabaseUrl)throw new Error('Use TEST_DATABASE_URL for a disposable *_test database.');
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'https://knights-session-fixture-3001.app.github.dev',PORT:'3001',CODESPACES:'true',CODESPACE_NAME:'knights-session-fixture',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev',ENABLE_DEV_BOTS:'1'});
assert.equal(config.origin,'https://knights-session-fixture-3001.app.github.dev');assert.equal(config.originSource,'explicit');assert.equal(config.secureCookies,true);
const host=new URL(config.origin).hostname,temp=await mkdtemp(join(tmpdir(),'kr-https-'));
const admin=createDatabase(testDatabaseUrl),schema='https_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
const scopedUrl=new URL(testDatabaseUrl);scopedUrl.searchParams.set('options','-c search_path='+schema);const db=createDatabase(scopedUrl.href);
await migrate(db);const app=await createApp({db,config});
await provisionBots(db,{nodeEnv:'test',allowProvisioning:true});
let browser:Browser|undefined,proxy:ReturnType<typeof tlsServer>|undefined,tunnel:Server|undefined;
let originMode:'http'|'https'|'preserve'='http';
const sockets=new Set<Socket>(),observed:{browserOrigin:string|undefined;upstreamOrigin:string|undefined;refererOrigin:string|null;fetchSite:string|undefined;forwardedProto:string;path:string}[]=[];
const track=(server:Server)=>server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
const listen=async(server:Server)=>{server.listen(0,'127.0.0.1');await once(server,'listening');return (server.address() as {port:number}).port;};
try{
  await app.listen({host:'127.0.0.1',port:0});const backend=(app.server.address() as {port:number}).port;
  const key=join(temp,'key.pem'),cert=join(temp,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN='+host,'-addext','subjectAltName=DNS:'+host],{stdio:'ignore'});
  proxy=tlsServer({key:await readFile(key),cert:await readFile(cert)},(request,response)=>{
    // Dev Tunnels rewrites the SAME-ORIGIN source to localhost. Reproduce the
    // source seen at each side of TLS termination; preserve foreign Origins.
    const upstreamOrigin=request.headers.origin===config.origin&&originMode!=='preserve'?originMode+'://localhost:'+config.port:request.headers.origin;
    const headers={...request.headers,...(upstreamOrigin===undefined?{}:{origin:upstreamOrigin}),host:'localhost:'+config.port,'x-forwarded-host':host,'x-forwarded-proto':'https','x-forwarded-for':'203.0.113.41'};
    if(request.method==='POST')observed.push({browserOrigin:request.headers.origin,upstreamOrigin,refererOrigin:urlOrigin(request.headers.referer),fetchSite:String(request.headers['sec-fetch-site']),forwardedProto:'https',path:request.url!});
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
  const errors:string[]=[];
  // Registration must use real browser cookies, CSRF and a native form POST;
  // seeding accounts directly cannot catch a broken registration boundary.
  const newcomer=await context.newPage();
  newcomer.on('pageerror',error=>errors.push(error.message));
  await newcomer.goto(config.origin+'/register');
  const anonymousCookie=(await context.cookies()).find(cookie=>cookie.name==='kr_session')!;
  assert.equal(anonymousCookie.secure,true);assert.equal(anonymousCookie.httpOnly,true);
  await newcomer.getByLabel('Account name',{exact:true}).fill('new_https_'+suffix);
  await newcomer.getByLabel('Warrior name',{exact:true}).fill('New HTTPS Knight '+suffix);
  await newcomer.getByLabel('Password',{exact:true}).fill(randomUUID()+'Aa1!');
  await Promise.all([newcomer.waitForURL(config.origin+'/game/home'),newcomer.getByRole('button',{name:'Create your warrior',exact:false}).click()]);
  const registeredCookie=(await context.cookies()).find(cookie=>cookie.name==='kr_session')!;
  assert.equal(registeredCookie.secure,true);assert.equal(registeredCookie.httpOnly,true);assert.equal(registeredCookie.sameSite,'Lax');
  assert.notEqual(registeredCookie.value,anonymousCookie.value);
  const newlyRegistered=await newcomer.request.get(config.origin+'/api/v1/me');assert.equal(newlyRegistered.status(),200);
  assert.equal((await newlyRegistered.json()).state.name,'New HTTPS Knight '+suffix);
  await newcomer.goto(config.origin+'/game/profile');
  await Promise.all([newcomer.waitForURL(config.origin+'/login'),newcomer.getByRole('button',{name:'Sign out',exact:true}).click()]);
  await newcomer.close();
  // Create this returning player's persisted account/session outside the
  // browser, before that player first uses the proxy; never reset the DB.
  const account=await registerAccount(db,{username,name:'Proxy Knight '+suffix,password});
  const rival=await registerAccount(db,{username:'rival_'+suffix,name:'Proxy Rival '+suffix,password:randomUUID()});
  const session=await createSession(db,account.accountId);
  // A cookie issued by the old localhost-configured HTTP backend was not
  // marked Secure. It must still authenticate over HTTPS after the upgrade.
  const oldRivalSession=await createSession(db,rival.accountId);
  await context.addCookies([{name:'kr_session',value:session.token,url:config.origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
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
  originMode='https';
  await page.goto(config.origin+'/game/quests');await action(page.getByRole('button',{name:'Do quest Patrol the border',exact:true}));assert.equal((await state()).questsCompleted,2);
  originMode='preserve';
  await action(page.getByRole('button',{name:'Do quest Patrol the border',exact:true}));
  await page.goto(config.origin+'/game/profile?tab=skills');await action(page.getByRole('button',{name:'Increase Attack',exact:true}));assert.equal((await state()).training.attack,1);
  originMode='http';
  const returning=await browser.newContext({ignoreHTTPSErrors:true});
  await returning.route('**/*',route=>new URL(route.request().url()).origin===config.origin?route.continue():route.abort());
  await returning.addCookies([{name:'kr_session',value:oldRivalSession.token,url:config.origin,httpOnly:true,secure:false,sameSite:'Lax'}]);
  const oldPage=await returning.newPage();oldPage.on('pageerror',error=>errors.push(error.message));
  await oldPage.goto(config.origin+'/game/quests');
  await Promise.all([oldPage.waitForURL(url=>url.searchParams.has('command')),oldPage.getByRole('button',{name:'Do quest Patrol the border',exact:true}).click()]);
  assert.equal(await oldPage.getByRole('alert').count(),0);assert.equal((await oldPage.request.get(config.origin+'/api/v1/me').then(r=>r.json())).state.id,rival.characterId);
  await oldPage.goto(config.origin+'/game/profile');await Promise.all([oldPage.waitForURL(config.origin+'/login'),oldPage.getByRole('button',{name:'Sign out',exact:true}).click()]);
  assert.equal((await oldPage.request.get(config.origin+'/api/v1/me')).status(),401);await returning.close();
  // The new milestone must also cross the same rewritten-Origin boundary.
  originMode='http';
  await page.goto(config.origin+'/game/profile');await page.getByLabel('Calling',{exact:true}).selectOption('Spellward');
  await action(page.getByRole('button',{name:'Choose calling',exact:true}));assert.equal((await state()).className,'Spellward');
  assert.equal((await state()).calling.manaSeconds,270);
  const screenOut=join(projectRoot,'test-results/strategy-browser');await mkdir(screenOut,{recursive:true});
  await page.locator('#account').scrollIntoViewIfNeeded();await page.screenshot({path:join(screenOut,'390-calling.png')});
  async function fixture(name:string,level=3){
    const nonce=randomUUID().replaceAll('-','').slice(0,6),displayName=name+' '+nonce;
    const account=await registerAccount(db,{username:'contract_'+nonce,name:displayName,password:randomUUID()+'Aa1!'});
    await transaction(db,async sql=>{
      await lockCharacters(sql,[account.characterId]);await ledger(sql,null,'test_fixture',[{characterId:account.characterId,amount:1000000}],alpha.id);
      await grantExperience(sql,account.characterId,Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0),await clock(sql));
    });
    for(let i=0;i<5;i++)await executeCommand(db,account.accountId,randomUUID(),'quest',{questId:'border-patrol'});
    const session=await createSession(db,account.accountId);return {...account,name:displayName,token:session.token};
  }
  async function playerPage(token:string){
    const ctx=await browser!.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await ctx.route('**/*',route=>new URL(route.request().url()).origin===config.origin?route.continue():route.abort());
    await ctx.addCookies([{name:'kr_session',value:token,url:config.origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
    const player=await ctx.newPage();player.on('pageerror',error=>errors.push(error.message));return player;
  }
  async function submit(player:Page,button:Locator){const prior=player.url();await Promise.all([player.waitForURL(url=>url.href!==prior),button.click()]);assert.equal(await player.getByRole('alert').count(),0,await player.locator('body').innerText());}
  const sponsor=await fixture('Ash Steward'),target=await fixture('Briar Outlaw'),hunter=await fixture('Crown Hunter');
  await executeCommand(db,hunter.accountId,randomUUID(),'skill',{resource:'spirit'});
  await executeCommand(db,hunter.accountId,randomUUID(),'recruit',{unitId:'militia',quantity:20});
  await executeCommand(db,hunter.accountId,randomUUID(),'buy',{itemId:'iron-sword',quantity:20});
  const sponsorPage=await playerPage(sponsor.token);await sponsorPage.goto(config.origin+'/game/battle');
  const row=sponsorPage.locator('.rival-row').filter({has:sponsorPage.getByRole('heading',{name:target.name,exact:true})});
  await row.locator('summary').click();await row.locator('input[name="amount"]').fill('1000');
  await submit(sponsorPage,sponsorPage.getByRole('button',{name:'Place bounty on '+target.name,exact:true}));
  assert.match(await sponsorPage.locator('body').innerText(),/gold held in escrow/);
  assert.equal(await sponsorPage.getByRole('button',{name:'Cancel',exact:true}).first().isDisabled(),true);
  await sponsorPage.screenshot({path:join(screenOut,'390-bounty-sponsored.png'),fullPage:true});
  const hunterPage=await playerPage(hunter.token);await hunterPage.goto(config.origin+'/game/bounties');
  await hunterPage.screenshot({path:join(screenOut,'390-bounty-list.png'),fullPage:true});
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Hunt '+target.name,exact:true}));
  assert.match(await hunterPage.locator('body').innerText(),/Bounty claimed!/);
  const claimedId=hunterPage.url().split('/').at(-1)!;
  const claimed=(await hunterPage.request.get(config.origin+'/api/v1/battles/'+claimedId).then(response=>response.json())).battle;
  assert.equal(claimed.bountyClaim.reward,1000);assert.ok(claimed.loot<=50);
  assert.equal((await sponsorPage.request.get(config.origin+'/api/v1/battles/'+claimedId)).status(),404);
  await hunterPage.screenshot({path:join(screenOut,'390-bounty-report.png'),fullPage:true});
  const bot=(await db.query("SELECT c.id,c.name FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=3 AND b.tier='green'")).rows[0]!;
  await new Promise(resolve=>setTimeout(resolve,alpha.combat.cooldownSeconds*1000+50));
  await hunterPage.goto(config.origin+'/game/battle');
  for(let i=0;i<40&&!(await hunterPage.getByRole('button',{name:'Attack '+bot.name,exact:true}).count());i++)await hunterPage.getByRole('link',{name:'More rivals',exact:true}).click();
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Attack '+bot.name,exact:true}));
  const botReport=(await hunterPage.request.get(config.origin+'/api/v1/battles/'+hunterPage.url().split('/').at(-1)).then(r=>r.json())).battle;
  assert.equal(botReport.temporaryRival,true);assert.equal(botReport.bountyClaim,null);
  // Phase 4: real native mobile POSTs, using the very same HTTPS rewrite.
  const phase4Out=join(projectRoot,'test-results/phase4-browser');await mkdir(phase4Out,{recursive:true});
  await hunterPage.goto(config.origin+'/game/home');await hunterPage.screenshot({path:join(phase4Out,'390-home.png'),fullPage:true});
  await hunterPage.goto(config.origin+'/game/home?feed=battles');assert.ok((await hunterPage.locator('.activity-battle').count())>=2);
  await hunterPage.screenshot({path:join(phase4Out,'390-battles.png'),fullPage:true});
  await hunterPage.goto(config.origin+'/game/players/'+target.characterId+'?tab=comments');
  const socialPayload='<img src=x onerror=alert(1)> Honor to your banner.';
  await hunterPage.getByLabel('Leave a profile comment',{exact:true}).fill(socialPayload);
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Post Comment',exact:true}));
  assert.ok((await hunterPage.locator('.message-text').allTextContents()).includes(socialPayload));
  assert.equal(await hunterPage.locator('.message-text img').count(),0);
  assert.equal(await hunterPage.locator('.message-text').evaluateAll(nodes=>nodes.some(node=>node.innerHTML.includes('<img'))),false);
  await hunterPage.screenshot({path:join(phase4Out,'390-comments.png'),fullPage:true});
  const targetPage=await playerPage(target.token);await targetPage.goto(config.origin+'/game/home?feed=comments');
  assert.ok((await targetPage.locator('.message-text').allTextContents()).includes(socialPayload));
  await targetPage.locator('.report-message summary').first().click();
  await submit(targetPage,targetPage.getByRole('button',{name:'Send report',exact:true}));
  assert.match(await targetPage.locator('body').innerText(),/Reported for review/);
  await hunterPage.goto(config.origin+'/game/home?feed=broadcasts');
  await hunterPage.getByLabel('Speak to the realm',{exact:true}).fill('The Crown welcomes allies. Keep your blades ready.');
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Broadcast',exact:true}));
  await hunterPage.screenshot({path:join(phase4Out,'390-broadcasts.png'),fullPage:true});
  await targetPage.goto(config.origin+'/game/home?feed=broadcasts');assert.match(await targetPage.locator('body').innerText(),/Crown welcomes allies/);
  const targetState=(await targetPage.request.get(config.origin+'/api/v1/me').then(response=>response.json())).state;
  await hunterPage.goto(config.origin+'/game/army');
  await hunterPage.getByLabel('Invite using their code',{exact:true}).fill(targetState.invitationCode.toLowerCase());
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Invite Ally',exact:true}));
  await targetPage.goto(config.origin+'/game/army?tab=dashboard');
  await submit(targetPage,targetPage.getByRole('button',{name:'Accept '+hunter.name,exact:true}));
  assert.equal((await targetPage.request.get(config.origin+'/api/v1/me').then(response=>response.json())).state.army.allies,1);
  await hunterPage.goto(config.origin+'/game/army');await hunterPage.screenshot({path:join(phase4Out,'390-recruit.png'),fullPage:true});
  await hunterPage.goto(config.origin+'/game/army?tab=dashboard');await hunterPage.screenshot({path:join(phase4Out,'390-army-dashboard.png'),fullPage:true});
  // A separate low-Health target permits a real native repeat/finish, without
  // resetting the hunter, bypassing the cooldown, or exhausting a whole army.
  const finishing=await fixture('Wounded Raider');
  await db.query('UPDATE characters SET health=35,health_updated_at=clock_timestamp() WHERE id=$1',[finishing.characterId]);
  await hunterPage.goto(config.origin+'/game/players/'+finishing.characterId);
  await hunterPage.getByRole('button',{name:'Attack',exact:true}).waitFor({state:'visible'});
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Attack',exact:true}));
  const firstId=hunterPage.url().split('/').at(-1)!;
  const first=(await hunterPage.request.get(config.origin+'/api/v1/battles/'+firstId).then(response=>response.json())).battle;
  assert.ok(first.defenderHealthAfter>0&&first.defenderHealthAfter<20);
  assert.ok((await hunterPage.locator('a[href="/game/players/'+hunter.characterId+'"]').count())>=1);
  assert.ok((await hunterPage.locator('a[href="/game/players/'+finishing.characterId+'"]').count())>=1);
  assert.equal(await hunterPage.getByRole('button',{name:'Attack Again',exact:true}).isDisabled(),true);
  await hunterPage.waitForFunction(()=>!(document.querySelector('.attack-again') as HTMLButtonElement)?.disabled,{},{timeout:20000});
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Attack Again',exact:true}));
  const secondId=hunterPage.url().split('/').at(-1)!;assert.notEqual(firstId,secondId);
  const second=(await hunterPage.request.get(config.origin+'/api/v1/battles/'+secondId).then(response=>response.json())).battle;
  assert.equal(second.defenderHealthAfter,0);assert.equal(await hunterPage.getByRole('button',{name:'Attack Again',exact:true}).isDisabled(),true);
  assert.match(await hunterPage.locator('[data-combat-restriction]').innerText(),/Opponent defeated/);
  await hunterPage.screenshot({path:join(phase4Out,'390-battle-report.png'),fullPage:true});
  const legend=await fixture('Fable Keeper',50);await executeCommand(db,legend.accountId,randomUUID(),'recruit',{unitId:'militia',quantity:20});
  for(const itemId of ['eclipse-greatsword','eclipse-citadel-plate','eclipse-invocation'])await executeCommand(db,legend.accountId,randomUUID(),'buy',{itemId,quantity:5});
  await executeCommand(db,legend.accountId,randomUUID(),'land_buy',{propertyId:'eclipse-citadel',quantity:1});
  const legendPage=await playerPage(legend.token),widths=[320,360,390,412,1366];
  for(const width of widths){
    await legendPage.setViewportSize({width,height:width===1366?900:844});
    for(const screen of ['home','home?feed=battles','home?feed=comments','home?feed=broadcasts','profile','profile?tab=skills','profile?tab=comments','profile?tab=battles','players/'+target.characterId,'players/'+target.characterId+'?tab=comments','army','army?tab=army','army?tab=dashboard','settings','land','battle','bounties']){
      await legendPage.goto(config.origin+'/game/'+screen);
      assert.equal(await legendPage.getByRole('alert').count(),0,screen);
      assert.equal(await legendPage.locator('nav[aria-label="Primary navigation"] a').count(),5);
      assert.equal(await legendPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,width+' '+screen+' horizontal overflow');
      // Native accessibility contracts: each interactive control has a name,
      // headings and form labels remain visible, and status text is announced.
      assert.equal(await legendPage.locator('button').evaluateAll(buttons=>buttons.some(button=>!button.textContent?.trim()&&!button.getAttribute('aria-label'))),false);
      assert.equal(await legendPage.locator('input:not([type="hidden"]), textarea, select').evaluateAll(elements=>elements.some(element=>!element.getAttribute('aria-label')&&!(element as HTMLInputElement).labels?.length)),false);
      assert.equal(await legendPage.locator('img').evaluateAll(images=>images.some(image=>image instanceof HTMLImageElement&&(!image.complete||image.naturalWidth===0))),false);
      if(width===390&&screen==='profile')await legendPage.screenshot({path:join(phase4Out,'390-profile.png'),fullPage:true});
      if(screen==='land'){
        assert.equal(await legendPage.locator('[data-land-property]').count(),21);
        const art=await legendPage.locator('.atlas-properties').first().evaluate(element=>getComputedStyle(element).backgroundImage);assert.ok(art.includes('land-simple-0.1'));
        if(width===390){await legendPage.screenshot({path:join(screenOut,'390-land-starter.png')});await legendPage.locator('[data-land-property="eclipse-citadel"]').scrollIntoViewIfNeeded();await legendPage.screenshot({path:join(screenOut,'390-land-legendary.png')});}
      }
      if(width===390&&['profile','battle'].includes(screen))await legendPage.screenshot({path:join(screenOut,'390-'+screen+'.png'),fullPage:screen==='profile'});
    }
  }
  assert.ok(observed.length>=16);
  observed.forEach(request=>{assert.equal(request.browserOrigin,config.origin);assert.equal(request.refererOrigin,config.origin);assert.equal(request.fetchSite,'same-origin');});
  for(const upstream of ['http://localhost:3001','https://localhost:3001',config.origin])assert.ok(observed.some(request=>request.upstreamOrigin===upstream),upstream);
  assert.ok(observed.some(request=>request.path==='/register'&&request.upstreamOrigin==='http://localhost:3001'));assert.deepEqual(errors,[]);
  const out=join(projectRoot,'test-results/codespaces-https');await mkdir(out,{recursive:true});await page.screenshot({path:join(out,'phone-quest-success.png'),fullPage:true});
  const summary={passed:true,fixture:'Real local TLS reverse proxy, Codespaces port 3001 origin rewriting and HTTP backend',live_provider_contacted:false,
    configured_origin:config.origin,origin_source:config.originSource,secure_cookies:config.secureCookies,
    native_browser_registration:true,observed_post_headers:observed,
    calling_change:true,escrow_bounty_placement_and_claim:true,private_bounty_report:true,passive_bot_combat:true,
    mobile_widths:widths,simplified_land_art:true,phase4:{native_comments:true,safe_text:true,native_reporting:true,native_broadcasts:true,native_code_invitation_and_acceptance:true,native_attack_again_to_zero:true,public_profile_links:true,viewports:widths,screensPerViewport:17,screenshots:'test-results/phase4-browser',accessibility:'Named controls, native form labels, five-tab navigation, overflow and image checks; manual keyboard flow separately tested'},
    existing_accounts_preserved:true,pre_fix_non_secure_cookie_still_authenticates_over_https:true,secure_http_only_cookie:true,session_rotation_and_logout:true,forged_origin_and_forwarded_headers_rejected:true,invalid_csrf_rejected:true,
    form_actions:['Registration','Quest','Equipment purchase','Land purchase','Land sale','PvP','Sign out','Sign in','Quest after rotated login','Attack skill allocation'],browser_errors:errors.length};
  await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log('PASS: Phase 4 comments, broadcasts, code invitations, finishing Attack Again and 85 responsive screen visits pass. Registration, existing-player gameplay, Calling, funded bounties, passive rivals and mobile layouts pass through a Codespaces port-3001 HTTPS fixture. Secure cookies, CSRF, strict Origin validation and private reports remain enforced. Screenshots: test-results/strategy-browser/.');
}finally{
  await browser?.close();for(const socket of sockets)socket.destroy();
  if(tunnel)await new Promise<void>(resolve=>tunnel!.close(()=>resolve()));if(proxy)await new Promise<void>(resolve=>proxy!.close(()=>resolve()));
  await app.close();await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(temp,{recursive:true,force:true});
}
