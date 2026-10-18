import { loadConfig } from '../src/config.js';
import { createDatabase, transaction } from '../src/db.js';
import { registerAccount } from '../src/auth.js';
import { executeCommand } from '../src/commands.js';
import { migrate } from '../src/migrate.js';
import { rules } from '../src/rules.js';
import { randomUUID } from 'node:crypto';

const config = loadConfig();
if (config.nodeEnv === 'production') throw new Error('Demo seeding/reset is disabled in production.');
const db = createDatabase(config.databaseUrl);
const demo = [{ username: 'arthur', name: 'Arthur of the Vale' }, { username: 'morgan', name: 'Morgan Ironwood' }];
try {
  await migrate(db);
  if (process.argv.includes('--reset-demo')) {
    await transaction(db, async client => { await client.query('DELETE FROM accounts WHERE username=ANY($1::text[])', [demo.map(d => d.username)]); });
  }
  for (const entry of demo) {
    if ((await db.query('SELECT id FROM accounts WHERE username=$1', [entry.username])).rows.length) continue;
    const account = await registerAccount(db, { ...entry, password: 'DemoKnights!2026' });
    await executeCommand(db, account.accountId, randomUUID(), 'quest', { questId: rules.quest.id });
    const item = await executeCommand(db, account.accountId, randomUUID(), 'buy', { itemId: rules.weapon.id });
    await executeCommand(db, account.accountId, randomUUID(), 'equip', { inventoryEntryId: item.inventoryEntryId });
  }
  console.log('Demo accounts: arthur and morgan. Password for both: DemoKnights!2026');
  console.log('These are normal persisted players. Use separate browser profiles/devices for two-player testing.');
} finally { await db.end(); }
