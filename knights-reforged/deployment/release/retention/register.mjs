// Privileged, explicit provenance import; NEVER a runtime or release operation.
// The owner must verify the retained artifact and completed worker timestamps.
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {checkScope,evidenceRecord,hash,emergencyOids} from './protocol.mjs';
import {privateDatabase} from '../protocol.mjs';
let client,disconnected=false;
try{
 const {values}=parseArgs({options:{scope:{type:'string'},manifest:{type:'string'},'verified-at':{type:'string'},'expected-oid':{type:'string'},'owner-reviewed':{type:'boolean'}}});
 assert.equal(values['owner-reviewed'],true);assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 const scope=checkScope(JSON.parse(await readFile(values.scope,'utf8')));
 const evidence=JSON.parse(await readFile(values.manifest,'utf8')),record=evidenceRecord(evidence,scope);
 const target=privateDatabase(process.env.KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL);
 assert.equal(target.host,scope.host);assert.equal(target.name,scope.adminDatabase);
 assert.match(values['expected-oid']??'',/^[1-9][0-9]*$/);assert.ok(!emergencyOids.includes(values['expected-oid']));
 const verified=new Date(values['verified-at']);assert.ok(Number.isFinite(+verified)&&+verified<=Date.now()&&+verified>=Date.parse(evidence.request.createdAt)&&+verified<=Date.parse(evidence.request.expiresAt));
 client=new pg.Client({connectionString:target.url.href,connectionTimeoutMillis:5000,application_name:'kingdom-copy-provenance-import'});client.on('error',()=>{disconnected=true;});await client.connect();
 const cluster=(await client.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id;
 assert.equal(createHash('sha256').update(cluster).digest('hex'),scope.clusterDigest);
 assert.equal((await client.query('SELECT pg_try_advisory_lock(61824087) AS acquired')).rows[0].acquired,true);
 await client.query('BEGIN');await client.query('SET LOCAL ROLE kc_retention_owner');
 const database=(await client.query('SELECT d.oid::text AS oid,r.rolname AS owner FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=$1',[record.name])).rows[0];
 assert.deepEqual(database,{oid:values['expected-oid'],owner:'kc_release_copy_owner'});
 const existing=(await client.query('SELECT database_oid::text AS oid,evidence_sha256,verified_at FROM release_retention.copies WHERE name=$1',[record.name])).rows[0];
 if(existing){assert.equal(existing.oid,database.oid);assert.equal(existing.evidence_sha256,hash(evidence));assert.equal(+new Date(existing.verified_at),+verified);}
 else await client.query('INSERT INTO release_retention.copies(name,database_oid,owner_name,verified_at,evidence,evidence_sha256) VALUES($1,$2,$3,$4,$5,$6)',[record.name,database.oid,database.owner,verified,evidence,hash(evidence)]);
 await client.query('COMMIT');assert.equal(disconnected,false);console.log('COPY_PROVENANCE_IMPORT: PASS');
}catch{if(client)await client.query('ROLLBACK').catch(()=>{});console.error('COPY_PROVENANCE_IMPORT: FAIL');process.exitCode=1;}
finally{if(client)await client.end().catch(()=>{});}
