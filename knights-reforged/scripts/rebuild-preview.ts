// Private local review fixture, never a public route or production command.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {uiThemeFixture} from '../tests/home-theme-fixture.js';
import {transaction} from '../src/db.js';
import {testDatabaseUrl} from '../tests/helpers.js';
import {experienceView} from '../src/experience.js';
import {moderateMessage} from '../src/community.js';
import {expandedContent} from '../src/expansion-content.js';
assert.ok(testDatabaseUrl,'Local disposable test database required');
const r=await uiThemeFixture();
await r.ok(r.rival,'/api/v1/comments',{profileId:r.owner.id,body:'The northern road is clear. My banner stands with yours.'});
await r.ok(r.patron,'/api/v1/broadcasts',{body:'A new day in the realm. Good fortune to every company on the road.'});
for(let n=0;n<3;n++){
 r.advance(125);
 await transaction(r.db,sql=>sql.query('UPDATE characters SET health=max_health,spirit=max_spirit,health_updated_at=$2,spirit_updated_at=$2 WHERE id=ANY($1::uuid[])',[[r.owner.id,r.rival.id],r.now()]));
 await r.ok(r.owner,'/api/v1/battles',{targetCharacterId:r.rival.id});
}
// A genuine saved defeat, not a relabeled victory from the weak rival fixture.
const formidable=await r.player('Marshal of the Black Gate',75);await r.prepare(formidable,500000000);await r.legacyArmy(formidable,20);
for(const category of ['weapon','armor','spell']){
 const item=expandedContent.items.filter(i=>i.category===category&&i.level<=75&&i.acquisition!=='quest-exclusive').sort((a,b)=>b.defense-a.defense||b.attack-a.attack)[0]!;
 await r.ok(formidable,'/api/v1/inventory/purchases',{itemId:item.id,quantity:21});
}
await transaction(r.db,sql=>sql.query('UPDATE characters SET health=max_health,spirit=max_spirit,health_updated_at=$2,spirit_updated_at=$2 WHERE id=$1',[r.owner.id,r.now()]));
const defeat=await r.ok(r.owner,'/api/v1/battles',{targetCharacterId:formidable.id});
assert.equal((await r.db.query('SELECT result FROM battles WHERE id=$1',[defeat.battleId])).rows[0]!.result.winnerId,formidable.id);
await transaction(r.db,sql=>sql.query('UPDATE characters SET health=72,health_updated_at=$2 WHERE id=$1',[r.owner.id,r.now()]));
await transaction(r.db,sql=>sql.query("UPDATE characters SET profile_class='Warden' WHERE id=$1",[r.rival.id]));
await transaction(r.db,sql=>sql.query("UPDATE characters SET profile_class='Spellward' WHERE id=$1",[r.patron.id]));
await transaction(r.db,sql=>sql.query('UPDATE characters SET health=40,health_updated_at=$2 WHERE id=$1',[r.coverage.poor.id,r.now()]));
const muted=await r.player('Silenced Herald',10);await moderateMessage(r.db,{action:'mute',characterId:muted.id,operator:'local-synthetic-review',reason:'Never rendered private note',hours:5});
for(const [p,username] of [[r.owner,'ladyaveline'],[r.rival,'cedricblackthorn'],[r.patron,'rowanvale'],[muted,'silencedherald']] as const)await r.db.query('UPDATE accounts SET username=$2 WHERE id=$1',[p.accountId,username]);
// The policy is enabled only in this disposable fixture. Both renderers see
// identical, already-paid wallets; screenshots never fake a paid receipt.
await r.db.query('UPDATE achievement_gold_state SET enabled=true');
for(const p of [r.owner,r.rival,r.patron,r.coverage.poor,muted])await experienceView(r.db,p.id);
// Keep the insufficient-carried-Gold example genuine after retroactive awards.
// Existing Vault transfers preserve its funds; no fixture balance is erased.
const poorBalance=(await r.me(r.coverage.poor)).gold;if(poorBalance)await r.ok(r.coverage.poor,'/api/v1/vault/deposits',{amount:poorBalance});
assert.equal((await r.me(r.coverage.poor)).gold,0);
const baselinePath='/dev/shm/kc-rebuild-baseline/knights-reforged/src/app.ts';
const baseline=await import(pathToFileURL(baselinePath).href);
const apps:Awaited<ReturnType<typeof createApp>>[]=[];const origins:string[]=[];
for(const make of [baseline.createApp,createApp]){
 const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000'});
 const app=await make({db:r.db,config});apps.push(app);
 const origin=await app.listen({host:'127.0.0.1',port:0});config.origin=origin;origins.push(origin);
}
await writeFile('/dev/shm/kc-rebuild-preview.json',JSON.stringify({origins,owner:r.owner,rival:r.rival,patron:r.patron,coverage:r.coverage,muted,now:r.now().toISOString(),schema:(await r.db.query('SELECT current_schema() AS s')).rows[0]!.s,victory:r.victory,defeat,returned:r.returned}),{mode:0o600});
console.log('REBUILD_PREVIEW: READY — isolated synthetic fixture; two loopback renderers');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{for(const app of apps)await app.close();await r.close();process.exit(0);});
