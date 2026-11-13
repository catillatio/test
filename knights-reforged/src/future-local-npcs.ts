// Explicit disposable-generation entry point. The historical generator,
// endowment formula, sealed manifests and existing identities remain unchanged.
import {provisionBots,requireDevelopment,type DevelopmentPermission} from './development.js';
import {assertLocalNpcTarget,planNpcArmy,applyLocalNpcArmy,npcArmyPolicy} from './npc-army.js';
import {scheduledCommand} from './bot-schedule.js';
import type {Database} from './db.js';
export async function provisionFutureLocalNpcs(db:Database,permission:DevelopmentPermission){
 requireDevelopment(permission);await assertLocalNpcTarget(db);
 const existing=new Set((await db.query('SELECT character_id FROM development_bots')).rows.map(r=>r.character_id));
 const result=await provisionBots(db,permission),added=(await db.query('SELECT character_id FROM development_bots WHERE active ORDER BY character_id')).rows.filter(r=>!existing.has(r.character_id));
 const adjustments=[];
 for(const row of added){
  const quote=await planNpcArmy(db,row.character_id);
  if(quote.fundingShortfall)throw new Error('Future NPC defaults require a separately reviewed funding plan; no capital was added');
  if(quote.totalCost)await applyLocalNpcArmy(db,quote,scheduledCommand(npcArmyPolicy.id,row.character_id,0));
  adjustments.push(quote);
 }
 return {...result,policyId:npcArmyPolicy.id,newIdentityAdjustments:adjustments};
}
