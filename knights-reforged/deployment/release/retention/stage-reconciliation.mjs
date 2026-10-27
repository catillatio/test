// Private cloud handoff producer. No database connection or owner-PC execution.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {checkState,checkCoordinator} from './protocol.mjs';
import {uuid} from '../protocol.mjs';
import {publishReady} from './ready.mjs';
try{
 process.umask(0o077);
 const {values}=parseArgs({options:{scope:{type:'string'},state:{type:'string'},before:{type:'string'},'prior-approval':{type:'string'},'ready-out':{type:'string'}}});
 const read=async p=>{const b=await readFile(p);assert.ok(b.length<=2000000);return JSON.parse(b);};
 const scope=await read(values.scope),state=checkState(await read(values.state),scope);checkCoordinator(state.coordinator);
 const before=await read(values.before);assert.ok(Array.isArray(before.databases)&&before.databases.length>0);
 assert.match((await readFile(values['prior-approval'],'utf8')).trim(),uuid);
 await publishReady(values['ready-out'],{'scope.json':values.scope,'state.json':values.state,'prior-approval.txt':values['prior-approval'],'before.json':values.before});
 console.log('COPY_RETENTION_RECONCILIATION_READY: PASS');
}catch{console.error('COPY_RETENTION_RECONCILIATION_READY: FAIL');process.exitCode=1;}
