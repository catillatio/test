// Linux Docker deployment check. Uses only its own private network/databases;
// never reads DATABASE_URL or publishes a PostgreSQL/application port.
// Build kingdom-come:railway-check and pull postgres:18-bookworm first.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dockerEnv={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
const suffix=randomUUID().slice(0,8),network='kc-check-'+suffix,postgres='kc-pg-'+suffix,web='kc-web-'+suffix;
const image=process.env.KINGDOM_CONTAINER_IMAGE??'kingdom-come:railway-check';
const postgresImage=process.env.KINGDOM_POSTGRES_IMAGE??'postgres:18-bookworm';
const folder=await mkdtemp(join(tmpdir(),'kc-container-'));
let password=randomUUID();
const origin='https://kingdom-come-production.up.railway.app',alphaMode=process.env.KINGDOM_TEST_PRIVATE_ALPHA==='1';
const port=alphaMode?8080:32123,privateHost=postgres+'.railway.internal',devPassword=randomUUID()+'Aa1!';
const railwayServiceId=randomUUID(),railwayEnvironmentId=randomUUID();
const result={image,postgresImage,privateAlpha:alphaMode,checks:[],portsPublished:false};
const gameEnvironment=()=>['NODE_ENV=production','HOST=0.0.0.0','PORT='+port,'APP_ORIGIN='+origin,
  'DATABASE_URL=postgresql://postgres:'+password+'@'+privateHost+':5432/railway_test',
  ...(alphaMode?['KINGDOM_PRIVATE_ALPHA=1','RAILWAY_SERVICE_ID='+railwayServiceId,'RAILWAY_ENVIRONMENT_ID='+railwayEnvironmentId,
    'ENABLE_DEV_BOTS=1','ENABLE_DEV_BOT_BOUNTIES=1','ENABLE_DEV_BOT_RECRUITMENT=1']:[])];
const docker=(args,options={})=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],
  {env:dockerEnv,encoding:'utf8',timeout:45000,maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],...options});
const check=(name)=>{result.checks.push(name);console.log('PASS: '+name);};
const sql=(database,statement)=>docker(['exec',postgres,'psql','-U','postgres','-d',database,'-X','-At','-v','ON_ERROR_STOP=1','-c',statement]).trim();
async function ready(command){
  for(let i=0;i<300;i++){
    try{command();return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  let diagnostic='';try{diagnostic=docker(['logs',postgres]).slice(-3500);}catch{}
  throw new Error('Disposable container did not become ready. '+diagnostic.replaceAll(password,'[redacted]'));
}
const runtimeCode=(code)=>JSON.parse(docker(['exec','-i',web,'node','--input-type=module'],{input:code}));
const client=`import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const origin=${JSON.stringify(origin)},base='http://127.0.0.1:${port}';
const headers={origin,host:'game.railway.internal:${port}','x-forwarded-proto':'https','x-forwarded-host':new URL(origin).host};
const session=r=>{const line=r.headers.getSetCookie().find(v=>v.startsWith('kr_session='));assert.ok(line);assert.match(line,/; Secure/);assert.match(line,/; HttpOnly/);return line.split(';')[0];};
async function state(cookie){const r=await fetch(base+'/api/v1/me',{headers:{cookie}});assert.equal(r.status,200);const payload=await r.json();assert.equal(payload.rulesetId,payload.state.rulesetId);return payload;}
async function command(actor,url,payload={},key=randomUUID()){
 const r=await fetch(base+url,{method:'POST',headers:{...headers,cookie:actor.cookie,'content-type':'application/json','x-csrf-token':actor.csrf,'idempotency-key':key},body:JSON.stringify(payload)});
 const body=await r.text();assert.equal(r.status,200,body);return JSON.parse(body);
}
`;
const data=(database)=>docker(['exec',postgres,'pg_dump','-U','postgres','-d',database,'--data-only','--inserts','--no-owner','--no-acl'])
  .split('\n').filter(line=>!line.startsWith('\\restrict ')&&!line.startsWith('\\unrestrict ')).join('\n');
try{
  await writeFile(join(folder,'postgres.env'),'POSTGRES_DB=railway_test\nPOSTGRES_PASSWORD='+password+'\n',{mode:0o600});
  await writeFile(join(folder,'game.env'),gameEnvironment().join('\n')+'\n',{mode:0o600});
  docker(['image','inspect',image]);docker(['image','inspect',postgresImage]);
  docker(['network','create',network]);
  docker(['run','-d','--name',postgres,'--network',network,'--network-alias',privateHost,'--env-file',join(folder,'postgres.env'),postgresImage]);
  await ready(()=>docker(['exec',postgres,'pg_isready','-U','postgres','-d','railway_test']));
  check('private PostgreSQL 18 started without a published port');
  let refused=false;
  try{docker(['run','--rm','--network',network,'--env-file',join(folder,'game.env'),image]);}
  catch(error){refused=true;assert.match(String(error.stdout),/Startup failed|migrations/);}
  assert.ok(refused);assert.equal(sql('railway_test',"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"),'0');
  check('unmigrated production startup fails without altering the empty database');
  const migrate=()=>docker(['run','--rm','--network',network,'--env-file',join(folder,'game.env'),image,'node','deployment/migrate.mjs']);
  if(alphaMode){
    const nextPassword=randomUUID();
    docker(['exec','-i',postgres,'psql','-U','postgres','-d','railway_test','-X','-v','ON_ERROR_STOP=1','-c','\\password'],{input:nextPassword+'\n'+nextPassword+'\n'});
    let oldRejected=false;
    try{migrate();}catch(error){oldRejected=true;assert.match(String(error.stderr)+String(error.stdout),/password authentication failed/);}
    assert.ok(oldRejected);assert.equal(sql('railway_test',"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"),'0');
    password=nextPassword;
    await writeFile(join(folder,'game.env'),gameEnvironment().join('\n')+'\n',{mode:0o600});
    check('hidden psql password rotation rejects old TCP credentials and accepts the synchronized private service URL');
  }
  if(alphaMode){
    // Test-only Phase 4.6 fixture. The production pre-deploy/start entrypoints
    // cannot run first-time initialization or accept its old credential.
    await writeFile(join(folder,'bootstrap.env'),[...gameEnvironment(),'KINGDOM_ALPHA_INITIALIZE=INITIALIZE_EMPTY_PRIVATE_ALPHA','KINGDOM_DEV_PASSWORD='+devPassword].join('\n')+'\n',{mode:0o600});
    docker(['run','--rm','--network',network,'--env-file',join(folder,'bootstrap.env'),image,'node','--input-type=module','-e',`
      import {createDatabase} from './dist/db.js';import {migrate} from './dist/migrate.js';import {initializePrivateAlpha} from './dist/development.js';
      const db=createDatabase(process.env.DATABASE_URL);try{await migrate(db,{through:'019_champions_and_rivalries.sql'});await db.query(\"DELETE FROM rulesets WHERE id='game-feel-1'\");await initializePrivateAlpha(db,process.env);}finally{await db.end();}
    `]);
    const original=data('railway_test');let missingCopyRejected=false;
    let oldSchemaStartupRejected=false;try{docker(['run','--rm','--network',network,'--env-file',join(folder,'game.env'),image]);}catch(error){oldSchemaStartupRejected=true;assert.match(String(error.stdout),/Phase 4.7 migrations are incomplete|Ruleset game-feel-1 is not installed/);}assert.ok(oldSchemaStartupRejected);assert.equal(data('railway_test'),original);check('Phase 4.7 startup refuses an unmigrated Phase 4.6 realm without touching data');
    try{migrate();}catch(error){missingCopyRejected=true;assert.match(String(error.stderr),/First live Phase 4.7 upgrade requires a verified restored backup/);}
    assert.ok(missingCopyRejected);assert.equal(data('railway_test'),original);
    check('first initialized-realm upgrade refuses a missing restored-copy gate without applying a migration or changing existing data');
    const prior=docker(['exec',postgres,'pg_dump','-U','postgres','-d','railway_test','--format=custom','--no-owner','--no-acl'],{encoding:null});
    docker(['exec',postgres,'createdb','-U','postgres','phase45_restore_test']);
    docker(['exec','-i',postgres,'pg_restore','-U','postgres','--dbname=phase45_restore_test','--single-transaction','--exit-on-error','--no-owner','--no-acl'],{input:prior});
    await writeFile(join(folder,'game.env'),[...gameEnvironment(),'KINGDOM_RESTORE_TEST_DATABASE=phase45_restore_test'].join('\n')+'\n',{mode:0o600});
    result.restoredUpgrade=JSON.parse(docker(['run','--rm','--network',network,'--env-file',join(folder,'game.env'),'-e','KINGDOM_RESTORE_TEST_DATABASE=phase45_restore_test',image,'node','deployment/check-upgrade.mjs']));
    assert.equal(result.restoredUpgrade.passed,true);assert.equal(result.restoredUpgrade.bots,450);assert.equal(result.restoredUpgrade.liveDatabaseConnected,false);
    assert.equal(sql('railway_test','SELECT count(*) FROM schema_migrations'),'19');
    check('native Phase 4.6 backup restores to a separate database; compiled upgrade checker preserves every old business row and all 450 rivals');
  }
  migrate();assert.equal(sql('railway_test','SELECT count(*) FROM schema_migrations'),'20');
  check('separate compiled pre-deploy runner installs all 20 migrations without initialization');
  if(alphaMode){
    assert.equal(sql('railway_test','SELECT count(*) FROM private_alpha_initializations'),'1');
    assert.equal(sql('railway_test','SELECT count(*) FROM accounts'),'451');
    assert.equal(sql('railway_test','SELECT count(*) FROM development_bots'),'450');
    assert.equal(sql('railway_test',"SELECT w.balance||':'||(s.quantity+1) FROM accounts a JOIN characters c ON c.account_id=a.id JOIN wallets w ON w.character_id=c.id JOIN army_stacks s ON s.character_id=c.id WHERE a.username='dev'"),'50000:10');
    check('Phase 4.7 upgrade preserves existing dev at 50000 gold/10 army and all 450 Phase 4.6 rivals');
    const status=JSON.parse(docker(['run','--rm','--network',network,'--env-file',join(folder,'game.env'),image,'node','deployment/status.mjs']));
    assert.equal(status.release,'phase4.7');assert.equal(status.schemaHead,'020_game_feel.sql');assert.equal(status.initialized,true);assert.equal(status.bots,450);assert.equal(status.active_bots,450);
    assert.equal(status.dev.username,'dev');assert.equal(status.dev.gold,50000);assert.equal(status.dev.recruited_army,10);
    assert.equal(status.maximum_bot_army,10);assert.equal(status.minimum_bot_plots,3);assert.equal(status.population.length,50);
    for(const level of status.population)assert.equal(level.rivals,9);
    check('compiled operator-only status reports the initial account and population without exposing credentials');
  }
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
  const healthy=()=>docker(['exec',web,'node','-e',"fetch('http://127.0.0.1:"+port+"/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]);
  await ready(healthy);
  check('production server binds port '+port+' and passes database healthcheck');
  const played=runtimeCode(client+`
    async function player(user='image_'+randomUUID().replaceAll('-','').slice(0,12)){
      const form=await fetch(base+'/register'),html=await form.text();assert.equal(form.status,200);
      const r=await fetch(base+'/register',{method:'POST',redirect:'manual',headers:{...headers,cookie:session(form),'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({csrf:/name="csrf" value="([a-f0-9]{64})"/.exec(html)[1],username:user,password:randomUUID()+'aA1!',name:'Image Knight'})});
      assert.equal(r.status,303,await r.clone().text());const cookie=session(r),me=await state(cookie);return {cookie,csrf:me.csrfToken,id:me.state.id};
    }
    async function dev(){
      const form=await fetch(base+'/login'),html=await form.text();
      const r=await fetch(base+'/login',{method:'POST',redirect:'manual',headers:{...headers,cookie:session(form),'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({csrf:/name="csrf" value="([a-f0-9]{64})"/.exec(html)[1],username:'dev',password:${JSON.stringify(devPassword)}})});
      assert.equal(r.status,303,await r.clone().text());const cookie=session(r),me=await state(cookie);
      assert.equal(me.state.gold,50000);assert.equal(me.state.army.participants,10);
      const rivals=await fetch(base+'/api/v1/opponents',{headers:{cookie}}).then(r=>r.json());assert.ok(rivals.opponents.some(r=>r.botTier));
      return {cookie,csrf:me.csrfToken,id:me.state.id};
    }
    const a=${alphaMode?'await dev()':'await player()'},b=await player();
    const key=randomUUID(),quest=await command(a,'/api/v1/quests/border-patrol/runs',{},key);
    assert.equal((await command(a,'/api/v1/quests/border-patrol/runs',{},key)).commandId,quest.commandId);
    for(let i=0;i<2;i++)await command(a,'/api/v1/quests/border-patrol/runs');
    await command(a,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:2});
    await command(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});
    await command(a,'/api/v1/vault/deposits',{amount:5});
    const battle=await command(a,'/api/v1/battles',{targetCharacterId:b.id});
    const injured=(await state(a.cookie)).state;
    const deniedHeal=await fetch(base+'/api/v1/health/restorations',{method:'POST',headers:{...headers,cookie:a.cookie,'content-type':'application/json','x-csrf-token':'invalid','idempotency-key':randomUUID()},body:'{}'});assert.equal(deniedHeal.status,403);
    const healKey=randomUUID(),healed=await command(a,'/api/v1/health/restorations',{maxCost:injured.healing.cost},healKey);
    assert.equal(healed.state.health,healed.state.maxHealth);assert.equal(healed.state.gold,injured.gold-healed.data.cost);
    await command(a,'/api/v1/health/restorations',{maxCost:injured.healing.cost},healKey);assert.equal((await state(a.cookie)).state.gold,healed.state.gold);
    const retired=await fetch(base+'/api/v1/army/recruitments',{method:'POST',headers:{...headers,cookie:a.cookie,'content-type':'application/json','x-csrf-token':a.csrf,'idempotency-key':randomUUID()},body:JSON.stringify({unitId:'militia',quantity:1})});assert.equal(retired.status,404);

    const comment=await command(a,'/api/v1/comments',{profileId:b.id,body:'A respectful production-container field report.'});
    for(const page of ['home','profile','quests','battle','bounties','armory','army','land','vault','settings','champions','tutorial']){
      const r=await fetch(base+'/game/'+page,{headers:{cookie:a.cookie}});assert.equal(r.status,200,await r.clone().text());
    }
    const invalid=await fetch(base+'/api/v1/quests/border-patrol/runs',{method:'POST',headers:{...headers,origin:'https://foreign.invalid',cookie:a.cookie,'x-csrf-token':a.csrf,'content-type':'application/json'},body:'{}'});
    assert.equal(invalid.status,403);
    const gray=${alphaMode?'await player("gray")':'null'};
    console.log(JSON.stringify({a,b,gray,messageId:comment.data.messageId,battleId:battle.battleId,before:(await state(a.cookie)).state}));
  `);
  check('real production HTTP registration, twelve pages, quests, quantity equipment, Land, Vault, PvP, idempotent gold healing/CSRF, retired militia and foreign-Origin rejection');
  if(alphaMode){
    let moderationDenied=false;
    try{docker(['run','--rm','--network',network,'--env-file',join(folder,'game.env'),image,'node','deployment/moderate.mjs','queue']);}catch(error){moderationDenied=true;assert.match(String(error.stderr),/ALLOW_REALM_MODERATION/);}
    assert.ok(moderationDenied);
    const moderate=(...args)=>JSON.parse(docker(['run','--rm','--network',network,'--env-file',join(folder,'game.env'),'-e','ALLOW_REALM_MODERATION=1','-e','REALM_MODERATOR_LABEL=Disposable security operator',image,'node','deployment/moderate.mjs',...args]));
    assert.deepEqual(moderate('queue'),{reports:[]});
    assert.equal(moderate('hide',played.messageId,'Regression moderation check').completed,true);
    assert.equal(sql('railway_test',"SELECT status FROM realm_messages WHERE id='"+played.messageId+"'"),'hidden');
    assert.equal(moderate('restore',played.messageId,'Verified restoration check').completed,true);
    check('compiled operator moderation works without development tools, requires explicit authorization and preserves the existing audit history');
    const broadcastIds=[randomUUID(),randomUUID(),randomUUID()];
    for(const id of broadcastIds)sql('railway_test',`INSERT INTO realm_messages(id,author_id,channel,body,command_id,ruleset_id,created_at)
      VALUES('${id}','${played.a.id}','broadcast','Disposable owner-reviewed broadcast','${randomUUID()}','community-0.1',clock_timestamp())`);
    assert.equal(moderate('broadcasts').broadcasts.length,3);
    const reviewed=moderate('review-broadcasts',...broadcastIds.slice(0,2));assert.equal(reviewed.records.length,2);
    let hideDenied=false;try{moderate('hide-broadcasts',...broadcastIds.slice(0,2));}catch(error){hideDenied=true;assert.match(String(error.stderr),/confirmation/);}assert.ok(hideDenied);
    await writeFile(join(folder,'moderation.env'),[...gameEnvironment(),'ALLOW_REALM_MODERATION=1','REALM_MODERATOR_LABEL=Disposable security operator',
      'KINGDOM_BROADCAST_REVIEW='+reviewed.reviewSha256,'KINGDOM_BROADCAST_CONFIRM=HIDE_REVIEWED_BROADCASTS'].join('\n')+'\n',{mode:0o600});
    const hideBroadcasts=()=>JSON.parse(docker(['run','--rm','--network',network,'--env-file',join(folder,'moderation.env'),image,'node','deployment/moderate.mjs','hide-broadcasts',...broadcastIds.slice(0,2)]));
    assert.equal(hideBroadcasts().hidden,2);assert.equal(hideBroadcasts().alreadyHidden,2);
    assert.equal(sql('railway_test',"SELECT status FROM realm_messages WHERE id='"+broadcastIds[2]+"'"),'visible');
    for(const id of broadcastIds.slice(0,2))assert.equal(moderate('restore',id,'Owner-approved reversal fixture').completed,true);
    assert.equal(moderate('broadcasts').broadcasts.length,3);
    check('compiled two-ID broadcast review, explicit approval, atomic idempotent hides and reversible restoration preserve unrelated messages');
    const inspect=JSON.parse(docker(['run','--rm','--network',network,'--env-file',join(folder,'game.env'),image,'node','deployment/grant-gray.mjs','inspect']));
    assert.equal(inspect.character_id,played.gray.id);
    await writeFile(join(folder,'grant.env'),[...gameEnvironment(),'KINGDOM_GRAY_ACCOUNT_ID='+inspect.account_id,'KINGDOM_GRAY_GRANT_CONFIRM=GRANT_GRAY_50000_PHASE44','KINGDOM_OPERATOR_REFERENCE=Disposable production-container regression'].join('\n')+'\n',{mode:0o600});
    const grant=()=>JSON.parse(docker(['run','--rm','--network',network,'--env-file',join(folder,'grant.env'),image,'node','deployment/grant-gray.mjs','apply']));
    assert.equal(grant().applied,true);assert.equal(grant().alreadyApplied,true);
    assert.equal(Number(sql('railway_test',"SELECT balance FROM wallets WHERE character_id='"+played.gray.id+"'")),inspect.spendable_gold+50000);
    assert.equal(sql('railway_test','SELECT count(*) FROM authorized_gold_grants'),'1');
    check('operator-only gray inspect/apply grants exactly 50000 spendable gold once on the disposable identity');
    const unchanged=data('railway_test');
    for(const entrypoint of ['deployment/migrate.mjs','deployment/start.mjs']){
      let denied=false;try{docker(['run','--rm','--network',network,'--env-file',join(folder,'bootstrap.env'),image,'node',entrypoint]);}catch(error){denied=true;assert.match(String(error.stderr),/Remove first-time initialization/);}assert.ok(denied);
    }
    assert.equal(data('railway_test'),unchanged);check('production migration/start refuse leftover bootstrap credentials before any database changes');
  }
  const before=data('railway_test');
  if(alphaMode)docker(['run','--rm','--network',network,'--env-file',join(folder,'game.env'),image,'node','deployment/status.mjs']);
  assert.equal(data('railway_test'),before);
  migrate();
  if(alphaMode){
    const noSecret=gameEnvironment().filter(line=>!line.startsWith('KINGDOM_DEV_PASSWORD='));
    await writeFile(join(folder,'game.env'),noSecret.join('\n')+'\n',{mode:0o600});
  }
  migrate();
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
  if(alphaMode){
    const permanent=gameEnvironment().filter(line=>!line.startsWith('KINGDOM_DEV_PASSWORD=')&&!line.startsWith('KINGDOM_ALPHA_INITIALIZE='));
    await writeFile(join(folder,'game.env'),permanent.join('\n')+'\n',{mode:0o600});
    migrate();
    docker(['rm',web]);
    docker(['run','-d','--name',web,'--network',network,'--env-file',join(folder,'game.env'),image]);
    check('redeploy removes bootstrap flag/secret and starts a fresh web container against the same persistent realm');
  }else docker(['start',web]);
  await ready(healthy);
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
