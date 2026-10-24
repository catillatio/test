import {randomUUID} from 'node:crypto';
import type {Sql} from './db.js';
import {GameError} from './errors.js';

export const contentPolicy='realm-content-1';
const segments=new Intl.Segmenter('und',{granularity:'grapheme'});
const lookalikes:Record<string,string>={'а':'a','е':'e','о':'o','р':'p','с':'c','х':'x','у':'y','і':'i','ј':'j','ѕ':'s','ɑ':'a','α':'a','ο':'o','ρ':'p','ι':'i','κ':'k','τ':'t','ν':'v'};
function comparison(value:string){return value.normalize('NFKC').toLowerCase().normalize('NFKD')
 .replace(/[\p{M}\p{Cf}]/gu,'').replace(/[аеорсхуіјѕɑαορικτν]/gu,c=>lookalikes[c]!)
 .replace(/[013457@$]/g,c=>({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s'})[c]!);}
// Whole words/explicit inflections only. Not "ass", "cock", "hell", names
// containing a prohibited substring, or a general political vocabulary filter.
const prohibited=['fuck','fucking','fucker','fuckers','motherfucker','shit','shitty','bullshit','cunt','fag','faggot','faggots','nigger','niggers'];
const patterns=prohibited.map(word=>new RegExp('(?<![\\p{L}\\p{N}])'+[...word].map(c=>c+'+').join('[\\s\\p{P}\\p{S}_]{0,3}')+'(?![\\p{L}\\p{N}])','u'));
export class ContentPolicyError extends GameError {
 constructor(readonly scope:'name'|'comment'|'broadcast',readonly rule:'blocked_language'|'reserved_identity'){
  super('CONTENT_POLICY',rule==='reserved_identity'?'Choose a warrior name that does not imply an official game role.':
   scope==='name'?'Choose a warrior name without abusive language.':'Please reword that message without abusive language.',422);
 }
}
export function checkNewContent(value:string,scope:'name'|'comment'|'broadcast'){
 const key=comparison(value);
 if(patterns.some(pattern=>pattern.test(key)))throw new ContentPolicyError(scope,'blocked_language');
 if(scope==='name'&&['admin','administrator','moderator','support','system','officialsupport','officialmoderator','gamemaster','kingdomcome'].includes(key.replace(/[^\p{L}\p{N}]/gu,'')))
  throw new ContentPolicyError(scope,'reserved_identity');
}
export function normalizeDisplayName(value:string){
 const name=value.normalize('NFC').trim().replace(/\p{Zs}+/gu,' '),graphemes=[...segments.segment(name)].map(s=>s.segment);
 const invalid=()=>{throw new GameError('INVALID_ACCOUNT','Use 2–28 visible characters, readable letters or symbols, and no hidden controls or markup.');};
 if(graphemes.length<2||graphemes.length>28||[...name].length>96||Buffer.byteLength(name,'utf8')>256||
  /[\p{Cc}\p{Cs}<>={}\[\]\\/`&]/u.test(name)||/\p{Default_Ignorable_Code_Point}/u.test(name.replace(/[\u200d\ufe0e\ufe0f]/g,''))||
  !/^[\p{L}\p{N}\p{M}\p{S}\p{Zs}\u200d'’_\-·.!?()+#,:]+$/u.test(name))invalid();
 for(const g of graphemes){
  if(/^\p{M}/u.test(g)||[...g].length>12)invalid();
  if(g.includes('\u200d')&&!/^\p{Extended_Pictographic}[\p{M}\p{Emoji_Modifier}]*(?:\u200d\p{Extended_Pictographic}[\p{M}\p{Emoji_Modifier}]*)+$/u.test(g))invalid();
  if(/[\uFE00-\uFE0F]/u.test(g)&&!/[\p{Extended_Pictographic}\p{N}]/u.test(g))invalid();
 }
 // Native Greek/Cyrillic names remain valid; mixed Latin homographs do not.
 if(/\p{Script=Latin}/u.test(name)&&/[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(name))
  throw new GameError('INVALID_ACCOUNT','Avoid mixing Latin with lookalike Greek or Cyrillic letters in a warrior name.');
 return name;
}
export async function recordContentRejection(sql:Sql,characterId:string|null,error:ContentPolicyError,commandId:string|null=null){
 // Compatibility with populated historical migration fixtures. Current game
 // startup still requires the full migration head before accepting requests.
 if(!(await sql.query("SELECT to_regclass('content_policy_rejections') AS installed")).rows[0]?.installed)return;
 await sql.query(`INSERT INTO content_policy_rejections(id,character_id,scope,policy_id,rule_id,command_id)
  VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(character_id,command_id,scope) WHERE command_id IS NOT NULL DO NOTHING`,
  [randomUUID(),characterId,error.scope,contentPolicy,error.rule,commandId]);
}
