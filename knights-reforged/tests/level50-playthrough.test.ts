import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {realm,testDatabaseUrl} from './helpers.js';
import {alpha,itemById} from '../src/alpha-rules.js';
import {provisionBots} from '../src/development.js';
import {projectRoot} from '../src/config.js';

test('a fresh player reaches level 50 and completes its finale through actual quest, inventory, army and income APIs',{skip:!testDatabaseUrl,timeout:180000},async()=>{
  let virtualNow=Date.now();const startedAt=virtualNow,r=await realm({clock:()=>new Date(virtualNow),developmentBotsEnabled:true,developmentBotRecruitmentEnabled:true,isolated:true,logger:process.env.DEBUG_REALM==='1'});
  try{
    await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
    const allies=(await r.db.query('SELECT character_id FROM development_bots ORDER BY character_id LIMIT 20')).rows.map(row=>row.character_id);let recruited=0;
    const player=await r.player('Returning Realm Knight');let state=await r.me(player),actions=0,runs=0,waits=0,highestLevel=1;
    const visited=new Set<string>(),checkpoints:{level:number;gold:number;quests:number;elapsedHours:number;hourlyNet:number}[]=[];
    const command=async(url:string,payload:Record<string,unknown>={})=>{assert.ok(++actions<2500,'Playthrough exceeded its bounded action budget.');const result=await r.ok(player,url,payload);state=result.state;return result;};
    while(!state.quests.find(q=>q.id==='defy-eclipsed-sovereign')!.completions){
      if(state.level>highestLevel){highestLevel=state.level;checkpoints.push({level:state.level,gold:state.gold,quests:state.questsCompleted,elapsedHours:(virtualNow-startedAt)/3600000,hourlyNet:state.economy.netHourlyIncome});}
      if(state.skillPoints>0&&state.maxMana<100){await command('/api/v1/skills',{resource:'mana'});continue;}
      let goal=state.level>=50?state.quests.find(q=>q.id==='defy-eclipsed-sovereign')!:
        state.quests.filter(q=>q.level<=state.level).sort((a,b)=>b.level-a.level||b.xp-a.xp)[0]!;
      while(goal.requiresLoot&&!state.loot.some(loot=>loot.id===goal.requiresLoot))goal=state.quests.find(q=>q.loot?.id===goal.requiresLoot)!;
      const recruits=Math.max(0,goal.army-state.army.participants);
      const maintenanceBuffer=Object.entries(goal.missing).reduce((n,[id,quantity])=>n+itemById.get(id)!.upkeep*quantity,0);
      if(state.gold>=goal.missingCost+maintenanceBuffer){
        if(recruits){assert.ok(recruited<allies.length);virtualNow+=31000;await command('/api/v1/army/invitations',{targetCharacterId:allies[recruited++]});continue;}
        if(Object.keys(goal.missing).length){await command('/api/v1/quests/'+goal.id+'/equipment');continue;}
      }else{
        goal=state.quests.filter(q=>q.level<=state.level&&!Object.keys(q.missing).length&&q.army<=state.army.participants&&(!q.requiresLoot||state.loot.some(loot=>loot.id===q.requiresLoot)))
          .sort((a,b)=>(b.goldMin+b.goldMax)/b.mana-(a.goldMin+a.goldMax)/a.mana||b.xp-a.xp)[0]!;
      }
      assert.ok(goal,'No playable fallback quest.');
      if(state.mana<goal.mana){
        // A return session advances the business clock; the real settlement and
        // recovery services alone produce the resulting resources and income.
        virtualNow+=(state.maxMana-state.mana)*alpha.resources.manaSeconds*1000+1000;waits++;
        assert.ok(virtualNow-startedAt<120*86400000,'Progression exceeded the generous virtual-time guard.');
        state=await r.me(player);continue;
      }
      await command('/api/v1/quests/'+goal.id+'/runs');runs++;visited.add(goal.area);
      if(runs%5===0){
        const investment=state.land.properties.filter(property=>property.unlocked&&property.owned<3&&property.price!==null&&property.price*3<=state.gold)
          .sort((a,b)=>b.level-a.level||b.hourlyIncome-a.hourlyIncome)[0];
        if(investment)await command('/api/v1/land/purchases',{propertyId:investment.id,quantity:1});
      }
    }
    assert.ok(state.level>=50);assert.ok(state.loot.some(loot=>loot.id==='eclipse-key'));assert.ok(state.land.holdings.length>0);assert.ok(state.army.participants>=18);
    assert.ok(visited.size>=10);assert.ok(waits>0);assert.ok(state.inventory.some(item=>item.level===50&&item.quantity>0));
    const rewards=(await r.db.query('SELECT sum(gold_reward)::bigint AS gold,sum(xp_reward)::int AS xp,count(*)::int AS runs FROM quest_runs WHERE character_id=$1',[player.id])).rows[0]!;
    assert.equal(rewards.xp,state.xp);assert.equal(rewards.runs,runs);
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM economy_transactions t JOIN economy_entries e ON e.transaction_id=t.id WHERE e.character_id=$1 AND t.reason='test_fixture'",[player.id])).rows[0]!.n,0);
    const report={ruleset:alpha.id,passed:true,clock:'Simulated elapsed resource/income time via a test-only SQL clock adapter; every HTTP action and settlement uses real PostgreSQL.',administrative_gold_xp_or_item_grants:0,
      actions,questRuns:runs,returnSessions:waits,simulatedElapsedHours:(virtualNow-startedAt)/3600000,finalLevel:state.level,lifetimeXp:state.xp,
      regionsVisited:[...visited],ownedProperties:state.land.properties.filter(p=>p.owned).map(p=>({id:p.id,quantity:p.owned})),hourlyNet:state.economy.netHourlyIncome,
      levelCheckpoints:checkpoints,limitation:'A Mana-focused automated build and accelerated waits do not establish human session durations or multiplayer balance.'};
    const out=join(projectRoot,'test-results');await mkdir(out,{recursive:true});await writeFile(join(out,'level50-playthrough.json'),JSON.stringify(report,null,2)+'\n');
    console.log('Level-50 playthrough:',JSON.stringify({actions,runs,waits,simulatedHours:report.simulatedElapsedHours,finalLevel:state.level}));
  }finally{await r.close();}
});
