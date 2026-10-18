import {randomUUID} from 'node:crypto';
import {type Sql} from './db.js';
import {ledger} from './economy.js';
import {GameError} from './errors.js';
import {healingQuote,gameplay} from './gameplay-rules.js';
export async function restoreHealth(sql:Sql,character:{id:string;health:number;max_health:number;attained_level:number},gold:number,commandId:string,now:Date,maxCost?:number){
 const quote=healingQuote(character.health,character.max_health,character.attained_level,gold);
 if(maxCost!==undefined&&quote.cost>maxCost)throw new GameError('HEALING_CHANGED','Your healing cost changed. Review the updated amount before healing.',409);
 if(!quote.affordable)throw new GameError('INSUFFICIENT_GOLD','You need '+quote.shortfall+' more gold to restore your Health.',409);
 if(quote.cost)await ledger(sql,commandId,'health_restoration',[{characterId:character.id,amount:-quote.cost}],gameplay.id);
 if(quote.missing){
  await sql.query('UPDATE characters SET health=max_health,health_updated_at=$2 WHERE id=$1',[character.id,now]);
  await sql.query('INSERT INTO health_restorations(id,character_id,command_id,health_before,health_after,max_health,level,gold_cost,ruleset_id,created_at) VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,$9)',[randomUUID(),character.id,commandId,quote.health,quote.maxHealth,character.attained_level,quote.cost,gameplay.id,now]);
 }
 return {...quote,healthAfter:quote.maxHealth};
}
