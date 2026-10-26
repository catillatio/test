// Local disposable fixtures only; no game command grants or rewrites exist.
import {competitionFixture} from './phase6-fixtures.js';
export async function classicProfileFixture(){
 const r=await competitionFixture();
 const owner=await r.player('Lady Aveline Ashford',50),rival=await r.player('Cedric Blackthorn',50),patron=await r.player('Rowan of the March',50);
 for(const p of [owner,rival,patron])await r.ok(p,'/api/v1/tutorial',{action:'skip'});
 await r.prepare(owner,10000000);await r.legacyArmy(owner,20);
 for(const [itemId,quantity]of [['oathbound-greatsword',3],['crown-of-ash-blade',2],['sovereigns-bastion',2],['eclipse-citadel-plate',1],['ember-word',5],['lantern-mote',2]] as const)await r.ok(owner,'/api/v1/inventory/purchases',{itemId,quantity});
 for(const [propertyId,quantity]of [['smallholding',4],['woodland',2],['tempest-port',1]] as const)await r.ok(owner,'/api/v1/land/purchases',{propertyId,quantity});
 for(const [p,days]of [[owner,1084],[rival,730],[patron,365]] as const)await r.db.query('UPDATE accounts SET created_at=$2 WHERE id=$1',[p.accountId,new Date(+r.now()-days*86400000)]);
 const first=await r.ok(patron,'/api/v1/bounties/placements',{targetCharacterId:rival.id,amount:1000});await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[rival.id,r.now()]);
 const victory=await r.ok(owner,'/api/v1/battles',{targetCharacterId:rival.id,bountyId:first.data.bountyId});await r.ok(rival,'/api/v1/health/restorations');
 const second=await r.ok(patron,'/api/v1/bounties/placements',{targetCharacterId:owner.id,amount:1000});await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[owner.id,r.now()]);
 const returned=await r.ok(rival,'/api/v1/battles',{targetCharacterId:owner.id,bountyId:second.data.bountyId});
 for(const p of[owner,rival,patron])await r.me(p);
 return {...r,owner,rival,patron,victory,returned};
}
export async function profileBusinessSnapshot(db:Awaited<ReturnType<typeof competitionFixture>>['db']){
 const out:Record<string,string[]>={};for(const table of ['accounts','characters','wallets','vault_accounts','vault_entries','inventory_entries','inventory_lots','inventory_transactions','inventory_acquisition_events','land_holdings','land_accounts','income_cycles','land_income_settlements','land_partial_settlements','land_sales','maintenance_accounts','maintenance_events','economy_transactions','economy_entries','army_links','army_events','army_stacks','battles','bounties','bounty_kills','bounty_events','competitive_statistics','competitive_deaths','champion_standings','rivalry_totals','quest_runs','character_quest_progress','command_receipts','development_bots','realm_expansion_state','hudson_equipment_grants'])out[table]=(await db.query('SELECT row_to_json(t)::text AS row FROM '+table+' t ORDER BY row_to_json(t)::text')).rows.map(r=>r.row);return out;
}
