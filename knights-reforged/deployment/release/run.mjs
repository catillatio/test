// Invoked only in the approved GitHub environment, from release/production.
// SSH carries DB operations entirely inside Railway. No public PG endpoint or
// DATABASE_URL leaves Railway; backups exported to the runner are encrypted.
import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {releaseInputs,checkBackup,checkRestoredCopy,checkLiveStatus} from './guard.mjs';
const mode=process.argv[2];assert.ok(['prepare','promote'].includes(mode),'Choose prepare or promote.');
const settings=releaseInputs(process.env),base=new URL('../../',import.meta.url).pathname;
assert.ok(process.env.RAILWAY_TOKEN&&!process.env.RAILWAY_API_TOKEN,'Use only the dedicated project-scoped Railway token.');
assert.match(process.env.KINGDOM_BACKUP_RECIPIENT??'',/^age1[a-z0-9]{58}$/,'Set an owner-controlled age public recipient.');
const scratch=process.env.RUNNER_TEMP+'/kingdom-'+settings.id,out=process.env.GITHUB_WORKSPACE+'/.release-artifacts';
await mkdir(scratch,{mode:0o700});await mkdir(out,{mode:0o700,recursive:true});
async function command(exe,args,{input,output,cwd=base}={}){
 const child=spawn(exe,args,{cwd,stdio:['pipe','pipe','pipe'],env:process.env});let result='';
 // Failure logs deliberately omit provider output: it can contain environment
 // values or user records. The step name and exit code identify the failed gate.
 child.stderr.resume();if(output)child.stdout.pipe(output);else child.stdout.on('data',chunk=>{result+=chunk;if(result.length>2000000)child.kill();});
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve(result):reject(new Error(exe+' failed (exit '+code+'); production promotion stopped.')));});
 if(input&&typeof input.pipe==='function')input.pipe(child.stdin);else child.stdin.end(input);
 return done;
}
const railwayArgs=['--project',process.env.RAILWAY_PROJECT_ID,'--environment',process.env.RAILWAY_ENVIRONMENT_ID];
const ssh=(alias,script,args=[],output)=>command('ssh',['-F',scratch+'/ssh_config','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+scratch+'/known_hosts',alias,'sh','-s','--',...args],{input:script,output});
let backup;
try{
 await writeFile(scratch+'/identity',process.env.RAILWAY_SSH_PRIVATE_KEY,{mode:0o600});
 await writeFile(scratch+'/known_hosts',process.env.RAILWAY_SSH_KNOWN_HOSTS,{mode:0o600});
 for(const [alias,service] of [['kc-pg',process.env.RAILWAY_PG_SERVICE_ID],['kc-game',process.env.RAILWAY_GAME_SERVICE_ID]])await command('railway',['ssh','config',...railwayArgs,'--service',service,'--path',scratch+'/ssh_config','--alias',alias,'--identity-file',scratch+'/identity']);
 console.log('Authenticated private-service SSH configuration prepared.');
 if(mode==='prepare'){
 const probe=JSON.parse(await ssh('kc-game',`set -eu
 cd /app
 node --input-type=module <<'NODE'
 import assert from 'node:assert/strict';
 import {loadConfig} from './dist/config.js';
 import {validateDeploymentEnvironment} from './deployment/environment.mjs';
 validateDeploymentEnvironment();const config=loadConfig();assert.equal(config.privateAlpha,true);assert.equal(config.secureCookies,true);assert.equal(config.port,8080);
 const url=new URL(config.databaseUrl);assert.ok(url.hostname.endsWith('.railway.internal'));
 console.log(JSON.stringify({origin:config.origin,databaseName:decodeURIComponent(url.pathname.slice(1)),databaseHost:url.hostname}));
NODE
 `));assert.equal(probe.origin,settings.origin,'Configured production origin does not match the reviewed release target.');
 const script=await readFile(new URL('./backup.sh',import.meta.url),'utf8');
 backup=JSON.parse(await ssh('kc-pg',script,['backup',settings.id]));assert.equal(backup.sourceDatabase,probe.databaseName,'Wrong source database.');assert.equal(backup.privateHost,probe.databaseHost,'Wrong PostgreSQL service.');
 const dump=scratch+'/realm.dump',stream=createWriteStream(dump,{flags:'wx',mode:0o600});
 await ssh('kc-pg',script,['export',settings.id],stream);await new Promise((resolve,reject)=>{stream.on('error',reject);if(stream.writableFinished)resolve();else stream.on('finish',resolve);});
 const hash=createHash('sha256');for await(const chunk of createReadStream(dump))hash.update(chunk);
 checkBackup(backup,hash.digest('hex'),(await stat(dump)).size);
 await command('docker',['run','--rm','-i','postgres:18-bookworm','pg_restore','--list'],{input:createReadStream(dump)});
 await command('age',['--encrypt','--recipient',process.env.KINGDOM_BACKUP_RECIPIENT,'--output',out+'/realm-'+settings.id+'.dump.age',dump]);
 const encryptedHash=createHash('sha256');for await(const chunk of createReadStream(out+'/realm-'+settings.id+'.dump.age'))encryptedHash.update(chunk);
 await writeFile(out+'/backup-manifest.json',JSON.stringify({...backup,releaseSha:settings.sha,encryptedSha256:encryptedHash.digest('hex'),createdAt:new Date().toISOString()},null,2));
 console.log('Backup exported, checksum matched, archive readable, independent encrypted artifact prepared.');
 await ssh('kc-pg',script,['restore',settings.id]);
 // Test the exact candidate's compiled migrations/dependencies against the
 // restored private copy, using an isolated directory in the old game service.
 const bundle=scratch+'/candidate.tgz';
 await command('tar',['-czf',bundle,'dist','rulesets','migrations','package.json','node_modules','deployment/check-upgrade.mjs']);
 const remote='/tmp/kingdom-'+settings.id;
 await ssh('kc-game','set -eu; umask 077; test ! -e "$1"; mkdir "$1"\n',[remote]);
 await command('ssh',['-F',scratch+'/ssh_config','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+scratch+'/known_hosts','kc-game','tar','-xzf','-','-C',remote],{input:createReadStream(bundle)});
 const copy=JSON.parse(await ssh('kc-game','set -eu; export KINGDOM_RESTORE_TEST_DATABASE="$2"; cd "$1"; node deployment/check-upgrade.mjs\n',[remote,backup.copy]));checkRestoredCopy(copy);assert.ok(copy.accounts>=backup.accounts,'The restored copy lost an account.');
 await writeFile(out+'/restored-copy.json',JSON.stringify(copy,null,2));
 console.log('Every old business row preserved in restored-copy migration and replay.');
 }else{
 backup=JSON.parse(await readFile(out+'/backup-manifest.json','utf8'));assert.equal(backup.releaseSha,settings.sha);
 checkRestoredCopy(JSON.parse(await readFile(out+'/restored-copy.json','utf8')));
 // Require an independently downloaded Actions artifact, not just local files.
 const downloaded=process.env.RUNNER_TEMP+'/verified-backup/realm-'+settings.id+'.dump.age';
 const hash=createHash('sha256');for await(const chunk of createReadStream(downloaded))hash.update(chunk);
 assert.equal(hash.digest('hex'),backup.encryptedSha256,'Durable artifact verification failed.');
 // Stage only non-secret release markers; --skip-deploys prevents accidental
 // promotion before the following deliberate deployment command.
 await command('railway',['variable','set','--project',process.env.RAILWAY_PROJECT_ID,'--service',process.env.RAILWAY_GAME_SERVICE_ID,'--environment',process.env.RAILWAY_ENVIRONMENT_ID,'--skip-deploys','KINGDOM_RESTORE_TEST_DATABASE='+backup.copy,'KINGDOM_RELEASE_SHA='+settings.sha]);
 await command('railway',['up',process.env.GITHUB_WORKSPACE,...railwayArgs,'--service',process.env.RAILWAY_GAME_SERVICE_ID,'--ci','--message','Kingdom Come '+settings.sha],{cwd:process.env.GITHUB_WORKSPACE});
 console.log('Deployment submitted after backup and restored-copy gates. Checking exact release…');
 let healthy=false;
 for(let attempt=0;attempt<30;attempt++){
  try{const response=await fetch(settings.origin+'/healthz',{signal:AbortSignal.timeout(8000),cache:'no-store'});const body=await response.json();if(response.ok&&body.status==='ready'&&body.release==='phase4.7'&&body.commit===settings.sha){healthy=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,4000));
 }
 assert.ok(healthy,'Exact-release health verification failed. Stop; use the documented code rollback, never reset PostgreSQL.');
 // The service instance can change on deploy: resolve SSH again.
 await command('railway',['ssh','config',...railwayArgs,'--service',process.env.RAILWAY_GAME_SERVICE_ID,'--path',scratch+'/ssh_config','--alias','kc-game','--identity-file',scratch+'/identity']);
 const status=JSON.parse(await ssh('kc-game','set -eu; cd /app; node deployment/status.mjs\n'));checkLiveStatus(status);assert.ok(status.accounts>=backup.accounts,'Post-deployment account count is below the backed-up realm.');
 const login=await fetch(settings.origin+'/login',{signal:AbortSignal.timeout(8000),redirect:'error'});assert.equal(login.status,200);assert.ok((await login.text()).includes('Enter the realm'),'Anonymous login verification failed.');
 await writeFile(out+'/post-deploy.json',JSON.stringify({passed:true,sha:settings.sha,health:'ready',bots:status.bots,accounts:status.accounts,schemaHead:status.schemaHead,anonymousLogin:200},null,2));
 console.log('Exact-release health, schema, initialization state, 450 bots and login verified. No initialization or seed ran.');
 }
}finally{
 // Retain the restored private copy and remote dump for review/recovery. Never
 // automatically drop a database. Only disposable runner plaintext is removed.
 await rm(scratch,{recursive:true,force:true});
}
