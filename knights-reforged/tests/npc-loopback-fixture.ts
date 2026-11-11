// Test infrastructure only. Never relax assertLocalNpcTarget for Docker bridge
// addresses: PostgreSQL must itself see a loopback endpoint, not just a forwarded
// client URL. GitHub's ordinary published-port service does not satisfy that.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdir,writeFile} from 'node:fs/promises';
import {createDatabase} from '../src/db.js';
const exec=promisify(execFile);
const loopback=(address:unknown)=>address==='127.0.0.1'||address==='::1';

export async function npcLoopbackFixture(value:string){
 const url=new URL(value);
 assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname)&&!url.search&&!url.hash,'Only an existing local disposable test URL is supported');
 const original=createDatabase(value);let native=false;
 try{native=loopback((await original.query('SELECT host(inet_server_addr()) AS address')).rows[0]!.address);}finally{await original.end();}
 async function evidence(transport:string){await mkdir('test-results',{recursive:true});await writeFile('test-results/npc-fixture-network.json',JSON.stringify({transport,serverEndpointLoopback:true,guardUnchanged:true,syntheticOnly:true},null,2)+'\n');}
 if(native){await evidence('native-loopback');return {url:value,close:async()=>{}};}
 assert.equal(process.env.GITHUB_ACTIONS,'true','A bridge-backed local fixture needs an explicitly prepared loopback PostgreSQL; the NPC guard stays closed');
 const listener=createServer();await new Promise<void>((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
 const address=listener.address();assert.ok(address&&typeof address!=='string');const port=address.port;await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
 const nonce=randomUUID().replaceAll('-',''),name='kc-npc-fixture-'+nonce;
 let id:string|undefined,closed=false;
 const docker=(args:string[])=>exec('docker',args,{timeout:15000,maxBuffer:1024*1024,env:{...process.env,POSTGRES_USER:decodeURIComponent(url.username),POSTGRES_PASSWORD:decodeURIComponent(url.password),POSTGRES_DB:url.pathname.slice(1),PGPORT:String(port)}});
 async function close(){
  if(closed)return;closed=true;
  // An uncertain start acknowledgment is reconciled by this unpredictable name
  // AND the exact owner label, never by adopting/deleting a matching database.
  const target=id??name;
  let inspected;
  try{inspected=JSON.parse((await docker(['inspect',target])).stdout)[0];}catch(error){
   if(/No such (object|container)/i.test(String((error as {stderr?:string}).stderr)))return;
   throw new Error('Owned NPC fixture cleanup could not verify container identity');
  }
  assert.equal(inspected.Config.Labels['kingdom.npc.fixture'],nonce);assert.equal(inspected.Name,'/'+name);
  await docker(['rm','--force',inspected.Id]);
 }
 const interrupted=()=>{void close().then(()=>process.exit(143),()=>process.exit(1));};
 process.once('SIGTERM',interrupted);process.once('SIGINT',interrupted);
 async function finish(){process.removeListener('SIGTERM',interrupted);process.removeListener('SIGINT',interrupted);await close();}
 try{
  const started=await docker(['run','--detach','--name',name,'--label','kingdom.npc.fixture='+nonce,'--network','host','--tmpfs','/var/lib/postgresql:rw','-e','POSTGRES_USER','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB','-e','PGPORT','postgres:18-bookworm','postgres','-c','listen_addresses=127.0.0.1']);
  id=started.stdout.trim();assert.match(id,/^[a-f0-9]{64}$/);
  url.hostname='127.0.0.1';url.port=String(port);
  const deadline=Date.now()+45000;let ready=false;
  while(Date.now()<deadline){
   const probe=createDatabase(url.href);
   try{const row=(await probe.query('SELECT host(inet_server_addr()) AS address,current_database() AS database')).rows[0]!;assert.equal(row.address,'127.0.0.1');assert.equal(row.database,url.pathname.slice(1));ready=true;break;}catch{await delay(250);}finally{await probe.end();}
  }
  assert.ok(ready,'Owned loopback NPC fixture did not become ready within its bound');
  await evidence('ci-owned-host-network-loopback');
  return {url:url.href,close:finish};
 }catch{await finish();throw new Error('Owned loopback NPC fixture setup failed; no guard was bypassed');}
}
