import type {Sql} from './db.js';
export const mutedSound={enabled:false,volume:55};
export async function soundPreferences(sql:Sql,id:string){
 return (await sql.query('SELECT enabled,volume FROM sound_preferences WHERE character_id=$1',[id])).rows[0]??mutedSound;
}
// These are presentation hints from committed records, never predicted rewards.
export function soundFeedback(receipt:any,battle:any,viewerId:string|undefined){
 const record=battle?{commandId:battle.commandId,kind:'attack',data:battle.playerExperience?.[viewerId??'']}:receipt;
 if(!record?.commandId)return null;
 const reward=record.data;
 let cue=reward?.celebration?'level':battle?.bountyClaim?.id&&battle.attackerId===viewerId?'bounty':(reward?.tutorialCompleted||record.kind==='tutorial'&&reward?.tutorialAction==='finish')?'tutorial':reward?.newAchievements?.length?'achievement':null;
 if(!cue){
  if(battle)cue=battle.winnerId===viewerId?battle.victoryStyle==='decisive'?'decisive':'victory':'defeat';
  else cue=({quest:'quest',quest_buy:'equipment',buy:'equipment',sell:'sale',land_buy:'land',land_sell:'sale',heal:'healing',accept:'alliance',vault_deposit:'spend',vault_withdraw:'coins',bounty_place:'spend',bounty_cancel:'coins',invite:record.data?.armyEvent==='accepted'?'alliance':null,invite_code:record.data?.armyEvent==='accepted'?'alliance':null} as Record<string,string|null>)[record.kind]??null;
 }
 return cue?{id:record.commandId,cue}:null;
}
