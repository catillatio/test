// Real saved commands and authenticated local pages; never contact production.
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {chromium,type Page} from 'playwright-core';import {competitionFixture,prepareRareQuest,withQuestDraw,syntheticRecovery} from '../tests/phase6-fixtures.js';
import {testDatabaseUrl} from '../tests/helpers.js';import {createApp} from '../src/app.js';import {loadConfig} from '../src/config.js';import {transaction} from '../src/db.js';
import {syntheticCutover} from '../tests/level100-e2b-fixture.js';import {definitionDigest} from '../src/expansion-content.js';import {inspectRarity,setRarityAuthorization} from '../src/rarity-activation.js';
if(!testDatabaseUrl)throw Error('Use a designated disposable *_test fixture.');
const verify=process.argv.includes('--verify-only'),out=verify?'test-results/phase47-browser/phase6':'docs/phase6/screenshots';await mkdir(out,{recursive:true});
const r=await competitionFixture(),config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox']});const errors:string[]=[],views:{width:number;name:string}[]=[];
async function context(cookie:string,javaScriptEnabled=true){const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',javaScriptEnabled});await c.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await c.addCookies([{name:'kr_session',value:cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);return c;}
function monitor(page:Page){page.on('pageerror',e=>errors.push(e.message));page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).pathname.startsWith('/assets/'))errors.push('Missing local asset');});}
async function visit(page:Page,path:string){assert.equal((await page.goto(origin+path))?.status(),200,path);await page.waitForLoadState('networkidle');await page.evaluate(async()=>{await document.fonts.ready;});}
async function capture(page:Page,width:number,name:string,selector?:string){if(selector)await page.locator(selector).first().evaluate(e=>e.scrollIntoView({block:'start'}));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow at '+width);assert.equal(await page.locator('.primary-nav a').count(),5);assert.ok((await page.locator('.primary-nav a').evaluateAll(es=>es.map(e=>e.getBoundingClientRect()))).every(b=>b.height>=44&&b.width>=44));assert.ok(await page.locator('img').evaluateAll(es=>es.every(e=>e instanceof HTMLImageElement&&e.complete&&e.naturalWidth>0)));if(!verify)await page.screenshot({path:out+'/'+width+'-'+name+'.jpg',type:'jpeg',quality:80,animations:'disabled'});views.push({width,name});}
try{
 const patron=await r.player('Rivalry Patron'),target=await r.player('Éowyn of Moonfen'),hunter=await r.player('Marshal of the Crown',100);
 for(const p of[patron,target,hunter])await r.ok(p,'/api/v1/tutorial',{action:'skip'});
 await r.legacyArmy(hunter,20);await r.ok(hunter,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});
 await syntheticCutover(r.db,false);
 const bounty=await r.ok(patron,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000});
 const native=await context(hunter.cookie,false),page=await native.newPage();monitor(page);await visit(page,'/game/bounties');const hunt=page.locator('form').filter({has:page.locator('input[name=bountyId][value="'+bounty.data.bountyId+'"]')}).first();assert.equal(await hunt.getByRole('button').isEnabled(),true);
 await Promise.all([page.waitForURL(/\/game\/battles\//),hunt.getByRole('button').click()]);const firstReport=new URL(page.url()).pathname;
 assert.equal(await page.locator('input[name=bountyId]').inputValue(),bounty.data.bountyId);assert.equal(await page.getByRole('button',{name:'Attack Again',exact:true}).isEnabled(),true);
 // Runtime polling retains the exact contract, rather than silently falling
 // back to ordinary range-bound PvP on a cross-level follow-up.
 const polling=await context(hunter.cookie),live=await polling.newPage();monitor(live);const checked=live.waitForResponse(x=>x.url().includes('/combat?bountyId=')&&x.status()===200);await live.goto(origin+firstReport);await checked;assert.equal(await live.getByRole('button',{name:'Attack Again',exact:true}).isEnabled(),true);await polling.close();
 await transaction(r.db,sql=>sql.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]));
 await Promise.all([page.waitForURL(url=>url.pathname.startsWith('/game/battles/')&&url.pathname!==firstReport),page.getByRole('button',{name:'Attack Again',exact:true}).click()]);const finalReport=new URL(page.url()).pathname;assert.match(await page.locator('.bounty-reward').innerText(),/1,000 bounty gold/);assert.equal(await page.locator('input[name=bountyId]').count(),0,'ended contract cannot authorize another hunt');
 const recovery={...syntheticRecovery(),expiresAt:new Date(+r.now()+7200000).toISOString()},plan={...await inspectRarity(r.db,recovery),enabled:true,rateReviewed:true,equipmentReviewed:true};await setRarityAuthorization(r.db,plan,definitionDigest(plan));
 const quest=await prepareRareQuest(r,hunter),key=randomUUID();await withQuestDraw(0,()=>r.ok(hunter,'/api/v1/quests/'+quest.id+'/runs',{},key));
 for(const width of[320,390,430,1024]){
  await page.setViewportSize({width,height:width===1024?900:844});
  await visit(page,'/game/champions?category=kills');assert.equal(await page.locator('.champion-tabs a').count(),7);assert.match(await page.locator('.champion-list').innerText(),/Marshal of the Crown/);await capture(page,width,'champions');
  await visit(page,'/game/players/'+target.id);assert.equal(await page.locator('.competitive-record').count(),0);assert.equal(await page.locator('[data-profile-stats]').count(),1);assert.ok(!(await page.locator('body').innerHTML()).includes(target.accountId));await capture(page,width,'rival-profile','[data-profile-stats]');
  await visit(page,'/game/bounties');assert.match(await page.locator('main').innerText(),/successful bounty claim/);await capture(page,width,'bounty-history');
  await visit(page,finalReport);await capture(page,width,'bounty-report','.battle-result');
  await visit(page,'/game/quests?command='+key);assert.equal(await page.getByRole('status',{name:'Rare quest equipment discovered'}).count(),1);assert.match(await page.locator('.rare-discovery').innerText(),/King Hudson.*Sword/);await capture(page,width,'rare-discovery','.rare-discovery');
 }
 await native.close();
 // Visible contract history acknowledges its own placed/claimed events. A
 // significant finishing claim does not also count its incoming battle twice.
 const before=(await r.app.inject({url:'/api/v1/notifications',headers:{cookie:target.cookie}})).json();assert.equal(before.home,3,'one ordinary incoming attack plus placement and final claim');
 const nativeVictim=await context(target.cookie,false),nativeBoard=await nativeVictim.newPage();monitor(nativeBoard);await visit(nativeBoard,'/game/bounties');await Promise.all([nativeBoard.waitForNavigation(),nativeBoard.getByRole('button',{name:'Mark shown events read',exact:true}).click()]);assert.equal(new URL(nativeBoard.url()).pathname,'/game/bounties');assert.equal((await r.app.inject({url:'/api/v1/notifications',headers:{cookie:target.cookie}})).json().home,1);await nativeVictim.close();
 const victim=await context(target.cookie),victimPage=await victim.newPage();monitor(victimPage); await visit(victimPage,firstReport);await victimPage.locator('.battle-outcome-heading').scrollIntoViewIfNeeded();await victimPage.waitForFunction(async()=>{const data=await(await fetch('/api/v1/notifications')).json();return data.home===0;});await victimPage.reload();assert.equal(await victimPage.locator('[data-notification-badge=home]').isVisible(),false);
 await visit(victimPage,'/game/champions?category=kills');await victimPage.locator('.champion-tabs a').first().focus();await Promise.all([victimPage.waitForURL(/category=victories/),victimPage.keyboard.press('Enter')]);await victim.close();
 assert.deepEqual(errors,[]);const evidence={passed:true,productionContacted:false,views,errors,actualCrossLevelHTMLHunts:true,exactContractPolling:true,actualSavedRareQuest:true,visibleAcknowledgementsPersistent:true,noDuplicateFinishingBadge:true,keyboardReducedMotionAnd44pxNavigation:true};await writeFile(verify?'test-results/phase6-browser.json':'docs/phase6/browser.json',JSON.stringify(evidence,null,2)+'\n');console.log('PASS Phase 6: '+views.length+' responsive views; genuine hunts, saved quest discovery, private profiles and persistent acknowledgements.');
}finally{await browser.close();await app.close();await r.close();}
