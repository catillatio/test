// Linux Docker deployment check. Uses only its own private network/databases;
// never reads DATABASE_URL or publishes a PostgreSQL/application port.
// Build kingdom-come:railway-check and pull postgres:18-bookworm first.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dockerEnv={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
const suffix=randomUUID().slice(0,8),network='kc-check-'+suffix,postgres='kc-pg-'+suffix,web='kc-web-'+suffix;
const image=process.env.KINGDOM_CONTAINER_IMAGE??'kingdom-come:railway-check';
const postgresImage=process.env.KINGDOM_POSTGRES_IMAGE??'postgres:18-bookworm';
const folder=await mkdtemp(join(tmpdir(),'kc-container-'));
const password=randomUUID(),origin='https://kingdom-come-production.up.railway.app';
const result={image,postgresImage,checks:[],portsPublished:false};
const docker=(args,options={})=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],
  {env:dockerEnv,encoding:'utf8',timeout:45000,maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],...options});
const check=(name)=>{result.checks.push(name);console.log('PASS: '+name);};
const sql=(database,statement)=>docker(['exec',postgres,'psql','-U','postgres','-d',database,'-X','-At','-v','ON_ERROR_STOP=1','-c',statement]).trim();
async function ready(command){
  for(let i=0;i<100;i++){
    try{command();return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw new Error('Disposable container did not become ready.');
}
const runtimeCode=(code)=>JSON.parse(docker(['exec','-i',web,'node','--input-type=module'],{input:code}));
const client=`import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const origin=${JSON.stringify(origin)},base='http://127.0.0.1:32123';
const headers={origin,host:'game.railway.internal:32123','x-forwarded-proto':'https','x-forwarded-host':new URL(origin).host};
const session=r=>{const line=r.headers.getSetCookie().find(v=>v.startsWith('kr_session='));assert.ok(line);assert.match(line,/; Secure/);assert.match(line,/; HttpOnly/);return line.split(';')[0];};
async function state(cookie){const r=await fetch(base+'/api/v1/me',{headers:{cookie}});assert.equal(r.status,200);return r.json();}
async function command(actor,url,payload={},key=randomUUID()){
 const r=await fetch(base+url,{method:'POST',headers:{...headers,cookie:actor.cookie,'content-type':'application/json','x-csrf-token':actor.csrf,'idempotency-key':key},body:JSON.stringify(payload)});
 const body=await r.text();assert.equal(r.status,200,body);return JSON.parse(body);
}
`;
const data=(database)=>docker(['exec',postgres,'pg_dump','-U','postgres','-d',database,'--data-only','--inserts','--no-owner','--no-acl'])
  .split('\n').filter(line=>!line.startsWith('\\restrict ')&&!line.startsWith('\\unrestrict ')).join('\n');
try{
  await writeFile(join(folder,'postgres.env'),'POSTGRES_DB=railway_test\nPOSTGRES_PASSWORD='+password+'\n',{mode:0o600});
  await writeFile(join(folder,'game.env'),['NODE_ENV=production','HOST=0.0.0.0','PORT=32123','APP_ORIGIN='+origin,
    'DATABASE_URL=postgresql://postgres:'+password+'@'+postgres+':5432/railway_test'].join('\n')+'\n',{mode:0o600});
  docker(['image','inspect',image]);docker(['image','inspect',postgresImage]);
  docker(['network','create',network]);
  docker(['run','-d','--name',postgres,'--network',network,'--env-file',join(folder,'postgres.env'),postgresImage]);
  await ready(()=>docker(['exec',postgres,'pg_isready','-U','postgres','-d','railway_test']));
  check('private PostgreSQL 18 started without a published port');
  let refused=false;
  try{docker(['run','--rm','--network',network,'--env-file',join(folder,'game.env'),image]);}
  catch(error){refused=true;assert.match(String(error.stdout),/Startup failed|migrations/);}
  assert.ok(refused);assert.equal(sql('railway_test',"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"),'0');
  check('unmigrated production startup fails without altering the empty database');
  const migrate=()=>docker(['run','--rm','--network',network,'--env-file',join(folder,'game.env'),image,'node','deployment/migrate.mjs']);
  migrate();assert.equal(sql('railway_test','SELECT count(*) FROM schema_migrations'),'14');
  check('separate compiled pre-deploy runner installs all 14 migrations');
  const contents=JSON.parse(docker(['run','--rm',image,'node','--input-type=module','-e',`
    import fs from 'node:fs';import {hash,verify} from '@node-rs/argon2';
    const digest=await hash('disposable-container-fixture');
    const missing=['.env','src','tests','original-reference','node_modules/tsx','/run/secrets/proxy_ca'];
    console.log(JSON.stringify({uid:process.getuid(),argon:await verify(digest,'disposable-container-fixture'),
      absent:missing.every(p=>!fs.existsSync(p)),files:['dist/server.js','views/layout.ejs','public/phase41.css','rulesets/alpha-0.3/rules.json','migrations/014_economy_and_progression.sql'].every(p=>fs.existsSync(p))}));
  `]));
  assert.equal(contents.uid,1000);assert.equal(contents.argon,true);assert.equal(contents.absent,true);assert.equal(contents.files,true);
  check('non-root production image has native Argon2/assets/catalogs and excludes dev dependencies, source, secrets and research');
  docker(['run','-d','--name',web,'--network',network,'--env-file',join(folder,'game.env'),image]);
  const healthy=()=>docker(['exec',web,'node','-e',"fetch('http://127.0.0.1:32123/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]);
  await ready(healthy);
  check('production server binds dynamically assigned port 32123 and passes database healthcheck');
  const played=runtimeCode(client+`
    async function player(){
      const form=await fetch(base+'/register'),html=await form.text();assert.equal(form.status,200);
      const r=await fetch(base+'/register',{method:'POST',redirect:'manual',headers:{...headers,cookie:session(form),'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({csrf:/name="csrf" value="([a-f0-9]{64})"/.exec(html)[1],username:'image_'+randomUUID().replaceAll('-','').slice(0,12),password:randomUUID()+'aA1!',name:'Image Knight'})});
      assert.equal(r.status,303,await r.clone().text());const cookie=session(r),me=await state(cookie);return {cookie,csrf:me.csrfToken,id:me.state.id};
    }
    const a=await player(),b=await player();
    const key=randomUUID(),quest=await command(a,'/api/v1/quests/border-patrol/runs',{},key);
    assert.equal((await command(a,'/api/v1/quests/border-patrol/runs',{},key)).commandId,quest.commandId);
    for(let i=0;i<2;i++)await command(a,'/api/v1/quests/border-patrol/runs');
    await command(a,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:2});
    await command(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});
    await command(a,'/api/v1/vault/deposits',{amount:5});
    const battle=await command(a,'/api/v1/battles',{targetCharacterId:b.id});
    for(const page of ['home','profile','quests','battle','bounties','armory','army','land','vault','settings']){
      const r=await fetch(base+'/game/'+page,{headers:{cookie:a.cookie}});assert.equal(r.status,200,await r.clone().text());
    }
    const invalid=await fetch(base+'/api/v1/quests/border-patrol/runs',{method:'POST',headers:{...headers,origin:'https://foreign.invalid',cookie:a.cookie,'x-csrf-token':a.csrf,'content-type':'application/json'},body:'{}'});
    assert.equal(invalid.status,403);
    console.log(JSON.stringify({a,b,battleId:battle.battleId,before:(await state(a.cookie)).state}));
  `);
  check('real production HTTP registration, ten pages, quests, quantity equipment, Land, Vault, PvP and foreign-Origin rejection');
  const before=data('railway_test');migrate();migrate();
  assert.equal(data('railway_test'),before);
  check('repeated pre-deploy migrations preserve every table row, session, holding and financial record');
  const dump=docker(['exec',postgres,'pg_dump','-U','postgres','-d','railway_test','--format=custom','--no-owner','--no-acl'],{encoding:null});
  docker(['exec',postgres,'createdb','-U','postgres','railway_restore_test']);
  docker(['exec','-i',postgres,'pg_restore','-U','postgres','--dbname=railway_restore_test','--single-transaction','--exit-on-error','--no-owner','--no-acl'],{input:dump});
  assert.equal(data('railway_restore_test'),before);
  check('native custom-format backup restores atomically into a separate fresh database with identical data');
  result.backupBytes=dump.length;result.dataDigest=createHash('sha256').update(before).digest('hex');
  docker(['stop','--time','15',web]);
  assert.equal(JSON.parse(docker(['inspect',web]))[0].State.ExitCode,0);
  docker(['start',web]);await ready(healthy);
  const after=runtimeCode(client+`console.log(JSON.stringify((await state(${JSON.stringify(played.a.cookie)})).state));`);
  for(const key of ['id','gold','bankedGold','xp','level','inventory','questsCompleted','army','skillPoints'])assert.deepEqual(after[key],played.before[key],key);
  assert.equal(after.land.hourlyIncome,8);
  assert.equal(after.land.hourlyIncome,played.before.land.hourlyIncome);
  assert.equal(after.land.hourlyUpkeep,played.before.land.hourlyUpkeep);
  assert.equal(after.land.netHourlyIncome,played.before.land.netHourlyIncome);
  assert.equal(after.land.nextPaymentAt,played.before.land.nextPaymentAt);
  const logout=runtimeCode(client+`
    const cookie=${JSON.stringify(played.a.cookie)},me=await state(cookie);
    const r=await fetch(base+'/logout',{method:'POST',redirect:'manual',headers:{...headers,cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:me.csrfToken})});
    assert.equal(r.status,303);session(r);assert.equal((await fetch(base+'/api/v1/me',{headers:{cookie}})).status,401);console.log('true');
  `);
  assert.equal(logout,true);
  check('SIGTERM is graceful; restart preserves session/gameplay/income schedule; Secure logout revokes session');
  const inspection=JSON.parse(docker(['inspect',web,postgres]));
  for(const container of inspection)assert.deepEqual(container.HostConfig.PortBindings,{});
  check('neither web nor PostgreSQL container publishes a port');
  console.log(JSON.stringify(result,null,2));
}finally{
  for(const name of [web,postgres])try{docker(['rm','-f','-v',name]);}catch{}
  try{docker(['network','rm',network]);}catch{}
  await rm(folder,{recursive:true,force:true});
}
