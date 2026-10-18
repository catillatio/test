// Owner-run diagnostics only. Never seeds, grants gold or settles a payment.
import {loadConfig} from '../dist/config.js';
import {createDatabase} from '../dist/db.js';
import {requireRailwayOperator} from '../dist/operator.js';
import {auditBotEconomy} from '../dist/bot-audit.js';
import {validateDeploymentEnvironment} from './environment.mjs';
validateDeploymentEnvironment();requireRailwayOperator(process.env);
const db=createDatabase(loadConfig().databaseUrl);
try{console.log(JSON.stringify(await auditBotEconomy(db),null,2));}finally{await db.end();}
