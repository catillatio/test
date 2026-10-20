// Disposable local fixture only: actual battle receipts, not visual mock data.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {realm,testDatabaseUrl} from '../tests/helpers.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {provisionBots} from '../src/development.js';
import {alpha,levelRequirement,areRivals} from '../src/alpha-rules.js';
import {getState} from '../src/game.js';
if(!testDatabaseUrl)throw new Error('A disposable local *_test database is required.');
const r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>new Date('2049-04-01T00:00:00Z')});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000',ENABLE_DEV_BOTS:'1'}),app=await createApp({db:r.db,config});
const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
const out='docs/phase49/screenshots',checks:string[]=[],errors:string[]=[];await mkdir(out,{recursive:true});
try{
 await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});const a=await r.player('Reward Review Challenger');
 await r.prepare(a,250000,Array.from({length:16},(_,i)=>levelRequirement(i+1)).reduce((s,x)=>s+x,0));await r.legacyArmy(a,3);
 for(const category of['weapon','armor','spell']){const item=alpha.items.filter(i=>i.category===category&&i.level<=17).sort((a,b)=>b.attack-a.attack||b.defense-a.defense)[0]!;await r.ok(a,'/api/v1/inventory/purchases',{itemId:item.id,quantity:4});}
 await r.db.query('UPDATE characters SET spirit=100,max_spirit=100,health=1000,max_health=1000 WHERE id=$1',[a.id]);
 const state=await r.me(a),bots=(await r.db.query('SELECT c.id,c.account_id FROM characters c JOIN development_bots b ON b.character_id=c.id WHERE c.attained_level BETWEEN 14 AND 20 ORDER BY c.id')).rows;
 let matched:string|undefined,weak:string|undefined;for(const b of bots){const s=await getState(r.db,b.account_id),ratio=s.defense/state.attack;if(s.level===17&&ratio>=.35&&ratio<.8)matched=b.id;if(areRivals(state.level,s.level)&&ratio<.35)weak=b.id;}
 assert.ok(matched&&weak);await r.ok(a,'/api/v1/battles',{targetCharacterId:matched});
 const repeated=await r.ok(a,'/api/v1/battles',{targetCharacterId:matched}),easy=await r.ok(a,'/api/v1/battles',{targetCharacterId:weak});
 await r.db.query('UPDATE wallets SET balance=0 WHERE character_id=$1',[matched]);const empty=await r.ok(a,'/api/v1/battles',{targetCharacterId:matched});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addCookies([{name:'kr_session',value:a.cookie.split('=')[1]!,url:origin,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const width of[320,390,430])for(const [name,result,expected] of[['repeat',repeated,'Reduced rewards from repeated battles with this rival.'],['weak',easy,'Less experience against a much weaker opponent.'],['empty',empty,'This rival had too little unprotected gold to steal.']] as const){
  await page.setViewportSize({width,height:844});const response=await page.goto(origin+'/game/battles/'+result.battleId);assert.equal(response?.status(),200);await page.getByText(expected,{exact:true}).last().waitFor();
  const notes=await page.locator('[data-reward-note]').allTextContents();assert.ok(notes.includes(expected));if(name==='weak')assert.ok(!notes.some(n=>n.includes('repeated battles')));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('.primary-nav a').count(),5);
  await page.locator('[data-reward-note]').last().scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+width+'-'+name+'.png'});
  checks.push(width+' '+name+': actual receipt, accurate explanation, no horizontal overflow, five tabs');
 }
 assert.deepEqual(errors,[]);await context.close();await mkdir('test-results',{recursive:true});await writeFile('test-results/phase49-browser.json',JSON.stringify({passed:true,checks,errors,viewports:[320,390,430],productionContacted:false},null,2)+'\n');console.log('PASS '+checks.length+' mobile receipt views.');
}finally{await browser.close();await app.close();await r.close();}
