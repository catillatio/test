import type {Sql} from './db.js';
export function killDeathRatio(kills:string,deaths:string){
 const k=BigInt(kills),d=BigInt(deaths);if(d===0n)return null;
 const hundredths=k*100n/d;return `${hundredths/100n}.${String(hundredths%100n).padStart(2,'0')}`;
}
export async function competitiveProfile(sql:Sql,id:string){
 const row=(await sql.query(`SELECT p.player_kills::text AS kills,p.player_deaths::text AS deaths,
 p.bounties_received::text AS wanted,s.bounty_claims::text AS claims,
 s.battle_victories::text AS wins,s.battle_defeats::text AS losses
 FROM competitive_statistics p JOIN champion_standings s ON s.character_id=p.character_id
 WHERE p.character_id=$1 AND s.eligible`,[id])).rows[0];
 return row?{kills:String(row.kills),deaths:String(row.deaths),ratio:killDeathRatio(row.kills,row.deaths),bountyClaims:String(row.claims),bountiesReceived:String(row.wanted),wins:String(row.wins),losses:String(row.losses)}:null;
}
export async function directedRivalry(sql:Sql,viewer:string,opponent:string){
 const pair=[viewer,opponent].sort();
 const result=(await sql.query(`SELECT count(*)::text AS encounters,
 count(*) FILTER(WHERE attacker_id=$3)::text AS attacks,
 count(*) FILTER(WHERE defender_id=$3)::text AS defenses
 FROM battles WHERE LEAST(attacker_id,defender_id)=$1 AND GREATEST(attacker_id,defender_id)=$2`,[...pair,viewer])).rows[0]!;
 const deaths=(await sql.query(`SELECT count(*) FILTER(WHERE killer_id=$1)::text AS kills,
 count(*) FILTER(WHERE victim_id=$1)::text AS deaths FROM competitive_deaths
 WHERE (killer_id=$1 AND victim_id=$2) OR(killer_id=$2 AND victim_id=$1)`,[viewer,opponent])).rows[0]!;
 return {encounters:String(result.encounters),attacksInitiated:String(result.attacks),defensiveEncounters:String(result.defenses),kills:String(deaths.kills),deaths:String(deaths.deaths)};
}
