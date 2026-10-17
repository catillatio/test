import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Database, type Sql, transaction } from './db.js';
import { projectRoot } from './config.js';
import { rules } from './rules.js';
import { landRules } from './land-rules.js';
import { alpha,alphaCatalogs } from './alpha-rules.js';

const definitions=[rules,landRules,...alphaCatalogs];
const normalize=(value:unknown):unknown=>Array.isArray(value)?value.map(normalize):
  value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort().map(([key,item])=>[key,normalize(item)])):value;

// Read-only validation at both migration and runtime startup. Skipping migration
// must not let edited JSON silently redefine an already installed ruleset ID.
export async function assertInstalledRulesets(sql:Sql) {
  for(const definition of definitions) {
    const stored=(await sql.query('SELECT definition FROM rulesets WHERE id=$1',[definition.id])).rows[0]?.definition;
    if(!stored)throw new Error('Ruleset '+definition.id+' is not installed. Run npm run db:migrate.');
    if(JSON.stringify(normalize(stored))!==JSON.stringify(normalize(definition)))throw new Error('An existing ruleset version is immutable. Create a new ruleset ID for changed rules.');
  }
}

export async function migrate(db: Database, options: { through?: string } = {}) {
  await transaction(db, async client => {
    await client.query('SELECT pg_advisory_xact_lock(61824004)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await readdir(join(projectRoot, 'migrations'))).filter(f => f.endsWith('.sql')).sort();
    for (const name of files) {
      if (options.through && name > options.through) continue;
      if ((await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name])).rows.length) continue;
      await client.query(await readFile(join(projectRoot, 'migrations', name), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    }
    for (const definition of definitions) {
      await client.query('INSERT INTO rulesets(id,definition) VALUES($1,$2) ON CONFLICT DO NOTHING', [definition.id, definition]);
    }
    await assertInstalledRulesets(client);
    if((await client.query("SELECT name FROM schema_migrations WHERE name='006_fantasy_progression.sql'")).rows.length) {
      // One-time entitlements also apply to existing high-level characters.
      // Never recompute their XP/levels, touch their timers, or re-grant spent points.
      for(const milestone of alpha.progression.milestones??[]) {
        await client.query(`WITH awarded AS (
          INSERT INTO progression_awards(character_id,award_id,points)
          SELECT id,$1,$2 FROM characters WHERE attained_level>=$3
          ON CONFLICT DO NOTHING RETURNING character_id,points)
          UPDATE characters c SET skill_points=c.skill_points+a.points FROM awarded a WHERE c.id=a.character_id`,[milestone.id,milestone.points,milestone.level]);
      }
    }
  });
}
