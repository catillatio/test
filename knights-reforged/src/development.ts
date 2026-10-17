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
import {materialize,type CharacterRow} from './game.js';

export interface DevelopmentPermission{nodeEnv:string;allowProvisioning:boolean;}
export function requireDevelopment(permission:DevelopmentPermission){
  if(!['development','test'].includes(permission.nodeEnv)||!permission.allowProvisioning)
    throw new Error('Development provisioning requires NODE_ENV=development and ALLOW_DEV_PROVISIONING=1; production is prohibited.');
}
interface BotBlueprint{name:string;calling:Calling;participants:number;quantity:number;quantities:Record<string,number>;items:ItemDefinition[];training:number;health:number;mana:number;spirit:number;gold:number;}
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
export function botGoldAllowance(level:number,tier:string){
  const policy=refinements.bots,profile=botCatalog.profiles[tier];
  if(!profile||!Number.isInteger(level)||level<1||level>50)throw new RangeError('Invalid rival allowance.');
  return Math.floor((policy.walletBase+level*policy.walletPerLevel+level*level*policy.walletPerLevelSquared)*profile.goldPercent/100);
}
export function botBlueprint(level:number,tier:string){
  const cached=blueprints.get(level+':'+tier);if(cached)return cached;
  const index=strategy.bots.tiers.indexOf(tier);
  if(!Number.isInteger(level)||level<1||level>50||index<0)throw new RangeError('Invalid temporary rival.');
  const profile=botCatalog.profiles[tier]!;
  const capacity=Math.min(botCatalog.armyCap,1+Math.floor(level/botCatalog.levelsPerArmyMember),activeArmy(level,alpha.limits.mercenaries,0).participants);let participants=Math.max(1,Math.round(capacity*profile.armyPercent/100));
  const itemLevel=Math.max(1,level-profile.itemLevelLag);
  const items=(['weapon','armor','spell'] as const).map(category=>alpha.items.filter(item=>item.category===category&&item.level<=itemLevel)
    .sort((a,b)=>b.defense-a.defense||b.attack-a.attack||a.id.localeCompare(b.id))[0]!);
  const calling=profile.calling,training=Math.min(25,Math.floor(level/profile.levelsPerTraining));
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
  const result:BotBlueprint={name:botCatalog.names[level-1]+' '+profile.surname,calling,
    participants,quantity:Math.max(...Object.values(quantities)),quantities,items,training,
    health:botCatalog.healthBase+Math.floor(level/botCatalog.levelsPerHealthUpgrade)*botCatalog.healthPerUpgrade+profile.healthBonus,mana:botCatalog.manaBase+Math.floor(level/botCatalog.levelsPerManaUpgrade),spirit:botCatalog.spiritBase+Math.floor(level/botCatalog.levelsPerSpiritUpgrade),gold:botGoldAllowance(level,tier)};
  blueprints.set(level+':'+tier,result);return result;
}
export async function provisionBots(db:Database,permission:DevelopmentPermission,disable=false){
  requireDevelopment(permission);
  const disabledPasswordHash=disable?'':await hashPassword(randomUUID()+randomUUID());
  return transaction(db,async sql=>{
    await sql.query('SELECT pg_advisory_xact_lock(61824006)');
    if(disable){await sql.query('UPDATE development_bots SET active=false');return {created:0,active:0};}
    let created=0,upgraded=0;
    const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
    for(let level=1;level<=50;level++)for(const tier of strategy.bots.tiers){
      const key=`${botCatalog.id}:${level}:${tier}`;
      const old=(await sql.query('SELECT b.character_id,b.population_version FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=$1 AND b.tier=$2',[level,tier])).rows[0];
      if(old?.population_version===botCatalog.id){await sql.query('UPDATE development_bots SET active=true WHERE character_id=$1',[old.character_id]);continue;}
      const blueprint=botBlueprint(level,tier),accountId=randomUUID(),id=old?old.character_id as string:randomUUID();
      const xp=Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0);
      if(!old){
        await sql.query('INSERT INTO accounts(id,username,password_hash,login_disabled) VALUES($1,$2,$3,true)',[accountId,`_npc_${level}_${tier}`,disabledPasswordHash]);
        await sql.query(`INSERT INTO characters(id,account_id,name,attained_level,xp,level_xp,profile_class,max_health,health,attack_training,defense_training,max_mana,mana,max_spirit,spirit)
        VALUES($1,$2,$3,$4,$5,0,$6,$7,$7,$8,$8,$9,$9,$10,$10)`,[id,accountId,blueprint.name,level,xp,blueprint.calling,blueprint.health,blueprint.training,blueprint.mana,blueprint.spirit]);
        await sql.query('INSERT INTO wallets(character_id,balance) VALUES($1,0)',[id]);
        await ledger(sql,null,'development_bot_allowance',[{characterId:id,amount:blueprint.gold}],refinements.id);
        await sql.query("INSERT INTO army_stacks(character_id,unit_definition_id,quantity) VALUES($1,'militia',$2)",[id,blueprint.participants-1]);
      }else{
        await sql.query('UPDATE characters SET profile_class=$2,max_health=$3,health=LEAST(health,$3),attack_training=$5,defense_training=$5,legacy_army_floor=LEAST(legacy_army_floor,$4),max_mana=$6,mana=LEAST(mana,$6),max_spirit=$7,spirit=LEAST(spirit,$7),state_version=state_version+1 WHERE id=$1',[id,blueprint.calling,blueprint.health,refinements.bots.armyCap,blueprint.training,blueprint.mana,blueprint.spirit]);
        await sql.query("UPDATE army_stacks SET quantity=$2 WHERE character_id=$1 AND unit_definition_id='militia'",[id,blueprint.participants-1]);
        await sql.query('UPDATE inventory_entries SET quantity=0 WHERE character_id=$1',[id]);
        await sql.query('UPDATE inventory_lots SET remaining_quantity=0 WHERE character_id=$1',[id]);
      }
      if(old){const balance=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[id])).rows[0]!.balance;await creditGold(sql,id,BigInt(Math.max(0,blueprint.gold-balance)),null,'development_bot_catalog_allowance',refinements.id);}
      let rate=0;
      for(const item of blueprint.items){
        const quantity=blueprint.quantities[item.id]!;if(!quantity)continue;rate+=item.upkeep*quantity;
        const entry=(await sql.query('INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity,acquired_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(character_id,item_definition_id) DO UPDATE SET quantity=EXCLUDED.quantity RETURNING id',[randomUUID(),id,item.id,alpha.id,quantity,now])).rows[0]!.id;
        await sql.query(`INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,acquired_at)
          VALUES($1,$2,$3,$4,$5,$5,0,$6)`,[randomUUID(),entry,id,alpha.id,quantity,now]);
      }
      await sql.query('INSERT INTO maintenance_accounts(character_id,hourly_rate,reserve_gold,settled_at) VALUES($1,$2,$3,$4) ON CONFLICT(character_id) DO UPDATE SET hourly_rate=EXCLUDED.hourly_rate,reserve_gold=EXCLUDED.reserve_gold,arrears_gold=0,remainder=0,paused=false,settled_at=EXCLUDED.settled_at',[id,rate,String(rate*strategy.bots.maintenanceHours),now]);
      await sql.query('INSERT INTO development_bots(character_id,population_key,population_version,tier,refilled_at,recovered_at,ruleset_id) VALUES($1,$2,$3,$4,$5,$5,$6) ON CONFLICT(character_id) DO UPDATE SET population_key=EXCLUDED.population_key,population_version=EXCLUDED.population_version,active=true,recovered_at=EXCLUDED.recovered_at,ruleset_id=EXCLUDED.ruleset_id',[id,key,botCatalog.id,tier,now,refinements.id]);
      await sql.query("INSERT INTO development_bot_events(id,character_id,kind,details,created_at) VALUES($1,$2,'provision',$3,$4)",[randomUUID(),id,{level,tier,participants:blueprint.participants,quantities:blueprint.quantities,maintenanceReserve:rate*strategy.bots.maintenanceHours,upgradedFrom:old?.population_version??null},now]);
      if(old)upgraded++;else created++;
    }
    return {created,upgraded,active:Number((await sql.query('SELECT count(*)::int AS n FROM development_bots WHERE active')).rows[0]!.n)};
  });
}
// Caller already owns this character's lock. Passive rivals never run commands.
export async function prepareBot(sql:Sql,id:string,now:Date,enabled:boolean){
  const bot=(await sql.query('SELECT * FROM development_bots WHERE character_id=$1 FOR UPDATE',[id])).rows[0];
  if(!bot)return false;
  if(!enabled||!bot.active)throw new GameError('BOT_UNAVAILABLE','Temporary development rivals are disabled.',409);
  if(+now-+new Date(bot.refilled_at)>=86400000){
    const level=(await sql.query('SELECT attained_level FROM characters WHERE id=$1',[id])).rows[0]!.attained_level;
    const balance=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[id])).rows[0]!.balance;
    const amount=Math.max(0,botGoldAllowance(level,bot.tier)-balance);
    await creditGold(sql,id,BigInt(amount),null,'development_bot_allowance',refinements.id);
    await sql.query('UPDATE maintenance_accounts SET reserve_gold=hourly_rate*$2,arrears_gold=0,paused=false,remainder=0,settled_at=$3 WHERE character_id=$1',[id,strategy.bots.maintenanceHours,now]);
    await sql.query('UPDATE development_bots SET refilled_at=$2 WHERE character_id=$1',[id,now]);
    await sql.query("INSERT INTO development_bot_events(id,character_id,kind,details,created_at) VALUES($1,$2,'refresh',$3,$4)",[randomUUID(),id,{goldAdded:amount,maintenanceHours:strategy.bots.maintenanceHours},now]);
  }
  return true;
}
export async function provisionDevelopmentAccount(db:Database,permission:DevelopmentPermission,password:string,reset=false){
  requireDevelopment(permission);
  registration.parse({username:'dev',name:'Development Knight',password});
  const passwordHash=await hashPassword(password);
  return transaction(db,async sql=>{
    await sql.query('SELECT pg_advisory_xact_lock(61824006)');
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
  });
}
