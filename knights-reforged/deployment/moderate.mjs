import {z} from 'zod';
import {loadConfig} from '../dist/config.js';
import {createDatabase} from '../dist/db.js';
import {assertInstalledRulesets} from '../dist/migrate.js';
import {moderateMessage} from '../dist/community.js';

// Existing moderation functions, packaged for an authenticated Railway operator shell.
import {validateDeploymentEnvironment} from './environment.mjs';
import {requireRailwayOperator} from '../dist/operator.js';
validateDeploymentEnvironment();requireRailwayOperator(process.env);
if(process.env.ALLOW_REALM_MODERATION!=='1')throw new Error('Set ALLOW_REALM_MODERATION=1 explicitly for a trusted operator session.');
const [action,id,...words]=process.argv.slice(2);
if(!['queue','hide','restore','mute','unmute'].includes(action??''))throw new Error('Use queue | hide MESSAGE_ID REASON | restore MESSAGE_ID REASON | mute CHARACTER_ID HOURS REASON | unmute CHARACTER_ID REASON.');
if(action!=='queue'&&!z.string().uuid().safeParse(id).success)throw new Error('A valid record ID is required.');
const config=loadConfig(),db=createDatabase(config.databaseUrl);
try{
  await assertInstalledRulesets(db);
  if(!(await db.query("SELECT 1 FROM schema_migrations WHERE name='017_security_and_operator_grants.sql'")).rows.length)throw new Error('Complete the controlled Phase 4.4 migration before moderation.');
  if(action==='queue'){
    const rows=(await db.query(`SELECT m.id,m.author_id,a.name,m.channel,m.body,m.status,m.created_at,count(r.id)::int AS reports,
      array_agg(DISTINCT r.reason) AS reasons FROM realm_messages m JOIN social_reports r ON r.message_id=m.id JOIN characters a ON a.id=m.author_id
      GROUP BY m.id,a.name ORDER BY max(r.created_at) DESC LIMIT 50`)).rows;
    console.log(JSON.stringify({reports:rows},null,2));
  }else{
    const hours=action==='mute'?Number(words.shift()):undefined;
    await moderateMessage(db,{action,messageId:action==='hide'||action==='restore'?id:undefined,
      characterId:action==='mute'||action==='unmute'?id:undefined,hours,reason:words.join(' '),operator:process.env.REALM_MODERATOR_LABEL??''});
    console.log(JSON.stringify({action,id,completed:true}));
  }
}finally{await db.end();}
