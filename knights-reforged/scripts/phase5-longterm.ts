import {mkdir,writeFile} from 'node:fs/promises';
import {runLongTerm,type Scenario} from './simulation/living-economy.js';
if(process.env.RUN_PHASE5_LONGTERM!=='1')throw new Error('Explicit RUN_PHASE5_LONGTERM=1 and a local disposable TEST_DATABASE_URL are required.');
const days=Number(process.env.PHASE5_DAYS??30),scenarios=(process.env.PHASE5_SCENARIOS??'quiet,attacked,interrupted').split(',') as Scenario[];
if(scenarios.some(s=>!['quiet','attacked','interrupted'].includes(s)))throw new Error('Unknown synthetic scenario.');
await mkdir('test-results',{recursive:true});
const report=await runLongTerm({days,scenarios,onProgress:line=>console.log(line),onCheckpoint:async(s,c)=>{await writeFile('test-results/phase5-longterm-'+s+'-latest.json',JSON.stringify(c,null,2)+'\n');}});
await mkdir('test-results',{recursive:true});await writeFile('test-results/phase5-longterm.json',JSON.stringify(report,null,2)+'\n');
console.log('LONG_TERM_PRESERVATION: PASS');
