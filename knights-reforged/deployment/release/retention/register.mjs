// Separately owner-approved adoption of an EXACT already observed future copy.
// No legacy import, pre-transfer step, role installation or deletion.
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {checkScope} from './protocol.mjs';
import {adoptionEvidence,adoptObservedCopy} from './adoption.mjs';
import {privateDatabase} from '../protocol.mjs';
import {liveGuards} from './guards.mjs';
import {publishReady} from './ready.mjs';
let client,disconnected=false;
try{
 process.umask(0o077);
 const {values}=parseArgs({options:{scope:{type:'string'},state:{type:'string'},manifest:{type:'string'},'expected-manifest-sha256':{type:'string'},'expected-oid':{type:'string'},'owner-reviewed':{type:'boolean'},'ready-out':{type:'string'}}});
 assert.equal(values['owner-reviewed'],true);assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 for(const key of ['KINGDOM_RETENTION_DATABASE_URL','KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL','KINGDOM_RETENTION_SIGNING_KEY','KINGDOM_RELEASE_SIGNING_KEY','DATABASE_URL','KINGDOM_RESTORE_DATABASE_URL','KINGDOM_RELEASE_JOB_REQUEST'])assert.ok(!process.env[key]);
 const scope=checkScope(JSON.parse(await readFile(values.scope,'utf8'))),state=JSON.parse(await readFile(values.state,'utf8'));
 const bytes=await readFile(values.manifest);adoptionEvidence(bytes,values['expected-manifest-sha256'],scope,values['expected-oid']);
 const target=privateDatabase(process.env.KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL);
 assert.equal(target.host,scope.host);assert.equal(target.name,scope.adminDatabase);
 client=new pg.Client({connectionString:target.url.href,connectionTimeoutMillis:5000,query_timeout:15000,application_name:'kingdom-observed-copy-adoption'});
 client.on('error',()=>{disconnected=true;});await client.connect();
 await adoptObservedCopy(client,{scope,state,bytes,expectedSha256:values['expected-manifest-sha256'],expectedOid:values['expected-oid'],beforeAdopt:liveGuards(scope,{githubToken:process.env.GH_TOKEN}).beforeDelete});
 assert.equal(disconnected,false);
 if(values['ready-out'])await publishReady(values['ready-out'],{'scope.json':values.scope,'state.json':values.state,'manifest.json':values.manifest});
 console.log('COPY_PROVENANCE_IMPORT: PASS');
}catch{console.error('COPY_PROVENANCE_IMPORT: FAIL');process.exitCode=1;}
finally{if(client)await client.end().catch(()=>{});}
