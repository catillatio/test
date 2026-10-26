import {verifyActiveCoordinatedArtwork} from './coordinated-artwork.js';
import {verifyEquipmentArtwork} from './equipment-artwork.js';
import {humanPvpLoot} from './human-pvp-loot.js';
import {equipmentPresentation,verifyPresentationAssets} from './equipment-presentation.js';
import {verifyExpansionArtwork} from './expansion-artwork.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Database, type Sql, transaction } from './db.js';
import { projectRoot } from './config.js';
import { rules } from './rules.js';
import { landRules } from './land-rules.js';
import { alpha,alphaCatalogs } from './alpha-rules.js';
import {strategy,botCatalog,phase42BotCatalog,previousStrategy,previousBotCatalog} from './strategy-rules.js';
import {community} from './community-rules.js';
import {refinements} from './refinement-rules.js';
import {pvp} from './pvp-rules.js';
import {progressionEconomy,initialProgressionEconomy} from './progression-economy-rules.js';
import {phase41BotCatalog} from './strategy-rules.js';
import {gameplay} from './gameplay-rules.js';
import {gameFeel} from './game-feel-rules.js';
import {botCombat,previousBotCombat} from './bot-combat-rules.js';
import {experienceRules} from './experience-rules.js';
import {phase4BotCatalog} from './strategy-rules.js';
import {automaticUpkeep} from './upkeep-policy.js';
import {compatibility} from './compatibility-rules.js';

import {expansionBots,expansionBotEconomy,expansionBotCombat} from './expansion-bot-rules.js';
import {expandedContent,expansionEngine,expansionAchievement,questRarities,hudsonGrant,artworkRegistries,betaArtworkPolicy} from './expansion-content.js';

const definitions=[humanPvpLoot,equipmentPresentation,...artworkRegistries,betaArtworkPolicy,expansionBots,expansionBotEconomy,expansionBotCombat,expandedContent,expansionEngine,expansionAchievement,questRarities,hudsonGrant,compatibility,automaticUpkeep,previousBotCombat,botCombat,gameFeel,gameplay,experienceRules,rules,landRules,...alphaCatalogs,previousStrategy,previousBotCatalog,phase4BotCatalog,strategy,phase41BotCatalog,phase42BotCatalog,botCatalog,community,refinements,pvp,initialProgressionEconomy,progressionEconomy];
const normalize=(value:unknown):unknown=>Array.isArray(value)?value.map(normalize):
  value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort().map(([key,item])=>[key,normalize(item)])):value;

// Read-only validation at both migration and runtime startup. Skipping migration
// must not let edited JSON silently redefine an already installed ruleset ID.
export async function assertInstalledRulesets(sql:Sql) {
  await verifyActiveCoordinatedArtwork();
  await verifyEquipmentArtwork();
  await verifyPresentationAssets();
  if(!(await verifyExpansionArtwork()).ready)throw new Error('Exact deployed artwork registry verification failed.');
  for(const definition of definitions) {
    const stored=(await sql.query('SELECT definition FROM rulesets WHERE id=$1',[definition.id])).rows[0]?.definition;
    if(!stored)throw new Error('Ruleset '+definition.id+' is not installed. Run npm run db:migrate.');
    if(JSON.stringify(normalize(stored))!==JSON.stringify(normalize(definition)))throw new Error('An existing ruleset version is immutable. Create a new ruleset ID for changed rules.');
  }
}

// Shared with fresh-realm provisioning so newly seeded high-level rivals are
// fully reconciled before its completion marker commits, not on a redeploy.
export async function reconcileLevelMilestones(sql:Sql) {
  // One-time entitlements also apply to existing high-level characters.
  // Never recompute XP/levels, touch timers, or re-grant spent points.
  for(const milestone of alpha.progression.milestones??[]) {
    await sql.query(`WITH awarded AS (
      INSERT INTO progression_awards(character_id,award_id,points)
      SELECT id,$1,$2 FROM characters WHERE attained_level>=$3
      ON CONFLICT DO NOTHING RETURNING character_id,points)
      UPDATE characters c SET skill_points=c.skill_points+a.points FROM awarded a WHERE c.id=a.character_id`,[milestone.id,milestone.points,milestone.level]);
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
      await reconcileLevelMilestones(client);
    }
  });
}
