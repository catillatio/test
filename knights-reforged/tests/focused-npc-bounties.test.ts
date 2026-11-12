import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {realm,type Player} from './helpers.js';
import {provisionBots} from '../src/development.js';
import {runNpcSponsorship,npcSponsorshipSelected,lockBountyEscrow,cancelBounty,expireBounties,bountyQuote} from '../src/bounties.js';
import {transaction} from '../src/db.js';
import {ledger} from '../src/economy.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';

test('default-off NPC sponsorship: genuinely funded synthetic list, normal claim/refunds, replay, limits and insufficient purses',{timeout:150000},async()=>{
 const base=Math.floor(Date.parse('2032-02-01T12:00:00Z')/3600000);let windows:number[]=[];
 for(let w=base;w<base+100000;w++){const selected=Array.from({length:24},(_,i)=>w+i).filter(npcSponsorshipSelected);if(selected.length>=5){windows=selected.slice(0,5);break;}}assert.equal(windows.length,5);
 let now=new Date(windows[0]!*3600000);const r=await realm({isolated:true,clock:()=>now,developmentBotsEnabled:true}),out='test-results/focused-followup';await mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000',ENABLE_DEV_BOTS:'1'}),app=await createApp({db:r.db,config});const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
 try{
  assert.equal(config.npcSponsorshipEnabled,false);
  assert.deepEqual(await runNpcSponsorship({query:async()=>{throw Error('Disabled SQL');},connect:async()=>{throw Error('Disabled connect');},end:async()=>{}},false),{status:'disabled'});
  const humans:Player[]=[];for(let i=0;i<5;i++){const p=await r.player(['Aldric Gatekeeper','Mira of the Vale','Edric Northwatch','Rhea Ashborne','Gareth Stonehand'][i]!);await r.prepare(p,10000,30);for(let j=0;j<5;j++)await r.ok(p,'/api/v1/quests/border-patrol/runs');await transaction(r.db,sql=>sql.query('UPDATE characters SET attained_level=20 WHERE id=$1',[p.id]));humans.push(p);}
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});assert.equal((await r.db.query('SELECT count(*)::int n FROM development_bots WHERE active')).rows[0]!.n,450);
  const before=(await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id')).rows;
  assert.equal((await runNpcSponsorship(r.db,true)).status,'placed');const first=(await r.db.query('SELECT b.* FROM bounties b JOIN npc_sponsored_bounties n ON n.bounty_id=b.id')).rows[0]!;
  assert.notEqual(first.target_id,first.sponsor_id);assert.ok(humans.some(p=>p.id===first.target_id));assert.ok(first.amount>=250&&first.amount<=2000);
  assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[first.sponsor_id])).rows[0]!.balance,before.find(v=>v.character_id===first.sponsor_id)!.balance-first.amount-first.fee);
  assert.equal((await r.db.query('SELECT sum(balance)::text total FROM wallets')).rows[0]!.total,String(before.reduce((n,v)=>n+BigInt(v.balance),0n)-BigInt(first.amount+first.fee)));
  assert.equal((await r.db.query('SELECT a.login_disabled FROM accounts a JOIN characters c ON c.account_id=a.id WHERE c.id=$1',[first.sponsor_id])).rows[0]!.login_disabled,true);
  await assert.rejects(()=>bountyQuote(r.db,humans[0]!.id,humans[0]!.id,250,now),(e:unknown)=>(e as {code:string}).code==='SELF_BOUNTY');
  await Promise.all([runNpcSponsorship(r.db,true),runNpcSponsorship(r.db,true)]);assert.equal((await r.db.query('SELECT count(*)::int n FROM npc_sponsored_bounties')).rows[0]!.n,1);
  const hunter=humans.find(p=>p.id!==first.target_id)!;
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();await context.addCookies([{name:'kr_session',value:hunter.cookie.slice('kr_session='.length),url:origin,httpOnly:true,sameSite:'Lax'}]);await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:width===1280?900:844});assert.equal((await page.goto(origin+'/game/bounties'))?.status(),200);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});assert.equal(await page.locator('.npc-sponsorship-label').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.match(await page.locator('.bounty-list').innerText(),/NPC-sponsored/);assert.doesNotMatch(await page.locator('.bounty-target>span').first().innerText(),/Freeblade|Warden|Spellward/);await page.screenshot({path:out+`/npc-bounty-${width}.png`});}
  await context.close();
  now=new Date(windows[1]!*3600000);assert.equal((await runNpcSponsorship(r.db,true)).status,'placed');now=new Date(windows[2]!*3600000);assert.equal((await runNpcSponsorship(r.db,true)).status,'at-limit');
  await transaction(r.db,sql=>sql.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[first.target_id,now]));const key=randomUUID();const claim=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:first.target_id,bountyId:first.id},key);await r.ok(hunter,'/api/v1/battles',{targetCharacterId:first.target_id,bountyId:first.id},key);
  const report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[claim.battleId])).rows[0]!.result;assert.equal(report.bountyClaim.reward,first.amount);assert.equal((await r.db.query("SELECT count(*)::int n FROM bounty_events WHERE bounty_id=$1 AND kind='claimed'",[first.id])).rows[0]!.n,1);
  now=new Date(windows[3]!*3600000);assert.equal((await runNpcSponsorship(r.db,true)).status,'placed');
  const rest=(await r.db.query("SELECT b.* FROM bounties b JOIN npc_sponsored_bounties n ON n.bounty_id=b.id WHERE b.status='active' ORDER BY b.created_at")).rows;assert.equal(rest.length,2);
  const canceled=rest[0]!,cancelBefore=(await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[rest[0]!.sponsor_id])).rows[0]!.balance;await transaction(r.db,async sql=>{await lockBountyEscrow(sql);await sql.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[canceled.sponsor_id]);await cancelBounty(sql,canceled.sponsor_id,canceled.id,randomUUID(),now);});
  assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[canceled.sponsor_id])).rows[0]!.balance,cancelBefore+canceled.amount);
  now=new Date(windows[4]!*3600000);assert.equal((await runNpcSponsorship(r.db,true)).status,'at-limit');assert.equal((await r.db.query('SELECT count(DISTINCT target_id)::int n FROM npc_sponsored_bounties')).rows[0]!.n,3);
  now=new Date(+now+86400000);const expired=rest[1]!,expireBefore=(await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[rest[1]!.sponsor_id])).rows[0]!.balance;await transaction(r.db,sql=>expireBounties(sql,now,null,expired.sponsor_id));await transaction(r.db,sql=>expireBounties(sql,now,null,expired.sponsor_id));
  assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[expired.sponsor_id])).rows[0]!.balance,expireBefore+expired.amount);
  for(const [b,kind] of [[canceled,'canceled'],[expired,'expired']] as const){const events=(await r.db.query('SELECT amount FROM bounty_events WHERE bounty_id=$1 AND kind=$2',[b.id,kind])).rows;assert.equal(events.length,1);assert.equal(events[0]!.amount,b.amount);}
  // Exhaust only the disposable NPC purses through the real ledger. The worker
  // cannot grant, replenish, withdraw Vault funds or place unfunded escrow.
  await transaction(r.db,async sql=>{const bots=(await sql.query('SELECT w.character_id,w.balance FROM wallets w JOIN development_bots d ON d.character_id=w.character_id ORDER BY w.character_id FOR UPDATE OF w')).rows;await ledger(sql,null,'test_fixture',[...bots].map(b=>({characterId:b.character_id,amount:-b.balance})));});
  do{now=new Date((Math.floor(+now/3600000)+1)*3600000);}while(!npcSponsorshipSelected(Math.floor(+now/3600000)));
  assert.equal((await runNpcSponsorship(r.db,true)).status,'no-funded-sponsor');assert.equal((await r.db.query('SELECT count(*)::int n FROM npc_sponsored_bounties')).rows[0]!.n,3);
  await writeFile(out+'/npc-bounty-evidence.json',JSON.stringify({source:'Disposable PostgreSQL only; no live activation',population:450,defaultOff:true,disabledNoSql:true,syntheticFirstContract:{amount:first.amount,fee:first.fee},fundedWalletDebitExact:true,firstPlacementConserved:true,renderedList:[320,390,1280],claim:report.bountyClaim.reward,claimRetryOnce:true,cancellationAndExpiryPrincipalEventsOnce:true,activeCap:2,rolling24hCap:3,targetCooldown:true,sameWindowReplay:true,insufficientFundsRejected:true,policyUnchanged:true},null,2)+'\n');
 }finally{await browser.close();await app.close();await r.close();}
});
