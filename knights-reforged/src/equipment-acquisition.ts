import {randomUUID} from 'node:crypto';
import type {Sql} from './db.js';
import {realmPolicy} from './realm-policy.js';
import {inventoryLimit} from './compatibility-rules.js';
import {expandedContent,equipmentCatalogFor,questRarities,hudsonGrant,definitionDigest} from './expansion-content.js';
import {GameError} from './errors.js';
// Internal transaction primitive only. Callers hold the character lock and
// authorize a quest run or the exact private grant; no command accepts a source.
export async function acquireQuestEquipment(sql:Sql,characterId:string,itemId:string,quantity:number,kind:'quest_drop'|'hudson_grant',sourceId:string,commandId:string,now:Date){
 const world=await realmPolicy(sql),item=equipmentCatalogFor(world.catalogId).definition(itemId);
 if(!world.expanded||world.catalogId!==expandedContent.id||item?.acquisition!=='quest-exclusive'||!Number.isInteger(quantity)||quantity<1||quantity>15)throw new GameError('ACQUISITION_DENIED','This acquisition is not authorized.',409);
 if(kind==='quest_drop'){if(quantity!==questRarities.quantity)throw new Error('Quest discoveries award exactly one item per opportunity.');const boundary=world.rareAuthorizationId?'(SELECT created_at FROM rare_equipment_authorizations WHERE id=$3)':'(SELECT activated_at FROM realm_expansion_state)';const source=(await sql.query(`SELECT r.quest_id,r.ruleset_id,c.attained_level,r.created_at>=${boundary} AS current_opportunity FROM quest_runs r JOIN characters c ON c.id=r.character_id WHERE r.id=$1 AND r.character_id=$2`,world.rareAuthorizationId?[sourceId,characterId,world.rareAuthorizationId]:[sourceId,characterId])).rows[0];if(!world.rareDrops||!source||source.ruleset_id!==expandedContent.id||source.attained_level<Math.max(71,expandedContent.quests.find(q=>q.id===source.quest_id)?.level??Infinity)||!source.current_opportunity||!questRarities.quests[source.quest_id]?.includes(itemId))throw new Error('Unauthorized quest acquisition source.');}
 else{const grant=(await sql.query('SELECT g.* FROM hudson_equipment_grants g JOIN characters c ON c.id=g.character_id AND c.account_id=g.account_id WHERE g.id=$1 AND g.character_id=$2',[sourceId,characterId])).rows[0];if(characterId!==hudsonGrant.characterId||sourceId!==hudsonGrant.operationId||!grant||grant.manifest_digest!==definitionDigest(hudsonGrant)||!hudsonGrant.items.some(i=>i.itemId===itemId&&i.quantity===quantity))throw new Error('Unauthorized private grant source.');}
 const previous=(await sql.query('SELECT * FROM inventory_acquisition_events WHERE character_id=$1 AND source_kind=$2 AND source_id=$3 AND item_id=$4',[characterId,kind,sourceId,itemId])).rows[0];
 if(previous){if(previous.quantity!==quantity||previous.command_id!==commandId)throw new Error('Acquisition identity mismatch.');return {id:previous.id as string,inventoryId:previous.inventory_entry_id as string,replayed:true};}
 const owned=(await sql.query('SELECT quantity FROM inventory_entries WHERE character_id=$1 AND item_definition_id=$2 FOR UPDATE',[characterId,itemId])).rows[0]?.quantity??0;
 if(owned+quantity>inventoryLimit(world.inventoryPolicy))return null;
 const accounted=Number((await sql.query('SELECT COALESCE(sum(l.remaining_quantity),0)::int AS n FROM inventory_lots l JOIN inventory_entries e ON e.id=l.inventory_entry_id WHERE e.character_id=$1 AND e.item_definition_id=$2',[characterId,itemId])).rows[0]!.n);if(accounted!==owned)throw new Error('Acquisition inventory history mismatch.');
 const entry=(await sql.query(`INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity,acquired_at) VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(character_id,item_definition_id) DO UPDATE SET quantity=inventory_entries.quantity+EXCLUDED.quantity RETURNING id`,[randomUUID(),characterId,itemId,world.catalogId,quantity,now])).rows[0]!;
 const lotId=randomUUID(),id=randomUUID();
 await sql.query(`INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,command_id,acquired_at) VALUES($1,$2,$3,$4,$5,$5,0,$6,$7)`,[lotId,entry.id,characterId,world.catalogId,quantity,commandId,now]);
 await sql.query(`INSERT INTO inventory_transactions(id,character_id,item_id,kind,quantity,gold_amount,ruleset_id,command_id) VALUES($1,$2,$3,$4,$5,0,$6,$7)`,[randomUUID(),characterId,itemId,kind,quantity,world.catalogId,commandId]);
 await sql.query(`INSERT INTO inventory_acquisition_events(id,character_id,inventory_entry_id,lot_id,item_id,quantity,unit_cost,source_kind,source_id,command_id,ruleset_id) VALUES($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10)`,[id,characterId,entry.id,lotId,itemId,quantity,kind,sourceId,commandId,world.catalogId]);
 return {id,inventoryId:entry.id as string,replayed:false};
}
