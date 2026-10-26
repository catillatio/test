import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';import {listOpponents} from '../src/game.js';
const skip=!testDatabaseUrl;
test('cyclic rivals cover tiny/large populations once, freeze pagination across attacks, and retain old cursors',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Rotating Viewer');assert.deepEqual((await listOpponents(r.db,a.id)).opponents,[]);
  const b=await r.player('Only Rival');assert.equal((await listOpponents(r.db,a.id)).opponents[0]!.id,b.id);
  for(let i=0;i<24;i++)await r.player('Rival '+i);
  const excluded=await r.player('Unavailable Rival');await r.db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[excluded.accountId]);
  const far=await r.player('Distant Rival');await r.prepare(far,0,50000);
  const page=await listOpponents(r.db,a.id),ids=page.opponents.map(p=>p.id);assert.equal(ids.length,20);assert.ok(!ids.includes(excluded.id));assert.ok(!ids.includes(far.id));
  const target=ids[0]!;await r.ok(a,'/api/v1/battles',{targetCharacterId:target});
  const refreshed=await listOpponents(r.db,a.id);assert.notEqual(refreshed.opponents[0]!.id,target,'just-attacked rival is not elevated when alternatives exist');
  const next=await listOpponents(r.db,a.id,page.nextCursor!);assert.equal(new Set([...ids,...next.opponents.map(p=>p.id)]).size,25);assert.equal(next.nextCursor,null);assert.ok(next.opponents.every(p=>!ids.includes(p.id)));
  for(const seed of [randomUUID(),randomUUID()]){let cursor:string|undefined,seen:string[]=[];do{const next=await listOpponents(r.db,a.id,cursor,false,false,seed);seen.push(...next.opponents.map(p=>p.id));cursor=next.nextCursor??undefined;}while(cursor);assert.equal(seen.length,25);assert.equal(new Set(seen).size,25);}
  const old=(await r.db.query(`SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at,id FROM characters WHERE id=$1`,[b.id])).rows[0]!;
  assert.ok(Array.isArray((await listOpponents(r.db,a.id,old.at+'~'+old.id)).opponents));
  for(const cursor of ['bad','r1~bad~0~'+b.id,'r1~'+b.id+'~2~'+b.id])await assert.rejects(listOpponents(r.db,a.id,cursor),/Invalid rival page/);
  await assert.rejects(listOpponents(r.db,a.id,undefined,false,false,'<script>'),/Invalid rival refresh/);
  const api=await r.app.inject({url:'/api/v1/opponents?rotation='+randomUUID(),headers:{cookie:a.cookie}});assert.equal(api.statusCode,200,api.body);
 }finally{await r.close();}
});
