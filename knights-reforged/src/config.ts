import 'dotenv/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export interface Config {
  nodeEnv: string;
  host: string;
  port: number;
  origin: string;
  databaseUrl: string;
  secureCookies: boolean;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const origin = new URL(env.APP_ORIGIN ?? 'http://localhost:3000');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.hostname === 'bluepawgames.com' || origin.hostname.endsWith('.bluepawgames.com')) {
    throw new Error('APP_ORIGIN must be a replacement HTTP(S) origin, never the historical host.');
  }
  if (origin.pathname !== '/' || origin.search || origin.hash) throw new Error('APP_ORIGIN must not contain a path or query.');
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production' && origin.protocol !== 'https:') throw new Error('Production requires HTTPS.');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  return {
    nodeEnv, host: env.HOST ?? '0.0.0.0', port, origin: origin.origin,
    databaseUrl: env.DATABASE_URL ?? 'postgres://knights:knights_local@127.0.0.1:54329/knights',
    secureCookies: origin.protocol === 'https:',
  };
}
