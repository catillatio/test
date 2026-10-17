// Verifies the compiled production entrypoint across a real process restart.
// Uses only an explicitly designated disposable PostgreSQL database.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {projectRoot} from '../src/config.js';
import {testDatabaseUrl} from '../tests/helpers.js';
import {createDatabase} from '../src/db.js';
import {migrate} from '../src/migrate.js';

if(!testDatabaseUrl)throw new Error('TEST_DATABASE_URL must designate a disposable *_test database. Build before running this check.');
const db=createDatabase(testDatabaseUrl);await migrate(db);await db.end();
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
const port=(socket.address() as {port:number}).port;await new Promise<void>(resolve=>socket.close(()=>resolve()));
const origin='http://127.0.0.1:'+port;
let child:ChildProcess|undefined,output='';
async function start(){
  // This fixture intentionally exercises loopback HTTP. Do not inherit the
  // current Codespace's provider origin into its isolated child process.
  const env={...process.env};delete env.CODESPACE_NAME;delete env.CODESPACES;delete env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  child=spawn(process.execPath,[join(projectRoot,'dist/server.js')],{cwd:projectRoot,env:{...env,DATABASE_URL:testDatabaseUrl,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:origin},stdio:['ignore','pipe','pipe']});
  child.stdout!.on('data',chunk=>{output=(output+chunk).slice(-4000);});child.stderr!.on('data',chunk=>{output=(output+chunk).slice(-4000);});
  for(let i=0;i<80;i++){
    if(child.exitCode!==null)throw new Error('Compiled server exited: '+output);
    if(await fetch(origin+'/healthz').then(r=>r.ok).catch(()=>false))return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Compiled server did not become ready: '+output);
}
async function stop(){
  if(!child||child.exitCode!==null)return;
  const closed=once(child,'exit'),watchdog=setTimeout(()=>child?.kill('SIGKILL'),5000);
  child.kill('SIGTERM');await closed;clearTimeout(watchdog);
}
async function player(suffix:string){
  const form=await fetch(origin+'/register'),html=await form.text();assert.equal(form.status,200);
  const anonymous=form.headers.getSetCookie().find(line=>line.startsWith('kr_session='))!.split(';')[0]!;
  const csrf=/name="csrf" value="([a-f0-9]{64})"/.exec(html)![1]!;
  const registered=await fetch(origin+'/register',{method:'POST',redirect:'manual',headers:{cookie:anonymous,origin,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({csrf,username:'restart_'+randomUUID().replaceAll('-','').slice(0,12),name:'Restart '+suffix,password:randomUUID()+'!aA1'})});
  assert.equal(registered.status,303);
  const cookie=registered.headers.getSetCookie().find(line=>line.startsWith('kr_session='))!.split(';')[0]!;
  const me=await fetch(origin+'/api/v1/me',{headers:{cookie}}).then(r=>r.json());
  return {cookie,csrf:me.csrfToken,id:me.state.id};
}
try{
  await start();const a=await player('Attacker'),b=await player('Defender');
  const command=async(url:string,body:Record<string,unknown>)=>{
    const response=await fetch(origin+url,{method:'POST',headers:{cookie:a.cookie,origin,'content-type':'application/json','x-csrf-token':a.csrf,'idempotency-key':randomUUID()},body:JSON.stringify(body)});
    assert.equal(response.status,200,await response.clone().text());return response.json();
  };
  for(let i=0;i<3;i++)await command('/api/v1/quests/border-patrol/runs',{});await command('/api/v1/skills',{resource:'attack'});await command('/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});
  await command('/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});const battle=await command('/api/v1/battles',{targetCharacterId:b.id});
  const before=(await fetch(origin+'/api/v1/me',{headers:{cookie:a.cookie}}).then(r=>r.json())).state;
  await stop();await start();
  const restored=await fetch(origin+'/api/v1/me',{headers:{cookie:a.cookie}});assert.equal(restored.status,200);
  const after=(await restored.json()).state;
  for(const key of ['id','gold','xp','level','mana','spirit','health','inventory','questsCompleted','land','training','skillPoints','maxMana'])assert.deepEqual(after[key],before[key],key);
  for(const owner of [a,b]){
    const report=await fetch(origin+'/api/v1/battles/'+battle.battleId,{headers:{cookie:owner.cookie}});assert.equal(report.status,200);
    assert.equal((await report.json()).battle.id,battle.battleId);
  }
  assert.equal((await fetch(origin+'/game/profile',{headers:{cookie:a.cookie}})).status,200);
  console.log('PASS: compiled server restarted; sessions, progression, inventory, Land clocks/balances and both players’ battle access survived.');
}finally{await stop();}
