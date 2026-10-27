// Real localhost pages, paid fixture contracts and ordinary authenticated attacks.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,type Page,type Locator} from 'playwright-core';
import type {Player} from '../tests/helpers.js';
const before=process.argv.includes('--before'),evidence=process.argv.includes('--evidence'),stage=before?'before':'after';
const baseline=process.env.RIVALS_BASELINE_ROOT,source=before?baseline!:process.cwd();
if(!process.env.TEST_DATABASE_URL||!source)throw Error('Use a disposable database and an explicit baseline for before evidence.');
const {realm}=await import(pathToFileURL(resolve(source,'tests/helpers.ts')).href) as typeof import('../tests/helpers.js');
const {createApp}=await import(pathToFileURL(resolve(source,'src/app.ts')).href) as typeof import('../src/app.js');
const {loadConfig}=await import(pathToFileURL(resolve(source,'src/config.ts')).href) as typeof import('../src/config.js');
const approvedHash='cb1aaed28643f55b16852695016c7afebf07c7d542e296fcd685d43c5c2c96ed';
assert.equal(createHash('sha256').update(await readFile(resolve(source,'views/bounties.ejs'))).digest('hex'),approvedHash,'approved Bounty List template is unchanged');
const out=process.env.RIVALS_BROWSER_OUT??'test-results/rivals-shared/'+stage;await mkdir(out,{recursive:true});
const now=new Date('2038-05-05T12:00:00Z'),r=await realm({isolated:true,clock:()=>now});
const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'}),app=await createApp({db:r.db,config}),origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;
let reference:typeof app|null=null,referenceOrigin:string|null=null;
if(!before&&baseline){
 const {createApp:make}=await import(pathToFileURL(resolve(baseline,'src/app.ts')).href) as typeof import('../src/app.js');
 const {loadConfig:configure}=await import(pathToFileURL(resolve(baseline,'src/config.ts')).href) as typeof import('../src/config.js');
 const settings=configure({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'});reference=await make({db:r.db,config:settings});referenceOrigin=await reference.listen({host:'127.0.0.1',port:0});settings.origin=referenceOrigin;
}
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox']}),errors:string[]=[],views:unknown[]=[],pixelChecks:unknown[]=[];
const rowSelector=before?'.rival-row':'.bounty-row--rival';
async function style(row:Locator){return row.evaluate(el=>{
 const target=el.querySelector('.bounty-target')!,name=target.querySelector('h3')!,link=name.querySelector('a')!,button=el.querySelector('button')!,rect=el.getBoundingClientRect(),b=button.getBoundingClientRect();
 const nodes=[el,name,link,target.querySelector('span')!,button,el],keys=[['padding-top','padding-bottom','row-gap','column-gap'],['font-size','line-height','font-family','font-weight'],['color'],['font-size','line-height','font-family','color'],['padding-top','padding-right','font-size','line-height','font-family','border-radius','background-image','filter','opacity'],['border-bottom-width','border-bottom-style','border-bottom-color']],styles:Record<string,string>[]=[];
 for(let i=0;i<nodes.length;i++){const entry:Record<string,string>={};for(const key of keys[i]!)entry[key]=getComputedStyle(nodes[i]!).getPropertyValue(key);styles.push(entry);}
 return {height:rect.height,padding:styles[0],name:styles[1],link:styles[2],level:styles[3],button:{width:b.width,height:b.height,...styles[4]},divider:styles[5],last:el.matches(':last-child')};
 });}
try{
 async function player(name:string,level=50,className='Freeblade',qualified=false){const p=await r.player(name);if(qualified){await r.prepare(p,200000,30);for(let i=0;i<5;i++)await r.ok(p,'/api/v1/quests/border-patrol/runs');}
  await r.db.query('UPDATE characters SET attained_level=$2,profile_class=$3 WHERE id=$1',[p.id,level,className]);await r.ok(p,'/api/v1/tutorial',{action:'skip'});return p;}
 const actor=await player('Rival Review',50,'Freeblade',true),sponsor=await player('Contract Patron',50,'Freeblade',true);
 await r.db.query('UPDATE characters SET max_spirit=20,spirit=20 WHERE id=$1',[actor.id]);
 const targets:Player[]=[];for(const [name,className,amount] of [['Odel Violetwatch','Warden',10000],['Ser Marek Moonward','Spellward',10000],['Elowen of the Silverwood','Freeblade',1000],['Ashen Guard','Warden',500]] as const){const p=await player(name,50,className,true);targets.push(p);await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:p.id,amount});}
 await r.db.query('UPDATE characters SET health=0,health_updated_at=$2 WHERE id=$1',[targets[3]!.id,now]);
 for(let i=1;i<=23;i++)await player('Marchwatch Warrior '+String(i).padStart(2,'0'),50,['Freeblade','Warden','Spellward'][i%3]);
 const distant=await player('Distant Sovereign',100),novice=await player('Distant Novice',5),unavailable=await player('Unavailable Account');
 await r.db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[unavailable.accountId]);
 const rotation=randomUUID(),start='/game/battle?rotation='+rotation;
 const snapshot=async()=>JSON.stringify((await r.db.query(`SELECT (SELECT jsonb_agg(to_jsonb(w) ORDER BY character_id) FROM wallets w) wallets,
  (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM bounties b) bounties,(SELECT count(*) FROM economy_entries) entries,
  (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM battles b) battles,(SELECT count(*) FROM command_receipts) receipts,
  (SELECT count(*) FROM bounty_events) events,(SELECT count(*) FROM bounty_kills) kills`)).rows[0]);
 const saved=await snapshot();
 const api=async(cursor?:string)=>{const response=await r.app.inject({url:'/api/v1/opponents?'+new URLSearchParams(cursor?{after:cursor}:{rotation}),headers:{cookie:actor.cookie}});assert.equal(response.statusCode,200,response.body);return response.json() as {opponents:{id:string;name:string;level:number;className:string;health:number}[];nextCursor:string|null};};
 const first=await api(),second=await api(first.nextCursor!);assert.equal(first.opponents.length,20);assert.equal(second.opponents.length,8);assert.equal(second.nextCursor,null);
 const all=[...first.opponents,...second.opponents];assert.equal(new Set(all.map(p=>p.id)).size,28);for(const id of[actor.id,distant.id,novice.id,unavailable.id])assert.ok(!all.some(p=>p.id===id));
 for(const [width,height,dpr,scale] of [[320,900,1,1],[390,844,2,1],[430,932,3,1],[1280,960,1,1],[390,844,2,1.25]]){
  const context=await browser.newContext({viewport:{width:width!,height:height!},deviceScaleFactor:dpr!});const [name,...value]=actor.cookie.split('=');await context.addCookies([{name:name!,value:value.join('='),url:origin}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const prepare=async(path:string)=>{assert.equal((await page.goto(origin+path))?.status(),200,path);await page.evaluate(async n=>{await document.fonts.ready;document.documentElement.style.fontSize=16*n+'px';},scale!);assert.equal(await page.locator('.primary-nav a').count(),5);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));};
  await prepare('/game/bounties');const bountyMetrics=new Map<string,Awaited<ReturnType<typeof style>>>();
  for(const target of targets){const row=page.locator('.bounty-list .bounty-row').filter({has:page.locator('input[name=targetCharacterId][value="'+target.id+'"]')});bountyMetrics.set(target.id,await style(row));}
  const panel=await page.locator('.bounty-list').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopColor,radius:s.borderRadius,shadow:s.boxShadow,padding:s.padding};});
  let compared=0;const ids:string[]=[];for(const [path,expected] of [[start,first.opponents],['/game/battle?after='+encodeURIComponent(first.nextCursor!),second.opponents]] as const){
   await prepare(path);const rows=page.locator('#rival-list '+rowSelector);assert.equal(await rows.count(),expected.length);
   for(let i=0;i<expected.length;i++){const opponent=expected[i]!,row=rows.nth(i);assert.equal(await row.locator('input[name=targetCharacterId]').inputValue(),opponent.id);ids.push(opponent.id);
    const button=row.getByRole('button',{name:'Attack '+opponent.name,exact:true});assert.equal(await button.isDisabled(),opponent.health===0);assert.equal(await row.locator('input[name=bountyId]').count(),0);
    if(!before){
     assert.equal((await row.innerText()).replace(/\s+/g,' ').trim(),opponent.name+' Level '+opponent.level+' '+opponent.className+' Attack');assert.equal(await row.locator('.bounty-amount,small,strong,time,.bot-label,.bounty-shortcut').count(),0);
     const metric=await style(row),standard=bountyMetrics.get(opponent.id)??[...bountyMetrics.values()][0]!;assert.deepEqual(metric.padding,standard.padding);assert.deepEqual(metric.name,standard.name);assert.deepEqual(metric.link,standard.link);assert.deepEqual(metric.level,standard.level);assert.deepEqual(metric.button,standard.button);assert.ok(metric.button.height>=44&&metric.button.width>=44);
     if(!metric.last)assert.deepEqual(metric.divider,[...bountyMetrics.values()].find(m=>!m.last)!.divider);else assert.equal(metric.divider!['border-bottom-width'],'0px');
     const counterpart=bountyMetrics.get(opponent.id);if(counterpart){assert.ok(Math.abs(counterpart.height-metric.height)<=1.1,JSON.stringify({width,name:opponent.name,bounty:counterpart.height,rival:metric.height}));compared++;}
     if(opponent.health===0){assert.ok(await button.getAttribute('title'));assert.equal(await button.getAttribute('data-attack-ready'),'false');}
    }
   }
   if(path===start&&evidence&&scale===1&&[320,1280].includes(width!)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/'+width+'-rivals.png',animations:'disabled'});}
   views.push({width,height,dpr,scale,path:typeof path==='string'&&path.includes('after=')?'page-2':'page-1',rows:expected.length});
  }
  assert.equal(new Set(ids).size,28);if(!before)assert.equal(compared,4,'all four shared characters retain the approved row height');
  if(!before){const currentPanel=await page.locator('#rival-list').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopColor,radius:s.borderRadius,shadow:s.boxShadow,padding:s.padding};});assert.deepEqual(currentPanel,panel);}
  await prepare(start);const more=page.getByRole('link',{name:'More rivals',exact:true});assert.equal(await more.getAttribute('href'),'/game/battle?after='+encodeURIComponent(first.nextCursor!));await more.click();await page.waitForURL('**/game/battle?after=*');assert.equal(await page.locator('#rival-list '+rowSelector).count(),8);
  await page.getByRole('link',{name:'Refresh rivals ›',exact:true}).click();assert.ok(new URL(page.url()).searchParams.has('rotation'));assert.equal(new URL(page.url()).hash,'#rival-list');
  await page.locator('.category-tabs').getByRole('link',{name:/Bounty List/}).click();assert.equal(new URL(page.url()).pathname,'/game/bounties');assert.equal(await page.locator('.bounty-amount').count(),4);
  await page.locator('.category-tabs').getByRole('link',{name:'Attack Rivals',exact:true}).click();assert.equal(new URL(page.url()).pathname,'/game/battle');
  if(!before)assert.equal(await page.locator('#rival-list .bounty-amount').count(),0);
  await context.close();
  if(referenceOrigin){
   const c=await browser.newContext({viewport:{width:width!,height:height!},deviceScaleFactor:dpr!,javaScriptEnabled:false});await c.addCookies([{name:name!,value:value.join('='),url:origin}]);const p=await c.newPage(),images:Buffer[]=[];
   for(const base of[referenceOrigin,origin]){await p.goto(base+'/game/bounties');await p.evaluate(async n=>{await document.fonts.ready;document.documentElement.style.fontSize=16*n+'px';},scale!);images.push(await p.locator('.bounty-list').screenshot({animations:'disabled'}));}
   assert.ok(images[0]!.equals(images[1]!),JSON.stringify({width,scale,bountyPixelsChanged:true}));pixelChecks.push({width,scale,identical:true,sha256:createHash('sha256').update(images[0]!).digest('hex')});await c.close();
  }
 }
 assert.equal(await snapshot(),saved,'navigation and visual comparisons preserve financial and combat records');assert.deepEqual(errors,[]);
 // Native controls, ordinary-target authorization, exhaustion and idempotency.
 const native=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),[cookieName,...cookieValue]=actor.cookie.split('=');await native.addCookies([{name:cookieName!,value:cookieValue.join('='),url:origin}]);const page=await native.newPage();
 const chosen=first.opponents.find(p=>p.health>0&&!targets.some(t=>t.id===p.id))!;
 await r.db.query('UPDATE characters SET spirit=0,spirit_updated_at=$2 WHERE id=$1',[actor.id,now]);await page.goto(origin+start);
 let row=page.locator('#rival-list '+rowSelector).filter({has:page.locator('input[name=targetCharacterId][value="'+chosen.id+'"]')});let button=row.getByRole('button');assert.equal(await button.isDisabled(),true);assert.equal(await button.getAttribute('data-attack-ready'),'true');if(!before)assert.ok(await button.getAttribute('title'));
 await r.db.query('UPDATE characters SET spirit=20,health=19,health_updated_at=$2 WHERE id=$1',[actor.id,now]);await page.reload();assert.equal(await button.isDisabled(),true);
 await r.db.query('UPDATE characters SET health=max_health WHERE id=$1',[actor.id]);const resource=(await r.me(actor)).spirit;
 for(const [target,code] of [[distant,'RIVAL_LEVEL_RANGE'],[novice,'RIVAL_LEVEL_RANGE'],[targets[3]!,'OPPONENT_DEFEATED']] as const){const denied=await r.command(actor,'/api/v1/battles',{targetCharacterId:target.id});assert.equal(denied.json().error.code,code);assert.equal((await r.me(actor)).spirit,resource);}
 await page.goto(origin+start);row=page.locator('#rival-list '+rowSelector).filter({has:page.locator('input[name=targetCharacterId][value="'+chosen.id+'"]')});
 await row.getByRole('link',{name:chosen.name,exact:true}).click();assert.equal(new URL(page.url()).pathname,'/game/players/'+chosen.id);await page.goBack();
 const key=await row.locator('input[name=commandId]').inputValue() as ReturnType<typeof randomUUID>;await row.getByRole('button',{name:'Attack '+chosen.name,exact:true}).click();await page.waitForURL('**/game/battles/*');
 const battleId=new URL(page.url()).pathname.split('/').at(-1)!,battle=(await r.db.query('SELECT result FROM battles WHERE id=$1',[battleId])).rows[0]!.result;
 assert.equal(battle.defenderId,chosen.id);assert.equal(battle.bountyHuntId,undefined);assert.equal(battle.spiritSpent,1);assert.equal((await r.me(actor)).spirit,resource-1);
 assert.equal((await r.ok(actor,'/api/v1/battles',{targetCharacterId:chosen.id},key)).battleId,battleId);assert.equal((await r.me(actor)).spirit,resource-1);
 const empty=await player('Empty Range',1),[emptyName,...emptyValue]=empty.cookie.split('=');await native.clearCookies();await native.addCookies([{name:emptyName!,value:emptyValue.join('='),url:origin}]);await page.goto(origin+'/game/battle');assert.equal(await page.locator('#rival-list '+rowSelector).count(),0);assert.equal(await page.getByRole('link',{name:'Return to quests',exact:true}).count(),1);await native.close();
 await writeFile(out+'/verification.json',JSON.stringify({passed:true,stage,baseline:'502354b1ba11728a92b74e74b1aaeb1c600bda5e',productionContacted:false,views,pixelChecks,approvedBountyTemplateSha256:approvedHash,financialViewsPreserved:true,paginationUnique:28,refreshAndTabsPassed:true,profileAndOrdinaryAttackPassed:true,disabledAndRangeChecksPassed:true,idempotencyPassed:true,errors},null,2)+'\n');
 console.log('RIVALS_SHARED: PASS '+views.length+' responsive list pages; '+pixelChecks.length+' unchanged Bounty pixel comparisons; native selection/attack, pagination, restrictions and replay.');
}finally{await browser.close();if(reference)await reference.close();await app.close();await r.close();}
