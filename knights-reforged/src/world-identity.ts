import type {Sql} from './db.js';
// No classification column is backfilled into existing saved characters. Older
// schemas cannot contain accountless characters; ordinary rows need no extra read.
export async function identifyWorldCharacter<T extends {id:string;account_id:string|null;identity_kind?:'human'|'abandoned'|'integrity_anchor';world_garrison?:number}>(sql:Sql,row:T):Promise<T&{identity_kind?:'human'|'abandoned'|'integrity_anchor';world_garrison?:number}>{
 if(row.account_id!==null)return row;
 const npc=(await sql.query('SELECT garrison FROM abandoned_kingdoms WHERE character_id=$1',[row.id])).rows[0];
 return {...row,identity_kind:npc?'abandoned':'integrity_anchor',...(npc?{world_garrison:npc.garrison}:{})};
}
