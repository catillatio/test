// All privileged seeding/age changes are DISPOSABLE TEST FIXTURES only.
import pg from 'pg';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {scope as original,fixture,scenario} from '../../tests/fixtures/release-retention.mjs';
import {hash} from '../../deployment/release/retention/protocol.mjs';
import {observationPayload,recordObservation} from '../../deployment/release/retention/observation.mjs';
export async function prepareDatabase(url,volumeId,sha){
 assert.equal(url.hostname,'127.0.0.1');assert.ok(url.pathname.endsWith('_test'));const db=new pg.Client({connectionString:url.href});db.on('error',()=>{});await db.connect();
 await db.query(await readFile(new URL('../../deployment/release/retention/bootstrap.sql',import.meta.url),'utf8'));
 await db.query(await readFile(new URL('../../deployment/release/retention/observations.sql',import.meta.url),'utf8'));
 await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
 await db.query("ALTER ROLE kc_retention_runtime PASSWORD 'disposable-runtime-only'; ALTER ROLE kc_retention_authorizer PASSWORD 'disposable-authorizer-only'");
 const cluster=createHash('sha256').update((await db.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id).digest('hex');
 const scope={...original,clusterDigest:cluster,adminDatabase:url.pathname.slice(1),workerAdminDatabase:url.pathname.slice(1),delivery:{...original.delivery,journalVolumeId:volumeId}};
 const copies=[701,702,703,704,705,706].map(n=>fixture(n,{now:Date.now(),age:100-(n-701)}));
 const rules=JSON.parse(await readFile(new URL('../../rulesets/level100-rivals-1/rules.json',import.meta.url),'utf8'));
 const population={manifestId:'level100-rivals-1',manifestDigest:hash(rules),legacyDigest:'f'.repeat(64),originalBots:450,addedBots:450,totalBots:900,activeAddedBots:450,autonomyMode:'enabled'};
 for(let i=0;i<copies.length;i++){
  const f=copies[i];await db.query('CREATE DATABASE "'+f.database.name+'"');
  f.database.oid=(await db.query('SELECT oid::text FROM pg_database WHERE datname=$1',[f.database.name])).rows[0].oid;
  Object.assign(f.catalog.evidence.report,{restoreClusterDigest:cluster,verifiedCopyIdentity:{oid:f.database.oid,owner:'knights',maintenanceDatabase:scope.adminDatabase,clusterDigest:cluster},bots:900,accounts:902,population});Object.assign(f.catalog.evidence.report.restoredCopy,{bots:900,accounts:902,population});
  const own=new URL(url);own.pathname='/'+f.database.name;const c=new pg.Client({connectionString:own.href});c.on('error',()=>{});await c.connect();
  try{await c.query("CREATE TABLE business(id int PRIMARY KEY,bot bool,wallet bigint,vault bigint,inventory int,land int,army int,session text,history text); INSERT INTO business SELECT n,n<=900,n*100,n*200,15,3,4,'session-'||n,'saved-history-'||n FROM generate_series(1,902)n");}finally{await c.end();}
  if(i<5){
   await db.query('SET SESSION AUTHORIZATION kc_copy_registrar');try{await recordObservation(db,observationPayload(f.catalog.evidence));}finally{await db.query('RESET SESSION AUTHORIZATION');}
   await db.query('ALTER DATABASE "'+f.database.name+'" OWNER TO kc_release_copy_owner');
   await db.query('SET ROLE kc_retention_owner');try{await db.query('INSERT INTO release_retention.copies(name,database_oid,owner_name,verified_at,evidence,evidence_sha256) VALUES($1,$2,$3,$4,$5,$6)',[f.database.name,f.database.oid,'kc_release_copy_owner',new Date(Date.now()-48*3600000+i*1000),f.catalog.evidence,hash(f.catalog.evidence)]);}finally{await db.query('RESET ROLE');}
  }
 }
 await db.query('ALTER TABLE release_retention.copies DISABLE TRIGGER copies_immutable');
 try{await db.query("UPDATE release_retention.copies SET first_observed_at=verified_at");}finally{await db.query('ALTER TABLE release_retention.copies ENABLE TRIGGER copies_immutable');}
 const state={...scenario(copies,Date.now()).state,scope,coordinator:{repository:'catillatio/test',workflow:'.github/workflows/recovery-copy-retention.yml',job:'retire',runId:'999',runAttempt:1,headSha:sha},activeSha:'f'.repeat(40),observedAt:new Date().toISOString()};
 const business=async f=>{const u=new URL(url);u.pathname='/'+f.database.name;const c=new pg.Client({connectionString:u.href});c.on('error',()=>{});await c.connect();try{return JSON.stringify((await c.query('SELECT * FROM business ORDER BY id')).rows);}finally{await c.end();}};
 const before=new Map();for(const f of copies)before.set(f.database.name,await business(f));
 return {db,scope,copies,state,async preservation(excluded=[]){for(const f of copies.filter(f=>!excluded.includes(f.database.name)))assert.equal(await business(f),before.get(f.database.name));}};
}
