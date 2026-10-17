// Qualified late-game fixtures live only in a designated disposable *_test DB.
// Browser purchases, sales, skills, quests, PvP and logout use real HTML forms.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {chromium,type Page,type Locator} from 'playwright-core';
import {createDatabase,transaction} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {createApp} from '../src/app.js';
import {loadConfig,projectRoot} from '../src/config.js';
import {registerAccount,createSession} from '../src/auth.js';
import {lockCharacters,clock,type CharacterState} from '../src/game.js';
import {grantExperience} from '../src/progression.js';
import {ledger} from '../src/economy.js';
import {executeCommand} from '../src/commands.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {testDatabaseUrl} from '../tests/helpers.js';

if(!testDatabaseUrl)throw new Error('Use a designated disposable TEST_DATABASE_URL ending in _test.');
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
const port=(socket.address() as {port:number}).port;await new Promise<void>(resolve=>socket.close(()=>resolve()));
const origin='http://127.0.0.1:'+port,db=createDatabase(testDatabaseUrl);await migrate(db);
const app=await createApp({db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:origin,PORT:String(port),DATABASE_URL:testDatabaseUrl})});
const out=join(projectRoot,'test-results/fantasy-browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',headless:true,args:process.env.CHROMIUM_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const errors:string[]=[],failedAssets:string[]=[];
try{
  await app.listen({host:'127.0.0.1',port});
  async function qualified(level:number){
    const suffix=randomUUID().replaceAll('-','').slice(0,10);
    const account=await registerAccount(db,{username:'fantasy_'+suffix,name:'Knight '+suffix,password:randomUUID()+'!aA1'});
    await transaction(db,async sql=>{
      await lockCharacters(sql,[account.characterId]);await ledger(sql,null,'test_fixture',[{characterId:account.characterId,amount:2000000}],alpha.id);
      await grantExperience(sql,account.characterId,Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((n,xp)=>n+xp,0),await clock(sql));
    });
    await executeCommand(db,account.accountId,randomUUID(),'recruit',{unitId:'militia',quantity:20});
    return {...account,...await createSession(db,account.accountId)};
  }
  const knight=await qualified(50),rival=await qualified(49);
  for(const itemId of ['astral-conductor','sovereigns-bastion','seraphs-rebuke'])await executeCommand(db,rival.accountId,randomUUID(),'buy',{itemId,quantity:4});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addCookies([{name:'kr_session',value:knight.token,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400&&response.url().includes('/assets/'))failedAssets.push(response.url());});
  const state=async():Promise<CharacterState>=>{const response=await page.request.get(origin+'/api/v1/me');assert.equal(response.status(),200);return (await response.json()).state;};
  const act=async(button:Locator)=>{const before=page.url();await Promise.all([page.waitForURL(url=>url.href!==before),button.click()]);assert.equal(await page.getByRole('alert').count(),0,await page.locator('body').innerText());};
  async function layout(label:string){
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': horizontal overflow');
    assert.equal(await page.locator('nav[aria-label="Primary navigation"] a').count(),5);
    const art=await page.locator('[data-art-atlas]').evaluateAll(async elements=>{
      const cells=elements.map(element=>{const css=getComputedStyle(element);return {source:css.backgroundImage,position:css.backgroundPosition};});
      const sources=[...new Set(cells.map(cell=>/^url\("?([^\")]+)"?\)$/.exec(cell.source)?.[1]))];
      const loaded=await Promise.all(sources.map(src=>new Promise<boolean>(resolve=>{if(!src)return resolve(false);const image=new Image();image.onload=()=>resolve(image.naturalWidth>0);image.onerror=()=>resolve(false);image.src=src;})));
      return {distinct:new Set(cells.map(cell=>cell.source+cell.position)).size,count:cells.length,loaded:loaded.every(Boolean)};
    });
    assert.equal(art.loaded,true,label+': background images loaded');assert.equal(art.distinct,art.count,label+': distinct artwork cells');
  }
  for(const [width,height] of [[330,740],[360,800],[390,844],[1366,900]]){
    await page.setViewportSize({width:width!,height:height!});
    for(const category of ['weapon','armor','spell']){
      await page.goto(origin+'/game/armory?category='+category);await layout(width+' '+category);
      assert.equal(await page.locator('[data-item]').count(),20);
      await page.screenshot({path:join(out,width+'-'+category+'-early.png')});
      await page.locator('[data-item]').last().scrollIntoViewIfNeeded();
      await page.screenshot({path:join(out,width+'-'+category+'-late.png')});
    }
    await page.goto(origin+'/game/land');await layout(width+' land');assert.equal(await page.locator('[data-land-property]').count(),21);
    await page.screenshot({path:join(out,width+'-land-early.png')});
    await page.locator('[data-land-property="eclipse-citadel"]').scrollIntoViewIfNeeded();await page.screenshot({path:join(out,width+'-land-late.png')});
    await page.goto(origin+'/game/profile');await layout(width+' profile');assert.equal(await page.getByRole('button',{name:'Sign out',exact:true}).count(),1);
    await page.screenshot({path:join(out,width+'-profile.png'),fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  for(const item of alpha.items.filter(item=>['eclipse-greatsword','eclipse-citadel-plate','eclipse-invocation'].includes(item.id))){
    await page.goto(origin+'/game/armory?category='+item.category);
    await page.getByLabel('Buy quantity for '+item.name,{exact:true}).fill('3');await act(page.getByRole('button',{name:'Buy '+item.name,exact:true}));
    assert.equal((await state()).inventory.find(entry=>entry.id===item.id)?.quantity,3);
  }
  await page.goto(origin+'/game/armory?category=weapon');await act(page.getByRole('button',{name:'Sell Eclipse Greatsword',exact:true}));
  assert.equal((await state()).inventory.find(entry=>entry.id==='eclipse-greatsword')?.quantity,2);
  await page.goto(origin+'/game/land');await act(page.getByRole('button',{name:'Buy Eclipse Citadel',exact:true}));
  let current=await state();assert.equal(current.economy.grossHourlyIncome,3100);assert.equal(current.economy.propertyUpkeep,500);assert.equal(current.economy.equipmentUpkeep,480);assert.equal(current.economy.netHourlyIncome,2120);
  assert.equal((await page.locator('[data-hourly-net]').textContent())?.trim(),'+2,120 gold/hr');
  assert.equal(await page.getByRole('button',{name:'Buy Worldroot Bastion',exact:true}).isDisabled(),true);
  await act(page.getByRole('button',{name:'Sell Eclipse Citadel',exact:true}));assert.equal((await state()).economy.grossHourlyIncome,0);
  await act(page.getByRole('button',{name:'Buy Eclipse Citadel',exact:true}));
  await page.goto(origin+'/game/profile');for(let i=0;i<10;i++)await act(page.getByRole('button',{name:'Increase Mana',exact:true}));assert.equal((await state()).maxMana,30);
  await page.goto(origin+'/game/quests?area=eclipse-crown');
  const discovery=page.locator('[data-quest="hold-last-meridian"]');await act(discovery.getByRole('button',{name:/Buy requirements/}));
  await act(discovery.getByRole('button',{name:'Do quest Hold the Last Meridian',exact:true}));
  const finale=page.locator('[data-quest="defy-eclipsed-sovereign"]');await act(finale.getByRole('button',{name:'Do quest Defy the Eclipsed Sovereign',exact:true}));
  current=await state();assert.equal(current.questsCompleted,2);assert.ok(current.loot.some(loot=>loot.id==='eclipse-key'));
  await page.screenshot({path:join(out,'390-finale-success.png')});
  await page.goto(origin+'/game/battle');
  const rivalName=(await db.query('SELECT name FROM characters WHERE id=$1',[rival.characterId])).rows[0]!.name;
  for(let i=0;i<100&&!(await page.getByRole('button',{name:'Attack '+rivalName,exact:true}).count());i++)await page.getByRole('link',{name:'More rivals',exact:true}).click();
  await act(page.getByRole('button',{name:'Attack '+rivalName,exact:true}));const reportId=page.url().split('/').at(-1)!;
  const opponentReport=await app.inject({method:'GET',url:'/api/v1/battles/'+reportId,headers:{cookie:'kr_session='+rival.token}});assert.equal(opponentReport.statusCode,200);
  assert.equal(opponentReport.json().battle.rulesetId,alpha.id);await page.screenshot({path:join(out,'390-fantasy-battle-report.png'),fullPage:true});
  // Also verify the maximum persisted wallet remains readable at phone widths.
  await transaction(db,async sql=>{await lockCharacters(sql,[knight.characterId]);const gold=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[knight.characterId])).rows[0]!.balance;await ledger(sql,null,'test_fixture',[{characterId:knight.characterId,amount:2147483647-gold}],alpha.id);});
  await page.setViewportSize({width:330,height:740});await page.goto(origin+'/game/profile');await layout('330 max-wallet');
  assert.equal((await page.locator('.resource-upper [data-wallet-gold]').textContent())?.trim(),'2,147,483,647');
  const gap=await page.locator('.resource-upper').evaluate(element=>{const cells=[...element.children].map(child=>child.getBoundingClientRect());return cells[1]!.left-cells[0]!.right;});assert.ok(gap>=0);
  const headerFits=await page.locator('.resource-upper').evaluate(element=>{
    const xp=element.querySelector('.xp-resource')!.getBoundingClientRect();
    return ['[data-wallet-gold]','[data-hourly-net]'].every(selector=>element.querySelector(selector)!.getBoundingClientRect().right<=xp.left+2);
  });assert.equal(headerFits,true,'maximum wallet and hourly flow must not cover the XP bar');
  await Promise.all([page.waitForURL(origin+'/login'),page.getByRole('button',{name:'Sign out',exact:true}).click()]);assert.equal((await page.request.get(origin+'/api/v1/me')).status(),401);
  assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
  await writeFile(join(out,'summary.json'),JSON.stringify({passed:true,viewports:['330x740','360x800','390x844','1366x900'],ruleset:alpha.id,
    fixture:'Qualified late-game players in disposable PostgreSQL; early-game no-grant playthrough verified separately',
    checks:['All 81 unique painted cells load','No horizontal overflow','Original five tabs','Three-category quantity purchases and resale','Level-50 property Buy/Sell and net header','Level-55 gate','Profile skills and logout','Discovery-gated level-50 finale','Two-player fantasy battle and private report','Maximum wallet at 330px'],browserErrors:errors.length,
    limitations:['Headless Chromium phone viewports; not a physical Android device','Loopback HTTP; real TLS reverse proxy covered by test:codespaces']},null,2)+'\n');
  console.log('PASS: fantasy catalog and late-game form-driven loop at 330, 360, 390 and 1366 px. Screenshots: test-results/fantasy-browser/');
}finally{await browser.close();await app.close();await db.end();}
