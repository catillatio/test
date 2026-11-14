// Explicit disposable-only benchmark. Existing fixture rejects non-loopback/non-*_test URLs.
import {writeFileSync} from 'node:fs';import {performance} from 'node:perf_hooks';
import {setup,publicKey} from '../tests/graveyard-fixture.js';
import {graveyardCapacity,assertGraveyardFence} from '../src/privacy/graveyard.js';
import {listOpponents} from '../src/game.js';import {publicProfile} from '../src/profiles.js';import {settleDueAbandonedIncome} from '../src/bot-income.js';
const f=await setup(),rows:Record<string,unknown>[]=[];
try{
 const {syntheticCutover}=await import('../tests/level100-e2b-fixture.js');await syntheticCutover(f.r.db,false);
 for(const population of [6,12,24,48,96]){
  const before=(await graveyardCapacity(f.r.db)).world_count,start=performance.now();await f.populate(population);const creationMs=performance.now()-start;
  const times:number[]=[];for(let i=0;i<30;i++){const t=performance.now();await listOpponents(f.r.db,f.actor.id);times.push(performance.now()-t);}times.sort((a,b)=>a-b);
  const id=(await f.r.db.query('SELECT character_id FROM abandoned_kingdoms ORDER BY slot DESC LIMIT 1')).rows[0]!.character_id;
  const p=performance.now();await publicProfile(f.r.db,id);const profileMs=performance.now()-p;
  const latest=(await f.r.db.query('SELECT max(next_payment_at) AS at FROM income_cycles WHERE character_id IN(SELECT character_id FROM abandoned_kingdoms)')).rows[0]!.at;f.advance(new Date(+new Date(latest)+1));
  const t=performance.now(),income=await settleDueAbandonedIncome(f.r.db),incomeMs=performance.now()-t;
  if(income.settled!==population)throw new Error('Incomplete synthetic income sweep');await assertGraveyardFence(f.r.db,{publicKey});
  rows.push({population,added:population-before,creationMs:Math.round(creationMs),rivalQueryMedianMs:Number(times[15]!.toFixed(2)),rivalQueryP95Ms:Number(times[28]!.toFixed(2)),publicProfileMs:Number(profileMs.toFixed(2)),incomeSweepMs:Number(incomeMs.toFixed(2)),settled:income.settled,operationCount:(await graveyardCapacity(f.r.db)).operation_count});
 }
 const report={kind:'synthetic-postgresql-population-performance-v1',environment:'Owned disposable PostgreSQL 18, one synthetic human plus public NPCs, 30 rival queries per size; no production data or existing dev-bot population. Warm/cold/cache/noise and production historical tables differ; timings are not a production SLO.',rows};
 const text=JSON.stringify(report,null,2)+'\n';if(process.argv[2])writeFileSync(process.argv[2],text);else console.log(text);
}finally{await f.close();}
