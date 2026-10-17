// Run against an already running disposable development realm and local Chromium.
// Requests are confined to APP_ORIGIN. Creates normal players, never demo accounts.
import { chromium,type BrowserContext,type Page,type Locator } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig,projectRoot } from '../src/config.js';
import { type CharacterState } from '../src/game.js';

const config=loadConfig(),origin=new URL(config.origin);
if(config.nodeEnv==='production'||!['localhost','127.0.0.1','[::1]',process.env.ALLOWED_BROWSER_TEST_HOST].includes(origin.hostname)) throw new Error('Use a designated non-production test realm.');
const out=join(projectRoot,'test-results/browser');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',headless:true,args:process.env.CHROMIUM_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const prefix='b_'+randomUUID().replaceAll('-','').slice(0,10),errors:string[]=[];
async function register(context:BrowserContext,suffix:string){
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin.origin?route.continue():route.abort());
  const page=await context.newPage(),name='Knight '+prefix.slice(2)+' '+suffix;
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(config.origin+'/register');
  await page.getByLabel('Account name',{exact:true}).fill(prefix+suffix);
  await page.getByLabel('Warrior name',{exact:true}).fill(name);
  await page.getByLabel('Password',{exact:true}).fill(randomUUID()+'!aA1');
  await Promise.all([page.waitForURL('**/game/home'),page.getByRole('button',{name:'Create your warrior'}).click()]);
  return {page,name};
}
async function state(page:Page):Promise<CharacterState>{
  const response=await page.request.get(config.origin+'/api/v1/me');assert.equal(response.status(),200);return (await response.json()).state;
}
async function action(page:Page,button:Locator){
  const before=page.url();await Promise.all([page.waitForURL(url=>url.href!==before&&(url.searchParams.has('command')||/\/game\/battles\/[a-f0-9-]+$/.test(url.pathname))),button.click()]);
  assert.equal(await page.getByRole('alert').count(),0,await page.locator('body').innerText());
}
async function screens(page:Page,label:string){
  const labels=['Home','Quests','Battle','Armory','Recruit'];
  const primary=()=>page.getByRole('navigation',{name:'Primary navigation'});
  assert.deepEqual((await primary().getByRole('link').allTextContents()).map(text=>text.trim()),labels);
  for(const screen of [...labels,'Land']){
    await page.getByRole('navigation',{name:screen==='Land'?'Secondary navigation':'Primary navigation'}).getByRole('link',{name:screen,exact:true}).click();
    await page.getByRole('heading',{name:screen,exact:true}).waitFor();await page.waitForLoadState('load');
    assert.equal(await primary().getByRole('link').count(),5);
    assert.equal(await primary().locator('[aria-current="page"]').count(),screen==='Land'?0:1);
    assert.equal(await primary().getByRole('link').first().evaluate(element=>element.getBoundingClientRect().height),50);
    const background=screen==='Quests'?'missions':screen==='Battle'?'attack':screen==='Armory'?'equipment':'default';
    assert.ok((await page.locator('.page-backdrop').evaluate(element=>getComputedStyle(element).backgroundImage)).includes('bg_'+background+'.jpg'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': horizontal overflow on '+screen);
    assert.equal(await page.locator('img').evaluateAll(images=>images.filter(img=>img instanceof HTMLImageElement&&(!img.complete||img.naturalWidth===0)).length),0);
    await page.screenshot({path:join(out,label+'-'+screen.toLowerCase()+'.png'),fullPage:true});
  }
  await page.goto(config.origin+'/game/profile');
  await page.getByRole('heading',{name:'Spend skill points'}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:join(out,label+'-profile.png'),fullPage:true});
}
try{
  const desktop=await browser.newContext({viewport:{width:1366,height:900}});
  const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const {page:a,name:attackerName}=await register(desktop,'a'),{page:b,name:defenderName}=await register(phone,'b');
  await screens(a,'desktop');await screens(b,'phone');
  await b.setViewportSize({width:360,height:800});await screens(b,'phone-360');
  await b.setViewportSize({width:390,height:844});

  // Both players progress through real form submissions with no fixture grants.
  await a.goto(config.origin+'/game/quests');
  await action(a,a.getByRole('button',{name:'Do quest Patrol the border',exact:true}));
  for(let i=0;i<2;i++)await action(a,a.getByRole('button',{name:'Do Again',exact:true}));
  assert.equal((await state(a)).level,2);
  await a.goto(config.origin+'/game/profile');
  await action(a,a.getByRole('button',{name:'Increase Mana',exact:true}));assert.equal((await state(a)).maxMana,21);
  await a.goto(config.origin+'/game/quests');
  const road=a.locator('[data-quest="clear-old-road"]');
  await action(a,road.getByRole('button',{name:/Buy requirements/}));
  await action(a,road.getByRole('button',{name:/Do quest/}));
  await action(a,a.getByRole('button',{name:'Do Again',exact:true}));
  assert.equal((await state(a)).level,3);
  const ruins=a.locator('[data-quest="search-ruins"]');
  await action(a,ruins.getByRole('button',{name:/Buy requirements/}));
  await action(a,ruins.getByRole('button',{name:/Do quest/}));
  assert.equal((await state(a)).loot[0]?.id,'watchtower-map');

  await a.goto(config.origin+'/game/army');await a.getByLabel('Number of recruits').fill('2');
  await action(a,a.getByRole('button',{name:'Recruit militia',exact:true}));
  const defender=await state(b);
  await a.getByLabel('Their army code').fill(defender.id);
  await action(a,a.getByRole('button',{name:'Invite ally',exact:true}));
  await b.goto(config.origin+'/game/army');await action(b,b.getByRole('button',{name:'Accept '+attackerName,exact:true}));
  assert.equal((await state(a)).army.allies,1);assert.equal((await state(b)).army.allies,1);

  await a.goto(config.origin+'/game/armory?category=spell');
  await a.getByLabel('Buy quantity for Ember Word',{exact:true}).fill('2');
  await action(a,a.getByRole('button',{name:'Buy Ember Word',exact:true}));
  assert.equal(new URL(a.url()).searchParams.get('category'),'spell');
  assert.equal((await state(a)).inventory.find(item=>item.id==='ember-word')?.quantity,2);
  await action(a,a.getByRole('button',{name:'Sell Ember Word',exact:true}));
  assert.equal((await state(a)).inventory.find(item=>item.id==='ember-word')?.quantity,1);

  await b.goto(config.origin+'/game/land');
  await action(b,b.getByRole('button',{name:'Buy Smallholding',exact:true}));
  await b.waitForFunction(()=>/^\d{2}:\d{2}:\d{2}$/.test(document.querySelector('[data-land-countdown]')?.textContent??''));
  const countdown=await b.locator('[data-land-countdown]').textContent();await b.waitForTimeout(1100);
  assert.notEqual(await b.locator('[data-land-countdown]').textContent(),countdown);
  await action(b,b.getByRole('button',{name:'Sell Smallholding',exact:true}));
  assert.equal((await state(b)).land.holdings.length,0);
  await b.goto(config.origin+'/game/quests');await action(b,b.getByRole('button',{name:'Do quest Patrol the border',exact:true}));
  await b.goto(config.origin+'/game/land');await action(b,b.getByRole('button',{name:'Buy Smallholding',exact:true}));

  await a.goto(config.origin+'/game/battle');
  await action(a,a.getByRole('button',{name:'Attack '+defenderName,exact:true}));
  const reportId=a.url().split('/').pop()!;
  const reportA=await a.request.get(config.origin+'/api/v1/battles/'+reportId),reportB=await b.request.get(config.origin+'/api/v1/battles/'+reportId);
  assert.equal(reportA.status(),200);assert.equal(reportB.status(),200);assert.deepEqual(await reportA.json(),await reportB.json());
  await b.goto(config.origin+'/game/battles/'+reportId);
  await a.screenshot({path:join(out,'desktop-battle-report.png'),fullPage:true});
  await b.screenshot({path:join(out,'phone-battle-report.png'),fullPage:true});
  for(const [page,label] of [[a,'desktop-progress'],[b,'phone-progress']] as const){
    await screens(page,label);
  }
  // No-JavaScript forms still work; a timer is an enhancement, never authority.
  const plain=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const {page:c}=await register(plain,'c');await c.goto(config.origin+'/game/quests');
  await action(c,c.getByRole('button',{name:'Do quest Patrol the border',exact:true}));assert.equal((await state(c)).questsCompleted,1);
  assert.deepEqual(errors,[]);
  const summary={passed:true,origin:origin.origin,viewports:['1366x900','390x844','360x800'],screensPerPass:7,passes:5,
    checks:['Five original tabs and backgrounds','No horizontal overflow or missing images','Quest repeat, gates and loot','Level and Mana skill allocation','Army recruitment and accepted player ally','Quantity spell Buy/Sell and category preservation','Property Buy/Sell and live countdown','Two-player private persistent report','JavaScript-disabled quest forms'],limitations:['Headless Chromium viewports, not physical Android/WebView','Offline hours and concurrency verified separately in PostgreSQL tests']};
  await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log('PASS: full form-driven multiplayer alpha on desktop, 390 px and 360 px phone viewports; no browser errors. Screenshots and summary: test-results/browser/');
}finally{await browser.close();}
