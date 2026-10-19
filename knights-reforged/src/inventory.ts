import { randomUUID } from 'node:crypto';
import { type Sql } from './db.js';
import { GameError } from './errors.js';
import { alpha,itemById,type OwnedItem } from './alpha-rules.js';
import { ledger,creditGold } from './economy.js';
import {equipmentResale,gameFeel} from './game-feel-rules.js';

export async function readInventory(sql:Sql,characterId:string):Promise<OwnedItem[]> {
  const rows=(await sql.query('SELECT id,item_definition_id,quantity FROM inventory_entries WHERE character_id=$1 ORDER BY acquired_at,id',[characterId])).rows;
  const lots=(await sql.query('SELECT inventory_entry_id,remaining_quantity,unit_cost FROM inventory_lots WHERE character_id=$1 AND remaining_quantity>0 ORDER BY acquired_at,id',[characterId])).rows;
  return rows.map(row=> {
    const definition=itemById.get(row.item_definition_id);
    if (!definition) throw new GameError('CATALOG_MISSING','An owned item definition is unavailable; ownership is preserved.',503);
    const units=lots.filter(lot=>lot.inventory_entry_id===row.id).flatMap(lot=>Array.from({length:Math.min(alpha.limits.transaction,lot.remaining_quantity)},()=>equipmentResale(lot.unit_cost))).slice(0,alpha.limits.transaction);
    return {...definition,resaleSteps:units.map((_,i)=>units.slice(0,i+1).reduce((n,p)=>n+p,0)),maxSell:Math.min(row.quantity,alpha.limits.transaction),inventoryId:row.id as string,quantity:row.quantity as number};
  });
}

export async function purchaseItems(sql:Sql,characterId:string,level:number,requests:Record<string,number>,commandId:string,now:Date) {
  const inventory=await readInventory(sql,characterId); let cost=0;
  const entries=Object.entries(requests).filter(([,quantity])=>quantity>0);
  if (!entries.length) throw new GameError('NOTHING_MISSING','You already own the required equipment.',409);
  for (const [id,quantity] of entries) {
    const item=itemById.get(id);
    if (!item) throw new GameError('ITEM_NOT_FOUND','That item is not in the active catalog.',404);
    if (level<item.level) throw new GameError('LEVEL_REQUIRED',`${item.name} unlocks at level ${item.level}.`,409);
    if (!Number.isSafeInteger(quantity)||quantity<1||quantity>alpha.limits.transaction) throw new GameError('INVALID_QUANTITY','Choose a valid whole quantity.');
    if ((inventory.find(i=>i.id===id)?.quantity??0)+quantity>alpha.limits.inventory) throw new GameError('INVENTORY_LIMIT','You cannot own more copies of that item.',409);
    cost+=quantity*item.price;
  }
  if (!Number.isSafeInteger(cost)||cost>2147483647) throw new GameError('TRANSACTION_LIMIT','The purchase exceeds treasury limits.',409);
  await ledger(sql,commandId,'equipment_purchase',[{characterId,amount:-cost}],alpha.id);
  const acquired:Record<string,string>={};
  for (const [id,quantity] of entries) {
    const item=itemById.get(id)!;
    const entry=(await sql.query(`INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity,acquired_at)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(character_id,item_definition_id) DO UPDATE SET quantity=inventory_entries.quantity+EXCLUDED.quantity RETURNING id`,
      [randomUUID(),characterId,id,alpha.id,quantity,now])).rows[0]!;
    acquired[id]=entry.id;
    await sql.query(`INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,command_id,acquired_at)
      VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8)`,[randomUUID(),entry.id,characterId,alpha.id,quantity,item.price,commandId,now]);
    await sql.query('INSERT INTO inventory_transactions(id,character_id,item_id,kind,quantity,gold_amount,ruleset_id,command_id) VALUES($1,$2,$3,\'buy\',$4,$5,$6,$7)',
      [randomUUID(),characterId,id,quantity,quantity*item.price,alpha.id,commandId]);
  }
  return {cost,acquired};
}

export async function sellItem(sql:Sql,characterId:string,itemId:string,quantity:number,commandId:string) {
  const item=(await readInventory(sql,characterId)).find(i=>i.id===itemId);
  if (!item||item.quantity<quantity) throw new GameError('ITEM_NOT_OWNED','You do not own that many copies.',409);
  const lots=(await sql.query('SELECT * FROM inventory_lots WHERE inventory_entry_id=$1 AND remaining_quantity>0 ORDER BY acquired_at,id FOR UPDATE',[item.inventoryId])).rows;
  if (lots.reduce((n,lot)=>n+lot.remaining_quantity,0)!==item.quantity) throw new GameError('INVENTORY_INCONSISTENT','Inventory history needs repair; no transaction was performed.',409);
  let left=quantity;let refund=0;
  for (const lot of lots) {
    const sold=Math.min(left,lot.remaining_quantity);if (!sold) break;
    refund+=sold*equipmentResale(lot.unit_cost);
    await sql.query('UPDATE inventory_lots SET remaining_quantity=remaining_quantity-$2 WHERE id=$1',[lot.id,sold]);left-=sold;
  }
  await sql.query('UPDATE inventory_entries SET quantity=quantity-$2 WHERE id=$1',[item.inventoryId,quantity]);
  if (item.quantity===quantity) await sql.query('DELETE FROM equipment_slots WHERE inventory_entry_id=$1',[item.inventoryId]);
  await creditGold(sql,characterId,BigInt(refund),commandId,'equipment_sale',gameFeel.id);
  await sql.query('INSERT INTO inventory_transactions(id,character_id,item_id,kind,quantity,gold_amount,ruleset_id,command_id) VALUES($1,$2,$3,\'sell\',$4,$5,$6,$7)',
    [randomUUID(),characterId,itemId,quantity,refund,gameFeel.id,commandId]);
  return refund;
}
