import { randomUUID } from 'node:crypto';
import { type Sql } from './db.js';
import { GameError } from './errors.js';
import { alpha,propertyById,propertyPrice,propertyQuote } from './alpha-rules.js';
import { getLandState,type LandState,type HoldingRow } from './land.js';
import { ledger,creditGold } from './economy.js';

export type EstateState = Omit<LandState,'properties'> & {
  equipmentUpkeep:number; totalUpkeep:number;
  properties:(LandState['properties'][number]&{level:number;unlocked:boolean;art:string;basePrice:number;priceSteps:number[]})[];
};
export async function estateState(sql:Sql,characterId:string,gold:number,equipmentUpkeep:number,level:number):Promise<EstateState> {
  const state=await getLandState(sql,characterId,gold);
  const properties=alpha.properties.map(property=> {
    const owned=state.holdings.filter(holding=>holding.propertyId===property.id).reduce((n,holding)=>n+holding.quantity,0);
    const remaining=Math.max(0,alpha.limits.property-owned);
    const maxPurchase=Math.min(remaining,alpha.limits.landTransaction);
    const priceSteps=Array.from({length:maxPurchase},(_,i)=>propertyPrice(property.price,owned+i));
    let total=0,maxAffordable=0;
    for (const price of priceSteps) { if (total+price>gold) break;total+=price;maxAffordable++; }
    return {...property,unlocked:level>=property.level,basePrice:property.price,price:propertyPrice(property.price,owned),owned,remaining,maxPurchase,maxAffordable,priceSteps};
  });
  return {...state,rulesetId:alpha.id,properties,equipmentUpkeep,totalUpkeep:state.hourlyUpkeep+equipmentUpkeep,
    netHourlyIncome:state.hourlyIncome-state.hourlyUpkeep-equipmentUpkeep};
}

export async function buyEstate(sql:Sql,characterId:string,level:number,propertyId:string,quantity:number,commandId:string,now:Date) {
  const property=propertyById.get(propertyId);
  if (!property) throw new GameError('PROPERTY_NOT_FOUND','That property is not available.',404);
  if (level<property.level) throw new GameError('LEVEL_REQUIRED',`${property.name} unlocks at level ${property.level}.`,409);
  const owned=(await sql.query('SELECT COALESCE(SUM(quantity),0)::int AS quantity FROM land_holdings WHERE character_id=$1 AND property_id=$2',[characterId,propertyId])).rows[0]!.quantity as number;
  if (owned+quantity>alpha.limits.property) throw new GameError('LAND_LIMIT','The property ownership limit has been reached.',409);
  const prices=propertyQuote(property.price,owned,quantity);const cost=prices.reduce((n,price)=>n+price,0);
  if(!Number.isSafeInteger(cost)||cost>2147483647)throw new GameError('TRANSACTION_LIMIT','That batch exceeds the carried-gold transaction limit. Buy a smaller quantity.',409);
  await ledger(sql,commandId,'land_purchase',[{characterId,amount:-cost}],alpha.id);
  let first='';
  // Each differently priced unit has a durable acquisition cost and the same
  // server purchase clock. Old multi-unit batches remain untouched.
  for (const price of prices) {
    const id=randomUUID();first ||= id;
    await sql.query(`INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through)
      VALUES($1,$2,$3,$4,$5,1,1,$6,$7,$8,3600,$9,$9)`,[id,characterId,propertyId,property.name,alpha.id,price,property.hourlyIncome,property.hourlyUpkeep,now]);
  }
  return {holdingId:first,cost};
}

export async function sellEstate(sql:Sql,characterId:string,propertyId:string,quantity:number,commandId:string,now:Date) {
  const batches=(await sql.query<HoldingRow>('SELECT * FROM land_holdings WHERE character_id=$1 AND property_id=$2 AND quantity>0 ORDER BY acquired_at,purchase_order,id FOR UPDATE',[characterId,propertyId])).rows;
  if (batches.reduce((n,batch)=>n+batch.quantity,0)<quantity) throw new GameError('PROPERTY_NOT_OWNED','You do not own that many properties.',409);
  let left=quantity;let refund=0;
  for (const batch of batches) {
    const sold=Math.min(left,batch.quantity);if (!sold) break;
    const unitRefund=Math.floor(batch.unit_price/2);refund+=unitRefund*sold;
    await sql.query('UPDATE land_holdings SET quantity=quantity-$2,closed_at=CASE WHEN quantity=$2 THEN $3 ELSE closed_at END WHERE id=$1',[batch.id,sold,now]);
    await sql.query('INSERT INTO land_sales(id,holding_id,character_id,quantity,unit_refund,ruleset_id,command_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(),batch.id,characterId,sold,unitRefund,alpha.id,commandId,now]);left-=sold;
  }
  await creditGold(sql,characterId,BigInt(refund),commandId,'land_sale',alpha.id);
  return refund;
}
