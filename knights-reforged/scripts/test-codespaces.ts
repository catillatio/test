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
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'https://knights-session-fixture-3001.app.github.dev',PORT:'3001',CODESPACES:'true',CODESPACE_NAME:'knights-session-fixture',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev',ENABLE_DEV_BOTS:'1',ENABLE_DEV_BOT_BOUNTIES:'1',ENABLE_DEV_BOT_RECRUITMENT:'1'});
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
  const refinementOut=join(projectRoot,'test-results/phase43-browser');await mkdir(refinementOut,{recursive:true});
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
  const action=async(button:Locator)=>{const prior=page.url();await Promise.all([page.waitForURL(url=>url.href!==prior),button.click()]);if(await page.locator('[data-trade-confirm]').count()){await Promise.all([page.waitForURL(url=>!url.pathname.endsWith('/buy')&&!url.pathname.endsWith('/sell')),page.locator('[data-trade-confirm] button[type=submit]').click()]);}assert.equal(await page.getByRole('alert').count(),0,await page.locator('body').innerText());};
  await page.goto(config.origin+'/game/quests');
  const before=await state();assert.equal(before.id,account.characterId);
  await action(page.getByRole('button',{name:'Do quest Patrol the border',exact:true}));assert.equal((await state()).questsCompleted,1);
  assert.equal(await page.getByRole('button',{name:'Do Again',exact:true}).isEnabled(),true);
  assert.ok((await page.getByRole('button',{name:'Do Again',exact:true}).getAttribute('class'))?.includes('button-gold'));
  await page.screenshot({path:join(refinementOut,'390-quest-do-again.png'),fullPage:true});
  await page.goto(config.origin+'/game/armory');await action(page.getByRole('button',{name:"Buy Squire's Blade",exact:true}));
  await page.goto(config.origin+'/game/land');await action(page.getByRole('button',{name:'Buy Smallholding',exact:true}));assert.equal((await state()).land.properties[0].owned,1);
  await page.goto(config.origin+'/game/land');
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
  const screenOut=join(projectRoot,'test-results/phase43-strategy-browser');await mkdir(screenOut,{recursive:true});
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
  async function submit(player:Page,button:Locator){const prior=player.url();await Promise.all([player.waitForURL(url=>url.href!==prior),button.click()]);if(await player.locator('[data-trade-confirm]').count()){await Promise.all([player.waitForURL(url=>!url.pathname.endsWith('/buy')&&!url.pathname.endsWith('/sell')),player.locator('[data-trade-confirm] button[type=submit]').click()]);}assert.equal(await player.getByRole('alert').count(),0,await player.locator('body').innerText());}
  const sponsor=await fixture('Ash Steward'),target=await fixture('Briar Outlaw'),hunter=await fixture('Crown Hunter',5);
  await executeCommand(db,hunter.accountId,randomUUID(),'skill',{resource:'spirit'});
  await executeCommand(db,hunter.accountId,randomUUID(),'skill',{resource:'spirit'});
  await executeCommand(db,hunter.accountId,randomUUID(),'recruit',{unitId:'militia',quantity:20});
  await executeCommand(db,hunter.accountId,randomUUID(),'buy',{itemId:'iron-sword',quantity:20});
  const sponsorPage=await playerPage(sponsor.token);await sponsorPage.goto(config.origin+'/game/players/'+target.characterId);
  const actions=sponsorPage.locator('.profile-actions');assert.equal(await actions.getByRole('button',{name:'Attack',exact:true}).count(),1);
  await actions.getByRole('link',{name:'Add to Bounty List',exact:true}).click();
  await sponsorPage.getByLabel('Escrowed bounty (1–10,000 gold)',{exact:true}).fill('1000');
  await submit(sponsorPage,sponsorPage.getByRole('button',{name:'Place bounty on '+target.name,exact:true}));
  assert.match(await sponsorPage.locator('body').innerText(),/Nonrefundable listing fee/);
  await sponsorPage.screenshot({path:join(screenOut,'390-bounty-confirm.png'),fullPage:true});
  await submit(sponsorPage,sponsorPage.getByRole('button',{name:'Confirm bounty — 1100 gold',exact:true}));
  assert.match(await sponsorPage.locator('body').innerText(),/gold held in escrow/);
  assert.equal(await sponsorPage.getByRole('button',{name:'Cancel',exact:true}).first().isDisabled(),true);
  await sponsorPage.screenshot({path:join(screenOut,'390-bounty-sponsored.png'),fullPage:true});
  const hunterPage=await playerPage(hunter.token);await hunterPage.goto(config.origin+'/game/bounties');
  await hunterPage.screenshot({path:join(screenOut,'390-bounty-list.png'),fullPage:true});
  await db.query('UPDATE characters SET health=1,health_updated_at=clock_timestamp() WHERE id=$1',[target.characterId]);
  await hunterPage.reload();
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Hunt '+target.name,exact:true}));
  assert.match(await hunterPage.locator('body').innerText(),/Bounty claimed!/);
  const claimedId=hunterPage.url().split('/').at(-1)!;
  const claimed=(await hunterPage.request.get(config.origin+'/api/v1/battles/'+claimedId).then(response=>response.json())).battle;
  assert.equal(claimed.bountyClaim.reward,1000);assert.equal(claimed.loot,5000);assert.equal(claimed.pvpRulesetId,'pvp-economy-0.1');
  assert.equal((await sponsorPage.request.get(config.origin+'/api/v1/battles/'+claimedId)).status(),404);
  await hunterPage.screenshot({path:join(screenOut,'390-bounty-report.png'),fullPage:true});
  const bot=(await db.query("SELECT c.id,c.name FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=3 AND b.tier='green'")).rows[0]!;
  await sponsorPage.goto(config.origin+'/game/players/'+bot.id);
  await sponsorPage.screenshot({path:join(screenOut,'390-bot-profile-actions.png'),fullPage:true});
  await sponsorPage.getByRole('link',{name:'Add to Bounty List',exact:true}).click();
  await sponsorPage.getByLabel('Escrowed bounty (1–10,000 gold)',{exact:true}).fill('500');
  await sponsorPage.waitForFunction(()=>document.querySelector('[data-bounty-total]')?.textContent==='550 gold');
  await sponsorPage.screenshot({path:join(screenOut,'390-bot-bounty-placement.png'),fullPage:true});
  await submit(sponsorPage,sponsorPage.getByRole('button',{name:'Place bounty on '+bot.name,exact:true}));
  await submit(sponsorPage,sponsorPage.getByRole('button',{name:'Confirm bounty — 550 gold',exact:true}));
  await db.query('UPDATE characters SET health=35,health_updated_at=clock_timestamp() WHERE id=$1',[bot.id]);
  await hunterPage.goto(config.origin+'/game/players/'+bot.id);
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Attack',exact:true}));
  const botReport=(await hunterPage.request.get(config.origin+'/api/v1/battles/'+hunterPage.url().split('/').at(-1)).then(r=>r.json())).battle;
  assert.equal(botReport.temporaryRival,true);assert.equal(botReport.bountyClaim,null);assert.ok(botReport.loot<=50);
  assert.equal(await hunterPage.getByRole('button',{name:'Attack Again',exact:true}).isEnabled(),true);
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Attack Again',exact:true}));
  const botClaim=(await hunterPage.request.get(config.origin+'/api/v1/battles/'+hunterPage.url().split('/').at(-1)).then(r=>r.json())).battle;
  assert.equal(botClaim.defenderHealthAfter,0);assert.equal(botClaim.bountyClaim.reward,500);assert.equal(botClaim.loot,0);assert.equal(botClaim.attackerXp,1);
  assert.equal(await hunterPage.getByRole('button',{name:'Attack Again',exact:true}).isDisabled(),true);
  await hunterPage.screenshot({path:join(screenOut,'390-bot-bounty-claim.png'),fullPage:true});
  // Native Vault forms exercise the same secure cookies and rewritten Origin.
  await hunterPage.goto(config.origin+'/game/vault');
  await hunterPage.getByLabel('Deposit gold',{exact:true}).fill('2000');
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Deposit',exact:true}));
  const banked=(await hunterPage.request.get(config.origin+'/api/v1/me').then(r=>r.json())).state.bankedGold;assert.equal(banked,2000);
  await hunterPage.getByLabel('Withdraw gold',{exact:true}).fill('500');
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Withdraw',exact:true}));
  assert.equal((await hunterPage.request.get(config.origin+'/api/v1/me').then(r=>r.json())).state.bankedGold,1500);
  await hunterPage.screenshot({path:join(screenOut,'390-vault.png'),fullPage:true});
  // Phase 4: real native mobile POSTs, using the very same HTTPS rewrite.
  const phase4Out=join(projectRoot,'test-results/phase43-browser');await mkdir(phase4Out,{recursive:true});
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
  // resetting the hunter or exhausting a whole army. No combat delay exists.
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
  assert.equal(await hunterPage.getByRole('button',{name:'Attack Again',exact:true}).isDisabled(),false);
  const immediateAt=performance.now();
  await submit(hunterPage,hunterPage.getByRole('button',{name:'Attack Again',exact:true}));
  const secondId=hunterPage.url().split('/').at(-1)!;assert.notEqual(firstId,secondId);
  assert.ok(performance.now()-immediateAt<8000,'repeat action should not wait for a combat cooldown');
  const second=(await hunterPage.request.get(config.origin+'/api/v1/battles/'+secondId).then(response=>response.json())).battle;
  assert.equal(second.defenderHealthAfter,0);assert.equal(await hunterPage.getByRole('button',{name:'Attack Again',exact:true}).isDisabled(),true);
  assert.match(await hunterPage.locator('[data-combat-restriction]').innerText(),/Opponent defeated/);
  await hunterPage.screenshot({path:join(phase4Out,'390-battle-report.png'),fullPage:true});
  // Phase 4.3: native quantity controls, saved Buy More receipts and profile
  // recruitment use the same TLS proxy and normal authenticated HTML POSTs.
  const merchant=await fixture('Market Knight',25),marketPage=await playerPage(merchant.token);
  const marketState=async()=>(await marketPage.request.get(config.origin+'/api/v1/me').then(r=>r.json())).state;
  let purchaseReceiptPath='';
  for(const category of ['weapon','armor','spell']){
    const item=alpha.items.find(i=>i.category===category)!;
    await marketPage.goto(config.origin+'/game/armory?category='+category);
    const control=marketPage.locator('[data-quantity-control][data-trade-mode="buy"][data-definition-id="'+item.id+'"]');
    assert.equal(await control.locator('input').getAttribute('readonly'),'');
    await control.getByRole('button',{name:'Increase quantity for '+item.name,exact:true}).click();
    await control.getByRole('button',{name:'Increase quantity for '+item.name,exact:true}).click();
    await control.getByRole('button',{name:'Decrease quantity for '+item.name,exact:true}).click();
    assert.equal(await control.locator('input').inputValue(),'2');
    await control.getByRole('button',{name:'Increase quantity for '+item.name,exact:true}).click();
    assert.equal(await control.locator('input').inputValue(),'3');
    assert.equal((await control.locator('[data-quantity-total]').innerText()).replaceAll(',',''),String(item.price*3));
    await marketPage.screenshot({path:join(refinementOut,'390-'+category+'-quantity.png')});
    await submit(marketPage,marketPage.getByRole('button',{name:'Buy '+item.name,exact:true}));
    assert.equal((await marketState()).inventory.find((i:{id:string})=>i.id===item.id).quantity,3);
    await marketPage.getByText('Buy More',{exact:true}).click();
    await marketPage.getByRole('button',{name:'Increase quantity for '+item.name,exact:true}).click();
    await submit(marketPage,marketPage.getByRole('button',{name:'Buy more '+item.name,exact:true}));
    assert.equal((await marketState()).inventory.find((i:{id:string})=>i.id===item.id).quantity,5);
  }
  await marketPage.goto(config.origin+'/game/land');
  const landControl=marketPage.locator('[data-quantity-control][data-trade-mode="buy"][data-definition-id="smallholding"]');
  await landControl.getByRole('button',{name:'Increase quantity for Smallholding',exact:true}).click();
  await landControl.getByRole('button',{name:'Increase quantity for Smallholding',exact:true}).click();
  await marketPage.screenshot({path:join(refinementOut,'390-land-quantity.png')});
  await submit(marketPage,marketPage.getByRole('button',{name:'Buy Smallholding',exact:true}));
  await marketPage.getByText('Buy More',{exact:true}).click();
  await marketPage.getByRole('button',{name:'Increase quantity for Smallholding',exact:true}).click();
  await marketPage.screenshot({path:join(refinementOut,'390-land-buy-more.png')});
  await submit(marketPage,marketPage.getByRole('button',{name:'Buy more Smallholding',exact:true}));
  purchaseReceiptPath=new URL(marketPage.url()).pathname;
  assert.equal((await marketState()).land.properties.find((p:{id:string})=>p.id==='smallholding').owned,5);
  const receiptGold=(await marketState()).gold;await marketPage.reload();assert.equal((await marketState()).gold,receiptGold);
  const recruitBot=(await db.query("SELECT b.character_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=25 AND b.tier='green' AND b.variant=0")).rows[0]!;
  await marketPage.goto(config.origin+'/game/players/'+recruitBot.character_id);
  await marketPage.screenshot({path:join(refinementOut,'390-profile-invite.png')});
  await submit(marketPage,marketPage.getByRole('button',{name:'Invite to Army',exact:true}));
  assert.equal((await marketState()).army.allies,1);
  await marketPage.screenshot({path:join(refinementOut,'390-recruit-auto-accepted.png')});
  const envoy=await fixture('Banner Envoy',10),envoyPage=await playerPage(envoy.token);
  await envoyPage.goto(config.origin+'/game/players/'+target.characterId);
  await envoyPage.screenshot({path:join(refinementOut,'390-real-profile-invite.png')});
  await submit(envoyPage,envoyPage.getByRole('button',{name:'Invite to Army',exact:true}));
  await envoyPage.goto(config.origin+'/game/players/'+target.characterId);assert.match(await envoyPage.locator('body').innerText(),/request pending their acceptance/);
  await targetPage.goto(config.origin+'/game/army?tab=army');
  await submit(targetPage,targetPage.getByRole('button',{name:'Accept '+envoy.name,exact:true}));
  assert.equal((await envoyPage.request.get(config.origin+'/api/v1/me').then(r=>r.json())).state.army.allies,1);
  // A short wait represents a full historical hour in an explicit SQL fixture.
  // Both the common cycle and the owned accrual cursors are moved consistently.
  await db.query(`WITH t AS (SELECT clock_timestamp()+interval '3 seconds' AS due)
    UPDATE income_cycles SET next_payment_at=t.due FROM t WHERE character_id=$1`,[merchant.characterId]);
  await db.query("UPDATE land_holdings SET acquired_at=(SELECT next_payment_at-interval '1 hour' FROM income_cycles WHERE character_id=$1),accrued_through=(SELECT next_payment_at-interval '1 hour' FROM income_cycles WHERE character_id=$1) WHERE character_id=$1",[merchant.characterId]);
  await marketPage.goto(config.origin+'/game/land');const dueBalance=(await marketState()).gold;
  // Poll the displayed balance only; server financial calculations remain intact.
  await marketPage.waitForFunction(expected=>document.querySelector('[data-wallet-gold]')?.textContent?.replaceAll(',','')===String(expected),dueBalance+35,{timeout:15000});
  const countdownText=await marketPage.locator('[data-land-countdown]').innerText();
  const remaining=countdownText.split(':').map(Number).reduce((n,v)=>n*60+v,0);assert.ok(remaining>3540&&remaining<=3600,countdownText);
  await marketPage.goto(config.origin+'/game/quests');
  await marketPage.locator('.region-picker summary').click();
  assert.equal(await marketPage.locator('.region-picker').evaluate(e=>e.hasAttribute('open')),true);
  await marketPage.screenshot({path:join(refinementOut,'390-quest-regions.png')});
  await marketPage.getByRole('navigation',{name:'Quest regions'}).getByRole('link',{name:'All Regions Every quest',exact:true}).click();
  assert.match(await marketPage.locator('.region-picker summary').innerText(),/All Regions/);
  for(const width of [320,360,390,412,1366]){await marketPage.setViewportSize({width,height:844});await marketPage.goto(config.origin+purchaseReceiptPath);await marketPage.getByText('Buy More',{exact:true}).click();assert.ok(await marketPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await marketPage.screenshot({path:join(refinementOut,width+'-buy-more.png')});}
  // Phase 4.4: native tutorial, missing-equipment purchase, property confirmation,
  // first real quest level-up, achievement collection and reduced-motion replay.
  const phase44Out=join(projectRoot,'test-results/phase44-browser');await mkdir(phase44Out,{recursive:true});
  await marketPage.setViewportSize({width:390,height:844});
  const apprenticeAccount=await registerAccount(db,{username:'apprentice_'+suffix,name:'Dawn Apprentice',password:randomUUID()+'Aa1!'});
  const apprenticeSession=await createSession(db,apprenticeAccount.accountId),apprentice=await playerPage(apprenticeSession.token);
  const apprenticeState=async()=>(await apprentice.request.get(config.origin+'/api/v1/me').then(r=>r.json())).state;
  await apprentice.goto(config.origin+'/game/home');assert.match(await apprentice.locator('body').innerText(),/PRE ALPHA BUILD, PLEASE REPORT BUGS TO @savism DISCORD/);
  await submit(apprentice,apprentice.getByRole('button',{name:'Start quick guide',exact:true}));
  assert.equal(await apprentice.locator('.tutorial-panel').count(),1);await apprentice.screenshot({path:join(phase44Out,'390-home-tutorial.png')});
  let levelUpUrl='';
  for(let i=0;i<10;i++){
    await apprentice.goto(config.origin+'/game/quests');assert.match(await apprentice.locator('.region-picker summary').innerText(),/All Regions/);
    await submit(apprentice,apprentice.getByRole('button',{name:'Do quest Patrol the border',exact:true}));
    if(await apprentice.locator('.level-celebration').count()){levelUpUrl=apprentice.url();break;}
  }
  assert.ok(levelUpUrl);await apprentice.screenshot({path:join(phase44Out,'390-level-up.png')});
  const levelBalance=(await apprenticeState()).gold;await apprentice.reload();assert.equal((await apprenticeState()).gold,levelBalance);
  assert.equal(await apprentice.locator('.level-celebration.is-celebrating').count(),0);
  await apprentice.goto(config.origin+'/game/quests');await apprentice.screenshot({path:join(phase44Out,'390-quests.png')});
  await Promise.all([apprentice.waitForURL(url=>url.pathname.endsWith('/requirements')),apprentice.getByRole('button',{name:'Do quest Gather the Winter Timber',exact:true}).click()]);
  assert.ok(!apprentice.url().includes('csrf'));assert.equal(await apprentice.getByRole('button',{name:'Buy Missing Equipment',exact:true}).isEnabled(),true);
  const questPromptUrl=apprentice.url();await apprentice.screenshot({path:join(phase44Out,'390-quest-equipment.png')});
  const beforeRequired=await apprenticeState();await submit(apprentice,apprentice.getByRole('button',{name:'Buy Missing Equipment',exact:true}));
  const afterRequired=await apprenticeState();assert.equal(afterRequired.questsCompleted,beforeRequired.questsCompleted);assert.equal(afterRequired.mana,beforeRequired.mana);
  await submit(apprentice,apprentice.getByRole('button',{name:'Do Quest',exact:true}));await apprentice.screenshot({path:join(phase44Out,'390-quest-reward.png')});
  await marketPage.goto(config.origin+'/game/land');const starter=marketPage.locator('[data-land-property="smallholding"]'),buyControl=starter.locator('[data-trade-mode="buy"]');
  await buyControl.getByRole('button',{name:'Select 5 Smallholding',exact:true}).click();assert.equal(await buyControl.locator('input').inputValue(),'5');
  await marketPage.screenshot({path:join(phase44Out,'390-land.png')});
  const marketGold=(await marketState()).gold;
  await Promise.all([marketPage.waitForURL(url=>url.pathname==='/game/land/buy'),marketPage.getByRole('button',{name:'Buy Smallholding',exact:true}).click()]);
  assert.equal((await marketState()).gold,marketGold);assert.equal(await marketPage.locator('[data-trade-confirm]').count(),1);
  await marketPage.screenshot({path:join(phase44Out,'390-land-confirmation.png')});
  await submit(marketPage,marketPage.getByRole('button',{name:'Confirm purchase',exact:true}));await marketPage.getByText('Buy More',{exact:true}).click();
  await marketPage.screenshot({path:join(phase44Out,'390-buy-more.png')});
  const winning=(await db.query("SELECT id FROM battles WHERE attacker_id=$1 AND outcome='attacker_win' ORDER BY created_at DESC LIMIT 1",[hunter.characterId])).rows[0]!.id;
  const victoryUrl=config.origin+'/game/battles/'+winning;
  await hunterPage.goto(victoryUrl);assert.equal(await hunterPage.getByRole('heading',{name:'VICTORY!',exact:true}).count(),1);
  await hunterPage.screenshot({path:join(phase44Out,'390-battle-victory.png')});
  await hunterPage.goto(config.origin+'/game/achievements');assert.ok(await hunterPage.locator('.achievement-row.is-earned').count());await hunterPage.screenshot({path:join(phase44Out,'390-achievements.png')});
  const phase44Widths=[320,360,375,390,393,412,430,1366];
  for(const width of phase44Widths){
    await apprentice.setViewportSize({width,height:844});
    for(const url of [config.origin+'/game/quests',questPromptUrl,levelUpUrl,config.origin+'/game/achievements',config.origin+'/game/land']){
      await apprentice.goto(url);assert.ok(await apprentice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' '+url);
      assert.equal(await apprentice.locator('button').evaluateAll(buttons=>buttons.some(button=>!button.textContent?.trim()&&!button.getAttribute('aria-label'))),false);
      assert.equal(await apprentice.locator('input:not([type="hidden"]),textarea,select').evaluateAll(elements=>elements.some(element=>!element.getAttribute('aria-label')&&!(element as HTMLInputElement).labels?.length)),false);
    }
    await hunterPage.setViewportSize({width,height:844});await hunterPage.goto(victoryUrl);assert.ok(await hunterPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  const quiet=await browser.newContext({ignoreHTTPSErrors:true,reducedMotion:'reduce',viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  await quiet.route('**/*',route=>new URL(route.request().url()).origin===config.origin?route.continue():route.abort());
  await quiet.addCookies([{name:'kr_session',value:apprenticeSession.token,url:config.origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
  const quietPage=await quiet.newPage();await quietPage.goto(levelUpUrl);assert.equal(await quietPage.locator('.is-celebrating').count(),0);await quiet.close();
  await apprentice.goto(config.origin+'/game/home');await submit(apprentice,apprentice.getByRole('button',{name:'Skip guide',exact:true}));
  await apprentice.reload();assert.equal(await apprentice.locator('.tutorial-panel').count(),0);
  await writeFile(join(phase44Out,'summary.json'),JSON.stringify({passed:true,widths:phase44Widths,responsiveVisits:phase44Widths.length*6,reducedMotion:true,celebrationReplay:true,missingEquipmentNativeFlow:true,propertyConfirmation:true,tutorialSkipPersistent:true,liveProviderContacted:false},null,2));
  const legend=await fixture('Fable Keeper',50);await executeCommand(db,legend.accountId,randomUUID(),'recruit',{unitId:'militia',quantity:20});
  for(const itemId of ['eclipse-greatsword','eclipse-citadel-plate','eclipse-invocation'])await executeCommand(db,legend.accountId,randomUUID(),'buy',{itemId,quantity:5});
  await executeCommand(db,legend.accountId,randomUUID(),'land_buy',{propertyId:'eclipse-citadel',quantity:1});
  const elder=(await db.query("SELECT b.character_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=50 AND b.tier='elite'")).rows[0]!;
  const legendPage=await playerPage(legend.token),widths=[320,360,390,412,430,1366];
  for(const width of widths){
    await legendPage.setViewportSize({width,height:width===1366?900:844});
    for(const screen of ['home','home?feed=battles','home?feed=comments','home?feed=broadcasts','profile','profile?tab=skills','profile?tab=comments','profile?tab=battles','players/'+target.characterId,'players/'+target.characterId+'?tab=comments','players/'+target.characterId+'?tab=battles','army','army?tab=army','army?tab=dashboard','settings','land','battle','bounties','vault','players/'+elder.character_id,'bounties/new?target='+elder.character_id,'quests','armory?category=weapon','armory?category=armor','armory?category=spell']){
      await legendPage.goto(config.origin+'/game/'+screen);
      assert.equal(await legendPage.getByRole('alert').count(),0,screen);
      assert.equal(await legendPage.locator('nav[aria-label="Primary navigation"] a').count(),5);
      assert.equal(await legendPage.locator('a[href="/game/land"]').count(),screen.startsWith('home')?1:0,screen+' Home-only Land link');
      if(screen.startsWith('profile')||screen.startsWith('players/'))assert.equal(await legendPage.getByText('Attack power',{exact:true}).count(),0);
      assert.equal(await legendPage.getByRole('link',{name:'Refresh income',exact:true}).count(),0);
      assert.equal(await legendPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,width+' '+screen+' horizontal overflow');
      // Native accessibility contracts: each interactive control has a name,
      // headings and form labels remain visible, and status text is announced.
      assert.equal(await legendPage.locator('button').evaluateAll(buttons=>buttons.some(button=>!button.textContent?.trim()&&!button.getAttribute('aria-label'))),false);
      assert.equal(await legendPage.locator('input:not([type="hidden"]), textarea, select').evaluateAll(elements=>elements.some(element=>!element.getAttribute('aria-label')&&!(element as HTMLInputElement).labels?.length)),false);
      assert.equal(await legendPage.locator('img').evaluateAll(images=>images.some(image=>image instanceof HTMLImageElement&&(!image.complete||image.naturalWidth===0))),false);
      if(['home','quests','army','army?tab=army','armory?category=weapon'].includes(screen))await legendPage.screenshot({path:join(refinementOut,width+'-'+screen.replaceAll('?','-').replaceAll('=','-')+'.png')});
      if(width===390&&screen==='players/'+elder.character_id)await legendPage.screenshot({path:join(screenOut,'390-level50-rival-profile.png'),fullPage:true});
      if(width===390&&screen==='profile')await legendPage.screenshot({path:join(phase4Out,'390-profile.png'),fullPage:true});
      if(screen==='land'){
        assert.equal(await legendPage.locator('[data-land-property]').count(),21);
        const art=await legendPage.locator('.atlas-properties').first().evaluate(element=>getComputedStyle(element).backgroundImage);assert.ok(art.includes('land-simple-0.1'));
        if(width===390){await legendPage.screenshot({path:join(screenOut,'390-land-starter.png')});await legendPage.locator('[data-land-property="eclipse-citadel"]').scrollIntoViewIfNeeded();await legendPage.screenshot({path:join(screenOut,'390-land-legendary.png')});}
      }
      if(width===390&&['profile','battle'].includes(screen))await legendPage.screenshot({path:join(screenOut,'390-'+screen+'.png'),fullPage:screen==='profile'});
    }
  }
  // Public Tales exposes real history while keeping private reports restricted.
  await targetPage.goto(config.origin+'/game/players/'+hunter.characterId+'?tab=battles');
  assert.ok((await targetPage.locator('.tale-row').count())>=1);
  await targetPage.screenshot({path:join(refinementOut,'390-public-tales.png'),fullPage:true});
  // Defeat status uses the normal engine, not a fabricated result fixture.
  const scout=await fixture('Unprepared Scout',50),scoutPage=await playerPage(scout.token);
  const elite=(await db.query("SELECT b.character_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=50 AND b.tier='elite'")).rows[0]!;
  await scoutPage.goto(config.origin+'/game/players/'+elite.character_id);
  await submit(scoutPage,scoutPage.getByRole('button',{name:'Attack',exact:true}));
  assert.equal((await scoutPage.request.get(config.origin+'/api/v1/battles/'+scoutPage.url().split('/').at(-1)).then(r=>r.json())).battle.outcome,'defender_win');
  await scoutPage.goto(config.origin+'/game/home?feed=battles');assert.equal(await scoutPage.locator('.outcome-defeat').count(),1);
  await scoutPage.screenshot({path:join(refinementOut,'390-defeat-activity.png'),fullPage:true});
  // A stale open page settles an actually due holding through the existing
  // server API. Browser time drives only countdown/requests, never its gold.
  await legendPage.goto(config.origin+'/game/land');await legendPage.clock.install();
  const goldBefore=(await legendPage.request.get(config.origin+'/api/v1/me').then(r=>r.json())).state.gold;
  await db.query("UPDATE land_holdings SET acquired_at=acquired_at-interval '1 hour',accrued_through=accrued_through-interval '1 hour' WHERE character_id=$1",[legend.characterId]);
  await db.query("UPDATE income_cycles SET next_payment_at=next_payment_at-interval '1 hour' WHERE character_id=$1",[legend.characterId]);
  const settled=legendPage.waitForResponse(r=>r.url().endsWith('/api/v1/land')&&r.ok());
  await legendPage.clock.fastForward(3601000);const settlement=await (await settled).json();
  await legendPage.waitForFunction(previous=>Number(document.querySelector('[data-wallet-gold]')?.textContent?.replaceAll(',',''))>previous,goldBefore);
  assert.equal(Number((await legendPage.locator('[data-wallet-gold]').innerText()).replaceAll(',','')),settlement.gold);
  assert.equal(await legendPage.getByRole('link',{name:'Refresh income',exact:true}).count(),0);
  await legendPage.clock.resume();
  await legendPage.goto(config.origin+'/game/home');await legendPage.keyboard.press('Tab');
  assert.equal(await legendPage.getByRole('link',{name:'Skip to content',exact:true}).evaluate(element=>element===document.activeElement),true);
  await legendPage.keyboard.press('Enter');assert.equal(await legendPage.locator('#main-content').evaluate(element=>element===document.activeElement),true);
  // The same server-rendered social and invitation forms also work without JS.
  const noScript=await browser.newContext({ignoreHTTPSErrors:true,javaScriptEnabled:false,viewport:{width:390,height:844}});
  await noScript.route('**/*',route=>new URL(route.request().url()).origin===config.origin?route.continue():route.abort());
  await noScript.addCookies([{name:'kr_session',value:target.token,url:config.origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
  const noScriptPage=await noScript.newPage();await noScriptPage.goto(config.origin+'/game/players/'+sponsor.characterId+'?tab=comments');
  await noScriptPage.getByLabel('Leave a profile comment',{exact:true}).fill('A handwritten note without scripts.');
  await submit(noScriptPage,noScriptPage.getByRole('button',{name:'Post Comment',exact:true}));
  assert.match(await noScriptPage.locator('body').innerText(),/handwritten note without scripts/);
  await noScriptPage.screenshot({path:join(phase4Out,'390-comments.png'),fullPage:true});await noScript.close();
  assert.ok(observed.length>=16);
  observed.forEach(request=>{assert.equal(request.browserOrigin,config.origin);assert.equal(request.refererOrigin,config.origin);assert.equal(request.fetchSite,'same-origin');});
  for(const upstream of ['http://localhost:3001','https://localhost:3001',config.origin])assert.ok(observed.some(request=>request.upstreamOrigin===upstream),upstream);
  assert.ok(observed.some(request=>request.path==='/register'&&request.upstreamOrigin==='http://localhost:3001'));assert.deepEqual(errors,[]);
  const out=join(projectRoot,'test-results/codespaces-https');await mkdir(out,{recursive:true});await page.screenshot({path:join(out,'phone-quest-success.png'),fullPage:true});
  const summary={passed:true,fixture:'Real local TLS reverse proxy, Codespaces port 3001 origin rewriting and HTTP backend',live_provider_contacted:false,
    configured_origin:config.origin,origin_source:config.originSource,secure_cookies:config.secureCookies,
    native_browser_registration:true,observed_post_headers:observed,phase44:{all_regions:true,persistent_guide:true,missing_equipment_native_flow:true,land_quantity_presets:true,single_use_confirmation:true,real_quest_level_up:true,achievements:true,celebration_replay:true,reduced_motion:true,viewports:phase44Widths,responsiveVisits:48},
    calling_change:true,escrow_bounty_placement_and_claim:true,private_bounty_report:true,passive_bot_combat:true,
    mobile_widths:widths,simplified_land_art:true,phase43:{quantity_steppers:true,keyboard_free:true,buy_more_equipment_and_land:true,private_persistent_receipts:true,profile_bot_recruitment:true,profile_real_player_recruitment_and_acceptance:true,shared_hourly_payment:true,next_timer_full_hour:true,region_selector:true,home_bounty_removed:true,purchase_receipt_viewports:[320,360,390,412,1366]},phase42:{bot_bounty_native_flow:true,bot_finishing_claim_keeps_reward_cap:true,vault_native_deposit_and_withdraw:true,prominent_profile_actions:true,native_comments:true,safe_text:true,native_reporting:true,native_broadcasts:true,native_code_invitation_and_acceptance:true,native_attack_again_to_zero:true,public_profile_links:true,viewports:widths,screensPerViewport:25,screenshots:'test-results/phase43-browser',home_only_land:true,no_combat_cooldown:true,public_tales:true,active_quest_repeat:true,automatic_income_settlement:true,defeat_indicator:true,accessibility:'Named controls, native form labels, five-tab navigation, overflow and image checks; keyboard skip-link and native comment form with JavaScript disabled also passed'},
    existing_accounts_preserved:true,pre_fix_non_secure_cookie_still_authenticates_over_https:true,secure_http_only_cookie:true,session_rotation_and_logout:true,forged_origin_and_forwarded_headers_rejected:true,invalid_csrf_rejected:true,
    form_actions:['Registration','Quest','Equipment purchase','Land purchase','Land sale','PvP','Sign out','Sign in','Quest after rotated login','Attack skill allocation'],browser_errors:errors.length};
  await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log('PASS: Phase 4.4 tutorial, All Regions filter, missing-equipment purchase then explicit quest, Land quantity presets/confirmation/Buy More, real quest level-up, victory, achievements, replay suppression and reduced motion pass at eight widths (48 new responsive visits), alongside 150 existing responsive visits and five receipt layouts. Registration and gameplay pass through the real Codespaces-shaped HTTPS fixture. Secure cookies, CSRF, strict Origin validation and private reports remain enforced. Screenshots: test-results/phase44-browser/.');
}finally{
  await browser?.close();for(const socket of sockets)socket.destroy();
  if(tunnel)await new Promise<void>(resolve=>tunnel!.close(()=>resolve()));if(proxy)await new Promise<void>(resolve=>proxy!.close(()=>resolve()));
  await app.close();await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(temp,{recursive:true,force:true});
}
