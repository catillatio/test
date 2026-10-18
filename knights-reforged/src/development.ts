import {randomUUID} from 'node:crypto';
import type {Database,Sql} from './db.js';
import {transaction} from './db.js';
import {hashPassword,registration} from './auth.js';
import {alpha,activeArmy,levelRequirement,trainedPower,type ItemDefinition} from './alpha-rules.js';
import {strategy,botCatalog,callingFor,callingPower,type Calling} from './strategy-rules.js';
import {rules} from './rules.js';
import {ledger,creditGold} from './economy.js';
import {GameError} from './errors.js';
import {refinements} from './refinement-rules.js';
import {pvp} from './pvp-rules.js';
import {buyEstate} from './estate.js';
import {vaultTransfer} from './pvp-economy.js';
import {propertyQuote} from './alpha-rules.js';
import {materialize,type CharacterRow} from './game.js';
import {privateAlphaInitializationId,requirePrivateAlphaInitialization} from './private-alpha-policy.js';
import {reconcileLevelMilestones} from './migrate.js';

export interface DevelopmentPermission{nodeEnv:string;allowProvisioning:boolean;}
export function requireDevelopment(permission:DevelopmentPermission){
  if(!['development','test'].includes(permission.nodeEnv)||!permission.allowProvisioning)
    throw new Error('Development provisioning requires NODE_ENV=development and ALLOW_DEV_PROVISIONING=1; production is prohibited.');
}
interface BotBlueprint{name:string;calling:Calling;participants:number;quantity:number;quantities:Record<string,number>;items:ItemDefinition[];training:number;health:number;mana:number;spirit:number;gold:number;bankedGold:number;properties:{id:string;quantity:number}[];equipmentInvestment:number;propertyInvestment:number;grossIncome:number;netIncome:number;}
const blueprints=new Map<string,BotBlueprint>();
function blueprintDefense(level:number,p:number,items:ItemDefinition[],quantities:Record<string,number>,training:number,calling:string){
  const base=rules.baseDefense+(level-1)*rules.defensePerLevel+(p-1)*rules.unit.defense+items.reduce((n,item)=>n+item.defense*quantities[item.id]!,0);
  return callingPower(trainedPower(base,training),callingFor(calling).defensePercent);
}
export function benchmarkAttack(level:number){
  const rule=botCatalog.benchmark,cap=Math.min(botCatalog.armyCap,1+Math.floor(level/botCatalog.levelsPerArmyMember),activeArmy(level,alpha.limits.mercenaries,0).participants);
  const p=Math.max(1,Math.round(cap*rule.armyPercent/100)),quantity=Math.ceil(p*rule.equipmentPercent/100);
  const items=(['weapon','armor','spell'] as const).map(category=>alpha.items.filter(item=>item.category===category&&item.level<=Math.max(1,level-rule.itemLevelLag)).sort((a,b)=>b.attack-a.attack||b.defense-a.defense||a.id.localeCompare(b.id))[0]!);
  const base=rules.baseAttack+(level-1)*rules.attackPerLevel+(p-1)*rules.unit.attack+items.reduce((n,item)=>n+item.attack*quantity,0);
  return callingPower(trainedPower(base,Math.floor(level/rule.levelsPerTraining)),callingFor(rule.calling).attackPercent);
}
export function botGoldAllowance(level:number,tier:string,populationVersion=botCatalog.id,variant=0){
  if(populationVersion===botCatalog.id)return botBlueprint(level,tier,variant).gold;
  if(populationVersion==='passive-rivals-4')return 0; // Saved estates continue earning; new capital requires explicit versioned provisioning.
  // An operator may start the new app before explicitly upgrading its NPCs.
  // Do not fund an old, landless rival using a portfolio it does not own.
  const percent=botCatalog.profiles[tier]?.goldPercent;
  if(!percent||!Number.isInteger(level)||level<1||level>50)throw new RangeError('Invalid rival allowance.');
  return populationVersion==='passive-rivals-3'?
    Math.floor((refinements.bots.walletBase+level*refinements.bots.walletPerLevel+level*level*refinements.bots.walletPerLevelSquared)*percent/100):
    strategy.bots.walletBase+level*strategy.bots.walletPerLevel;
}
function botEstate(level:number,tier:string,variant=0){
  const economy=botCatalog.economy,band=economy.estateBands.filter(b=>b.minimumLevel<=level).at(-1)!;
  const unlocked=alpha.properties.filter(p=>p.level<=level);
  const types=band.types?unlocked.slice(-band.types):[];
  if(!band.types)return [];
  const portfolio=types.map((property,i)=>({id:property.id,quantity:Math.max(1,Math.round((band.copies+(i===0&&level>=21?1:0))*economy.estateCopiesPercent[tier]!/100))}));
  const total=portfolio.reduce((n,p)=>n+p.quantity,0);
  if(total<3){const starter=portfolio.find(p=>p.id===unlocked[0]!.id);if(starter)starter.quantity+=3-total;else portfolio.push({id:unlocked[0]!.id,quantity:3-total});}
  if(variant&&level>10)portfolio[0]!.quantity+=variant;
  return portfolio;
}
export function botBlueprint(level:number,tier:string,variant=0){
  const cached=blueprints.get(level+':'+tier+':'+variant);if(cached)return cached;
  const index=strategy.bots.tiers.indexOf(tier);
  if(!Number.isInteger(level)||level<1||level>50||index<0||!Number.isInteger(variant)||variant<0||variant>=botCatalog.variants)throw new RangeError('Invalid temporary rival.');
  const profile=botCatalog.profiles[tier]!;
  const capacity=Math.min(botCatalog.armyCap,1+Math.floor(level/botCatalog.levelsPerArmyMember),activeArmy(level,alpha.limits.mercenaries,0).participants);let participants=Math.max(1,Math.round(capacity*profile.armyPercent/100));
  const itemLevel=Math.min(level,Math.max(1,level-profile.itemLevelLag-(variant===2?1:variant===1?-1:0)));
  const items=(['weapon','armor','spell'] as const).map(category=>alpha.items.filter(item=>item.category===category&&item.level<=itemLevel)
    .sort((a,b)=>b.defense-a.defense||b.attack-a.attack||a.id.localeCompare(b.id))[0]!);
  const calling=(['Freeblade','Spellward','Warden'] as const)[(index+variant)%3]!,training=Math.min(25,Math.floor(level/profile.levelsPerTraining));
  let quantities=Object.fromEntries(items.map(item=>[item.id,(item.category==='spell'&&level<profile.spellMinimumLevel)||(item.category==='armor'&&level<profile.armorMinimumLevel)?0:Math.max(1,Math.ceil(participants*profile.equipmentPercent/100))]));
  if(tier==='seasoned'&&botCatalog.calibrateSeasoned){
    const green=botBlueprint(level,'green'),elite=botBlueprint(level,'elite');
    const target=Math.max(blueprintDefense(level,green.participants,green.items,green.quantities,green.training,green.calling)*1.1,
      Math.min(benchmarkAttack(level),blueprintDefense(level,elite.participants,elite.items,elite.quantities,elite.training,elite.calling)*botCatalog.calibrationElitePercent/100));
    let best=Infinity,bestPreference=Infinity;
    // Provisioning-only search over legal equipment quantities. Persist the
    // resulting ordinary inventory; runtime combat needs no NPC power bonus.
    for(let p=1;p<=capacity;p++)for(let w=1;w<=p;w++)for(let a=1;a<=p;a++)for(let s=1;s<=p;s++){
      const candidate={[items[0]!.id]:w,[items[1]!.id]:a,[items[2]!.id]:s};
      const distance=Math.abs(blueprintDefense(level,p,items,candidate,training,calling)-target);
      const preference=Math.abs(p-capacity*profile.armyPercent/100)+Math.abs(w-a)+Math.abs(a-s);
      if(distance<best||(distance===best&&preference<bestPreference)){best=distance;bestPreference=preference;participants=p;quantities=candidate;}
    }
  }
  const properties=botEstate(level,tier,variant);
  const equipmentInvestment=items.reduce((sum,item)=>sum+item.price*quantities[item.id]!,0);
  const propertyInvestment=properties.reduce((sum,holding)=>sum+propertyQuote(alpha.properties.find(p=>p.id===holding.id)!.price,0,holding.quantity).reduce((a,b)=>a+b,0),0);
  const grossIncome=properties.reduce((sum,holding)=>sum+alpha.properties.find(p=>p.id===holding.id)!.hourlyIncome*holding.quantity,0);
  const propertyUpkeep=properties.reduce((sum,holding)=>sum+alpha.properties.find(p=>p.id===holding.id)!.hourlyUpkeep*holding.quantity,0);
  const equipmentUpkeep=items.reduce((sum,item)=>sum+item.upkeep*quantities[item.id]!,0);
  const netIncome=grossIncome-propertyUpkeep-equipmentUpkeep,economy=botCatalog.economy;
  const gold=Math.max(botCatalog.minimumGold,Math.floor((economy.walletBase+Math.max(0,netIncome)*economy.walletIncomeHours+equipmentInvestment*economy.walletEquipmentPercent/100)*profile.goldPercent/100*(100+variant*7)/100));
  const bankedGold=Math.floor((Math.max(0,netIncome)*economy.vaultIncomeHours+propertyInvestment*economy.vaultEstatePercent/100)*profile.goldPercent/100);
  const result:BotBlueprint={name:botCatalog.identities[level+':'+tier+':'+variant]!,calling,properties,equipmentInvestment,propertyInvestment,grossIncome,netIncome,gold,bankedGold,
    participants,quantity:Math.max(...Object.values(quantities)),quantities,items,training,
    health:botCatalog.healthBase+Math.floor(level/botCatalog.levelsPerHealthUpgrade)*botCatalog.healthPerUpgrade+profile.healthBonus,mana:botCatalog.manaBase+Math.floor(level/botCatalog.levelsPerManaUpgrade),spirit:botCatalog.spiritBase+Math.floor(level/botCatalog.levelsPerSpiritUpgrade)};
  blueprints.set(level+':'+tier+':'+variant,result);return result;
}
export async function provisionBots(db:Database,permission:DevelopmentPermission,disable=false){
  requireDevelopment(permission);
  const disabledPasswordHash=disable?'':await hashPassword(randomUUID()+randomUUID());
  return transaction(db,async sql=>{
    await sql.query('SELECT pg_advisory_xact_lock(61824006)');
    return provisionBotsInTransaction(sql,disabledPasswordHash,disable);
  });
}
async function provisionBotsInTransaction(sql:Sql,disabledPasswordHash:string,disable=false){
    if(disable){await sql.query('UPDATE development_bots SET active=false');return {created:0,active:0};}
    await sql.query('SELECT id FROM characters WHERE id IN (SELECT character_id FROM development_bots) ORDER BY id FOR UPDATE');
    let created=0,upgraded=0;
    const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
    for(let level=1;level<=50;level++)for(const tier of strategy.bots.tiers)for(let variant=0;variant<botCatalog.variants;variant++){
      const key=`${botCatalog.id}:${level}:${tier}:${variant}`;
      const old=(await sql.query('SELECT b.character_id,b.population_version FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=$1 AND b.tier=$2 AND b.variant=$3',[level,tier,variant])).rows[0];
      if(old?.population_version===botCatalog.id){await sql.query('UPDATE development_bots SET active=true WHERE character_id=$1',[old.character_id]);continue;}
      const blueprint=botBlueprint(level,tier,variant),accountId=randomUUID(),id=old?old.character_id as string:randomUUID();
      const xp=Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0);
      if(!old){
        await sql.query('INSERT INTO accounts(id,username,password_hash,login_disabled) VALUES($1,$2,$3,true)',[accountId,`_npc_${level}_${tier}${variant?'_v'+variant:''}`,disabledPasswordHash]);
        await sql.query(`INSERT INTO characters(id,account_id,name,attained_level,xp,level_xp,profile_class,max_health,health,attack_training,defense_training,max_mana,mana,max_spirit,spirit)
        VALUES($1,$2,$3,$4,$5,0,$6,$7,$7,$8,$8,$9,$9,$10,$10)`,[id,accountId,blueprint.name,level,xp,blueprint.calling,blueprint.health,blueprint.training,blueprint.mana,blueprint.spirit]);
        await sql.query('INSERT INTO wallets(character_id,balance) VALUES($1,0)',[id]);

        await sql.query("INSERT INTO army_stacks(character_id,unit_definition_id,quantity) VALUES($1,'militia',$2)",[id,blueprint.participants-1]);
      }else{
        const existing=(await sql.query<CharacterRow>('SELECT * FROM characters WHERE id=$1',[id])).rows[0]!;
        await materialize(sql,existing,now); // settle saved estates/upkeep; do not discard old income
        await sql.query('UPDATE characters SET name=$8,profile_class=$2,max_health=$3,health=LEAST(health,$3),attack_training=$5,defense_training=$5,legacy_army_floor=LEAST(legacy_army_floor,$4),max_mana=$6,mana=LEAST(mana,$6),max_spirit=$7,spirit=LEAST(spirit,$7),state_version=state_version+1 WHERE id=$1',[id,blueprint.calling,blueprint.health,refinements.bots.armyCap,blueprint.training,blueprint.mana,blueprint.spirit,blueprint.name]);
        await sql.query("UPDATE army_stacks SET quantity=$2 WHERE character_id=$1 AND unit_definition_id='militia'",[id,blueprint.participants-1]);
        await sql.query('UPDATE inventory_entries SET quantity=0 WHERE character_id=$1',[id]);
        await sql.query('UPDATE inventory_lots SET remaining_quantity=0 WHERE character_id=$1',[id]);
      }
      // Explicitly registered synthetic development capital, never a gameplay
      // reward. Spend it through normal saved-cost purchases and the Vault.
      const estatePurchases=[];let propertyCost=0;
      for(const property of blueprint.properties){
        const owned=(await sql.query('SELECT COALESCE(sum(quantity),0)::int AS n FROM land_holdings WHERE character_id=$1 AND property_id=$2',[id,property.id])).rows[0]!.n;
        const quantity=Math.max(0,property.quantity-owned);
        if(quantity){estatePurchases.push({...property,quantity});propertyCost+=propertyQuote(alpha.properties.find(p=>p.id===property.id)!.price,owned,quantity).reduce((a,b)=>a+b,0);}
      }
      const bank=(await sql.query('SELECT balance FROM vault_accounts WHERE character_id=$1',[id])).rows[0]?.balance??0;
      const bankAdded=Math.max(0,blueprint.bankedGold-bank);
      const balance=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[id])).rows[0]!.balance;
      const capital=Math.max(0,blueprint.gold+blueprint.equipmentInvestment+propertyCost+bankAdded-balance);
      await creditGold(sql,id,BigInt(capital),null,'development_bot_endowment',pvp.id);
      await ledger(sql,null,'development_bot_equipment',[{characterId:id,amount:-blueprint.equipmentInvestment}],pvp.id);
      // Install registry before adding estate references; never replace IDs.
      await sql.query('INSERT INTO development_bots(character_id,population_key,population_version,tier,refilled_at,recovered_at,ruleset_id,variant) VALUES($1,$2,$3,$4,$5,$5,$6,$7) ON CONFLICT(character_id) DO NOTHING',[id,key,botCatalog.id,tier,now,pvp.id,variant]);
      for(const property of estatePurchases)await buyEstate(sql,id,level,property.id,property.quantity,randomUUID(),now);
      for(const property of blueprint.properties)await sql.query('INSERT INTO development_bot_estates(character_id,population_version,property_id,quantity) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,botCatalog.id,property.id,property.quantity]);
      if(bankAdded)await vaultTransfer(sql,id,bankAdded,true,randomUUID(),now);
      let rate=0;
      for(const item of blueprint.items){
        const quantity=blueprint.quantities[item.id]!;if(!quantity)continue;rate+=item.upkeep*quantity;
        const entry=(await sql.query('INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity,acquired_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(character_id,item_definition_id) DO UPDATE SET quantity=EXCLUDED.quantity RETURNING id',[randomUUID(),id,item.id,alpha.id,quantity,now])).rows[0]!.id;
        await sql.query(`INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,acquired_at)
          VALUES($1,$2,$3,$4,$5,$5,$7,$6)`,[randomUUID(),entry,id,alpha.id,quantity,now,item.price]);
      }
      await sql.query('INSERT INTO maintenance_accounts(character_id,hourly_rate,reserve_gold,settled_at) VALUES($1,$2,$3,$4) ON CONFLICT(character_id) DO UPDATE SET hourly_rate=EXCLUDED.hourly_rate,reserve_gold=EXCLUDED.reserve_gold,arrears_gold=0,remainder=0,paused=false,settled_at=EXCLUDED.settled_at',[id,rate,String(rate*strategy.bots.maintenanceHours),now]);
      await sql.query('INSERT INTO development_bots(character_id,population_key,population_version,tier,refilled_at,recovered_at,ruleset_id,variant) VALUES($1,$2,$3,$4,$5,$5,$6,$7) ON CONFLICT(character_id) DO UPDATE SET population_key=EXCLUDED.population_key,population_version=EXCLUDED.population_version,active=true,refilled_at=EXCLUDED.refilled_at,recovered_at=EXCLUDED.recovered_at,ruleset_id=EXCLUDED.ruleset_id',[id,key,botCatalog.id,tier,now,pvp.id,variant]);
      await sql.query("INSERT INTO development_bot_events(id,character_id,kind,details,created_at) VALUES($1,$2,'provision',$3,$4)",[randomUUID(),id,{level,tier,variant,participants:blueprint.participants,quantities:blueprint.quantities,maintenanceReserve:rate*strategy.bots.maintenanceHours,endowment:capital,equipmentInvestment:blueprint.equipmentInvestment,propertyInvestment:propertyCost,bankAdded,properties:blueprint.properties,name:blueprint.name,upgradedFrom:old?.population_version??null},now]);
      if(old)upgraded++;else created++;
    }
    return {created,upgraded,active:Number((await sql.query('SELECT count(*)::int AS n FROM development_bots WHERE active')).rows[0]!.n)};
}
// Caller already owns this character's lock. Passive rivals never run commands.
export async function prepareBot(sql:Sql,id:string,now:Date,enabled:boolean){
  const bot=(await sql.query('SELECT * FROM development_bots WHERE character_id=$1 FOR UPDATE',[id])).rows[0];
  if(!bot)return false;
  if(!enabled||!bot.active)throw new GameError('BOT_UNAVAILABLE','Temporary development rivals are disabled.',409);
  // Phase 4.5: wealth comes from actual saved Land. Never create gold or
  // maintenance reserves in response to an attack. Ordinary materialization
  // settles income/upkeep; scheduled bot funding spends only its existing purse.

  return true;
}
export async function provisionDevelopmentAccount(db:Database,permission:DevelopmentPermission,password:string,reset=false){
  requireDevelopment(permission);
  registration.parse({username:'dev',name:'Development Knight',password});
  const passwordHash=await hashPassword(password);
  return transaction(db,async sql=>{
    await sql.query('SELECT pg_advisory_xact_lock(61824006)');
    return provisionDevelopmentAccountInTransaction(sql,passwordHash,reset);
  });
}
async function provisionDevelopmentAccountInTransaction(sql:Sql,passwordHash:string,reset=false){
    const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
    let account=(await sql.query("SELECT a.id,d.baseline_version FROM accounts a LEFT JOIN development_accounts d ON d.account_id=a.id WHERE a.username='dev' FOR UPDATE OF a")).rows[0];
    let initialized=false;
    if(account&&!account.baseline_version)throw new Error('The username dev belongs to an unmanaged account. No account has been changed.');
    if(!account){
      const id=randomUUID(),character=randomUUID();
      await sql.query("INSERT INTO accounts(id,username,password_hash) VALUES($1,'dev',$2)",[id,passwordHash]);
      await sql.query("INSERT INTO characters(id,account_id,name) VALUES($1,$2,'Development Knight')",[character,id]);
      await sql.query('INSERT INTO wallets(character_id,balance) VALUES($1,0)',[character]);
      await sql.query("INSERT INTO army_stacks(character_id,unit_definition_id,quantity) VALUES($1,'militia',0)",[character]);
      await sql.query("INSERT INTO development_accounts(account_id,purpose,baseline_version,initialized_at,reset_at) VALUES($1,'persistent-dev',$2,$3,$3)",[id,strategy.id,now]);
      account={id,baseline_version:null};initialized=true;
    }
    const character=(await sql.query<CharacterRow>('SELECT * FROM characters WHERE account_id=$1 FOR UPDATE',[account.id])).rows[0]!;
    if(!reset&&!initialized&&account.baseline_version===strategy.id)return {accountId:account.id as string,characterId:character.id as string,reset:false,initialized:false};
    // Settle the dev character's old obligations/income before restoring the
    // carried-gold baseline; the next login must not charge an old offline bill.
    await materialize(sql,character,now);
    const gold=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[character.id])).rows[0]!.balance;
    const army=(await sql.query("SELECT quantity FROM army_stacks WHERE character_id=$1 AND unit_definition_id='militia'",[character.id])).rows[0]!.quantity;
    await ledger(sql,null,'development_account_baseline',[{characterId:character.id,amount:strategy.developmentAccount.gold-gold}],strategy.id);
    await sql.query("UPDATE army_stacks SET quantity=$2 WHERE character_id=$1 AND unit_definition_id='militia'",[character.id,strategy.developmentAccount.armyParticipants-1]);
    await sql.query('UPDATE characters SET legacy_army_floor=GREATEST(legacy_army_floor,$2),health=max_health,mana=max_mana,spirit=max_spirit,health_updated_at=$3,mana_updated_at=$3,spirit_updated_at=$3,attack_ready_at=$3,state_version=state_version+1 WHERE id=$1',[character.id,strategy.developmentAccount.armyParticipants,now]);
    await sql.query('UPDATE accounts SET password_hash=$2 WHERE id=$1',[account.id,passwordHash]);
    await sql.query('DELETE FROM sessions WHERE account_id=$1',[account.id]);
    await sql.query('UPDATE development_accounts SET baseline_version=$2,reset_at=$3 WHERE account_id=$1',[account.id,strategy.id,now]);
    await sql.query('INSERT INTO development_account_resets(id,account_id,ruleset_id,gold_before,gold_after,army_before,army_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),account.id,strategy.id,gold,strategy.developmentAccount.gold,army,strategy.developmentAccount.armyParticipants-1,now]);
    return {accountId:account.id as string,characterId:character.id as string,reset:true,initialized};
}

// No HTTP route invokes this. Only the explicitly armed pre-deploy entrypoint
// can reach this production bootstrap. Existing development CLIs stay blocked.
export async function assertPrivateAlphaBootstrapTarget(sql:Sql,env:NodeJS.ProcessEnv){
  requirePrivateAlphaInitialization(env);
  const tables=(await sql.query("SELECT to_regclass('private_alpha_initializations') AS journal,to_regclass('accounts') AS accounts")).rows[0]!;
  if(tables.journal&&(await sql.query('SELECT 1 FROM private_alpha_initializations WHERE id=$1',[privateAlphaInitializationId])).rows.length)return;
  if(tables.accounts){
    if((await sql.query('SELECT 1 FROM accounts LIMIT 1')).rows.length)
      throw new Error('Private alpha bootstrap requires an empty player realm. Existing records were not changed.');
  }else if((await sql.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind IN ('r','p') LIMIT 1")).rows.length){
    throw new Error('Private alpha bootstrap refuses an unrecognized nonempty schema.');
  }
}

export async function initializePrivateAlpha(db:Database,env:NodeJS.ProcessEnv){
  requirePrivateAlphaInitialization(env); // Before any SQL or password access.
  return transaction(db,async sql=>{
    await sql.query('SELECT pg_advisory_xact_lock(61824006)');
    const completed=(await sql.query('SELECT dev_account_id FROM private_alpha_initializations WHERE id=$1',[privateAlphaInitializationId])).rows[0];
    if(completed)return {initialized:false,alreadyInitialized:true,accountId:completed.dev_account_id as string,botsCreated:0};
    // Block concurrent registration while checking the first-deployment realm.
    // A nonempty/unmarked database is refused; there is no reset/adopt option.
    await sql.query('LOCK TABLE accounts IN SHARE ROW EXCLUSIVE MODE');
    if((await sql.query('SELECT 1 FROM accounts LIMIT 1')).rows.length||
      (await sql.query('SELECT 1 FROM characters LIMIT 1')).rows.length) {
      throw new Error('Private alpha bootstrap requires an empty player realm. Existing records were not changed.');
    }
    const password=env.KINGDOM_DEV_PASSWORD;
    if(!registration.safeParse({username:'dev',name:'Development Knight',password}).success)
      throw new Error('Set KINGDOM_DEV_PASSWORD as a sealed secret with 12–128 characters for first initialization.');
    const account=await provisionDevelopmentAccountInTransaction(sql,await hashPassword(password!),false);
    const bots=await provisionBotsInTransaction(sql,await hashPassword(randomUUID()+randomUUID()));
    if(bots.active!==450||bots.created!==450||bots.upgraded)
      throw new Error('Private alpha bot population verification failed; initialization rolled back.');
    await reconcileLevelMilestones(sql);
    await sql.query(`INSERT INTO private_alpha_initializations(id,dev_account_id,content_ruleset_id,bot_catalog_id,bot_count,railway_service_id,railway_environment_id)
      VALUES($1,$2,$3,$4,450,$5,$6)`,[privateAlphaInitializationId,account.accountId,alpha.id,botCatalog.id,env.RAILWAY_SERVICE_ID,env.RAILWAY_ENVIRONMENT_ID]);
    return {initialized:true,alreadyInitialized:false,accountId:account.accountId,botsCreated:bots.created};
  });
}

export async function assertPrivateAlphaInitialized(sql:Sql){
  const marker=(await sql.query('SELECT dev_account_id FROM private_alpha_initializations WHERE id=$1',[privateAlphaInitializationId])).rows[0];
  if(!marker)throw new Error('Private alpha is not initialized. Complete the explicitly armed Railway pre-deploy step before starting.');
}
