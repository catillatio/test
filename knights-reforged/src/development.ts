import {randomUUID} from 'node:crypto';
import type {Database,Sql} from './db.js';
import {transaction} from './db.js';
import {hashPassword,registration} from './auth.js';
import {alpha,activeArmy,levelRequirement} from './alpha-rules.js';
import {strategy} from './strategy-rules.js';
import {ledger,creditGold} from './economy.js';
import {GameError} from './errors.js';

export interface DevelopmentPermission{nodeEnv:string;allowProvisioning:boolean;}
export function requireDevelopment(permission:DevelopmentPermission){
  if(!['development','test'].includes(permission.nodeEnv)||!permission.allowProvisioning)
    throw new Error('Development provisioning requires NODE_ENV=development and ALLOW_DEV_PROVISIONING=1; production is prohibited.');
}
const botNames=['Alden','Branna','Corin','Dara','Elric','Fenna','Gareth','Hesta','Idris','Jora','Kael','Liora','Merric','Nerys','Orin','Petra','Quill','Riona','Soren','Tamsin','Ulric','Veya','Wystan','Xara','Yorick','Zella','Anwen','Bryn','Cedric','Delia','Eamon','Fara','Galen','Hilda','Isen','Jessam','Kellan','Lyra','Marek','Nessa','Odel','Perrin','Rhos','Selene','Torin','Una','Varric','Wren','Ysolda','Zephan'];
export function botBlueprint(level:number,tier:string){
  const index=strategy.bots.tiers.indexOf(tier);
  if(!Number.isInteger(level)||level<1||level>50||index<0)throw new RangeError('Invalid temporary rival.');
  const capacity=activeArmy(level,alpha.limits.mercenaries,0).participants,participants=Math.max(1,Math.round(capacity*[0.4,0.7,1][index]!));
  const itemLevel=Math.max(1,level-[6,2,0][index]!);
  const items=(['weapon','armor','spell'] as const).map(category=>alpha.items.filter(item=>item.category===category&&item.level<=itemLevel)
    .sort((a,b)=>b.level-a.level||(b.defense+b.attack*0.3)-(a.defense+a.attack*0.3)||a.id.localeCompare(b.id))[0]!);
  return {name:botNames[level-1]+' '+['Brook','Ironwood','Drake'][index],calling:(['Freeblade','Warden','Spellward'] as const)[(level+index)%3]!,
    participants,quantity:Math.max(1,Math.ceil(participants*[0.55,0.8,1][index]!)),items,training:Math.min(25,Math.floor(level/[12,6,3][index]!)),
    health:100+Math.floor(level/5)*10,gold:strategy.bots.walletBase+level*strategy.bots.walletPerLevel};
}
export async function provisionBots(db:Database,permission:DevelopmentPermission,disable=false){
  requireDevelopment(permission);
  const disabledPasswordHash=disable?'':await hashPassword(randomUUID()+randomUUID());
  return transaction(db,async sql=>{
    await sql.query('SELECT pg_advisory_xact_lock(61824006)');
    if(disable){await sql.query('UPDATE development_bots SET active=false');return {created:0,active:0};}
    let created=0;
    const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
    for(let level=1;level<=50;level++)for(const tier of strategy.bots.tiers){
      const key=`${strategy.bots.populationVersion}:${level}:${tier}`;
      const old=(await sql.query('SELECT character_id FROM development_bots WHERE population_key=$1',[key])).rows[0];
      if(old){await sql.query('UPDATE development_bots SET active=true WHERE character_id=$1',[old.character_id]);continue;}
      const blueprint=botBlueprint(level,tier),accountId=randomUUID(),id=randomUUID();
      await sql.query('INSERT INTO accounts(id,username,password_hash,login_disabled) VALUES($1,$2,$3,true)',[accountId,`_npc_${level}_${tier}`,disabledPasswordHash]);
      const xp=Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0);
      await sql.query(`INSERT INTO characters(id,account_id,name,attained_level,xp,level_xp,profile_class,max_health,health,attack_training,defense_training)
        VALUES($1,$2,$3,$4,$5,0,$6,$7,$7,$8,$8)`,[id,accountId,blueprint.name,level,xp,blueprint.calling,blueprint.health,blueprint.training]);
      await sql.query('INSERT INTO wallets(character_id,balance) VALUES($1,0)',[id]);
      await ledger(sql,null,'development_bot_allowance',[{characterId:id,amount:blueprint.gold}],strategy.id);
      await sql.query("INSERT INTO army_stacks(character_id,unit_definition_id,quantity) VALUES($1,'militia',$2)",[id,blueprint.participants-1]);
      let rate=0;
      for(const item of blueprint.items){
        const entry=randomUUID();rate+=item.upkeep*blueprint.quantity;
        await sql.query('INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity,acquired_at) VALUES($1,$2,$3,$4,$5,$6)',[entry,id,item.id,alpha.id,blueprint.quantity,now]);
        await sql.query(`INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,acquired_at)
          VALUES($1,$2,$3,$4,$5,$5,0,$6)`,[randomUUID(),entry,id,alpha.id,blueprint.quantity,now]);
      }
      await sql.query('INSERT INTO maintenance_accounts(character_id,hourly_rate,reserve_gold,settled_at) VALUES($1,$2,$3,$4)',[id,rate,String(rate*strategy.bots.maintenanceHours),now]);
      await sql.query('INSERT INTO development_bots(character_id,population_key,population_version,tier,refilled_at,recovered_at,ruleset_id) VALUES($1,$2,$3,$4,$5,$5,$6)',[id,key,strategy.bots.populationVersion,tier,now,strategy.id]);
      await sql.query("INSERT INTO development_bot_events(id,character_id,kind,details,created_at) VALUES($1,$2,'provision',$3,$4)",[randomUUID(),id,{level,tier,participants:blueprint.participants,maintenanceReserve:rate*strategy.bots.maintenanceHours},now]);
      created++;
    }
    return {created,active:Number((await sql.query('SELECT count(*)::int AS n FROM development_bots WHERE active')).rows[0]!.n)};
  });
}
// Caller already owns this character's lock. Passive rivals never run commands.
export async function prepareBot(sql:Sql,id:string,now:Date,enabled:boolean){
  const bot=(await sql.query('SELECT * FROM development_bots WHERE character_id=$1 FOR UPDATE',[id])).rows[0];
  if(!bot)return false;
  if(!enabled||!bot.active)throw new GameError('BOT_UNAVAILABLE','Temporary development rivals are disabled.',409);
  if(+now-+new Date(bot.recovered_at)>=strategy.bots.recoverySeconds*1000){
    await sql.query('UPDATE characters SET health=max_health,health_updated_at=$2 WHERE id=$1',[id,now]);
    await sql.query('UPDATE development_bots SET recovered_at=$2 WHERE character_id=$1',[id,now]);
    await sql.query("INSERT INTO development_bot_events(id,character_id,kind,details,created_at) VALUES($1,$2,'recovery','{}',$3)",[randomUUID(),id,now]);
  }
  if(+now-+new Date(bot.refilled_at)>=86400000){
    const level=(await sql.query('SELECT attained_level FROM characters WHERE id=$1',[id])).rows[0]!.attained_level;
    const balance=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[id])).rows[0]!.balance;
    const amount=Math.max(0,strategy.bots.walletBase+level*strategy.bots.walletPerLevel-balance);
    await creditGold(sql,id,BigInt(amount),null,'development_bot_allowance',strategy.id);
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
    const character=(await sql.query('SELECT * FROM characters WHERE account_id=$1 FOR UPDATE',[account.id])).rows[0]!;
    if(!reset&&!initialized&&account.baseline_version===strategy.id)return {accountId:account.id as string,characterId:character.id as string,reset:false,initialized:false};
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
