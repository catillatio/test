// Operator-only. Never imported by startup or an HTTP handler.
import {validateDeploymentEnvironment} from './environment.mjs';
import {createDatabase} from '../dist/db.js';
import {inspectGray,grantGray,requireRailwayOperator} from '../dist/operator.js';
validateDeploymentEnvironment();requireRailwayOperator(process.env);
const mode=process.argv[2];if(!['inspect','apply'].includes(mode))throw new Error('Use inspect first; apply requires explicit owner confirmation and the inspected account ID.');
const db=createDatabase(process.env.DATABASE_URL);
try{console.log(JSON.stringify(await (mode==='inspect'?inspectGray(db,process.env):grantGray(db,process.env)),null,2));}finally{await db.end();}
