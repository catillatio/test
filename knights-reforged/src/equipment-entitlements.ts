import type {Sql} from './db.js';import {hudsonGrant,definitionDigest} from './expansion-content.js';
// One centralized identity/item entitlement. No name, username, Calling, client
// flag or global item-rate change can create this exception.
export async function upkeepExemptions(sql:Sql,characterId:string,expanded:boolean):Promise<ReadonlySet<string>>{
 if(!expanded||characterId!==hudsonGrant.characterId)return new Set();
 const rows=(await sql.query(`SELECT e.item_id FROM equipment_upkeep_entitlements e
 JOIN hudson_equipment_grants g ON g.id=e.grant_id JOIN characters c ON c.id=e.character_id
 WHERE e.character_id=$1 AND e.effective_at<=clock_timestamp() AND g.account_id=c.account_id
 AND g.id=$2 AND g.manifest_id=$3 AND g.manifest_digest=$4`,[characterId,hudsonGrant.operationId,hudsonGrant.id,definitionDigest(hudsonGrant)])).rows;
 return new Set(rows.map(r=>r.item_id).filter(id=>hudsonGrant.upkeepExemptItemIds.includes(id)));
}
