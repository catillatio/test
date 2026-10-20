import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {realm,testDatabaseUrl} from './helpers.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {propertyName} from '../src/property-presentation.js';
import {levelCelebration} from '../src/experience.js';
import {provisionBots} from '../src/development.js';
import {migrate} from '../src/migrate.js';

test('Gold Mine is a current display alias, not a mutation of any immutable catalog or unrelated Moonwell content',()=>{
 const before=JSON.stringify(alpha),mine=alpha.properties.find(p=>p.id==='moonwell-sanctuary')!;
 assert.equal(mine.name,'Moonwell Sanctuary');assert.equal(propertyName(mine.id,mine.name),'Gold Mine');
 assert.equal(propertyName('wyrmcrest-keep','Wyrmcrest Keep'),'Wyrmcrest Keep');
 assert.equal(propertyName('moonwell-veil','Moonwell Veil'),'Moonwell Veil');
 assert.equal(propertyName('secure-moonwell','Secure the Moonwell'),'Secure the Moonwell');
 assert.ok(levelCelebration(mine.level-1,mine.level,1)!.land.includes('Gold Mine'));
 assert.equal(JSON.stringify(alpha),before);
});

test('approved replacement artwork is checksum-verified and maps only the two preserved property IDs',()=>{
 const root=new URL('../',import.meta.url),manifest=JSON.parse(readFileSync(new URL('public/art/properties-49/provenance.json',root),'utf8'));
 assert.equal(createHash('sha256').update(readFileSync(new URL(manifest.source,root))).digest('hex'),manifest.sourceSha256);
 assert.deepEqual(manifest.assets.map((a:any)=>a.id),['wyrmcrest-keep','moonwell-sanctuary']);
 for(const a of manifest.assets){const bytes=readFileSync(new URL('public/art/properties-49/'+a.asset,root));assert.equal(bytes.length,a.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);assert.ok(alpha.properties.some(p=>p.id===a.id));}
});

test('populated holdings, 450 bot identities, historical Moonwell receipts and financial records survive display rename and restart',{skip:!testDatabaseUrl},async()=>{
 const now=new Date('2049-04-01T12:00:00Z'),r=await realm({isolated:true,clock:()=>now,developmentBotsEnabled:true});try{
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  const a=await r.player('Property Owner Fixture'),viewer=await r.player('Property Viewer Fixture');
  await r.prepare(a,500000,Array.from({length:39},(_,i)=>levelRequirement(i+1)).reduce((s,n)=>s+n,0));
  const key=randomUUID(),payload={propertyId:'moonwell-sanctuary',quantity:1},purchase=await r.ok(a,'/api/v1/land/purchases',payload,key);
  // Explicit pre-rename fixture. Existing historical rows retain the old name;
  // no production migration or operator operation is used to construct it.
  const {state:ignoredState,...saved}=purchase;
  const old={...saved,message:purchase.message.replaceAll('Gold Mine','Moonwell Sanctuary'),data:{...purchase.data,itemName:'Moonwell Sanctuary'}};
  await r.db.query('UPDATE command_receipts SET result=$3 WHERE account_id=$1 AND command_id=$2',[a.accountId,key,old]);
  const oldestKey=randomUUID(),{itemName:ignoredName,...oldestData}=old.data;
  const oldest={...old,commandId:oldestKey,data:oldestData};
  await r.db.query("INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) SELECT account_id,$3,kind,intent_hash,$4 FROM command_receipts WHERE account_id=$1 AND command_id=$2",[a.accountId,key,oldestKey,oldest]);
  await r.db.query("UPDATE land_holdings SET property_name='Moonwell Sanctuary' WHERE character_id=$1",[a.id]);
  await migrate(r.db);await r.me(a);await r.me(viewer);
  const tables=['accounts','development_bots','wallets','vault_accounts','vault_entries','inventory_entries','inventory_lots','inventory_transactions','land_holdings','land_income_settlements','land_partial_settlements','land_accounts','income_cycles','land_sales','economy_transactions','economy_entries','maintenance_accounts','maintenance_events','bot_finance_cycles','bot_finance_events','army_stacks','battles','bounties','bounty_events','command_receipts','rulesets','champion_standings','rivalry_totals'];
  async function snapshot(){const out:Record<string,string[]>={};for(const t of tables)out[t]=(await r.db.query('SELECT row_to_json(t)::text row FROM '+t+' t')).rows.map(x=>x.row).sort();return out;}
  const before=await snapshot();await migrate(r.db);
  const state=await r.me(a),mine=state.land.properties.find(p=>p.id===payload.propertyId)!;
  assert.equal(mine.name,'Gold Mine');assert.equal(state.land.holdings.find(h=>h.propertyId===payload.propertyId)!.name,'Gold Mine');
  const catalog=alpha.properties.find(p=>p.id===payload.propertyId)!;assert.equal(mine.basePrice,catalog.price);assert.equal(mine.hourlyIncome,catalog.hourlyIncome);assert.equal(mine.hourlyUpkeep,catalog.hourlyUpkeep);assert.equal(mine.level,catalog.level);
  for(const url of['/game/land','/game/profile','/game/players/'+a.id]){
   const response=await r.app.inject({url,headers:{cookie:url.includes('/players/')?viewer.cookie:a.cookie}});assert.equal(response.statusCode,200);assert.match(response.body,/Gold Mine/);assert.match(response.body,/data-art-atlas="properties-49"/);
  }
  const receipt=await r.app.inject({url:'/game/purchases/'+key,headers:{cookie:a.cookie}});assert.equal(receipt.statusCode,200);assert.match(receipt.body,/<h3>Moonwell Sanctuary<\/h3>/);assert.match(receipt.body,/aria-label="Buy more Gold Mine"/);
  const oldestPage=await r.app.inject({url:'/game/purchases/'+oldestKey,headers:{cookie:a.cookie}});assert.equal(oldestPage.statusCode,200);assert.match(oldestPage.body,/<h3>Moonwell Sanctuary<\/h3>/);
  const denied=await r.app.inject({url:'/game/purchases/'+key,headers:{cookie:viewer.cookie}});assert.equal(denied.statusCode,404);
  const {state:retryState,...retried}=await r.ok(a,'/api/v1/land/purchases',payload,key);assert.deepEqual(retried,old);
  assert.deepEqual(await snapshot(),before,'Read/display/retry/migration cannot rewrite existing records');assert.equal(before.development_bots!.length,450);
  const next=await r.ok(a,'/api/v1/land/purchases',payload);assert.equal(next.data.itemName,'Gold Mine');assert.equal(next.data.propertyId,'moonwell-sanctuary');
  const newReceipt=await r.app.inject({url:'/game/purchases/'+next.commandId,headers:{cookie:a.cookie}});assert.match(newReceipt.body,/<h3>Gold Mine<\/h3>/);
  const oldRow=(await r.db.query('SELECT result FROM command_receipts WHERE account_id=$1 AND command_id=$2',[a.accountId,key])).rows[0]!.result;assert.deepEqual(oldRow,old);
  const {createApp}=await import('../src/app.js'),{loadConfig}=await import('../src/config.js');
  const restarted=await createApp({db:r.db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',ENABLE_DEV_BOTS:'1'})});
  try{const response=await restarted.inject({url:'/game/purchases/'+key,headers:{cookie:a.cookie}});assert.equal(response.statusCode,200);assert.match(response.body,/<h3>Moonwell Sanctuary<\/h3>/);}finally{await restarted.close();}
 }finally{await r.close();}
});
