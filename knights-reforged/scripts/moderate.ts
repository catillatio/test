import {listBroadcasts,reviewBroadcasts,hideReviewedBroadcasts} from '../src/broadcast-moderation.js';
import {z} from 'zod';
import {loadConfig} from '../src/config.js';
import {createDatabase} from '../src/db.js';
import {assertInstalledRulesets} from '../src/migrate.js';
import {moderateMessage} from '../src/community.js';

// Deliberately local-operator only. No route grants accounts administrator power.
if(process.env.ALLOW_REALM_MODERATION!=='1')throw new Error('Set ALLOW_REALM_MODERATION=1 explicitly for a trusted operator session.');
const [action,id,...words]=process.argv.slice(2);
if(!['queue','broadcasts','review-broadcasts','hide-broadcasts','hide','restore','mute','unmute'].includes(action??''))throw new Error('Use queue | broadcasts | review-broadcasts ID1 ID2 | hide-broadcasts ID1 ID2 | hide MESSAGE_ID REASON | restore MESSAGE_ID REASON | mute CHARACTER_ID HOURS REASON | unmute CHARACTER_ID REASON.');
if(!['queue','broadcasts'].includes(action??'')&&!z.string().uuid().safeParse(id).success)throw new Error('A valid record ID is required.');
const config=loadConfig(),db=createDatabase(config.databaseUrl);
try{
  await assertInstalledRulesets(db);
  if(!(await db.query("SELECT 1 FROM schema_migrations WHERE name='014_economy_and_progression.sql'")).rows.length)throw new Error('Run npm run db:migrate before moderation.');
  if(action==='broadcasts'){
    console.log(JSON.stringify({broadcasts:await listBroadcasts(db)},null,2));
  }else if(action==='review-broadcasts'||action==='hide-broadcasts'){
    const ids=[id!,...words];
    console.log(JSON.stringify(action==='review-broadcasts'?await reviewBroadcasts(db,ids):await hideReviewedBroadcasts(db,ids,process.env),null,2));
  }else if(action==='queue'){
    const rows=(await db.query(`SELECT m.id,m.author_id,a.name,m.channel,m.body,m.status,m.created_at,count(r.id)::int AS reports,
      array_agg(DISTINCT r.reason) AS reasons FROM realm_messages m JOIN social_reports r ON r.message_id=m.id JOIN characters a ON a.id=m.author_id
      GROUP BY m.id,a.name ORDER BY max(r.created_at) DESC LIMIT 50`)).rows;
    console.log(JSON.stringify({reports:rows},null,2));
  }else{
    const hours=action==='mute'?Number(words.shift()):undefined;
    await moderateMessage(db,{action:action as 'hide'|'restore'|'mute'|'unmute',messageId:action==='hide'||action==='restore'?id:undefined,
      characterId:action==='mute'||action==='unmute'?id:undefined,hours,reason:words.join(' '),operator:process.env.REALM_MODERATOR_LABEL??''});
    console.log(JSON.stringify({action,id,completed:true}));
  }
}finally{await db.end();}
