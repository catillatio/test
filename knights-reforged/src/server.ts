import {startBotCombat} from './bot-combat.js';
import {startBotIncome} from './bot-income.js';
import {startBotEconomy} from './bot-economy.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { assertInstalledRulesets } from './migrate.js';
import {assertPrivateAlphaInitialized} from './development.js';

const config = loadConfig();
const db = createDatabase(config.databaseUrl);
const app = await createApp({ db, config, logger: true });
let stopBotIncome=async()=>{};
let stopBotEconomy=async()=>{};
let stopBotCombat=async()=>{};
try {
  await assertInstalledRulesets(db);
  const schema = await db.query("SELECT name FROM schema_migrations WHERE name='020_game_feel.sql'");
  if (!schema.rows.length) throw new Error('Phase 4.7 migrations are incomplete. Run node deployment/migrate.mjs before starting.');
  if(config.privateAlpha)await assertPrivateAlphaInitialized(db);
  await app.listen({ host: config.host, port: config.port });
  app.log.info({event:'realm_origin_configuration',origin:config.origin,originSource:config.originSource,
    codespacesOrigin:config.codespacesOrigin,port:config.port,secureCookies:config.secureCookies},'Resolved realm origin');
  stopBotIncome=startBotIncome(db,config.developmentBotsEnabled,error=>app.log.error({err:error},'Passive rival income check failed; saved cursors will retry.'));
  stopBotEconomy=startBotEconomy(db,config.livingBotEconomyEnabled,()=>app.log.error('Autonomous rival purchase check failed; committed decisions will not repeat.'));
  stopBotCombat=startBotCombat(db,config.livingBotCombatEnabled,()=>app.log.error('Autonomous rival duel check failed; committed battles will not repeat.'));
  console.log(`Kingdom Come is ready at ${config.origin}`);
} catch (error) {
  app.log.error(error, 'Startup failed. Run npm run db:migrate before starting.');
  await db.end();
  process.exit(1);
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => { await stopBotCombat(); await stopBotEconomy(); await stopBotIncome(); await app.close(); await db.end(); process.exit(0); });
}
