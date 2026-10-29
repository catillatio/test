import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('manual retention workflow is default-disabled, owner-gated before the release mutex, read-only API token and no schedule',async()=>{
 const template=await read('deployment/release/retention/workflow.yml'),release=await read('../.github/workflows/production-release.yml');
 assert.match(release,/group: kingdom-come-production/);assert.match(template,/group: kingdom-come-production/);
 assert.match(template,/cancel-in-progress: false/);assert.match(template,/needs: owner-approval/);assert.match(template,/environment: production/);
 const gate=template.slice(template.indexOf('  owner-approval:'),template.indexOf('  inspect-installation:'));assert.doesNotMatch(gate,/concurrency:/);
 assert.match(template,/timeout-minutes: 5/);assert.match(template,/actions: read/);assert.doesNotMatch(template,/schedule:|upload-artifact|self-hosted|runner-group|always\(\)/);
 assert.equal(await read('../.github/workflows/recovery-copy-retention.yml'),template);
 assert.match(gate,/vars\.KINGDOM_RETENTION_EXECUTION_APPROVED == '1'/);
 assert.match(template,/options: \[inspect-installation, validate-handoff, adopt, retire, adoption-review, reconcile, initialize-journal, install-disabled\]/);assert.match(template,/default: adoption-review/);
});
test('private entrypoint has no arbitrary dispatch paths, shell/SQL execution or public result artifacts',async()=>{
 const job=await read('deployment/release/retention/job.mjs'),spool=await read('deployment/release/retention/spool.mjs');
 assert.match(job,/assert\.match\(process\.env\.RETENTION_REQUEST_ID\?\?'',uuid\)/);assert.match(spool,/realpath/);assert.match(spool,/isSymbolicLink/);
 assert.match(spool,/ready\.json/);assert.match(spool,/createHash\('sha256'\)/);assert.match(spool,/Date\.now\(\)\+180000/);
 assert.match(job,/stdio:'ignore'/);assert.doesNotMatch(job,/shell:true|process\.env\.DATABASE_URL|DROP DATABASE|upload-artifact/);
 const run=spawnSync(process.execPath,['deployment/release/retention/job.mjs'],{encoding:'utf8',env:{PATH:process.env.PATH}});
 assert.equal(run.status,1);assert.equal(run.stdout,'');assert.equal(run.stderr,'COPY_RETENTION_JOB: FAIL\n');
});
test('inventory SQL is read-only, enumerates real OIDs and independently protects both emergency OIDs',async()=>{
 const sql=await read('deployment/release/retention/inventory.sql');
 assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/d\.oid::text/);assert.match(sql,/pg_database_size/);assert.match(sql,/106971,129180/);
 assert.doesNotMatch(sql,/\b(?:DROP|ALTER|CREATE|INSERT|UPDATE|DELETE|TRUNCATE|GRANT)\b/);
});
test('interruption recovery observes absence only and cannot renew or resume destructive approval',async()=>{
 const code=await read('deployment/release/retention/reconcile.mjs');
 assert.match(code,/checkApproval/);assert.match(code,/requiresFreshApproval/);assert.match(code,/measuredDatabaseBytesRemoved:'0'/);
 assert.doesNotMatch(code,/client\.query\(['"`]\s*(?:DROP|ALTER|UPDATE|DELETE|TRUNCATE)/);
 assert.match(code,/datname=\$1 OR oid=\$2/);assert.match(code,/intent\.oid,'absent'/);
});
