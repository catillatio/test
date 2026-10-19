// Operator-only, read-only status. Never materialize income or print credentials.
import {loadConfig} from '../dist/config.js';
import {createDatabase} from '../dist/db.js';
import {privateAlphaInitializationId} from '../dist/private-alpha-policy.js';
import {validateDeploymentEnvironment} from './environment.mjs';

validateDeploymentEnvironment();
const config=loadConfig();
if(!config.privateAlpha)throw new Error('Status requires the explicitly enabled Railway private alpha.');
const db=createDatabase(config.databaseUrl);
let client;
try{
  client=await db.connect();await client.query('BEGIN READ ONLY');
  const marker=(await client.query('SELECT id,bot_count,completed_at FROM private_alpha_initializations WHERE id=$1',[privateAlphaInitializationId])).rows[0];
  const dev=(await client.query(`SELECT a.username,c.id AS character_id,c.attained_level AS level,w.balance AS gold,
    1+COALESCE((SELECT sum(quantity) FROM army_stacks WHERE character_id=c.id),0)::int AS recruited_army
    FROM accounts a JOIN characters c ON c.account_id=a.id JOIN wallets w ON w.character_id=c.id WHERE a.username='dev'`)).rows[0];
  const population=(await client.query(`SELECT c.attained_level AS level,count(*)::int AS rivals FROM development_bots b JOIN characters c ON c.id=b.character_id GROUP BY c.attained_level ORDER BY c.attained_level`)).rows;
  const totals=(await client.query(`SELECT (SELECT count(*)::int FROM accounts) AS accounts,
    (SELECT count(*)::int FROM development_bots) AS bots,
    (SELECT count(*)::int FROM development_bots WHERE active) AS active_bots,
    (SELECT max(quantity+1)::int FROM army_stacks WHERE character_id IN(SELECT character_id FROM development_bots)) AS maximum_bot_army,
    (SELECT min(n)::int FROM (SELECT sum(quantity) AS n FROM land_holdings WHERE character_id IN(SELECT character_id FROM development_bots) GROUP BY character_id) q) AS minimum_bot_plots`)).rows[0];
  const schemaHead=(await client.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0]?.name;
  console.log(JSON.stringify({release:'phase4.7',schemaHead,bootstrapCredentialsPresent:!!(process.env.KINGDOM_DEV_PASSWORD||process.env.KINGDOM_ALPHA_INITIALIZE),initialized:!!marker,marker:marker??null,dev:dev??null,...totals,population,
    features:{bots:config.developmentBotsEnabled,botBounties:config.developmentBotBountiesEnabled,botRecruitment:config.developmentBotRecruitmentEnabled}},null,2));
  if(!marker)process.exitCode=1;
}finally{
  if(client){await client.query('ROLLBACK').catch(()=>{});client.release();}
  await db.end();
}
