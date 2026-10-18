import 'dotenv/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {privateAlphaEnabled,privateAlphaConfirmation} from './private-alpha-policy.js';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export interface Config {
  nodeEnv: string;
  host: string;
  port: number;
  origin: string;
  originSource: 'explicit' | 'codespaces' | 'local-default';
  codespacesOrigin: string | null;
  databaseUrl: string;
  secureCookies: boolean;
  privateAlpha:boolean;
  developmentBotsEnabled:boolean;
  developmentBotBountiesEnabled:boolean;
  developmentBotRecruitmentEnabled:boolean;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const configured = env.APP_ORIGIN ? new URL(env.APP_ORIGIN) : null;
  if(configured&&(!['http:','https:'].includes(configured.protocol)||configured.username||configured.password)) throw new Error('APP_ORIGIN must be an HTTP(S) origin without credentials.');
  if (configured && (configured.pathname !== '/' || configured.search || configured.hash)) throw new Error('APP_ORIGIN must not contain a path or query.');
  let codespaceOrigin:string|null=null;
  const forwardingDomain=(env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev').toLowerCase();
  if(env.CODESPACE_NAME) {
    const name=env.CODESPACE_NAME;
    if(!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name) || (name+'-'+port).length>63) throw new Error('Invalid Codespace name.');
    if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(forwardingDomain)) throw new Error('Invalid Codespaces forwarding domain.');
    codespaceOrigin='https://'+name+'-'+port+'.'+forwardingDomain;
  }
  // These deployment variables are controlled by the server environment. Never
  // derive the allowed Origin from request Host/Forwarded/Origin headers.
  // A copied localhost .env can use the current HTTPS preview. An explicit
  // public origin always wins, including *.app.github.dev: never silently
  // substitute another public address or port for an operator's override.
  const local = configured && ['localhost','127.0.0.1','[::1]','0.0.0.0'].includes(configured.hostname);
  const automatic = codespaceOrigin && (!configured || local);
  const origin = new URL(automatic ? codespaceOrigin! : configured?.href ?? 'http://localhost:'+port);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      ['bluepawgames.com','storm8.com'].some(host => origin.hostname === host || origin.hostname.endsWith('.' + host))) {
    throw new Error('APP_ORIGIN must be a replacement HTTP(S) origin, never the historical host.');
  }
  if (origin.pathname !== '/' || origin.search || origin.hash) throw new Error('APP_ORIGIN must not contain a path or query.');
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production' && origin.protocol !== 'https:') throw new Error('Production requires HTTPS.');
  const privateAlpha=privateAlphaEnabled(env);
  if(env.KINGDOM_ALPHA_INITIALIZE&&(!privateAlpha||env.KINGDOM_ALPHA_INITIALIZE!==privateAlphaConfirmation))
    throw new Error('Invalid private-alpha initialization configuration.');
  return {
    nodeEnv, host: env.HOST ?? '0.0.0.0', port, origin: origin.origin,
    originSource:automatic?'codespaces':configured?'explicit':'local-default',
    codespacesOrigin:codespaceOrigin,
    databaseUrl: env.DATABASE_URL ?? 'postgres://knights:knights_local@127.0.0.1:54329/knights',
    secureCookies: origin.protocol === 'https:',
    privateAlpha,
    developmentBotsEnabled:(nodeEnv!=='production'||privateAlpha)&&env.ENABLE_DEV_BOTS==='1',
    developmentBotRecruitmentEnabled:(['development','test'].includes(nodeEnv)||privateAlpha)&&env.ENABLE_DEV_BOTS==='1'&&env.ENABLE_DEV_BOT_RECRUITMENT==='1',
    developmentBotBountiesEnabled:(['development','test'].includes(nodeEnv)||privateAlpha)&&env.ENABLE_DEV_BOTS==='1'&&env.ENABLE_DEV_BOT_BOUNTIES==='1',
  };
}
