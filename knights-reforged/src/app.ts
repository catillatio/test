import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import view from '@fastify/view';
import ejs from 'ejs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { type Config, projectRoot } from './config.js';
import {requestOriginAllowed,urlOrigin} from './request-origin.js';
import { type Database } from './db.js';
import { authenticate, registerAccount, createSession, findSession, type Session } from './auth.js';
import { getState, getBattle, recentBattles, listOpponents, type CharacterState } from './game.js';
import { executeCommand, type CommandKind } from './commands.js';
import { GameError } from './errors.js';
import { rules } from './rules.js';
import { landRules } from './land-rules.js';
import { alpha } from './alpha-rules.js';
import { navigation as nav, templateScreens, commandRoutes } from './http-contracts.js';

declare module 'fastify' { interface FastifyRequest { realmSession: Session | null; } }
const uuid = z.string().uuid();
const allowedScreens = new Set<string>(templateScreens);
const destination: Record<CommandKind, string> = { quest:'quests',quest_buy:'quests',recruit:'army',buy:'armory',sell:'armory',equip:'armory',attack:'battle',land_buy:'land',land_sell:'land',skill:'profile',profile:'profile',maintain:'armory',invite:'army',accept:'army',remove:'army' };
const asBody = (request: FastifyRequest) => (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
const wantsJson = (request: FastifyRequest) => request.url.startsWith('/api/') || (request.headers.accept ?? '').includes('application/json');

export async function createApp(options: { db: Database; config: Config; logger?: boolean }) {
  const { db, config } = options;
  const app = Fastify({ logger: options.logger ? { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization', 'req.body.password'] } : false,
    bodyLimit: 16384, trustProxy: false });
  await app.register(cookie);
  await app.register(formbody);
  // Chromium submits Origin: null for HTML POST forms under no-referrer.
  // Keep same-origin form origins available for the strict CSRF check while
  // withholding referrers on requests to other sites.
  await app.register(helmet, { referrerPolicy:{policy:'same-origin'}, contentSecurityPolicy: { directives: { defaultSrc: ["'self'"],
    scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'"], fontSrc: ["'self'"],
    objectSrc: ["'none'"], frameAncestors: ["'none'"], formAction: ["'self'"], upgradeInsecureRequests: config.secureCookies ? [] : null } } });
  await app.register(rateLimit, { global: false });
  await app.register(fastifyStatic, { root: join(projectRoot, 'public'), prefix: '/assets/', maxAge: '1h' });
  await app.register(view, { engine: { ejs }, root: join(projectRoot, 'views') });
  app.decorateRequest('realmSession', null);

  const setSessionCookie = (reply: FastifyReply, token: string, authenticated: boolean) => reply.setCookie('kr_session', token, {
    path: '/', httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge: authenticated ? 30 * 86400 : 86400,
  });

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/assets/') || request.url.split('?')[0] === '/healthz') return;
    request.realmSession = await findSession(db, request.cookies.kr_session);
    if (!request.realmSession && (request.method === 'GET' || request.method === 'HEAD')) {
      const fresh = await createSession(db, null);
      request.realmSession = fresh.session;
      setSessionCookie(reply, fresh.token, false);
    }
    reply.header('Cache-Control', 'no-store');
  });

  app.addHook('preHandler', async request => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const session = request.realmSession;
    const csrf = request.headers['x-csrf-token'] ?? asBody(request).csrf;
    const origin = request.headers.origin;
    if (!session || typeof csrf !== 'string' || !/^[a-f0-9]{64}$/.test(csrf) ||
        !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf_token))) {
      throw new GameError('CSRF_REJECTED', 'Your session changed or the form expired. Reload the page and try again.', 403);
    }
    const allowedOrigin=requestOriginAllowed(config,request.headers);
    if (!allowedOrigin || (origin!==undefined&&origin!==config.origin)) {
      // Server-only diagnostics: no cookies, tokens, passwords, request bodies,
      // URL paths or Referer queries. Forwarding headers are evidence, not trust.
      const details={event:allowedOrigin?'codespaces_origin_rewrite':'origin_rejected',
        configuredOrigin:config.origin,originSource:config.originSource,port:config.port,
        receivedOrigin:origin==='null'?'null':urlOrigin(origin),refererOrigin:urlOrigin(request.headers.referer),
        hostOrigin:urlOrigin('https://'+request.headers.host),
        forwardedHostOrigin:urlOrigin('https://'+request.headers['x-forwarded-host']),
        forwardedProto:['http','https'].includes(String(request.headers['x-forwarded-proto']))?request.headers['x-forwarded-proto']:null,
        fetchSite:['same-origin','same-site','cross-site','none'].includes(String(request.headers['sec-fetch-site']))?request.headers['sec-fetch-site']:null};
      if(allowedOrigin)request.log.info(details,'Validated Codespaces-rewritten Origin against the canonical Referer');
      else request.log.warn(details,'Rejected request Origin');
    }
    if (!allowedOrigin) {
      throw new GameError('ORIGIN_REJECTED','This form was opened from a different realm address. Open the current realm address and reload the page.',403);
    }
  });

  async function requireAccount(request: FastifyRequest, reply: FastifyReply) {
    if (request.realmSession?.account_id) return;
    if (wantsJson(request)) throw new GameError('SIGN_IN_REQUIRED', 'Sign in to enter the realm.', 401);
    return reply.redirect('/login');
  }

  async function render(request: FastifyRequest, reply: FastifyReply, screen: string, data: Record<string, unknown> = {}) {
    if (!allowedScreens.has(screen)) throw new Error('Unknown server-selected template.');
    const session = request.realmSession;
    const state = (data.state as CharacterState | undefined) ?? (session?.account_id ? await getState(db, session.account_id) : null);
    let notice: string | null = null;
    let actionResult: Record<string,unknown> | null = null;
    const query = request.query as { command?: string; category?: string;area?:string;tab?:string };
    if (session?.account_id && uuid.safeParse(query?.command).success) {
      const receipt = (await db.query('SELECT result FROM command_receipts WHERE account_id=$1 AND command_id=$2', [session.account_id, query.command])).rows[0];
      notice = receipt?.result?.message ?? null;
      actionResult = receipt?.result ?? null;
    }
    return reply.viewAsync('layout.ejs', {
      screen, state, nav, rules, landRules, alpha, actionResult,
      category: ['weapon','armor','spell'].includes(query?.category??'') ? query.category : 'weapon',
      questArea: query.area==='all'||alpha.content?.areas.some(area=>area.id===query.area) ? query.area : 'nearby',
      profileTab:query.tab==='skills'||query.tab==='battles'?query.tab:'player',
      csrf: session?.csrf_token ?? '', accountName: session?.username ?? '',
      commandId: randomUUID, notice, error: null, opponents: [], nextOpponentCursor:null, battles: [], battle: null,
      title: 'Kingdom Come', authMode: 'login', formValues: { username: '', name: '' }, ...data,
    });
  }

  app.get('/healthz', async () => { await db.query('SELECT 1'); return { status: 'ready', ruleset: alpha.id }; });
  app.get('/', async (request, reply) => reply.redirect(request.realmSession?.account_id ? '/game/home' : '/login'));
  for (const mode of ['login', 'register'] as const) {
    app.get('/' + mode, async (request, reply) => request.realmSession?.account_id ? reply.redirect('/game/home') :
      render(request, reply, 'auth', { authMode: mode, title: mode === 'login' ? 'Enter the realm' : 'Raise your banner' }));
  }
  const authLimit = { config: { rateLimit: { max: config.nodeEnv === 'test' ? 10000 : 10, timeWindow: '1 minute' } } };
  app.post('/register', authLimit, async (request, reply) => {
    const account = await registerAccount(db, asBody(request));
    const fresh = await createSession(db, account.accountId, request.realmSession?.token_hash);
    setSessionCookie(reply, fresh.token, true);
    return reply.redirect('/game/home', 303);
  });
  app.post('/login', authLimit, async (request, reply) => {
    const body = asBody(request);
    const account = await authenticate(db, body.username, body.password);
    const fresh = await createSession(db, account.accountId, request.realmSession?.token_hash);
    setSessionCookie(reply, fresh.token, true);
    return reply.redirect('/game/home', 303);
  });
  app.post('/logout', async (request, reply) => {
    if (request.realmSession) await db.query('DELETE FROM sessions WHERE token_hash=$1', [request.realmSession.token_hash]);
    reply.clearCookie('kr_session', { path: '/',httpOnly:true,secure:config.secureCookies,sameSite:'lax' });
    return reply.redirect('/login', 303);
  });

  app.get('/rules', async (request, reply) => render(request, reply, 'rules', { title: 'Rules of this realm' }));
  for (const { id: screen, label: title } of nav) {
    app.get('/game/' + screen, { preHandler: requireAccount }, async (request, reply) => {
      const state = await getState(db, request.realmSession!.account_id!);
      return render(request, reply, screen, { title, state,
        ...(screen === 'home' || screen === 'battle' ? { battles: await recentBattles(db, state.id) } : {}),
        ...(screen === 'battle' ? await (async () => {
          const query=request.query as {after?:string};
          const page=await listOpponents(db,state.id,query.after);
          return {opponents:page.opponents,nextOpponentCursor:page.nextCursor};
        })() : {}),
      });
    });
  }
  app.get('/game/profile', {preHandler:requireAccount}, async(request,reply)=>{
    const state=await getState(db,request.realmSession!.account_id!);
    return render(request,reply,'profile',{title:'Character',state,battles:await recentBattles(db,state.id)});
  });
  app.get('/game/battles/:id', { preHandler: requireAccount }, async (request, reply) => {
    const id = (request.params as {id:string}).id;
    if (!uuid.safeParse(id).success) throw new GameError('BATTLE_NOT_FOUND', 'That battle was not found.', 404);
    const battle = await getBattle(db, request.realmSession!.account_id!, id);
    return render(request, reply, 'report', { battle: {...battle.result,attackerId:battle.attacker_id,defenderId:battle.defender_id,winnerId:battle.outcome==='attacker_win'?battle.attacker_id:battle.defender_id}, title: 'Battle report' });
  });

  for (const route of commandRoutes) {
    for (const url of [route.html, route.api]) {
      app.post(url, { preHandler: requireAccount, config: { rateLimit: { max: config.nodeEnv === 'test' ? 10000 : 90, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = asBody(request);
        const input = route.kind === 'quest' || route.kind === 'quest_buy' ? { ...body, questId: (request.params as {id:string}).id } : body;
        const result = await executeCommand(db, request.realmSession!.account_id!, request.headers['idempotency-key'] ?? body.commandId, route.kind, input);
        if (wantsJson(request)) return { ...result, state: await getState(db, request.realmSession!.account_id!) };
        return reply.redirect(result.battleId ? '/game/battles/' + result.battleId :
          '/game/' + destination[route.kind] + '?command=' + result.commandId +
          (destination[route.kind]==='armory' && ['weapon','armor','spell'].includes(String(result.data?.category)) ? '&category='+result.data!.category : '') +
          (route.kind==='skill'?'&tab=skills#skills':route.kind==='profile'?'#account':''), 303);
      });
    }
  }
  app.get('/api/v1/me', { preHandler: requireAccount }, async request => ({
    state: await getState(db, request.realmSession!.account_id!), csrfToken: request.realmSession!.csrf_token, rulesetId: alpha.id,
  }));
  app.get('/api/v1/opponents', { preHandler: requireAccount }, async request => {
    const state = await getState(db, request.realmSession!.account_id!);
    return listOpponents(db,state.id,(request.query as {after?:string}).after);
  });
  app.get('/api/v1/land', { preHandler: requireAccount }, async request => {
    const state = await getState(db, request.realmSession!.account_id!);
    return { land: state.land, economy:state.economy, gold: state.gold, serverTime: state.serverTime, state };
  });
  app.get('/api/v1/battles/:id', { preHandler: requireAccount }, async request => {
    const id = (request.params as {id:string}).id;
    if (!uuid.safeParse(id).success) throw new GameError('BATTLE_NOT_FOUND', 'That battle was not found.', 404);
    const battle = await getBattle(db, request.realmSession!.account_id!, id);
    return { battle: battle.result };
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (wantsJson(request)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That route does not exist.' } });
    return render(request, reply.code(404), 'error', { title: 'Page not found', error: 'That road does not lead anywhere. Return to the realm.' });
  });
  app.setErrorHandler(async (error, request, reply) => {
    const known = error instanceof GameError;
    const reportedStatus = (error as { statusCode?: number }).statusCode;
    const status = known ? error.status : (reportedStatus && reportedStatus < 500 ? reportedStatus : 500);
    const message = known ? error.message : status === 429 ? 'Too many actions. Wait a moment and try again.' :
      status < 500 ? 'The request could not be read. Reload the page and try again.' : 'The realm could not complete that request. Please try again.';
    if (status >= 500) app.log.error({ err: error }, 'Request failed');
    if (wantsJson(request)) return reply.code(status).send({ error: { code: known ? error.code : 'REQUEST_FAILED', message } });
    try {
      const path = request.url.split('?')[0];
      if (known && !request.realmSession?.account_id && request.realmSession?.csrf_token && (path === '/register' || path === '/login')) {
        const body = asBody(request);
        const authMode = path === '/register' ? 'register' : 'login';
        return await render(request, reply.code(status), 'auth', {
          authMode, title: authMode === 'register' ? 'Raise your banner' : 'Enter the realm', error: message,
          formValues: { username: typeof body.username === 'string' ? body.username.slice(0, 24) : '',
            name: typeof body.name === 'string' ? body.name.slice(0, 28) : '' },
        });
      }
      return await render(request, reply.code(status), 'error', { title: 'Action not completed', error: message });
    }
    catch { return reply.code(status).type('text/plain').send(message); }
  });
  await app.ready();
  return app;
}
