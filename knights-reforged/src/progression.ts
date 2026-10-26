import { randomUUID } from 'node:crypto';
import { type Sql } from './db.js';
import { GameError } from './errors.js';
import { alpha } from './alpha-rules.js';
import {advanceProgression,readProgressionEpoch} from './progression-policy.js';

export async function grantExperience(sql:Sql,characterId:string,award:number,now:Date,restoreResources=true) {
  const row=(await sql.query('SELECT attained_level,level_xp,xp FROM characters WHERE id=$1 FOR UPDATE',[characterId])).rows[0]!;
  const actual=Math.min(award,2147483647-row.xp);
  const next=advanceProgression(row.attained_level,row.level_xp,actual,await readProgressionEpoch(sql,characterId));
  await sql.query(`UPDATE characters SET xp=xp+$2,attained_level=$3,level_xp=$4,skill_points=skill_points+$5,
    health=CASE WHEN $6 THEN max_health ELSE health END,mana=CASE WHEN $6 THEN max_mana ELSE mana END,spirit=CASE WHEN $6 THEN max_spirit ELSE spirit END,
    health_updated_at=CASE WHEN $6 THEN $7 ELSE health_updated_at END,mana_updated_at=CASE WHEN $6 THEN $7 ELSE mana_updated_at END,
    spirit_updated_at=CASE WHEN $6 THEN $7 ELSE spirit_updated_at END WHERE id=$1`,[characterId,actual,next.level,next.progress,next.points,next.gained>0&&restoreResources,now]);
  if (next.gained) await sql.query('INSERT INTO progression_awards(character_id,award_id,points) VALUES($1,$2,$3)',[characterId,'level-through-'+next.level,next.points]);
  return {...next,xpAwarded:actual};
}
export async function awardMilestones(sql:Sql,characterId:string) {
  const row=(await sql.query(`SELECT c.attained_level,(SELECT COALESCE(SUM(completions),0)::int FROM character_quest_progress p WHERE p.character_id=c.id) AS quests,
    (SELECT count(*)::int FROM battles b WHERE b.attacker_id=c.id AND b.outcome='attacker_win') AS wins FROM characters c WHERE c.id=$1`,[characterId])).rows[0]!;
  const awarded:string[]=[];
  const candidates=[{id:'quests-10',points:1,qualifies:row.quests>=10},{id:'first-victory',points:1,qualifies:row.wins>=1},
    ...(alpha.progression.milestones??[]).map(milestone=>({...milestone,qualifies:row.attained_level>=milestone.level}))];
  for (const {id,points,qualifies} of candidates) {
    if (!qualifies) continue;
    const inserted=await sql.query('INSERT INTO progression_awards(character_id,award_id,points) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING award_id',[characterId,id,points]);
    if (inserted.rows.length) { await sql.query('UPDATE characters SET skill_points=skill_points+$2 WHERE id=$1',[characterId,points]);awarded.push(id); }
  }
  return awarded;
}
export async function allocateSkill(sql:Sql,characterId:string,resource:'health'|'mana'|'spirit'|'attack'|'defense',commandId:string,now:Date) {
  if(resource==='attack'||resource==='defense'){
    const column=resource==='attack'?'attack_training':'defense_training',rule=alpha.combatSkills;
    const row=(await sql.query(`UPDATE characters SET skill_points=skill_points-$2,${column}=${column}+1
      WHERE id=$1 AND skill_points>=$2 AND ${column}<$3 RETURNING ${column} AS capacity`,[characterId,rule.pointsPerRating,rule.maxRating])).rows[0];
    if(!row)throw new GameError('SKILL_UNAVAILABLE','Not enough skill points or the combat-training limit is reached.',409);
    await sql.query('INSERT INTO skill_allocations(id,character_id,command_id,resource,points,capacity_added,capacity_after,ruleset_id) VALUES($1,$2,$3,$4,$5,1,$6,$7)',[randomUUID(),characterId,commandId,resource,rule.pointsPerRating,row.capacity,alpha.id]);
    return {points:rule.pointsPerRating,delta:1,capacity:row.capacity as number};
  }
  const points=resource==='spirit'?2:1;const delta=resource==='health'?10:1;
  const maximum=resource==='health'?alpha.resources.maxHealth:resource==='mana'?alpha.resources.maxMana:alpha.resources.maxSpirit;
  // Identifiers are selected from the server-owned enum, never arbitrary SQL.
  const column={health:'max_health',mana:'max_mana',spirit:'max_spirit'}[resource];
  const timer={health:'health_updated_at',mana:'mana_updated_at',spirit:'spirit_updated_at'}[resource];
  const row=(await sql.query(`UPDATE characters SET skill_points=skill_points-$2,${column}=${column}+$3,${resource}=${resource}+$3,
    ${timer}=CASE WHEN ${resource}=${column} THEN $5 ELSE ${timer} END WHERE id=$1 AND skill_points>=$2 AND ${column}+$3<=$4 RETURNING ${column} AS capacity`,[characterId,points,delta,maximum,now])).rows[0];
  if (!row) throw new GameError('SKILL_UNAVAILABLE','Not enough skill points or the resource capacity limit is reached.',409);
  await sql.query('INSERT INTO skill_allocations(id,character_id,command_id,resource,points,capacity_added,capacity_after,ruleset_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [randomUUID(),characterId,commandId,resource,points,delta,row.capacity,alpha.id]);
  return {points,delta,capacity:row.capacity as number};
}
