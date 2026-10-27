// Real localhost HTTP/EJS + disposable PostgreSQL. A separate pinned checkout
// supplies the before renderer; no DOM replacement or production data is used.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {historicalPlacements} from '../tests/bounty-history-fixture.js';
import type {Player} from '../tests/helpers.js';
const before=process.argv.includes('--before'),evidence=process.argv.includes('--evidence'),stage=before?'before':'after';
const source=process.env.BOUNTY_BASELINE_ROOT??process.cwd();
const {realm}=await import(pathToFileURL(resolve(source,'tests/helpers.ts')).href) as typeof import('../tests/helpers.js');
const {createApp}=await import(pathToFileURL(resolve(source,'src/app.ts')).href) as typeof import('../src/app.js');
const {loadConfig}=await import(pathToFileURL(resolve(source,'src/config.ts')).href) as typeof import('../src/config.js');
if(!process.env.TEST_DATABASE_URL)throw Error('Disposable test database required.');
const out=process.env.BOUNTY_BROWSER_OUT??'test-results/historical-bounties/'+stage;await mkdir(out,{recursive:true});
const now=new Date('2038-05-02T12:00:00Z'),r=await realm({isolated:true,clock:()=>now});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox']}),errors:string[]=[],views:unknown[]=[];
try{
 async function player(name:string,level:number){const p=await r.player(name);await r.prepare(p,25000,30);for(let n=0;n<5;n++)await r.ok(p,'/api/v1/quests/border-patrol/runs');await r.db.query('UPDATE characters SET attained_level=$2 WHERE id=$1',[p.id,level]);await r.ok(p,'/api/v1/tutorial',{action:'skip'});return p;}
 const sponsor=await player('Contract Patron',5),target=await player('Marked Warden',100),hunter=await player('Contract Hunter',100),other=await player('Other Patron',5),blocked=await player('Repeated Mark',100);
 await historicalPlacements(r.db,[sponsor.id],target.id,24,now,{claimant:hunter.id,missingPlacedEvents:true});
 await historicalPlacements(r.db,[other.id],target.id,24,now,{claimant:hunter.id});
 const blockedHistory=await historicalPlacements(r.db,[sponsor.id],blocked.id,25,now,{claimant:hunter.id});
 const nextPairSlot=new Date(Math.min(...blockedHistory.map(row=>+new Date(row.created)))+86400000).toISOString();
 // A separate live contract exercises the board and real finishing report.
 const activeTarget=await player('Open Contract',100),finishedTarget=await player('Finished Contract',100);
 await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:activeTarget.id,amount:100});
 const finished=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:finishedTarget.id,amount:100});
 await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[finishedTarget.id,now]);
 const hit=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:finishedTarget.id,bountyId:finished.data.bountyId});
 const snapshot=async()=>JSON.stringify((await r.db.query(`SELECT (SELECT jsonb_agg(to_jsonb(w) ORDER BY character_id) FROM wallets w) wallets,
  (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM bounties b) contracts,(SELECT count(*) FROM economy_entries) entries,
  (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM battles b) battles,(SELECT count(*) FROM command_receipts) receipts,
  (SELECT count(*) FROM bounty_events) events,(SELECT count(*) FROM bounty_kills) kills`)).rows[0]);
 const saved=await snapshot();
 for(const [width,height,dpr,textScale] of [[320,900,1,1],[390,844,2,1],[430,932,3,1],[1280,960,1,1],[390,844,2,1.25]]){
  const context=await browser.newContext({viewport:{width:width!,height:height!},deviceScaleFactor:dpr!});
  async function session(p:Player){await context.clearCookies();const [name,...value]=p.cookie.split('=');await context.addCookies([{name:name!,value:value.join('='),url:origin}]);}
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const [name,path,selector,actor] of [
   ['profile','/game/players/'+target.id,'.profile-actions',sponsor],
   ['placement','/game/bounties/new?target='+target.id,'.bounty-new',sponsor],
   ['confirmation','/game/bounties/new?target='+target.id,'.bounty-confirm',sponsor],
   ['blocked','/game/bounties/new?target='+blocked.id,'.bounty-new',sponsor],
   ['board','/game/bounties','.bounty-list',hunter],
   ['report','/game/battles/'+hit.battleId,'.battle-report',hunter],
   ['help','/rules','.rules-page',sponsor],
  ] as const){
   await session(actor);assert.equal((await page.goto(origin+path))?.status(),200,name);
   if(name==='confirmation'){await page.locator('#bounty-amount').fill('101');await page.locator('.bounty-new button[type="submit"]').click();await page.locator('.bounty-confirm').waitFor();assert.match(await page.locator('.bounty-confirm').innerText(),/112 gold/);}
   await page.evaluate(async scale=>{await document.fonts.ready;document.documentElement.style.fontSize=(16*scale)+'px';},textScale!);
   const scope=page.locator(name==='report'?'.battle-report, .battle-result, main':selector).first();await scope.scrollIntoViewIfNeeded();
   assert.equal(await page.locator('.primary-nav a').count(),5);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1,JSON.stringify({width,name,overflow}));
   if(!before&&['profile','placement','confirmation'].includes(name)){assert.match(await page.locator('[data-bounty-quotas]').first().innerText(),/1 \/ 25 remaining/);assert.match(await page.locator('[data-bounty-quotas]').first().innerText(),/202 \/ 250 remaining/);}
   if(!before&&name==='blocked'){assert.match(await scope.innerText(),/25 bounties on this target/);assert.equal(await page.locator('#bounty-amount').isDisabled(),true);assert.equal(await page.locator('[data-bounty-quotas] time').first().getAttribute('datetime'),nextPairSlot);}
   if(name==='board'){assert.equal(await page.locator('input[name="bountyId"]').count(),1);assert.match(await scope.innerText(),/Open Contract/);}
   if(name==='report')assert.match(await page.locator('main').innerText(),/Bounty claimed/);
   if(evidence&&textScale===1&&[320,1280].includes(width!))await page.screenshot({path:out+'/'+width+'-'+name+'.png',animations:'disabled'});
   views.push({name,width,height,dpr,textScale,overflow});
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.equal(await snapshot(),saved,'views and quotes never charge or change historical outcomes');
 await writeFile(out+'/verification.json',JSON.stringify({passed:true,stage,baseline:before?'7802b0ab1c606f35402d5ab15f91408127968c19':null,productionContacted:false,views,errors,financialRowsPreserved:true},null,2)+'\n');
 console.log('HISTORICAL_BOUNTIES_BROWSER: PASS '+views.length+' real HTTP views; '+stage);
}finally{await browser.close();await app.close();await r.close();}
