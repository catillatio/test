// Static interface/asset checks using the production EJS engine.
// Runtime SQL, transactions and browser behavior are tested by separate scripts.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import ejs from 'ejs';
import {attributes,navigationLinks} from './html-contracts.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),read=path=>readFileSync(join(root,path),'utf8');
const json=path=>JSON.parse(read(path));
const rules=json('rulesets/recreation-0.1/rules.json'),landRules=json('rulesets/land-provisional-0.1/rules.json'),alpha=json('rulesets/alpha-0.2/rules.json');
const contractSource=stripTypeScriptTypes(read('src/http-contracts.ts'),{mode:'transform'});
const {navigation,templateScreens,commandRoutes}=await import('data:text/javascript;base64,'+Buffer.from(contractSource).toString('base64'));
const results=[];
function check(name,run){try{run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}}
function files(dir){return readdirSync(join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]);}
check('All production EJS templates compile with the installed EJS engine',()=>{
  for(const path of files('views'))if(path.endsWith('.ejs'))ejs.compile(read(path),{filename:join(root,path)});
  for(const screen of templateScreens)assert.ok(existsSync(join(root,'views',screen+'.ejs')));
});
check('Local imports resolve and external dependencies are declared',()=>{
  const pkg=json('package.json');
  for(const file of [...files('src'),...files('scripts'),...files('tests')].filter(path=>path.endsWith('.ts'))){
    for(const match of read(file).matchAll(/\b(?:from\s+|import\s*)['"]([^'"]+)['"]/g)){
      const specifier=match[1];if(specifier.startsWith('node:'))continue;
      if(specifier.startsWith('.'))assert.ok(existsSync(resolve(root,dirname(file),specifier.replace(/\.js$/,'.ts'))),file+': '+specifier);
      else{const name=specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0];assert.ok(pkg.dependencies?.[name]||pkg.devDependencies?.[name],file+': '+name);}
    }
  }
});
check('All browser scripts parse as JavaScript',()=>{
  for(const file of files('public').filter(path=>path.endsWith('.js'))){
    const result=spawnSync(process.execPath,['--check',join(root,file)],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  }
});
for(const [manifest,count] of [['public/art/provenance.json',11],['public/art/land-provenance.json',2],['public/art/kingdoms-live/provenance.json',16],['public/art/alpha/provenance.json',18]]){
  check('Artwork integrity: '+manifest,()=>{
    const art=json(manifest);assert.equal(art.assets.length,count);
    for(const item of art.assets)assert.equal(createHash('sha256').update(readFileSync(join(root,dirname(manifest),item.asset))).digest('hex'),item.sha256,item.asset);
  });
}
check('Fantasy illustration sheets and all catalog cell assignments are intact',()=>{
  const manifest=json('public/art/fantasy-0.2/provenance.json');assert.equal(manifest.assets.length,4);
  const cells=new Set();
  for(const asset of manifest.assets){
    const bytes=readFileSync(join(root,'public/art/fantasy-0.2',asset.asset));assert.equal(bytes.length,asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    const bounds=manifest.observed_row_bounds[asset.atlas];assert.equal(bounds.length,asset.rows+1);assert.equal(bounds[0],0);assert.equal(bounds.at(-1),asset.height);
    for(let i=1;i<bounds.length;i++)assert.ok(bounds[i]>bounds[i-1]);
  }
  for(const entry of [...alpha.items,...alpha.properties]){
    const art=entry.illustration,atlas=manifest.assets.find(a=>a.atlas===art.atlas);assert.ok(atlas);
    assert.ok(art.column>=0&&art.column<atlas.columns&&art.row>=0&&art.row<atlas.rows);
    const key=art.atlas+':'+art.column+':'+art.row;assert.ok(!cells.has(key));cells.add(key);
  }
  assert.equal(cells.size,81);
});
check('CSS uses local assets; original tab gradients and safe areas remain',()=>{
  for(const file of ['public/styles.css','public/kingdoms-live.css','public/alpha.css','public/refinements.css']){
    for(const match of read(file).matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)){
      assert.ok(!/^(?:https?:|\/\/)/.test(match[1]));assert.ok(existsSync(resolve(root,dirname(file),match[1])),match[1]);
    }
  }
  const css=read('public/kingdoms-live.css');
  for(const literal of ['--tab-content-height: 50px','repeat(5, minmax(0, 1fr))','safe-area-inset-bottom','linear-gradient(to top, #000000, #404040)','linear-gradient(to top, #404040e1, #7f7f7fe1)','linear-gradient(to top, #647f00e1, #64b400e1)'])assert.ok(css.includes(literal),literal);
});
const playerId='11111111-1111-4111-8111-111111111111',targetId='22222222-2222-4222-8222-222222222222',battleId=randomUUID(),holdingId=randomUUID();
const now='2026-10-17T12:00:00.000Z',next='2026-10-17T13:00:00.000Z';
const inventory=alpha.items.slice(0,3).map(item=>({...item,inventoryId:randomUUID(),quantity:2}));
const properties=alpha.properties.map((p,i)=>({...p,basePrice:p.price,owned:i===0?1:0,remaining:99,maxPurchase:25,maxAffordable:1,priceSteps:[p.price],unlocked:true}));
const land={rulesetId:alpha.id,provisional:true,paymentIntervalSeconds:3600,hourlyIncome:8,hourlyUpkeep:1,equipmentUpkeep:0,totalUpkeep:1,netHourlyIncome:7,nextPaymentAt:next,pendingGold:'0',properties,
 holdings:[{id:holdingId,propertyId:'smallholding',name:'Smallholding',quantity:1,hourlyIncome:8,hourlyUpkeep:1,nextPaymentAt:next,rulesetId:landRules.id}]};
const state={id:playerId,name:'Arthur of the Vale',xp:60,level:4,levelXp:0,levelRequirement:45,xpToNext:45,health:85,maxHealth:110,mana:16,maxMana:21,spirit:2,maxSpirit:3,energy:16,gold:150,units:2,
 attack:20,defense:18,equipped:true,inventoryId:inventory[0].inventoryId,inventory,questsCompleted:10,stateVersion:4,skillPoints:3,className:'Warden',attackReadyAt:now,serverTime:now,
 energyNextAt:next,manaNextAt:next,spiritNextAt:next,healthNextAt:next,land,rulesetId:alpha.id,
 maintenance:{hourlyRate:0,reserveGold:'0',arrearsGold:'0',paused:false,resumeCost:0},
 economy:{grossHourlyIncome:8,propertyUpkeep:1,equipmentUpkeep:0,scheduledEquipmentUpkeep:0,otherUpkeep:0,totalUpkeep:1,netHourlyIncome:7,maintenancePaused:false},battleStats:{wins:2,losses:1,total:3},
 army:{capacity:9,participants:4,total:4,allies:1,mercenaries:2,links:[{characterId:targetId,name:'Morgan',level:3,className:'Freeblade',status:'pending',incoming:true}]},
 attackEquipment:{attack:6,defense:2,selected:[]},defenseEquipment:{attack:6,defense:2,selected:[]},
 quests:alpha.quests.map(q=>({...q,completions:1,missing:{},missingCost:0,ready:true,lockReason:null})),loot:[{id:'watchtower-map',name:'Watchtower Map'}],awards:[{id:'quests-10',points:1}]};
const legacyBattle={id:battleId,attackerId:playerId,defenderId:targetId,attackerName:'Arthur',defenderName:'Morgan',winnerName:'Arthur',winnerId:playerId,loot:3,attackPower:20,defensePower:10,attackRoll:2,defenseRoll:1,attackerDamage:3,defenderDamage:12,attackerHealthAfter:82,defenderHealthAfter:88,attackerXp:5,createdAt:now};
const newBattle={...legacyBattle,rulesetId:alpha.id,attackPower:2000,defensePower:1000,attackerArmy:4,defenderArmy:2,attackerMaxHealth:110,defenderMaxHealth:100,spiritSpent:1,rewarded:true,attackEquipment:[],defenseEquipment:[]};
const opponent={id:targetId,name:'Morgan',level:3,units:2,armySize:3,className:'Freeblade',health:100,maxHealth:100};
const fixture=(screen,extra={})=>({screen,state,nav:navigation,rules,landRules,alpha,csrf:'a'.repeat(64),accountName:'arthur',commandId:randomUUID,notice:null,error:null,actionResult:null,
 opponents:[opponent],nextOpponentCursor:null,battles:[],battle:newBattle,title:navigation.find(n=>n.id===screen)?.label??'The Realm',authMode:'login',formValues:{username:'',name:''},category:'weapon',questArea:'all',...extra});
const emptyLand={...land,hourlyIncome:0,hourlyUpkeep:0,totalUpkeep:0,netHourlyIncome:0,nextPaymentAt:null,holdings:[],properties:properties.map(p=>({...p,owned:0}))};
const cases=[
 ...navigation.map(n=>({name:n.id,data:fixture(n.id)})),{name:'profile',data:fixture('profile')},
 {name:'armory-armor',data:fixture('armory',{category:'armor'})},{name:'armory-spells',data:fixture('armory',{category:'spell'})},
 {name:'armory-paused',data:fixture('armory',{state:{...state,maintenance:{hourlyRate:3,reserveGold:'0',arrearsGold:'3',paused:true,resumeCost:6}}})},
 {name:'quests-missing',data:fixture('quests',{state:{...state,quests:state.quests.map(q=>({...q,missing:{'squires-blade':1},missingCost:5,ready:false,lockReason:'Equipment required'}))}})},
 {name:'quests-result',data:fixture('quests',{actionResult:{kind:'quest',data:{questId:'border-patrol',questName:'Patrol',gold:8,xp:4,mana:2,levelGained:1,loot:'Watchtower Map',milestones:['quests-10']}}})},
 {name:'land-empty',data:fixture('land',{state:{...state,land:emptyLand}})},
 {name:'land-no-gold',data:fixture('land',{state:{...state,gold:0,land:{...land,properties:properties.map(p=>({...p,maxAffordable:0}))}}})},
 {name:'land-locked',data:fixture('land',{state:{...state,level:1}})},
 {name:'land-limit',data:fixture('land',{state:{...state,land:{...land,properties:properties.map(p=>({...p,owned:100,remaining:0,maxPurchase:0,maxAffordable:0}))}}})},
 {name:'land-retained',data:fixture('land',{state:{...state,land:{...land,pendingGold:'99999900000000000'}}})},
 {name:'battle-empty',data:fixture('battle',{opponents:[]})},{name:'battle-recovering',data:fixture('battle',{state:{...state,health:0,spirit:0}})},
 {name:'home-history',data:fixture('home',{battles:[{id:battleId,result:newBattle,created_at:now}]})},
 {name:'report-alpha',data:fixture('report')},{name:'report-previous-alpha',data:fixture('report',{battle:{...newBattle,rulesetId:'alpha-0.1'}})},{name:'report-legacy',data:fixture('report',{battle:legacyBattle})},
 ...['auth','rules','error'].flatMap(screen=>[{name:screen+'-public',data:fixture(screen,{state:null})},...(screen==='auth'?[{name:'register',data:fixture('auth',{state:null,authMode:'register'})}]:[{name:screen+'-signed-in',data:fixture(screen)}])]),
 {name:'escaped-name',data:fixture('home',{state:{...state,name:'<img src=x onerror=1>'}})},
 {name:'large-resources',data:fixture('home',{state:{...state,name:'MMMMMMMMMMMMMMMMMMMMMMMMMMMM',gold:2147483647,xp:2147483647,level:42949673}})},
];
const rendered=new Map();
for(const example of cases)check('Production EJS render: '+example.name,()=>{
 const html=ejs.render(read('views/layout.ejs'),example.data,{filename:join(root,'views/layout.ejs')});
 assert.ok(html.startsWith('<!doctype html>')&&!html.includes('<%'));assert.ok(!html.includes('<img src=x'));
 rendered.set(example.name,html);
});
const routeRegex=route=>new RegExp('^'+route.split('/').map(s=>s.startsWith(':')?'[^/]+':s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'$');
const gets=['/','/login','/register','/rules','/game/profile',...navigation.map(n=>'/game/'+n.id),'/game/battles/:id'].map(routeRegex);
const posts=['/login','/register','/logout',...commandRoutes.map(r=>r.html)].map(routeRegex),covered=new Set();
check('Rendered links, asset references, unique IDs, labels, CSRF and command contracts',()=>{
 for(const [name,html] of rendered){
  const ids=[...html.matchAll(/\bid="([^"]*)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,name+': duplicate ID');
  for(const match of html.matchAll(/<(?:a|link|img|script)\b([^>]+)>/g)){
   const attrs=attributes(match[1]),value=attrs.href??attrs.src;if(!value)continue;
   if(value.startsWith('#')){assert.ok(ids.includes(value.slice(1)),name+': missing fragment');continue;}
   const url=new URL(value,'http://check.invalid');assert.equal(url.origin,'http://check.invalid');
   if(url.pathname.startsWith('/assets/'))assert.ok(existsSync(join(root,'public',url.pathname.slice(8))),value);
   else assert.ok(gets.some(p=>p.test(url.pathname)),name+': missing GET '+url.pathname);
  }
  for(const match of html.matchAll(/<label\b([^>]+)>/g))assert.ok(ids.includes(attributes(match[1]).for),name+': label without target');
  for(const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)){
   const attrs=attributes(match[1]);assert.equal(attrs.method,'post');assert.ok(posts.some(p=>p.test(attrs.action)),attrs.action);
   assert.match(match[2],/name="csrf" value="[a-f0-9]{64}"/);
   if(attrs.action.startsWith('/game/')){
    assert.match(match[2],/name="commandId" value="[a-f0-9-]{36}"/);
    assert.ok(!/name="(?:gold|price|damage|reward|xp|actorId)"/.test(match[2]),'Client supplied result field');
    for(const route of commandRoutes)if(routeRegex(route.html).test(attrs.action))covered.add(route.kind);
   }
  }
 }
 // Manual equip became automatic; its existing route is retained and exercised
 // by integration tests. Every other command has an HTML form in these fixtures.
 assert.deepEqual([...covered].sort(),commandRoutes.filter(r=>r.kind!=='equip').map(r=>r.kind).sort());
});
check('Original five tabs, selected artwork, secondary Land and profile Home selection',()=>{
 const expected=[['/game/home','Home'],['/game/quests','Quests'],['/game/battle','Battle'],['/game/armory','Armory'],['/game/army','Recruit']];
 const icons={home:'home',quests:'missions',battle:'attack',armory:'equipment',army:'recruit'};
 for(const example of cases){
  const links=navigationLinks(rendered.get(example.name),'Primary navigation');assert.deepEqual(links.map(l=>[l.href,l.label]),example.data.state?expected:[]);
  if(!example.data.state)continue;
  const selected=example.data.screen==='report'?'battle':example.data.screen==='profile'?'home':example.data.screen;
  for(const link of links){const id=link.href.split('/').pop();assert.equal(link.current,id===selected);assert.equal(link.image,'/assets/art/kingdoms-live/'+icons[id]+(id===selected?'_selected':'')+'.png');}
  assert.ok(navigationLinks(rendered.get(example.name),'Secondary navigation').some(l=>l.href==='/game/land'));
 }
});
check('Legacy HTML command routes are preserved through the alpha expansion',()=>{
 const baseline=json('tests/fixtures/land-form-contracts.json');
 for(const forms of Object.values(baseline.fixtures))for(const form of forms)assert.ok(posts.some(p=>p.test(form.action)),form.action);
});
check('Upgraded pages bypass cached pre-expansion income clients',()=>{
  for(const example of cases){
    const html=rendered.get(example.name);assert.ok(html.includes('/assets/refinements.css?v='+alpha.id));
    if(example.data.state)assert.ok(html.includes('/assets/realm.js?v='+alpha.id));
    if(example.data.screen==='land')assert.ok(html.includes('/assets/land.js?v='+alpha.id));
  }
});
check('Land retains countdown, offline payment, sale, retained-gold and no-script hooks',()=>{
 for(const example of cases.filter(e=>e.data.screen==='land')){
  const html=rendered.get(example.name);
  for(const hook of ['data-land-countdown','data-land-status','data-land-payment-time','data-land-gross','data-land-upkeep','data-equipment-upkeep','data-land-net','data-land-pending','data-land-pending-gold','data-land-owned','data-land-buy-hint','data-wallet-gold','data-land-sell','<noscript>','/assets/land.js'])assert.ok(html.includes(hook),example.name+': '+hook);
 }
});
mkdirSync(join(root,'test-results'),{recursive:true});
const report={scope:'Production EJS fixture rendering, local references, form contracts, original navigation and artwork hashes.',fixtureCount:cases.length,
 passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
writeFileSync(join(root,'test-results/static-checks.json'),JSON.stringify(report,null,2)+'\n');
for(const r of results)console.log((r.passed?'PASS ':'FAIL ')+r.name+(r.error?': '+r.error:''));
console.log(report.passed+' passed; '+report.failed+' failed; '+cases.length+' production EJS fixture cases.');
if(report.failed)process.exitCode=1;
