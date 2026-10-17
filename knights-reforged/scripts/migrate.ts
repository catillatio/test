import { loadConfig } from '../src/config.js';
import { createDatabase } from '../src/db.js';
import { migrate } from '../src/migrate.js';
const db = createDatabase(loadConfig().databaseUrl);
try { await migrate(db); console.log('PostgreSQL migrations and provisional ruleset applied.'); }
finally { await db.end(); }
