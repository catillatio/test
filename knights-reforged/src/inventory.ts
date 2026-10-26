import {presentedItem} from './equipment-presentation.js';
import { randomUUID } from 'node:crypto';
import { type Sql } from './db.js';
import { GameError } from './errors.js';
import { alpha,type OwnedItem } from './alpha-rules.js';
import { ledger,creditGold } from './economy.js';
import {equipmentResale,gameFeel} from './game-feel-rules.js';
import {inventoryLimit} from './compatibility-rules.js';
import {activeEquipmentCatalog} from './catalog-compatibility.js';
import {realmPolicy} from './realm-policy.js';
import {equipmentCatalogFor} from './expansion-content.js';
import {upkeepExemptions} from './equipment-entitlements.js';

export function fifoResaleSteps(lots:Iterable<{remaining_quantity:number;unit_cost:number}>,maximum=alpha.limits.transaction){
 if(!Number.isSafeInteger(maximum)||maximum<1||maximum>alpha.limits.transaction)throw new RangeError('Invalid resale preview.');
 const steps:number[]=[];let total=0;
 for(const lot of lots){const count=Math.min(maximum-steps.length,lot.remaining_quantity),refund=equipmentResale(lot.unit_cost);
  for(let n=0;n<count;n++){total+=refund;steps.push(total);}if(steps.length===maximum)break;}
 return steps;
}

export async function readInventory(sql:Sql,characterId:string):Promise<OwnedItem[]> {
  const world=await realmPolicy(sql),catalog=equipmentCatalogFor(world.catalogId),exempt=await upkeepExemptions(sql,characterId,world.expanded);
  const rows=(await sql.query('SELECT id,item_definition_id,quantity FROM inventory_entries WHERE character_id=$1 ORDER BY acquired_at,id',[characterId])).rows;
  // At most 100 positive lots per entry are needed to quote a 100-unit sale.
  // The indexed bounded prefix is filtered again by preceding quantities, so a
  // 5,000-unit first lot returns one row, not thousands of historical prices.
  const lots=(await sql.query<{inventory_entry_id:string;remaining_quantity:number;unit_cost:number}>(`SELECT i.id AS inventory_entry_id,p.remaining_quantity,p.unit_cost FROM inventory_entries i
    CROSS JOIN LATERAL (SELECT b.*,COALESCE(sum(b.remaining_quantity) OVER(ORDER BY b.acquired_at,b.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior
     FROM (SELECT id,acquired_at,remaining_quantity,unit_cost FROM inventory_lots WHERE inventory_entry_id=i.id AND remaining_quantity>0 ORDER BY acquired_at,id LIMIT $2) b) p
    WHERE i.character_id=$1 AND p.prior<$2 ORDER BY i.id,p.acquired_at,p.id`,[characterId,alpha.limits.transaction])).rows;
  const byEntry=new Map<string,typeof lots>();for(const lot of lots){const values=byEntry.get(lot.inventory_entry_id)??[];values.push(lot);byEntry.set(lot.inventory_entry_id,values);}
  return rows.map(row=> {
    const definition=catalog.definition(row.item_definition_id);
    if (!definition) throw new GameError('CATALOG_MISSING','An owned item definition is unavailable; ownership is preserved.',503);
    return {...presentedItem(definition,world.presentationId),...(exempt.has(definition.id)?{maintenanceExempt:true,effectiveUpkeep:0}:{}),resaleSteps:fifoResaleSteps(byEntry.get(row.id)??[]),maxSell:Math.min(row.quantity,alpha.limits.transaction),inventoryId:row.id as string,quantity:row.quantity as number};
  });
}

export async function purchaseItems(sql:Sql,characterId:string,level:number,requests:Record<string,number>,commandId:string,now:Date) {
  const world=await realmPolicy(sql),catalog=equipmentCatalogFor(world.catalogId);
  const bot=world.expanded&&(await sql.query('SELECT 1 FROM development_bots WHERE character_id=$1',[characterId])).rows.length>0;
  const inventory=await readInventory(sql,characterId); let cost=0;
  const entries=Object.entries(requests).filter(([,quantity])=>quantity>0);
  if (!entries.length) throw new GameError('NOTHING_MISSING','You already own the required equipment.',409);
  for (const [id,quantity] of entries) {
    const item=catalog.purchasableDefinition(id);
    if(catalog.definition(id)?.acquisition==='quest-exclusive')throw new GameError('QUEST_EXCLUSIVE','This equipment can only be discovered in eligible quests.',409);
    if (!item) throw new GameError('ITEM_NOT_FOUND','That item is not in the active catalog.',404);
    if (!catalog.canPurchase(id,level)) throw new GameError('LEVEL_REQUIRED',`${presentedItem(item,world.presentationId).name} unlocks at level ${catalog.purchaseLevel(id)}.`,409);
    if (!Number.isSafeInteger(quantity)||quantity<1||quantity>alpha.limits.transaction) throw new GameError('INVALID_QUANTITY','Choose a valid whole quantity.');
    if ((inventory.find(i=>i.id===id)?.quantity??0)+quantity>inventoryLimit(bot?'inventory-legacy-1':world.inventoryPolicy)) throw new GameError('INVENTORY_LIMIT','You cannot own more copies of that item.',409);
    cost+=quantity*item.price;
  }
  if (!Number.isSafeInteger(cost)||cost>2147483647) throw new GameError('TRANSACTION_LIMIT','The purchase exceeds treasury limits.',409);
  await ledger(sql,commandId,'equipment_purchase',[{characterId,amount:-cost}],catalog.id);
  const acquired:Record<string,string>={};
  for (const [id,quantity] of entries) {
    const item=catalog.definition(id)!;
    const entry=(await sql.query(`INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity,acquired_at)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(character_id,item_definition_id) DO UPDATE SET quantity=inventory_entries.quantity+EXCLUDED.quantity RETURNING id`,
      [randomUUID(),characterId,id,catalog.id,quantity,now])).rows[0]!;
    acquired[id]=entry.id;
    await sql.query(`INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,command_id,acquired_at)
      VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8)`,[randomUUID(),entry.id,characterId,catalog.id,quantity,item.price,commandId,now]);
    await sql.query('INSERT INTO inventory_transactions(id,character_id,item_id,kind,quantity,gold_amount,ruleset_id,command_id) VALUES($1,$2,$3,\'buy\',$4,$5,$6,$7)',
      [randomUUID(),characterId,id,quantity,quantity*item.price,catalog.id,commandId]);
  }
  return {cost,acquired};
}

export async function sellItem(sql:Sql,characterId:string,itemId:string,quantity:number,commandId:string) {
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>alpha.limits.transaction)throw new GameError('INVALID_QUANTITY','Choose a valid whole quantity.');
  const item=(await readInventory(sql,characterId)).find(i=>i.id===itemId);
  if (!item||item.quantity<quantity) throw new GameError('ITEM_NOT_OWNED','You do not own that many copies.',409);
  const total=(await sql.query('SELECT COALESCE(sum(remaining_quantity),0)::int AS quantity FROM inventory_lots WHERE inventory_entry_id=$1 AND remaining_quantity>0',[item.inventoryId])).rows[0]!.quantity;
  if (total!==item.quantity) throw new GameError('INVENTORY_INCONSISTENT','Inventory history needs repair; no transaction was performed.',409);
  const lots=(await sql.query('SELECT * FROM inventory_lots WHERE inventory_entry_id=$1 AND remaining_quantity>0 ORDER BY acquired_at,id LIMIT $2 FOR UPDATE',[item.inventoryId,quantity])).rows;
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
