import {randomBytes,randomUUID} from 'node:crypto';
import {type Sql,type Database,transaction} from './db.js';
import {GameError} from './errors.js';
import {community} from './community-rules.js';

export async function invitationCode(sql:Sql,characterId:string):Promise<string>{
  const existing=(await sql.query('SELECT code FROM army_invitation_codes WHERE character_id=$1',[characterId])).rows[0];
  if(existing)return existing.code;
  for(let attempt=0;attempt<10;attempt++){
    const candidate=randomBytes(community.army.codeCharacters/2).toString('hex').toUpperCase();
    await sql.query('INSERT INTO army_invitation_codes(character_id,code) VALUES($1,$2) ON CONFLICT DO NOTHING',[characterId,candidate]);
    const row=(await sql.query('SELECT code FROM army_invitation_codes WHERE character_id=$1',[characterId])).rows[0];
    if(row)return row.code;
  }
  throw new GameError('CODE_UNAVAILABLE','A new invitation code could not be issued. Try again.',503);
}
export function cleanMessage(value:string){
  const body=value.replace(/\r\n?/g,'\n').normalize('NFC').trim();
  if(!body||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/u.test(body))
    throw new GameError('INVALID_MESSAGE','Use readable plain text without control characters.');
  return body;
}
// Commands hold the author character lock, serializing rate checks with inserts.
// Hidden/deleted records still count, so deletion cannot reset a posting limit.
export async function postMessage(sql:Sql,actorId:string,profileId:string|null,raw:string,key:string,now:Date,level:number,quests:number){
  const channel=profileId?'comment':'broadcast',body=cleanMessage(raw),limits=community.social;
  if(body.length>(profileId?limits.commentCharacters:limits.broadcastCharacters))throw new GameError('MESSAGE_TOO_LONG','That message is too long.');
  if((await sql.query('SELECT 1 FROM social_mutes WHERE character_id=$1 AND until_at>$2',[actorId,now])).rows.length)
    throw new GameError('SOCIAL_MUTED','Posting is temporarily restricted by realm moderation.',403);
  if(!profileId&&(level<limits.broadcastMinimumLevel||quests<limits.broadcastMinimumQuests))
    throw new GameError('BROADCAST_ELIGIBILITY','Reach level 2 and complete three quests before broadcasting.',409);
  if(profileId&&(await sql.query('SELECT 1 FROM development_bots WHERE character_id=$1',[profileId])).rows.length)
    throw new GameError('BOT_COMMENTS','Temporary rivals have no social presence. Comment on a player profile instead.',409);
  const recent=(await sql.query(`SELECT count(*)::int AS n,max(created_at) AS latest FROM realm_messages
    WHERE author_id=$1 AND channel=$2 AND created_at>$3`,[actorId,channel,new Date(+now-86400000)])).rows[0]!;
  const cooldown=profileId?limits.commentCooldownSeconds:limits.broadcastCooldownSeconds;
  if(recent.latest&&+now<+new Date(recent.latest)+cooldown*1000)throw new GameError('SOCIAL_COOLDOWN','Wait '+cooldown+' seconds between '+channel+' posts.',429);
  if(recent.n>=(profileId?limits.commentsPerDay:limits.broadcastsPerDay))throw new GameError('SOCIAL_DAILY_LIMIT','Your rolling 24-hour posting limit has been reached.',429);
  const messageId=randomUUID();
  await sql.query('INSERT INTO realm_messages(id,author_id,profile_id,channel,body,command_id,ruleset_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[messageId,actorId,profileId,channel,body,key,community.id,now]);
  return {messageId,profileId,channel};
}
export async function reportMessage(sql:Sql,actorId:string,messageId:string,reason:string,now:Date){
  const message=(await sql.query("SELECT * FROM realm_messages WHERE id=$1 AND status='visible' FOR UPDATE",[messageId])).rows[0];
  if(!message)throw new GameError('MESSAGE_UNAVAILABLE','That message is unavailable.',404);
  if(message.author_id===actorId)throw new GameError('SELF_REPORT','Remove your own message instead.');
  const old=(await sql.query('SELECT id FROM social_reports WHERE message_id=$1 AND reporter_id=$2',[messageId,actorId])).rows[0];
  if(old)return {reported:true,channel:message.channel,profileId:message.profile_id};
  const count=(await sql.query('SELECT count(*)::int AS n FROM social_reports WHERE reporter_id=$1 AND created_at>$2',[actorId,new Date(+now-86400000)])).rows[0]!.n;
  if(count>=community.social.reportsPerDay)throw new GameError('REPORT_LIMIT','Your rolling 24-hour report limit has been reached.',429);
  await sql.query('INSERT INTO social_reports(id,message_id,reporter_id,reason,created_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),messageId,actorId,reason,now]);
  return {reported:true,channel:message.channel,profileId:message.profile_id};
}
export async function removeMessage(sql:Sql,actorId:string,messageId:string,now:Date){
  const message=(await sql.query('SELECT * FROM realm_messages WHERE id=$1 FOR UPDATE',[messageId])).rows[0];
  if(!message)throw new GameError('MESSAGE_UNAVAILABLE','That message is unavailable.',404);
  const own=message.author_id===actorId,host=message.profile_id===actorId;
  if(!own&&!host)throw new GameError('MESSAGE_FORBIDDEN','Only its author or the profile owner may remove this message.',403);
  if(message.status!=='visible')return {removed:true,channel:message.channel,profileId:message.profile_id};
  await sql.query('UPDATE realm_messages SET status=$2 WHERE id=$1',[messageId,own?'deleted':'hidden']);
  await sql.query('INSERT INTO social_moderation(id,message_id,actor_id,action,reason,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),messageId,actorId,own?'author_delete':'profile_hide',own?'Removed by author':'Hidden by profile owner',now]);
  return {removed:true,channel:message.channel,profileId:message.profile_id};
}
export async function armyEvent(sql:Sql,actorId:string,targetId:string,kind:string,key:string,now:Date){
  await sql.query('INSERT INTO army_events(id,actor_id,target_id,kind,command_id,ruleset_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),actorId,targetId,kind,key,community.id,now]);
}
export async function validateInvitation(sql:Sql,actorId:string,targetId:string,now:Date){
  const recent=(await sql.query("SELECT count(*)::int AS n,max(created_at) AS latest FROM army_events WHERE actor_id=$1 AND kind='invited' AND created_at>$2",[actorId,new Date(+now-86400000)])).rows[0]!;
  if(recent.latest&&+now<+new Date(recent.latest)+community.army.invitationCooldownSeconds*1000)throw new GameError('INVITATION_COOLDOWN','Wait 30 seconds before another invitation.',429);
  if(recent.n>=community.army.invitationsPerDay)throw new GameError('INVITATION_LIMIT','Your rolling 24-hour invitation limit has been reached.',429);
  const last=(await sql.query("SELECT 1 FROM army_events WHERE kind='invited' AND ((actor_id=$1 AND target_id=$2) OR (actor_id=$2 AND target_id=$1)) AND created_at>$3 LIMIT 1",[actorId,targetId,new Date(+now-community.army.reinviteCooldownSeconds*1000)])).rows.length;
  if(last)throw new GameError('REINVITATION_COOLDOWN','Wait 24 hours before inviting the same player again.',409);
}

// No web-admin privilege or automatic report-count hiding. Operators review a
// local CLI queue; all actions are auditable and a mute never affects gameplay.
export async function moderateMessage(db:Database,input:{messageId?:string;characterId?:string;action:'hide'|'restore'|'mute'|'unmute';operator:string;reason:string;hours?:number}){
  if(!input.operator.trim()||input.operator.length>80||!input.reason.trim()||input.reason.length>200)throw new Error('An operator label and reason are required.');
  return transaction(db,async sql=>{
    const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
    if(input.action==='hide'||input.action==='restore'){
      const message=(await sql.query('SELECT * FROM realm_messages WHERE id=$1 FOR UPDATE',[input.messageId])).rows[0];
      if(!message)throw new Error('Message not found.');
      if(input.action==='restore'&&message.status==='deleted')throw new Error('Author-deleted messages cannot be restored.');
      await sql.query('UPDATE realm_messages SET status=$2 WHERE id=$1',[input.messageId,input.action==='hide'?'hidden':'visible']);
    }else{
      if(!input.characterId||!(await sql.query('SELECT 1 FROM characters WHERE id=$1',[input.characterId])).rows.length)throw new Error('Character not found.');
      if(input.action==='mute'){
        if(!Number.isInteger(input.hours)||input.hours! < 1||input.hours! > 720)throw new Error('Mute duration must be 1–720 hours.');
        await sql.query('INSERT INTO social_mutes(character_id,until_at,reason,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(character_id) DO UPDATE SET until_at=EXCLUDED.until_at,reason=EXCLUDED.reason,updated_at=EXCLUDED.updated_at',[input.characterId,new Date(+now+input.hours!*3600000),input.reason,now]);
      }else await sql.query('DELETE FROM social_mutes WHERE character_id=$1',[input.characterId]);
    }
    await sql.query('INSERT INTO social_moderation(id,message_id,character_id,operator_label,action,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),input.messageId??null,input.characterId??null,input.operator,input.action==='hide'?'operator_hide':input.action==='restore'?'operator_restore':input.action,input.reason,now]);
  });
}
