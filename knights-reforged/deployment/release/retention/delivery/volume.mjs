import assert from 'node:assert/strict';
import {readFile,lstat,stat,open,chown,chmod,readdir} from 'node:fs/promises';
import {root} from './protocol.mjs';
const marker=root+'/.retention-volume.json';
async function mount(){
 const lines=(await readFile('/proc/self/mountinfo','utf8')).split('\n');
 assert.ok(lines.some(l=>l.split(' ')[4]===root),'A dedicated mounted volume is mandatory, not an image/ephemeral directory.');
 assert.equal(process.env.RAILWAY_VOLUME_MOUNT_PATH,root);
 assert.ok(process.env.RAILWAY_VOLUME_NAME&&!/postgres|releasecopy/i.test(process.env.RAILWAY_VOLUME_NAME));
}
export async function verifyVolume(scope){
 await mount();assert.equal(process.env.RAILWAY_PROJECT_ID,scope.projectId);assert.equal(process.env.RAILWAY_ENVIRONMENT_ID,scope.environmentId);assert.equal(process.env.RAILWAY_SERVICE_ID,scope.operatorServiceId);assert.notEqual(process.getuid(),0);const i=await lstat(root);
 assert.ok(i.isDirectory()&&!i.isSymbolicLink());assert.equal(i.uid,process.getuid());assert.equal(i.mode&0o077,0);
 const m=JSON.parse(await readFile(marker,'utf8'));
 assert.deepEqual(m,{protocol:'kingdom-retention-journal-volume-v1',projectId:scope.projectId,environmentId:scope.environmentId,serviceId:scope.operatorServiceId,volumeId:scope.delivery.journalVolumeId});
 const probe=root+'/.write-probe-'+process.pid;const f=await open(probe,'wx',0o600);await f.sync();await f.close();
 const {unlink}=await import('node:fs/promises');await unlink(probe);
}
export async function initializeVolume(){
 assert.equal(process.getuid(),0);assert.equal(process.env.KINGDOM_RETENTION_ENABLED,'0');
 assert.equal(process.env.KINGDOM_RETENTION_INITIALIZE_JOURNAL,'owner-approved');
 for(const k of Object.keys(process.env))if(/DATABASE_URL|SIGNING_KEY|TOKEN|STORE_.*KEY|RETENTION_JOB/.test(k))assert.ok(!process.env[k]);
 await mount();assert.ok((await readdir(root)).every(n=>n==='lost+found'));
 const value={protocol:'kingdom-retention-journal-volume-v1',projectId:process.env.RAILWAY_PROJECT_ID,environmentId:process.env.RAILWAY_ENVIRONMENT_ID,serviceId:process.env.RAILWAY_SERVICE_ID,volumeId:process.env.KINGDOM_RETENTION_JOURNAL_VOLUME_ID};
 const {uuid}=await import('../../protocol.mjs');for(const v of Object.values(value).slice(1))assert.match(v??'',uuid);
 const f=await open(marker,'wx',0o600);await f.writeFile(JSON.stringify(value));await f.sync();await f.close();
 await chown(marker,1000,1000);await chown(root,1000,1000);await chmod(root,0o700);
 const d=await open(root,'r');await d.sync();await d.close();console.log('RETENTION_JOURNAL_INITIALIZATION: PASS');
}
