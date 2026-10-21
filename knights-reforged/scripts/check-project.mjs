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
const rules=json('rulesets/recreation-0.1/rules.json'),landRules=json('rulesets/land-provisional-0.1/rules.json'),alpha=json('rulesets/alpha-0.3/rules.json');
const contractSource=stripTypeScriptTypes(read('src/http-contracts.ts'),{mode:'transform'});
const {navigation,templateScreens,commandRoutes}=await import('data:text/javascript;base64,'+Buffer.from(contractSource).toString('base64'));
const {callingName,callingDescription}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(read('src/calling-presentation.ts'))).toString('base64'));
const {battleRewardNotes}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(read('src/battle-reward-notes.ts'))).toString('base64'));
const results=[];
function check(name,run){try{run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}}
check('Phase 4.9 approved property replacements retain stable IDs and verified original provenance',()=>{
 const manifest=json('public/art/properties-49/provenance.json');
 assert.deepEqual(manifest.assets.map(a=>a.id),['wyrmcrest-keep','moonwell-sanctuary']);
 assert.equal(createHash('sha256').update(readFileSync(join(root,manifest.source))).digest('hex'),manifest.sourceSha256);
 for(const asset of manifest.assets){const bytes=readFileSync(join(root,'public/art/properties-49',asset.asset));assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.ok(alpha.properties.some(p=>p.id===asset.id));}
});
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
check('Phase 4.8 original vector assets have verified provenance; no active APK artwork references',()=>{
  const manifest=json('public/art/remaster-ui/provenance.json');assert.equal(manifest.license,'CC0-1.0');assert.equal(manifest.assets.length,3);
  for(const asset of manifest.assets)assert.equal(createHash('sha256').update(readFileSync(join(root,'public/art/remaster-ui',asset.asset))).digest('hex'),asset.sha256);
  const symbols=read('public/art/remaster-ui/icons.svg');for(const id of ['home','quests','battle','armory','army'])assert.ok(symbols.includes('id="'+id+'"'));
  for(const path of [...files('views'),...files('public').filter(p=>p.endsWith('.css'))]){
    const source=read(path);assert.ok(!source.includes('art/kingdoms-live/'),path);
    assert.ok(!/\/assets\/art\/(?:home|quests|battle|armory|army|crest|tab-[^"']*)\.png/.test(source),path);
  }
});
check('The mockup-theme background matches its original-asset provenance',()=>{
  const manifest=json('public/art/remaster-ui/castle-provenance.json');
  const bytes=readFileSync(join(root,'public/art/remaster-ui',manifest.asset));
  assert.equal(bytes.length,manifest.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
  assert.ok(read('public/remaster.css').includes('art/remaster-ui/'+manifest.asset));
});
for(const [manifest,count] of [['public/art/alpha/provenance.json',18]]){
  check('Artwork integrity: '+manifest,()=>{
    const art=json(manifest);assert.equal(art.assets.length,count);
    for(const item of art.assets)assert.equal(createHash('sha256').update(readFileSync(join(root,dirname(manifest),item.asset))).digest('hex'),item.sha256,item.asset);
  });
}
for(const [manifest,retiredRoot,count] of [['docs/phase48/retired-art/provenance.json','public/art',11],['docs/phase48/retired-art/land-provenance.json','public/art',2],['docs/phase48/retired-art/kingdoms-live-provenance.json','public/art/kingdoms-live',16]]){
  check('Unlicensed historical artwork is absent from the runtime tree: '+manifest,()=>{
    const art=json(manifest);assert.equal(art.assets.length,count);
    for(const item of art.assets)assert.ok(!existsSync(join(root,retiredRoot,item.asset)),item.asset+' must not be served');
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
check('Simplified Land sheet preserves 21 property identities with verified image bytes and row bounds',()=>{
 const art=json('public/art/land-simple-0.1/provenance.json');const bytes=readFileSync(join(root,'public/art/land-simple-0.1',art.asset));
 assert.equal(bytes.length,art.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);assert.equal(art.assignments.length,21);
 assert.equal(art.observed_row_bounds.length,7);assert.equal(art.observed_row_bounds.at(-1),art.height);
 for(const property of alpha.properties){const mapping=art.assignments.find(a=>a.id===property.id);assert.deepEqual({atlas:mapping.atlas,row:mapping.row,column:mapping.column},property.illustration);}
 assert.ok(read('public/strategy.css').includes('land-simple-0.1/properties.webp'));
});
check('CSS uses local assets; original tab gradients and safe areas remain',()=>{
  for(const file of ['public/realm-theme.css','public/land-review.css','public/remaster.css','public/phase43.css','public/styles.css','public/kingdoms-live.css','public/alpha.css','public/refinements.css','public/strategy.css','public/community.css','public/phase41.css']){
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
const strategy=json('rulesets/strategy-0.2/rules.json'),community=json('rulesets/community-0.1/rules.json'),refinements=json('rulesets/refinements-0.1/rules.json'),pvp=json('rulesets/pvp-economy-0.1/rules.json'),bountyRules=pvp.bounties;
const properties=alpha.properties.map((p,i)=>({...p,basePrice:p.price,owned:i===0?1:0,remaining:99,maxPurchase:25,maxAffordable:1,priceSteps:[p.price],saleRefundSteps:[Math.floor(p.price/2)],maxSell:i===0?1:0,projectedBuyNetSteps:[14],projectedSaleNetSteps:[0],unlocked:true}));
const land={rulesetId:alpha.id,provisional:true,paymentIntervalSeconds:3600,hourlyIncome:8,hourlyUpkeep:1,equipmentUpkeep:0,totalUpkeep:1,netHourlyIncome:7,nextPaymentAt:next,pendingGold:'0',properties,
 holdings:[{id:holdingId,propertyId:'smallholding',name:'Smallholding',quantity:1,hourlyIncome:8,hourlyUpkeep:1,nextPaymentAt:next,rulesetId:landRules.id}]};
const gameplay=json('rulesets/gameplay-refinement-1/rules.json');
const state={healing:{health:85,maxHealth:110,missing:25,unitCost:1,cost:25,availableGold:150,affordable:true,shortfall:0},payment:{gold:7,gross:8,propertyUpkeep:1,equipmentUpkeep:0,prepaidUpkeep:0,walletUpkeep:0,economicNet:7,retainedGold:'0',nextAt:next,partial:false},nextUnlock:{level:5,names:['Iron Sword','Mountain pass']},invitationCode:'ABCDEF123456',id:playerId,name:'Arthur of the Vale',xp:60,level:4,levelXp:0,levelRequirement:45,xpToNext:45,health:85,maxHealth:110,mana:16,maxMana:21,spirit:2,maxSpirit:3,energy:16,bankedGold:250,gold:150,units:2,
 attack:20,defense:18,equipped:true,inventoryId:inventory[0].inventoryId,inventory,questsCompleted:10,stateVersion:4,skillPoints:3,className:'Warden',calling:{description:strategy.callings.Warden.description,attackPercent:-2,defensePercent:4,healthSeconds:162,manaSeconds:300,spiritSeconds:120,changeReadyAt:null,changeCost:0},attackReadyAt:now,serverTime:now,
 energyNextAt:next,manaNextAt:next,spiritNextAt:next,healthNextAt:next,land,rulesetId:alpha.id,
 maintenance:{hourlyRate:0,reserveGold:'0',arrearsGold:'0',paused:false,resumeCost:0},
 economy:{grossHourlyIncome:8,propertyUpkeep:1,equipmentUpkeep:0,scheduledEquipmentUpkeep:0,otherUpkeep:0,totalUpkeep:1,netHourlyIncome:7,maintenancePaused:false},battleStats:{wins:2,losses:1,total:3,kills:1,deaths:0,legacyKnockouts:0},accountCreatedAt:now,accountAgeDays:0,training:{attack:0,defense:0,attackBonusPercent:0,defenseBonusPercent:0,untrainedAttack:20,untrainedDefense:18},
 army:{capacity:9,participants:4,total:4,allies:1,mercenaries:2,links:[{characterId:targetId,name:'Morgan',level:3,className:'Freeblade',status:'pending',incoming:true}]},
 attackEquipment:{attack:6,defense:2,selected:[]},defenseEquipment:{attack:6,defense:2,selected:[]},
 quests:alpha.quests.map(q=>({...q,completions:1,missing:{},missingCost:0,ready:true,lockReason:null})),loot:[{id:'watchtower-map',name:'Watchtower Map'}],awards:[{id:'quests-10',points:1}]};
const legacyBattle={id:battleId,attackerId:playerId,defenderId:targetId,attackerName:'Arthur',defenderName:'Morgan',winnerName:'Arthur',winnerId:playerId,loot:3,attackPower:20,defensePower:10,attackRoll:2,defenseRoll:1,attackerDamage:3,defenderDamage:12,attackerHealthAfter:82,defenderHealthAfter:88,attackerXp:5,createdAt:now};
const newBattle={...legacyBattle,rulesetId:alpha.id,attackPower:2000,defensePower:1000,attackerArmy:4,defenderArmy:2,attackerMaxHealth:110,defenderMaxHealth:100,spiritSpent:1,rewarded:true,attackEquipment:[],defenseEquipment:[]};
const opponent={id:targetId,name:'Morgan',level:3,units:2,armySize:3,className:'Freeblade',health:100,maxHealth:100};
const fixture=(screen,extra={})=>({screen,announcements:[{heading:'Royal Announcements',text:'PRE ALPHA BUILD, PLEASE REPORT BUGS TO @savism DISCORD'}],experience:{tutorial:{status:'skipped',completed:0,steps:[]},achievements:[]},experienceRules:{achievements:[]},recruitment:{allowed:true,reason:null,status:"none",automatic:false},purchase:{type:"equipment",entry:alpha.items[0],owned:2,available:2,costSteps:[5,10]},state,nav:navigation,rules,landRules,alpha,strategy,community,refinements,bountyRules,pvp,gameplay,bountyCount:0,nextBountyExpiry:null,bountyPlacement:{allowed:true,reason:null},bountyTarget:{id:targetId,name:"Morgan",level:3,className:"Warden",health:100,maxHealth:100,temporaryRival:false},vaultEntries:[],developmentBotBountiesEnabled:false,relativeTime:()=> 'just now',showCalling:false,publicCharacter:null,profileProperties:[{id:'smallholding',name:'Smallholding',quantity:1,grossIncome:8,upkeep:1,art:'farm',illustration:alpha.properties[0].illustration}],combatTarget:null,tales:{entries:[],nextCursor:null},bountyQuote:{targetId,targetName:'Morgan',amount:1,fee:1,total:2,rulesetId:refinements.id},feedTab:'all',feed:{entries:[],nextCursor:null},armyTab:'recruit',armyEvents:[],developmentBotsEnabled:false,bountyBoard:{active:[],history:[],eligible:true},csrf:'a'.repeat(64),accountName:'arthur',commandId:randomUUID,notice:null,error:null,actionResult:screen==='purchase'?{kind:"buy",data:{quantity:1,goldSpent:5,itemId:alpha.items[0].id}}:null,
 opponents:[opponent],nextOpponentCursor:null,battles:[],battle:newBattle,title:navigation.find(n=>n.id===screen)?.label??'The Realm',authMode:'login',formValues:{username:'',name:''},category:'weapon',questArea:'all',profileTab:'player',...extra});
const emptyLand={...land,hourlyIncome:0,hourlyUpkeep:0,totalUpkeep:0,netHourlyIncome:0,nextPaymentAt:null,holdings:[],properties:properties.map(p=>({...p,owned:0}))};
const contract={id:randomUUID(),sponsor_id:playerId,target_id:targetId,name:'Morgan',target_name:'Morgan',sponsor_name:'Arthur',level:3,profile_class:'Freeblade',army_size:3,armySize:3,amount:1000,fee:100,status:'active',claimant_id:null,created_at:new Date(Date.parse(now)-7200000).toISOString(),expires_at:next,claimBlockedReason:'Sponsors cannot claim their own contracts.'};
const comment={id:randomUUID(),kind:'comment',createdAt:now,data:{authorId:targetId,authorName:'Morgan',profileId:playerId,profileName:'Arthur',body:'Welcome to the realm <script>!',reported:false}};
const sampleAchievement={id:'quests-1',name:'A First Deed',category:'Quests',metric:'quests',threshold:1,rank:1,emblem:'scroll',description:'Complete your first quest.',progress:1,earnedAt:now,evidence:'gameplay'};
const championCategories=[{id:'victories',name:'Battle Victories',unit:'victories',help:'Lifetime victories.'},{id:'bounties',name:'Bounty Hunters',unit:'claims',help:'Completed claims.'},{id:'land',name:'Wealthiest Kingdoms',unit:'gold in Land',help:'Recorded portfolio value.'},{id:'level',name:'Highest Level',unit:'level',help:'Level, then XP.'}];
const formatStanding=value=>BigInt(value).toLocaleString('en');
const guideSource=stripTypeScriptTypes(read('src/guide.ts'),{mode:'transform'});
const {guideSteps}=await import('data:text/javascript;base64,'+Buffer.from(guideSource).toString('base64'));
const tutorialExperience=status=>({tutorial:{status,position:7,completed:6,replaying:false,completedAt:status==='completed'?now:null,steps:guideSteps.map(step=>({...step,done:step.id!=='land'&&step.id!=='skills'}))},achievements:[]});
const cases=[
 {name:'champions',data:fixture('champions',{championCategories,formatStanding,champions:{category:championCategories[0],entries:[{id:playerId,name:'Arthur of the Vale',rank:1,score:'21',self:true}],own:{rank:'1',score:'21'}}})},
 {name:'champions-empty',data:fixture('champions',{championCategories,formatStanding,champions:{category:championCategories[1],entries:[],own:null}})},
 {name:'tutorial-introduction',data:fixture('tutorial',{experience:tutorialExperience('not_started')})},
 {name:'tutorial-land-lesson',data:fixture('tutorial',{experience:tutorialExperience('active')})},
 {name:'tutorial-completion',data:fixture('tutorial',{experience:tutorialExperience('completed')})},
 {name:'tutorial-context-land',data:fixture('land',{experience:tutorialExperience('active')})},
 {name:'achievements',data:fixture('achievements',{experience:{tutorial:{status:'skipped',completed:0,steps:[]},achievements:[sampleAchievement]}})},
 {name:'quest-equipment',data:fixture('quest-equipment',{questEquipment:{quest:state.quests[1],missing:[{item:alpha.items[0],quantity:1,cost:5}],total:5,shortfall:0}})},
 {name:'quest-equipment-ready',data:fixture('quest-equipment',{questEquipment:{quest:state.quests[1],missing:[],total:0,shortfall:0}})},
 {name:'trade-confirm-buy',data:fixture('trade-confirm',{tradeQuote:{property:properties[0],kind:'land_buy',quantity:1,amount:45,projectedNet:14,owned:1,id:randomUUID()}})},
 {name:'trade-confirm-sell',data:fixture('trade-confirm',{tradeQuote:{property:properties[0],kind:'land_sell',quantity:1,amount:22,projectedNet:0,owned:1,id:randomUUID()}})},
 {name:'home-calling',data:fixture('home',{showCalling:true})},
 {name:'home-tutorial',data:fixture('home',{experience:{tutorial:{status:'active',completed:0,steps:[{id:'quest',name:'Your first deed',help:'Complete a quest.',href:'/game/quests',done:false}]},achievements:[]}})},
 {name:'quest-celebration',data:fixture('quests',{experienceRules:{achievements:[sampleAchievement]},actionResult:{kind:'quest',commandId:randomUUID(),data:{questId:'border-patrol',questName:'Patrol',gold:8,xp:4,mana:2,newAchievements:['quests-1'],celebration:{level:5,points:2,equipment:['Iron sword'],quests:['New quest'],land:[]}}}})},
 {name:'purchase-equipment',data:fixture('purchase')},
 {name:'purchase-land',data:fixture('purchase',{purchase:{type:'land',entry:properties[0],owned:2,available:2,costSteps:[45,95]},actionResult:{kind:'land_buy',data:{quantity:2,goldSpent:95}}})},
 {name:'purchase-unavailable',data:fixture('purchase',{purchase:{type:'equipment',entry:alpha.items[0],owned:1000,available:0,costSteps:[5]}})},
 {name:'profile-public-tales',data:fixture('profile',{publicCharacter:{...state,id:targetId,name:'Morgan'},profileTab:'battles',tales:{entries:[{id:battleId,attackerId:randomUUID(),defenderId:targetId,attackerName:'Earlier Rival',defenderName:'Morgan',won:false,loot:3,attackerXp:5,attackerDamage:3,defenderDamage:30,bountyReward:0,canViewReport:false,createdAt:now}],nextCursor:now.replace('.000Z','.000001Z')+'~'+battleId}})},
 {name:'profile-legacy-tales',data:fixture('profile',{profileTab:'battles',tales:{entries:[{id:battleId,attackerId:playerId,defenderId:targetId,attackerName:'Arthur',defenderName:'Morgan',won:true,loot:null,attackerXp:null,attackerDamage:null,defenderDamage:null,bountyReward:0,canViewReport:true,createdAt:now}],nextCursor:null}})},
 {name:'home-defeat-activity',data:fixture('home',{feed:{entries:[{id:battleId,kind:'battle',createdAt:now,data:{...newBattle,winnerId:targetId}}],nextCursor:null}})},
 {name:'quests-result-unavailable',data:fixture('quests',{state:{...state,mana:0,quests:state.quests.map(q=>({...q,ready:false,lockReason:'More Mana required'}))},actionResult:{kind:'quest',data:{questId:'border-patrol',questName:'Patrol',gold:8,xp:4,mana:2,levelGained:0,loot:null,milestones:[]}}})},
 {name:'bounty-confirm',data:fixture('bounty-confirm')},
 {name:'bounty-new',data:fixture('bounty-new')},
 {name:'bounty-unavailable',data:fixture('bounty-new',{bountyPlacement:{allowed:false,reason:'Target already listed.'}})},
 {name:'vault',data:fixture('vault')},
 {name:'profile-no-land',data:fixture('profile',{profileProperties:[]})},
 {name:'profile-bot-no-land',data:fixture('profile',{publicCharacter:{...state,id:targetId,name:'Practice Rival',temporaryRival:true},profileProperties:[]})},
 {name:'report-defeated',data:fixture('report',{combatTarget:{targetId,name:'Morgan',health:0,maxHealth:100,allowed:false,eligible:false,reason:'Opponent defeated — 0 Health. Wait for recovery.'}})},
 {name:'bounty-defeated',data:fixture('bounties',{bountyBoard:{eligible:true,active:[{...contract,sponsor_id:randomUUID(),health:0,claimBlockedReason:null,attackBlockedReason:'Opponent defeated — 0 Health.'}],history:[]}})},
 {name:'home-mixed-activity',data:fixture('home',{feed:{entries:[{id:battleId,kind:'battle',createdAt:now,data:newBattle},{id:randomUUID(),kind:'army',createdAt:now,data:{event:'accepted',actorId:playerId,actorName:'Arthur',targetId,targetName:'Morgan'}},{id:randomUUID(),kind:'bounty',createdAt:now,data:{event:'claimed',amount:1000,targetId,targetName:'Morgan',sponsorId:playerId,sponsorName:'Arthur',battleId}}],nextCursor:null}})},
 {name:'settings',data:fixture('settings')},
 {name:'profile-comments',data:fixture('profile',{profileTab:'comments',feed:{entries:[comment],nextCursor:null}})},
 {name:'profile-public',data:fixture('profile',{publicCharacter:{...state,id:targetId,name:'Morgan',temporaryRival:false},combatTarget:{targetId:targetId,name:'Morgan',health:10,maxHealth:100,allowed:true,eligible:true,reason:null}})},
 {name:'army-roster',data:fixture('army',{armyTab:'army',state:{...state,army:{...state.army,links:[...state.army.links,{...state.army.links[0],status:'accepted',characterId:randomUUID()}]}}})},{name:'army-dashboard',data:fixture('army',{armyTab:'dashboard'})},
 {name:'home-comments',data:fixture('home',{feedTab:'comments',feed:{entries:[comment],nextCursor:null}})},
 {name:'home-broadcasts',data:fixture('home',{feedTab:'broadcasts',feed:{entries:[{...comment,kind:'broadcast',data:{...comment.data,profileId:null}}],nextCursor:null}})},
 {name:'home-own-comment',data:fixture('home',{feedTab:'comments',feed:{entries:[{...comment,data:{...comment.data,authorId:playerId}}],nextCursor:null}})},
 ...navigation.map(n=>({name:n.id,data:fixture(n.id)})),{name:'bounties-empty',data:fixture('bounties')},{name:'bounties-own',data:fixture('bounties',{bountyBoard:{eligible:true,active:[contract],history:[contract,...['claimed','expired','canceled'].map(status=>({...contract,id:randomUUID(),status}))]}})},{name:'bounties-hunt',data:fixture('bounties',{bountyBoard:{eligible:true,active:[{...contract,sponsor_id:randomUUID(),claimBlockedReason:null}],history:[]}})},{name:'profile',data:fixture('profile')},{name:'profile-skills',data:fixture('profile',{profileTab:'skills'})},{name:'profile-battles',data:fixture('profile',{profileTab:'battles',battles:[{id:battleId,result:newBattle,created_at:now}]})},
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
 {name:'report-bot-repeat',data:fixture('report',{battle:{...newBattle,outcome:'attacker_win',botRewardEligibilityPolicy:'bot-combat-rewards-1',lootDetails:{multiplier:85},xpDetails:{trivial:false}}})},
 {name:'report-bot-v2-repeat',data:fixture('report',{battle:{...newBattle,outcome:'attacker_win',botRewardEligibilityPolicy:'bot-combat-rewards-2',lootDetails:{multiplier:85},xpDetails:{trivial:false}}})},
 {name:'report-bot-weak',data:fixture('report',{battle:{...newBattle,outcome:'attacker_win',botRewardEligibilityPolicy:'bot-combat-rewards-1',lootDetails:{multiplier:100},xpDetails:{trivial:true}}})},
 ...['auth','rules','error'].flatMap(screen=>[{name:screen+'-public',data:fixture(screen,{state:null})},...(screen==='auth'?[{name:'register',data:fixture('auth',{state:null,authMode:'register'})}]:[{name:screen+'-signed-in',data:fixture(screen)}])]),
 {name:'escaped-name',data:fixture('home',{state:{...state,name:'<img src=x onerror=1>'}})},
 {name:'large-resources',data:fixture('home',{state:{...state,name:'MMMMMMMMMMMMMMMMMMMMMMMMMMMM',gold:2147483647,xp:2147483647,level:42949673}})},
];
const rendered=new Map();
for(const example of cases)check('Production EJS render: '+example.name,()=>{
 const html=ejs.render(read('views/layout.ejs'),{callingName,callingDescription,battleRewardNotes,sound:{enabled:false,volume:55},soundEvent:null,...example.data},{filename:join(root,'views/layout.ejs')});
 assert.ok(html.startsWith('<!doctype html>')&&!html.includes('<%'));assert.ok(!html.includes('<img src=x'));
 rendered.set(example.name,html);
});
const routeRegex=route=>new RegExp('^'+route.split('/').map(s=>s.startsWith(':')?'[^/]+':s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'$');
const gets=['/game/champions','/game/tutorial','/game/achievements','/game/quests/:id/requirements','/','/login','/register','/rules','/game/profile','/game/bounties','/game/bounties/new','/game/vault','/game/settings','/game/purchases/:id','/game/players/:id',...navigation.map(n=>'/game/'+n.id),'/game/battles/:id'].map(routeRegex);
const posts=['/login','/register','/logout','/game/bounties/preview',...commandRoutes.map(r=>r.html)].map(routeRegex),covered=new Set();
check('Rendered links, asset references, unique IDs, labels, CSRF and command contracts',()=>{
 for(const [name,html] of rendered){
  const ids=[...html.matchAll(/\sid="([^"]*)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,name+': duplicate ID');
  for(const match of html.matchAll(/<(?:a|link|img|script)\b([^>]+)>/g)){
   const attrs=attributes(match[1]),value=attrs.href??attrs.src;if(!value)continue;
   if(value.startsWith('#')){assert.ok(ids.includes(value.slice(1)),name+': missing fragment');continue;}
   const url=new URL(value,'http://check.invalid');assert.equal(url.origin,'http://check.invalid');
   if(url.pathname.startsWith('/assets/'))assert.ok(existsSync(join(root,'public',url.pathname.slice(8))),value);
   else assert.ok(gets.some(p=>p.test(url.pathname)),name+': missing GET '+url.pathname);
  }
  for(const match of html.matchAll(/<label\b([^>]+)>/g))assert.ok(ids.includes(attributes(match[1]).for),name+': label without target');
  for(const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)){
   const attrs=attributes(match[1]);if(attrs.method==='get'){assert.ok(gets.some(p=>p.test(attrs.action)));assert.ok(!/name="csrf"/.test(match[2]));continue;}assert.equal(attrs.method,'post');assert.ok(posts.some(p=>p.test(attrs.action)),attrs.action);
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
check('Original five destinations, accessible original vector icons, Home-only Land and profile Home selection',()=>{
 const expected=[['/game/home','Home'],['/game/quests','Quests'],['/game/battle','Battle'],['/game/armory','Armory'],['/game/army','Recruit']];

 for(const example of cases){
  const links=navigationLinks(rendered.get(example.name),'Primary navigation');assert.deepEqual(links.map(l=>[l.href,l.label]),example.data.state?expected:[]);
  if(!example.data.state)continue;
  const selected=example.data.screen==='land'?'home':example.data.screen==='purchase'?(example.data.purchase.type==='equipment'?'armory':'home'):['report','bounties','bounty-confirm','bounty-new','champions'].includes(example.data.screen)?'battle':['profile','settings','vault','achievements','trade-confirm','tutorial'].includes(example.data.screen)?'home':example.data.screen==='quest-equipment'?'quests':example.data.screen;
  for(const link of links){const id=link.href.split('/').pop();assert.equal(link.current,id===selected);assert.equal(link.image,null);assert.ok(rendered.get(example.name).includes('/assets/art/remaster-ui/icons.svg?v=phase48-finish1#'+id));}
  assert.ok(!navigationLinks(rendered.get(example.name),'Secondary navigation').some(l=>l.href==='/game/land'));
  assert.equal((rendered.get(example.name).match(/href="\/game\/land"/g)||[]).length,example.data.screen==='home'||(example.data.screen==='purchase'&&example.data.purchase.type==='land')?1:0);
 }
});
check('Repeat quest styling follows authoritative eligibility; legacy details stay unknown',()=>{
 const button=name=>/<button[^>]*data-quest-run="border-patrol"[^>]*>Do Again<\/button>/.exec(rendered.get(name))?.[0];
 assert.match(button('quests-result'),/button-gold/);assert.ok(!button('quests-result').includes(' disabled'));
 assert.match(button('quests-result-unavailable'),/ disabled/);
 assert.ok(rendered.get('profile-legacy-tales').includes('Gold not recorded'));
 assert.ok(!rendered.get('profile-public-tales').includes('href="/game/battles/'+battleId+'"'));
});
check('Compact combat outcomes are distinct medieval metal statuses and profile totals remain hidden',()=>{
 assert.ok(rendered.get('home-defeat-activity').includes('outcome-defeat'));
 assert.ok(rendered.get('home-mixed-activity').includes('outcome-victory'));
 assert.ok(rendered.get('home-defeat-activity').includes('#defeat-emblem'));
 assert.ok(rendered.get('home-mixed-activity').includes('#victory-emblem'));
 for(const [name,html] of rendered){
  if(name.startsWith('home')){assert.ok(html.includes('id="activity-title" class="profile-section-heading">Recent Activity</h2>'));assert.ok(!html.includes('>Realm Activity</h2>'));}
  if(name.startsWith('profile'))assert.ok(!/Attack power<|Defense power<|untrainedAttack/.test(html));
  for(const match of html.matchAll(/<span class="combat-outcome[^>]*>([\s\S]*?)<\/span><\/span>/g)){assert.ok(match[1].includes('<svg'));assert.ok(!match[1].includes('<button'));}
 }
});
check('Legacy HTML command routes are preserved through the alpha expansion',()=>{
 const baseline=json('tests/fixtures/land-form-contracts.json');
 for(const forms of Object.values(baseline.fixtures))for(const form of forms){if(form.action==='/game/army/recruit'){assert.ok(!posts.some(p=>p.test(form.action)));continue;}assert.ok(posts.some(p=>p.test(form.action)),form.action);}
});
check('Active branding and package lock use Kingdom Come',()=>{
  const pkg=json('package.json'),lock=json('package-lock.json');assert.equal(pkg.name,'kingdom-come');assert.equal(lock.name,pkg.name);assert.equal(lock.packages[''].name,pkg.name);
  for(const html of rendered.values()){assert.ok(html.includes('Kingdom Come'));assert.ok(!html.includes('Knights Reforged'));}
});
check('Upgraded pages bypass cached pre-expansion income clients',()=>{
  for(const example of cases){
    const html=rendered.get(example.name);assert.ok(html.includes('/assets/refinements.css?v='+alpha.id));
    assert.ok(html.includes('/assets/phase41.css?v='+alpha.id+'-phase41-render1-phase48-mockup2'));
    assert.ok(html.includes('/assets/kingdoms-live.css?v=phase48-mockup2'));assert.ok(html.includes('/assets/alpha.css?v=phase48-mockup2'));
    assert.ok(html.includes('/assets/remaster.css?v=phase48-mockup2'));
    assert.ok(html.includes('/assets/realm-theme.css?v=phase48-finish1'));
    assert.ok(html.includes('/assets/sound.js?v=phase491-quiet1'));
    if(example.data.state)assert.ok(html.includes('/assets/realm.js?v='+alpha.id+'-phase47-1'));
    if(example.data.state)assert.ok(html.includes('/assets/community.js?v='+alpha.id+'-phase48-shared1'));
    if(example.data.screen==='land')assert.ok(html.includes('/assets/land.js?v='+alpha.id+'-phase48-land-polish1'));
  }
});
check('Land retains countdown, offline payment, sale, retained-gold and no-script hooks',()=>{
 for(const example of cases.filter(e=>e.data.screen==='land')){
  const html=rendered.get(example.name);
  for(const hook of ['data-land-countdown','data-land-status','data-land-payment-time','data-land-gross','data-land-upkeep','data-equipment-upkeep','data-land-net','data-land-pending','data-land-pending-gold','data-land-owned','data-land-buy-hint','data-wallet-gold','data-land-sell','<noscript>','/assets/land.js'])assert.ok(html.includes(hook),example.name+': '+hook);
 }
});
check('The Land-only review stylesheet and original assets cannot replace other screens',()=>{
  for(const example of cases)assert.equal(rendered.get(example.name).includes('/assets/land-review.css?v=phase48-land-finish1'),example.data.screen==='land');
  const manifest=json('public/art/land-review/provenance.json');assert.equal(manifest.assets.length,3);
  for(const asset of manifest.assets){const bytes=readFileSync(join(root,'public/art/land-review',asset.asset));assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);}
  const reference=readFileSync(join(root,manifest.reference.path));assert.equal(createHash('sha256').update(reference).digest('hex'),manifest.reference.sha256);
});
mkdirSync(join(root,'test-results'),{recursive:true});
const report={scope:'Production EJS fixture rendering, local references, form contracts, original navigation and artwork hashes.',fixtureCount:cases.length,
 passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
writeFileSync(join(root,'test-results/static-checks.json'),JSON.stringify(report,null,2)+'\n');
for(const r of results)console.log((r.passed?'PASS ':'FAIL ')+r.name+(r.error?': '+r.error:''));
console.log(report.passed+' passed; '+report.failed+' failed; '+cases.length+' production EJS fixture cases.');
if(report.failed)process.exitCode=1;
