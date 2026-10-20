import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { z } from 'zod';
import { type Database, transaction, type Sql } from './db.js';
import { GameError } from './errors.js';
import { rules } from './rules.js';
import { alpha } from './alpha-rules.js';

export const registration = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'Use 3–24 lowercase letters, numbers, or underscores.'),
  name: z.string().trim().min(2).max(28).regex(/^[\p{L}\p{N} '\-]+$/u, 'Use letters, numbers, spaces, hyphens, or apostrophes.'),
  password: z.string().min(12, 'Use at least 12 characters.').max(128),
});
const passwordOptions = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashPassword=(password:string)=>hash(password,passwordOptions);
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export interface Session { token_hash: string; csrf_token: string; account_id: string | null; username?: string; }

export async function registerAccount(db: Database, input: unknown, options:{soundEnabled?:boolean}={}) {
  const parsed = registration.safeParse(input);
  if (!parsed.success) throw new GameError('INVALID_ACCOUNT', parsed.error.issues[0]?.message ?? 'Invalid account.');
  const { username, name, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  const accountId = randomUUID();
  const characterId = randomUUID();
  try {
    await transaction(db, async client => {
      await client.query('INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3)', [accountId, username, passwordHash]);
      await client.query('INSERT INTO characters(id,account_id,name) VALUES($1,$2,$3)', [characterId, accountId, name]);
      await client.query('INSERT INTO wallets(character_id,balance) VALUES($1,$2)', [characterId, alpha.startingGold]);
      await client.query('INSERT INTO army_stacks(character_id,unit_definition_id,quantity) VALUES($1,$2,0)', [characterId, rules.unit.id]);
      // New humans opt into action sounds, subject to the browser gesture gate.
      // Existing preference rows and the legacy muted fallback remain untouched.
      if(options.soundEnabled)await client.query('INSERT INTO sound_preferences(character_id,enabled,volume) VALUES($1,true,55)', [characterId]);
      const ledgerId = randomUUID();
      await client.query('INSERT INTO economy_transactions(id,reason,ruleset_id) VALUES($1,$2,$3)', [ledgerId, 'starting_grant', alpha.id]);
      await client.query('INSERT INTO economy_entries(id,transaction_id,character_id,amount,balance_after) VALUES($1,$2,$3,$4,$4)',
        [randomUUID(), ledgerId, characterId, alpha.startingGold]);
    });
  } catch (error) {
    if ((error as {code?: string}).code === '23505') throw new GameError('REGISTRATION_UNAVAILABLE', 'Registration could not be completed with those details. Try different details or sign in.', 409);
    throw error;
  }
  return { accountId, characterId, username };
}

let dummyHash: Promise<string> | undefined;
export async function authenticate(db: Database, username: unknown, password: unknown) {
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 128) {
    throw new GameError('INVALID_CREDENTIALS', 'Account name or password is incorrect.', 401);
  }
  const account = (await db.query('SELECT * FROM accounts WHERE username=$1', [username.trim().toLowerCase()])).rows[0];
  dummyHash ??= hash(randomBytes(32).toString('hex'), passwordOptions);
  const valid = await verify(account?.password_hash ?? await dummyHash, password).catch(() => false);
  if (!account || !valid || account.login_disabled) throw new GameError('INVALID_CREDENTIALS', 'Account name or password is incorrect.', 401);
  return { accountId: account.id as string, username: account.username as string };
}

export async function createSession(db: Database, accountId: string | null, oldHash?: string) {
  const token = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  const session: Session = { token_hash: tokenHash(token), csrf_token: csrf, account_id: accountId };
  await transaction(db, async client => {
    if (oldHash) await client.query('DELETE FROM sessions WHERE token_hash=$1', [oldHash]);
    await client.query("INSERT INTO sessions(token_hash,account_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+($4::integer * interval '1 day'))",
      [session.token_hash, accountId, csrf, accountId ? 30 : 1]);
  });
  return { token, session };
}

export async function findSession(sql: Sql, token: string | undefined): Promise<Session | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = (await sql.query<Session>(`SELECT s.token_hash,s.account_id,s.csrf_token,a.username FROM sessions s
    LEFT JOIN accounts a ON a.id=s.account_id
    WHERE s.token_hash=$1 AND s.expires_at>now()
      AND (s.account_id IS NULL OR (NOT a.login_disabled AND s.last_seen_at>now()-interval '7 days'))`, [tokenHash(token)])).rows[0];
  if (!row) return null;
  await sql.query("UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1 AND last_seen_at<now()-interval '5 minutes'", [row.token_hash]);
  return row;
}
