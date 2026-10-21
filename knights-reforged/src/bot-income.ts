import {type Database,transaction} from './db.js';
import {clock,materialize,type CharacterRow} from './game.js';
import {gameFeel} from './game-feel-rules.js';

// Housekeeping, never provisioning. Ordinary saved Land clocks are the sole
// income source. Locks are shared with combat; another worker skips busy bots.
const dueIncome=`i.next_payment_at<=$1 OR (i.character_id IS NULL AND EXISTS(
 SELECT 1 FROM land_holdings h WHERE h.character_id=c.id AND h.quantity>0 AND h.accrued_through<=$1::timestamptz-interval '1 hour'))`;
export async function settleDueBotIncome(db:Database,enabled:boolean){
 if(!enabled)return {settled:0,batches:0};
 let settled=0,batches=0;
 for(;batches<gameFeel.botIncome.maximumBatches;batches++){
  const count=await transaction(db,async sql=>{
   const now=await clock(sql);
   const rows=(await sql.query<CharacterRow>(`SELECT c.*,true AS development_bot FROM characters c
    JOIN development_bots b ON b.character_id=c.id AND b.active
    LEFT JOIN income_cycles i ON i.character_id=c.id
    WHERE ${dueIncome}
    ORDER BY i.next_payment_at NULLS FIRST,c.id LIMIT $2 FOR UPDATE OF c SKIP LOCKED`,[now,gameFeel.botIncome.batchSize])).rows;
   if(!rows.length)return 0;
   // READ COMMITTED can retain the old joined cycle snapshot while acquiring
   // a character row just committed by another sweeper. Recheck all candidates
   // in one fresh statement, after their character locks are ours. Payouts
   // already revalidate their cursors; this also avoids redundant upkeep and
   // resource materialization and counts only genuinely due bots.
   const due=new Set((await sql.query<{id:string}>(`SELECT c.id FROM characters c
    LEFT JOIN income_cycles i ON i.character_id=c.id
    WHERE c.id=ANY($2::uuid[]) AND (${dueIncome})`,[now,rows.map(r=>r.id)])).rows.map(r=>r.id));
   for(const row of rows)if(due.has(row.id))await materialize(sql,row,now);
   return due.size;
  });
  settled+=count;if(!count)break;
 }
 return {settled,batches};
}
export function startBotIncome(db:Database,enabled:boolean,onError:(error:unknown)=>void){
 let pending:Promise<unknown>|null=null,stopped=false;
 const tick=()=>{if(stopped||pending||!enabled)return;pending=settleDueBotIncome(db,true).catch(onError).finally(()=>{pending=null;});};
 const timer=setInterval(tick,gameFeel.botIncome.intervalSeconds*1000);timer.unref();tick();
 return async()=>{stopped=true;clearInterval(timer);await pending;};
}
