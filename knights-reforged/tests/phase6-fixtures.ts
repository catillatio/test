import {realm} from './helpers.js';
export async function competitionFixture(){let now=new Date('2032-02-01T12:00:00Z');const r=await realm({isolated:true,clock:()=>now});
 async function player(name:string,level=5){const p=await r.player(name);await r.prepare(p,25000,30);for(let i=0;i<5;i++)await r.ok(p,'/api/v1/quests/border-patrol/runs');await transaction(r.db,sql=>sql.query('UPDATE characters SET attained_level=$2 WHERE id=$1',[p.id,level]));return p;}
 return {...r,player,now:()=>now,advance:(seconds:number)=>{now=new Date(+now+seconds*1000);}};
}

import type {RecoveryReference} from '../src/rarity-activation.js';
export const syntheticRecovery=():RecoveryReference=>({artifactId:'123456',encryptedSha256:'a'.repeat(64),sha:'b'.repeat(40),candidateDigest:'c'.repeat(64),expiresAt:new Date(Date.now()+7200000).toISOString()});

import {randomUUID} from 'node:crypto';import crypto from 'node:crypto';import {syncBuiltinESMExports} from 'node:module';
import {transaction} from '../src/db.js';import {expandedContent} from '../src/expansion-content.js';import {purchaseItems} from '../src/inventory.js';import type {Player} from './helpers.js';
// Only disposable test fixtures import this module. No runtime switch, endpoint
// or client draw exists. Server quest commands still validate every prerequisite.
export async function prepareRareQuest(r:Pick<Awaited<ReturnType<typeof realm>>,'db'|'prepare'|'legacyArmy'>&{player:(name:string)=>Promise<Player>},actor:Player){
 const quest=expandedContent.quests.find(q=>q.id==='storm-the-river-fortress')!;
 await r.prepare(actor,200000000);const militia=Number((await r.db.query('SELECT COALESCE(sum(quantity),0)::int n FROM army_stacks WHERE character_id=$1',[actor.id])).rows[0]!.n);if(militia<20)await r.legacyArmy(actor,20-militia);
 for(let n=0;n<26;n++){const ally=await r.player('Established Ally '+n);const pair=[actor.id,ally.id].sort();await transaction(r.db,sql=>sql.query("INSERT INTO army_links(low_id,high_id,inviter_id,status,created_at) VALUES($1,$2,$3,'accepted',clock_timestamp()-interval '2 days')",[...pair,actor.id]));}
 await transaction(r.db,async sql=>{await purchaseItems(sql,actor.id,100,quest.items,randomUUID(),new Date());await sql.query('UPDATE characters SET mana=max_mana WHERE id=$1',[actor.id]);const source=expandedContent.quests.find(q=>q.loot?.id===quest.requiresLoot)!;await sql.query('INSERT INTO character_loot(character_id,loot_id,name,source_quest,ruleset_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[actor.id,source.loot!.id,source.loot!.name,source.id,expandedContent.id]);});
 return quest;
}
export async function withQuestDraw<T>(draw:number,work:()=>Promise<T>){
 const original=crypto.randomInt;
 // The one-argument rarity draw is controlled inside this local test process;
 // the two-argument gold draw remains in its authoritative catalog range.
 crypto.randomInt=((min:number,max?:number)=>max===undefined?Math.min(draw,min-1):min) as typeof crypto.randomInt;syncBuiltinESMExports();
 try{return await work();}finally{crypto.randomInt=original;syncBuiltinESMExports();}
}

// Disposable historical claim fixtures intentionally omit modern HP fields.
export async function historicalClaim(db:import('../src/db.js').Database,claimant:Player,target:Player,sponsor:Player,source:'legacy_claim'|'finishing_claim'='legacy_claim'){
 const battleId=randomUUID(),bountyId=randomUUID(),at=new Date('2020-02-01T12:00:00Z');
 await transaction(db,async sql=>{
  await sql.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,created_at) VALUES($1,$2,$3,'alpha-0.3','defender_win','{}','{}',$4)",[battleId,claimant.id,target.id,at]);
  await sql.query("INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at,settled_at,claimant_id,battle_id) VALUES($1,$2,$3,100,10,'claimed','alpha-0.3',$4,$5,$6,$7,$8,$9)",[bountyId,sponsor.id,target.id,randomUUID(),new Date(+at-1000),new Date(+at+3600000),at,claimant.id,battleId]);
  await sql.query("INSERT INTO bounty_kills(bounty_id,battle_id,claimant_id,target_id,ruleset_id,source,awarded_at) VALUES($1,$2,$3,$4,'alpha-0.3',$5,$6)",[bountyId,battleId,claimant.id,target.id,source,at]);
  await sql.query("INSERT INTO bounty_events(id,bounty_id,kind,character_id,amount,created_at) VALUES($1,$2,'claimed',$3,100,$4)",[randomUUID(),bountyId,claimant.id,at]);
 });
 return {battleId,bountyId};
}
