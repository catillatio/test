import {randomInt} from 'node:crypto';import type {Sql} from './db.js';
import {realmPolicy} from './realm-policy.js';import {expandedContent,questRarities} from './expansion-content.js';
import {acquireQuestEquipment} from './equipment-acquisition.js';
export function rareRoll(roll:number,ppm=questRarities.proposedPpm){
 if(!Number.isInteger(roll)||roll<0||roll>=questRarities.scale||!Number.isInteger(ppm)||ppm<1||ppm>10000)throw new RangeError('Invalid rarity draw.');return roll<ppm;
}
export async function questEquipmentDrops(sql:Sql,characterId:string,runId:string,commandId:string,now:Date,draw=()=>randomInt(questRarities.scale)){
 const world=await realmPolicy(sql);if(!world.rareDrops)return [];
 const boundary=world.rareAuthorizationId?'(SELECT created_at FROM rare_equipment_authorizations WHERE id=$3)':'(SELECT activated_at FROM realm_expansion_state)';
 const run=(await sql.query(`SELECT r.quest_id,r.ruleset_id,r.created_at,c.attained_level,r.created_at>=${boundary} AS current_opportunity FROM quest_runs r JOIN characters c ON c.id=r.character_id WHERE r.id=$1 AND r.character_id=$2`,world.rareAuthorizationId?[runId,characterId,world.rareAuthorizationId]:[runId,characterId])).rows[0];
 if(!run||run.ruleset_id!==expandedContent.id)throw new Error('Quest drop source mismatch.');
 const quest=expandedContent.quests.find(q=>q.id===run.quest_id),items=questRarities.quests[run.quest_id]??[];
 if(!quest||quest.level<questRarities.minimumLevel||run.attained_level<Math.max(questRarities.minimumLevel,quest.level)||!run.current_opportunity)return [];
 const saved=(await sql.query('SELECT * FROM quest_equipment_outcomes WHERE quest_run_id=$1 ORDER BY item_id',[runId])).rows;
 if(saved.length){if(saved.length!==items.length||saved.some(r=>r.character_id!==characterId||r.policy_id!==questRarities.id||r.probability_ppm!==questRarities.proposedPpm||!items.includes(r.item_id)))throw new Error('Incomplete quest drop evidence.');return saved.filter(r=>r.outcome==='awarded').map(r=>({id:r.item_id,name:expandedContent.items.find(i=>i.id===r.item_id)!.name,quantity:1}));}
 const rewards:{id:string;name:string;quantity:number}[]=[];
 for(const itemId of items){const roll=draw(),hit=rareRoll(roll);const acquired=hit?await acquireQuestEquipment(sql,characterId,itemId,1,'quest_drop',runId,commandId,now):null;
  const outcome=hit?(acquired?'awarded':'inventory_full'):'miss';
  await sql.query('INSERT INTO quest_equipment_outcomes(quest_run_id,character_id,item_id,policy_id,roll,probability_ppm,outcome,acquisition_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[runId,characterId,itemId,questRarities.id,roll,questRarities.proposedPpm,outcome,acquired?.id??null]);
  if(acquired)rewards.push({id:itemId,name:expandedContent.items.find(i=>i.id===itemId)!.name,quantity:1});
 }
 return rewards;
}
