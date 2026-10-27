import {randomUUID} from 'node:crypto';
import type {Sql} from '../src/db.js';
// Disposable legacy-history fixture. It deliberately includes older rows without
// placed events; quotas count placement facts, never synthetic event counters.
export async function historicalPlacements(sql:Sql,sponsors:string[],target:string,count:number,now:Date,options:{at?:Date;missingPlacedEvents?:boolean;claimant?:string}={}){
 const rows=Array.from({length:count},(_,i)=>({id:randomUUID(),sponsor:sponsors[i%sponsors.length]!,target,command:randomUUID(),battle:randomUUID(),
  status:['canceled','expired','claimed'][i%3]!,created:(options.at??new Date(+now-14400000-i*1000)).toISOString()}));
 for(const row of rows){
  const claimant=row.status==='claimed'?options.claimant??sponsors[(sponsors.indexOf(row.sponsor)+1)%sponsors.length]:null;
  if(row.status==='claimed'&&claimant===row.sponsor)throw Error('History fixture needs a distinct claimant.');
  if(row.status==='claimed')await sql.query(`INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,created_at)
   VALUES($1,$2,$3,'alpha-0.3','defender_win','{}','{}',$4)`,[row.battle,claimant,target,new Date(+new Date(row.created)+60000)]);
  // Claimed fixture claimant differs from its sponsor, as the schema requires.
  await sql.query(`INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at,settled_at,claimant_id,battle_id)
   VALUES($1,$2,$3,1,1,$4,'pvp-economy-0.1',$5,$6,$7,$8,$9,$10)`,[row.id,row.sponsor,target,row.status,row.command,row.created,
   new Date(+new Date(row.created)+(row.status==='expired'?3600000:86400000)),new Date(+new Date(row.created)+3600000),claimant,row.status==='claimed'?row.battle:null]);
  if(!options.missingPlacedEvents||rows.indexOf(row)%2)await sql.query(`INSERT INTO bounty_events(id,bounty_id,kind,character_id,amount,command_id,created_at)
   VALUES($1,$2,'placed',$3,1,$4,$5)`,[randomUUID(),row.id,row.sponsor,row.command,row.created]);
  await sql.query(`INSERT INTO bounty_events(id,bounty_id,kind,character_id,amount,created_at) VALUES($1,$2,$3,$4,1,$5)`,[randomUUID(),row.id,row.status,claimant??row.sponsor,new Date(+new Date(row.created)+3600000)]);
 }
 return rows;
}
