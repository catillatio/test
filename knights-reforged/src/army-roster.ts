import type {Sql} from './db.js';
import {GameError} from './errors.js';
export interface ArmyLink {characterId:string;name:string;level:number;className:string;status:string;incoming:boolean;}
export type RosterFilter='all'|'accepted'|'incoming'|'outgoing';
export const rosterPageSize=25;
const visible=`FROM army_links l JOIN characters c ON c.id=CASE WHEN l.low_id=$1 THEN l.high_id ELSE l.low_id END
 WHERE (l.low_id=$1 OR l.high_id=$1) AND l.status<>'declined'
 AND NOT EXISTS(SELECT 1 FROM development_bots self WHERE self.character_id=$1)
 AND (NOT EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id=c.id) OR ($2 AND EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id=c.id AND d.active)))`;
function decode(value:string|undefined,owner:string,filter:RosterFilter){
 if(!value)return null;
 try{if(value.length>1024||!/^[A-Za-z0-9_-]+$/.test(value))throw 0;const c=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
  if(c.owner!==owner||c.filter!==filter||!['accepted','pending'].includes(c.status)||typeof c.name!=='string'||c.name.length>384||!/^([a-f0-9]{8}-){1}[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(c.id))throw 0;return c as {status:string;name:string;id:string};
 }catch{throw new GameError('INVALID_CURSOR','Open your army again to refresh this roster.',400);}
}
export async function readArmyRoster(sql:Sql,owner:string,runtime:{developmentBotRecruitmentEnabled?:boolean}={},after?:string,filter:RosterFilter='all'){
 if(!['all','accepted','incoming','outgoing'].includes(filter))throw new GameError('INVALID_ROSTER','Choose a valid roster view.',400);
 const cursor=decode(after,owner,filter),values=[owner,!!runtime.developmentBotRecruitmentEnabled];
 const summary=(await sql.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE l.status='accepted')::int AS accepted,
 count(*) FILTER(WHERE l.status='pending' AND l.inviter_id<>$1)::int AS incoming,
 count(*) FILTER(WHERE l.status='pending' AND l.inviter_id=$1)::int AS outgoing ${visible}`,values)).rows[0] as {total:number;accepted:number;incoming:number;outgoing:number};
 const rows=(await sql.query(`SELECT c.id,c.name,c.attained_level,c.profile_class,l.status,l.inviter_id ${visible}
 AND ($3='all' OR $3='accepted' AND l.status='accepted' OR $3='incoming' AND l.status='pending' AND l.inviter_id<>$1 OR $3='outgoing' AND l.status='pending' AND l.inviter_id=$1)
 AND ($4::text IS NULL OR (l.status,c.name,c.id)>($4,$5,$6::uuid)) ORDER BY l.status,c.name,c.id LIMIT $7`,[...values,filter,cursor?.status??null,cursor?.name??null,cursor?.id??null,rosterPageSize+1])).rows;
 const page=rows.slice(0,rosterPageSize),last=page.at(-1),links:ArmyLink[]=page.map(r=>({characterId:r.id,name:r.name,level:r.attained_level,className:r.profile_class,status:r.status,incoming:r.inviter_id!==owner}));
 return {...summary,links,filter,nextCursor:rows.length>rosterPageSize&&last?Buffer.from(JSON.stringify({owner,filter,status:last.status,name:last.name,id:last.id})).toString('base64url'):null};
}
