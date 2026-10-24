import {randomUUID} from 'node:crypto';
import {type Database,type Sql,transaction} from './db.js';
import {GameError} from './errors.js';
import {propertyName} from './property-presentation.js';
import {propertyById,alpha,propertyQuote} from './alpha-rules.js';
import {clock,lockCharacters,materialize,stateFrom} from './game.js';
import {realmPolicy} from './realm-policy.js';import {contentCatalog} from './expansion-content.js';
export async function propertyTrade(sql:Sql,characterId:string,kind:'land_buy'|'land_sell',propertyId:string,quantity:number,gold:number,level:number,currentNet:number){
 const alpha=contentCatalog((await realmPolicy(sql)).catalogId),propertyById=new Map(alpha.properties.map(p=>[p.id,p]));
 const property=propertyById.get(propertyId);if(!property)throw new GameError('PROPERTY_NOT_FOUND','That property is not available.',404);
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>alpha.limits.landTransaction)throw new GameError('INVALID_QUANTITY','Choose 1–25 properties.');
 const owned=(await sql.query('SELECT COALESCE(sum(quantity),0)::int AS n FROM land_holdings WHERE character_id=$1 AND property_id=$2',[characterId,propertyId])).rows[0]!.n as number;
 let amount=0,netChange=quantity*(property.hourlyIncome-property.hourlyUpkeep);
 if(kind==='land_buy'){
  if(level<property.level)throw new GameError('LEVEL_REQUIRED','Reach level '+property.level+' first.',409);
  if(owned+quantity>alpha.limits.property)throw new GameError('LAND_LIMIT','The ownership limit has been reached.',409);
  try{amount=propertyQuote(property.price,owned,quantity).reduce((n,p)=>n+p,0);}catch(error){if(!(error instanceof RangeError))throw error;throw new GameError('TRANSACTION_LIMIT','That progressive purchase exceeds the carried-gold transaction limit.',409);}
  if(!Number.isSafeInteger(amount)||amount>2147483647)throw new GameError('TRANSACTION_LIMIT','Choose a smaller batch.',409);
  if(amount>gold)throw new GameError('INSUFFICIENT_GOLD','You need '+(amount-gold)+' more gold for this purchase.',409);
 }else{
  if(quantity>owned)throw new GameError('PROPERTY_NOT_OWNED','You do not own that many properties.',409);
  const holdings=(await sql.query('SELECT quantity,unit_price,hourly_income,hourly_upkeep FROM land_holdings WHERE character_id=$1 AND property_id=$2 AND quantity>0 ORDER BY acquired_at,purchase_order,id',[characterId,propertyId])).rows;
  netChange=0;let left=quantity;for(const holding of holdings){const sold=Math.min(left,holding.quantity);amount+=sold*Math.floor(holding.unit_price/2);netChange+=sold*(holding.hourly_income-holding.hourly_upkeep);left-=sold;}
 }
 return {property:{...property,name:propertyName(property.id,property.name)},quantity,amount,owned,projectedNet:currentNet+(kind==='land_buy'?1:-1)*netChange};
}
export async function createTradeQuote(db:Database,accountId:string,kind:'land_buy'|'land_sell',propertyId:string,quantity:number,runtime={}){
 return transaction(db,async sql=>{
  const id=(await sql.query('SELECT id FROM characters WHERE account_id=$1',[accountId])).rows[0]?.id as string|undefined;
  if(!id)throw new GameError('CHARACTER_NOT_FOUND','Your character was not found.',404);
  const [raw]=await lockCharacters(sql,[id]),now=await clock(sql);const state=await stateFrom(sql,await materialize(sql,raw!,now),now,runtime);
  const count=(await sql.query("SELECT count(*)::int AS n FROM trade_quotes WHERE account_id=$1 AND created_at>$2",[accountId,new Date(+now-60000)])).rows[0]!.n;
  if(count>=30)throw new GameError('QUOTE_THROTTLED','Review your existing confirmation or wait a minute.',429);
  const quote=await propertyTrade(sql,id,kind,propertyId,quantity,state.gold,state.level,state.economy.netHourlyIncome),quoteId=randomUUID(),expiresAt=new Date(+now+300000);
  await sql.query('INSERT INTO trade_quotes(id,account_id,character_id,kind,property_id,quantity,gold_amount,projected_net_hourly,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[quoteId,accountId,id,kind,propertyId,quantity,quote.amount,quote.projectedNet,expiresAt]);
  return {...quote,id:quoteId,kind,expiresAt:expiresAt.toISOString(),state};
 });
}
export async function validateTradeQuote(sql:Sql,quoteId:string,accountId:string,characterId:string,kind:'land_buy'|'land_sell',propertyId:string,quantity:number,now:Date,gold:number,level:number,currentNet:number,commandId:string){
 const quote=(await sql.query('SELECT * FROM trade_quotes WHERE id=$1 AND account_id=$2 AND character_id=$3 FOR UPDATE',[quoteId,accountId,characterId])).rows[0];
 if(quote?.consumed_command)throw new GameError('QUOTE_USED','This confirmation was already used. Open a fresh purchase or sale.',409);
 if(!quote||quote.kind!==kind||quote.property_id!==propertyId||quote.quantity!==quantity||+new Date(quote.expires_at)<=+now)throw new GameError('QUOTE_EXPIRED','This confirmation expired or belongs to another action. Review the property again.',409);
 const current=await propertyTrade(sql,characterId,kind,propertyId,quantity,gold,level,currentNet);
 if(Number(quote.gold_amount)!==current.amount||Number(quote.projected_net_hourly)!==current.projectedNet)throw new GameError('QUOTE_CHANGED','Your holdings or income changed. Review the updated price and income before confirming.',409);
 await sql.query('UPDATE trade_quotes SET consumed_command=$2,consumed_at=$3 WHERE id=$1',[quoteId,commandId,now]);
}
