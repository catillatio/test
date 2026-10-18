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
import {experienceView,regionFilter,rememberRegion} from './experience.js';
import {experienceRules} from './experience-rules.js';
import {gameplay} from './gameplay-rules.js';
import {announcements} from './announcements.js';
import {authenticationAttempt} from './security.js';
import { GameError } from './errors.js';
import { rules } from './rules.js';
import { landRules } from './land-rules.js';
import { alpha } from './alpha-rules.js';
import {strategy} from './strategy-rules.js';
import {community} from './community-rules.js';
import {refinements} from './refinement-rules.js';
import {pvp,bountyRules} from './pvp-rules.js';
import {publicProfile,ownedProperties,attackAvailability,recruitmentAvailability} from './profiles.js';
import {activityFeed,armyDashboard,feedCategory,relativeTime,battleTales} from './feeds.js';
import {bountyBoard as loadBountyBoard,bountyQuote,bountyPlacementAvailability} from './bounties.js';
import {activeBountyCount} from './bounties.js';
import { navigation as nav, templateScreens, commandRoutes } from './http-contracts.js';

declare module 'fastify' { interface FastifyRequest { realmSession: Session | null; } }
const uuid = z.string().uuid();
const allowedScreens = new Set<string>(templateScreens);
const destination: Record<CommandKind, string> = {heal:'home',tutorial:'home', vault_deposit:'vault',vault_withdraw:'vault',quest:'quests',quest_buy:'quests',recruit:'army',buy:'armory',sell:'armory',equip:'armory',attack:'battle',land_buy:'land',land_sell:'land',skill:'profile',profile:'profile',maintain:'armory',invite:'army',accept:'army',remove:'army',bounty_place:'bounties',bounty_cancel:'bounties',invite_code:'army',reject:'army',comment:'home',broadcast:'home',social_report:'home',social_remove:'home' };
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
  await app.register(rateLimit, { global:true,max:config.nodeEnv==='test'?100000:600,timeWindow:'1 minute',allowList:request=>request.url.startsWith('/assets/')||request.url.split('?')[0]==='/healthz' });
  await app.register(fastifyStatic, { root: join(projectRoot, 'public'), prefix: '/assets/', maxAge: '1h',dotfiles:'deny',index:false,list:false });
  // Rules used by shared/nested views are application constants, not optional
  // page locals. This also covers direct views and error rendering contexts.
  await app.register(view, { engine: { ejs }, root: join(projectRoot, 'views'), defaultContext: { bountyCount:0,nextBountyExpiry:null,gameplay,experience:null,experienceRules,announcements, recruitment:{allowed:false,reason:'Review in Recruit.',status:'none',automatic:false},refinements, bountyRules, pvp, bountyPlacement:{allowed:false,reason:'Review contract eligibility.'},developmentBotBountiesEnabled:false } });
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
    const state = (data.state as CharacterState | undefined) ?? (session?.account_id ? await getState(db, session.account_id,config) : null);
    let notice: string | null = null;
    let actionResult: Record<string,unknown> | null = null;
    const query = request.query as { command?: string; category?: string;area?:string;tab?:string };
    if (session?.account_id && uuid.safeParse(query?.command).success) {
      const receipt = (await db.query('SELECT result FROM command_receipts WHERE account_id=$1 AND command_id=$2', [session.account_id, query.command])).rows[0];
      notice = receipt?.result?.message ?? null;
      actionResult = receipt?.result ?? null;
    }
    const playerExperience=state?await experienceView(db,state.id):null;
    const board=data.bountyBoard as {activeCount?:number;nextExpiryAt?:string|null}|undefined;
    const counts=state&&['battle','bounties','bounty-new','bounty-confirm'].includes(screen)?board?.activeCount!==undefined?{count:board.activeCount,nextExpiryAt:board.nextExpiryAt??null}:await activeBountyCount(db,new Date(state.serverTime),config.developmentBotsEnabled&&config.developmentBotBountiesEnabled):{count:0,nextExpiryAt:null};
    const chosenRegion=regionFilter(query.area);
    if(screen==='quests'&&state&&chosenRegion)await rememberRegion(db,state.id,chosenRegion);
    return reply.viewAsync('layout.ejs', {
      screen, state, bountyCount:counts.count,nextBountyExpiry:counts.nextExpiryAt,nav, rules, landRules, alpha, strategy, community, relativeTime, gameplay,experienceRules,announcements,questEquipment:null,tradeQuote:null, developmentBotsEnabled:config.developmentBotsEnabled,developmentBotRecruitmentEnabled:config.developmentBotRecruitmentEnabled,developmentBotBountiesEnabled:config.developmentBotBountiesEnabled, actionResult,
      bountyBoard:{active:[],history:[],eligible:false},
      category: ['weapon','armor','spell'].includes(query?.category??'') ? query.category : 'weapon',
      questArea:chosenRegion??playerExperience?.region??'all',
      profileTab:['skills','battles','comments'].includes(query.tab??'')?query.tab:'player',
      recruitment:{allowed:false,reason:'Review this army request in Recruit.',status:'none',automatic:false},publicCharacter:null,profileProperties:state?ownedProperties(state):[],combatTarget:null,tales:{entries:[],nextCursor:null},bountyQuote:null,bountyPlacement:{allowed:false,reason:'Review contract eligibility.'},bountyTarget:null,vaultEntries:[],
      feedTab:feedCategory((request.query as {feed?:string}).feed),feed:{entries:[],nextCursor:null},
      armyTab:query.tab==='army'||query.tab==='dashboard'?query.tab:'recruit',armyEvents:[],
      csrf: session?.csrf_token ?? '', accountName: session?.username ?? '',
      commandId: randomUUID, notice, error: null, opponents: [], nextOpponentCursor:null, battles: [], battle: null,
      experience:playerExperience,title: 'Kingdom Come', authMode: 'login', formValues: { username: '', name: '' }, ...data,
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
    await authenticationAttempt(db,'registration',asBody(request).username);
    const account = await registerAccount(db, asBody(request));
    const fresh = await createSession(db, account.accountId, request.realmSession?.token_hash);
    setSessionCookie(reply, fresh.token, true);
    return reply.redirect('/game/home', 303);
  });
  app.post('/login', authLimit, async (request, reply) => {
    const body = asBody(request);
    await authenticationAttempt(db,'login',body.username);
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
      const state = await getState(db, request.realmSession!.account_id!,config);
      return render(request, reply, screen, { title, state,
        ...(screen === 'battle' ? { battles: await recentBattles(db, state.id) } : {}),
        ...(screen==='home'?{feed:await activityFeed(db,state.id,feedCategory((request.query as {feed?:string}).feed),(request.query as {after?:string}).after)}:{}),
        ...(screen==='army'?{armyEvents:await armyDashboard(db,state.id)}:{}),
        ...(screen === 'battle' ? await (async () => {
          const query=request.query as {after?:string};
          const page=await listOpponents(db,state.id,query.after,config.developmentBotsEnabled,config.developmentBotRecruitmentEnabled);
          return {opponents:page.opponents,nextOpponentCursor:page.nextCursor};
        })() : {}),
      });
    });
  }
  app.get('/game/achievements',{preHandler:requireAccount},async(request,reply)=>render(request,reply,'achievements',{title:'Achievements'}));
  app.get('/api/v1/achievements',{preHandler:requireAccount},async request=>{const state=await getState(db,request.realmSession!.account_id!,config);return experienceView(db,state.id);});
  app.get('/game/quests/:id/requirements',{preHandler:requireAccount},async(request,reply)=>{
    const state=await getState(db,request.realmSession!.account_id!,config),quest=state.quests.find(q=>q.id===(request.params as {id:string}).id);
    if(!quest)throw new GameError('QUEST_NOT_FOUND','That quest is not available.',404);
    const missing=Object.entries(quest.missing).map(([id,quantity])=>({item:alpha.items.find(item=>item.id===id)!,quantity,cost:alpha.items.find(item=>item.id===id)!.price*quantity}));
    return render(request,reply,'quest-equipment',{title:'Quest requirements',state,questEquipment:{quest,missing,total:quest.missingCost,shortfall:Math.max(0,quest.missingCost-state.gold)}});
  });
  app.get('/game/purchases/:id',{preHandler:requireAccount},async(request,reply)=>{
    const id=(request.params as {id:string}).id;if(!uuid.safeParse(id).success)throw new GameError('PURCHASE_NOT_FOUND','That purchase was not found.',404);
    const accountId=request.realmSession!.account_id!;
    const receipt=(await db.query("SELECT result FROM command_receipts WHERE account_id=$1 AND command_id=$2 AND kind IN ('buy','land_buy')",[accountId,id])).rows[0]?.result;
    if(!receipt?.data)throw new GameError('PURCHASE_NOT_FOUND','That purchase was not found.',404);
    const state=await getState(db,accountId,config),land=receipt.kind==='land_buy';
    const entry=land?state.land.properties.find(p=>p.id===receipt.data.propertyId):alpha.items.find(i=>i.id===receipt.data.itemId);
    if(!entry)throw new GameError('PURCHASE_NOT_FOUND','This historical purchase has no current catalog entry. Its saved transaction remains intact.',404);
    const owned=land?(entry as CharacterState['land']['properties'][number]).owned:state.inventory.find(i=>i.id===entry.id)?.quantity??0;
    const available=state.level<entry.level?0:land?(entry as CharacterState['land']['properties'][number]).maxAffordable:Math.min(alpha.limits.transaction,alpha.limits.inventory-owned,Math.floor(state.gold/entry.price));
    const steps=land?(entry as CharacterState['land']['properties'][number]).priceSteps:Array.from({length:Math.max(1,available)},()=>entry.price);
    const costSteps=steps.map((_,i)=>steps.slice(0,i+1).reduce((n,p)=>n+p,0));
    return render(request,reply,'purchase',{title:'Purchase complete',state,actionResult:receipt,purchase:{type:land?'land':'equipment',entry,owned,available,costSteps}});
  });
  app.get('/game/profile', {preHandler:requireAccount}, async(request,reply)=>{
    const state=await getState(db,request.realmSession!.account_id!,config);
    return render(request,reply,'profile',{title:'Character',state,tales:await battleTales(db,state.id,state.id,(request.query as {after?:string}).after),
      feed:await activityFeed(db,state.id,'comments',(request.query as {after?:string}).after,state.id)});
  });
  app.get('/game/players/:id',{preHandler:requireAccount},async(request,reply)=>{
    const id=(request.params as {id:string}).id;if(!uuid.safeParse(id).success)throw new GameError('CHARACTER_NOT_FOUND','That warrior was not found.',404);
    const state=await getState(db,request.realmSession!.account_id!,config);
    if(id===state.id)return reply.redirect('/game/profile?tab='+(['skills','battles','comments'].includes((request.query as {tab?:string}).tab??'')?(request.query as {tab:string}).tab:'player')+(uuid.safeParse((request.query as {command?:string}).command).success?'&command='+(request.query as {command:string}).command:''));
    const character=await publicProfile(db,id,config);
    return render(request,reply,'profile',{title:character.name,state,publicCharacter:character,profileProperties:character.properties,profileTab:['comments','battles'].includes((request.query as {tab?:string}).tab??'')?(request.query as {tab:string}).tab:'player',
      recruitment:await recruitmentAvailability(db,state,character,config.developmentBotRecruitmentEnabled),bountyPlacement:await bountyPlacementAvailability(db,state.id,id,new Date(state.serverTime),config.developmentBotBountiesEnabled),combatTarget:attackAvailability(state,character,config.developmentBotsEnabled),tales:await battleTales(db,id,state.id,(request.query as {after?:string}).after),
      feed:await activityFeed(db,state.id,'comments',(request.query as {after?:string}).after,id)});
  });
  app.get('/game/settings',{preHandler:requireAccount},async(request,reply)=>render(request,reply,'settings',{title:'Settings'}));
  app.get('/game/vault',{preHandler:requireAccount},async(request,reply)=>{
    const state=await getState(db,request.realmSession!.account_id!,config);
    const vaultEntries=(await db.query('SELECT amount,reason,balance_after,created_at FROM vault_entries WHERE character_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20',[state.id])).rows;
    return render(request,reply,'vault',{title:'Vault',state,vaultEntries});
  });
  app.get('/game/bounties/new',{preHandler:requireAccount},async(request,reply)=>{
    const id=(request.query as {target?:string}).target;
    if(!uuid.safeParse(id).success)throw new GameError('CHARACTER_NOT_FOUND','Choose a warrior from their profile.',404);
    const state=await getState(db,request.realmSession!.account_id!,config),character=await publicProfile(db,id!,config);
    const availability=await bountyPlacementAvailability(db,state.id,character.id,new Date(state.serverTime),config.developmentBotBountiesEnabled);
    return render(request,reply,'bounty-new',{title:'Add to Bounty List',state,bountyTarget:character,bountyPlacement:availability});
  });
  app.post('/game/bounties/preview',{preHandler:requireAccount},async(request,reply)=>{
    const parsed=z.object({targetCharacterId:uuid,amount:z.coerce.number().int().min(bountyRules.minimum).max(bountyRules.maximum)}).safeParse(asBody(request));
    if(!parsed.success)throw new GameError('INVALID_COMMAND','Choose a whole bounty amount between 1 and 10,000 gold.');
    const state=await getState(db,request.realmSession!.account_id!,config);
    const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0]!.now;
    const quote=await bountyQuote(db,state.id,parsed.data.targetCharacterId,parsed.data.amount,new Date(now),config.developmentBotBountiesEnabled);
    return render(request,reply,'bounty-confirm',{title:'Confirm bounty',state,bountyQuote:quote});
  });
  app.get('/game/bounties',{preHandler:requireAccount},async(request,reply)=>{
    const accountId=request.realmSession!.account_id!;
    const character=(await db.query('SELECT id FROM characters WHERE account_id=$1',[accountId])).rows[0];
    if(!character)throw new GameError('CHARACTER_NOT_FOUND','Your character was not found.',404);
    const board=await loadBountyBoard(db,character.id,config.developmentBotBountiesEnabled);
    const state=await getState(db,accountId,config);
    return render(request,reply,'bounties',{title:'Bounty List',state,bountyBoard:board});
  });
  app.get('/game/battles/:id', { preHandler: requireAccount }, async (request, reply) => {
    const id = (request.params as {id:string}).id;
    if (!uuid.safeParse(id).success) throw new GameError('BATTLE_NOT_FOUND', 'That battle was not found.', 404);
    const battle = await getBattle(db, request.realmSession!.account_id!, id);
    const state=await getState(db,request.realmSession!.account_id!,config);
    const opponentId=battle.attacker_id===state.id?battle.defender_id:battle.attacker_id;
    const combatTarget=attackAvailability(state,await publicProfile(db,opponentId,config),config.developmentBotsEnabled);
    return render(request, reply, 'report', { state,combatTarget,battle: {...battle.result,attackerId:battle.attacker_id,defenderId:battle.defender_id,winnerId:battle.outcome==='attacker_win'?battle.attacker_id:battle.defender_id}, title: 'Battle report' });
  });

  for (const route of commandRoutes) {
    for (const url of [route.html, route.api]) {
      app.post(url, { preHandler: requireAccount, config: { rateLimit: { max: config.nodeEnv === 'test' ? 10000 : 90, timeWindow: '1 minute',hook:'preHandler',keyGenerator:(request:FastifyRequest)=>request.realmSession?.account_id??request.ip } } }, async (request, reply) => {
        const body = asBody(request);
        const input = route.kind === 'quest' || route.kind === 'quest_buy' ? { ...body, questId: (request.params as {id:string}).id } : body;
        let result;
        try{result = await executeCommand(db, request.realmSession!.account_id!, request.headers['idempotency-key'] ?? body.commandId, route.kind, input,{developmentBotsEnabled:config.developmentBotsEnabled,developmentBotRecruitmentEnabled:config.developmentBotRecruitmentEnabled,developmentBotBountiesEnabled:config.developmentBotBountiesEnabled});}catch(error){
          if(route.kind==='quest'&&!wantsJson(request)&&error instanceof GameError&&error.code==='MISSING_EQUIPMENT')return reply.redirect('/game/quests/'+(request.params as {id:string}).id+'/requirements',303);
          throw error;
        }
        if(route.kind==='quest_buy'&&!wantsJson(request))return reply.redirect('/game/quests/'+result.data!.questId+'/requirements?command='+result.commandId,303);
        if (wantsJson(request)) return { ...result, state: await getState(db, request.realmSession!.account_id!,config) };
        if((route.kind==='buy'&&result.data?.itemId&&typeof result.data.quantity==='number')||(route.kind==='land_buy'&&result.data?.propertyId&&typeof result.data.quantity==='number'))
          return reply.redirect('/game/purchases/'+result.commandId,303);
        // Replayed pre-4.3 receipts can lack item/quantity metadata. Preserve
        // their original catalog confirmation instead of creating a broken receipt URL.
        if(route.kind==='comment')return reply.redirect('/game/players/'+result.data!.profileId+'?tab=comments&command='+result.commandId,303);
        if(route.kind==='social_report'||route.kind==='social_remove'){
          const location=result.data?.channel==='comment'&&result.data.profileId?'/game/players/'+result.data.profileId+'?tab=comments':'/game/home?feed=broadcasts';
          return reply.redirect(location+'&command='+result.commandId,303);
        }
        if(route.kind==='broadcast')return reply.redirect('/game/home?feed=broadcasts&command='+result.commandId,303);
        return reply.redirect(result.battleId ? '/game/battles/' + result.battleId :
          '/game/' + destination[route.kind] + '?command=' + result.commandId +
          (destination[route.kind]==='armory' && ['weapon','armor','spell'].includes(String(result.data?.category)) ? '&category='+result.data!.category : '') +
          (route.kind==='skill'?'&tab=skills#skills':route.kind==='profile'?'#account':['invite','invite_code','accept','reject','remove'].includes(route.kind)?'&tab=dashboard':''), 303);
      });
    }
  }
  app.get('/api/v1/me', { preHandler: requireAccount }, async request => {
    const state=await getState(db,request.realmSession!.account_id!,config);
    const counts=(request.query as {bounties?:string}).bounties==='1'?await activeBountyCount(db,new Date(state.serverTime),config.developmentBotsEnabled&&config.developmentBotBountiesEnabled):undefined;
    return {state,csrfToken:request.realmSession!.csrf_token,rulesetId:alpha.id,...(counts?{bounties:counts}:{})};
  });
  app.get('/api/v1/opponents', { preHandler: requireAccount }, async request => {
    const state = await getState(db, request.realmSession!.account_id!,config);
    return listOpponents(db,state.id,(request.query as {after?:string}).after,config.developmentBotsEnabled,config.developmentBotRecruitmentEnabled);
  });
  app.get('/api/v1/bounties/quote',{preHandler:requireAccount},async request=>{
    const query=z.object({targetCharacterId:uuid,amount:z.coerce.number().int().min(bountyRules.minimum).max(bountyRules.maximum)}).safeParse(request.query);
    if(!query.success)throw new GameError('INVALID_COMMAND','Choose a whole bounty amount between 1 and 10,000 gold.');
    const state=await getState(db,request.realmSession!.account_id!,config);
    return {quote:await bountyQuote(db,state.id,query.data.targetCharacterId,query.data.amount,new Date(state.serverTime),config.developmentBotBountiesEnabled)};
  });
  app.get('/api/v1/bounties',{preHandler:requireAccount},async request=>{
    const state=await getState(db,request.realmSession!.account_id!,config);return loadBountyBoard(db,state.id,config.developmentBotBountiesEnabled);
  });
  app.get('/api/v1/players/:id',{preHandler:requireAccount},async request=>{
    const id=(request.params as {id:string}).id;if(!uuid.safeParse(id).success)throw new GameError('CHARACTER_NOT_FOUND','That warrior was not found.',404);
    return {character:await publicProfile(db,id,config)};
  });
  app.get('/api/v1/players/:id/combat',{preHandler:requireAccount},async request=>{
    const id=(request.params as {id:string}).id;if(!uuid.safeParse(id).success)throw new GameError('CHARACTER_NOT_FOUND','That warrior was not found.',404);
    const state=await getState(db,request.realmSession!.account_id!,config);
    return {combatTarget:attackAvailability(state,await publicProfile(db,id,config),config.developmentBotsEnabled),state};
  });
  app.get('/api/v1/players/:id/tales',{preHandler:requireAccount},async request=>{
    const id=(request.params as {id:string}).id;if(!uuid.safeParse(id).success)throw new GameError('CHARACTER_NOT_FOUND','That warrior was not found.',404);
    const state=await getState(db,request.realmSession!.account_id!,config);
    await publicProfile(db,id,config);
    return battleTales(db,id,state.id,(request.query as {after?:string}).after);
  });
  app.get('/api/v1/feed',{preHandler:requireAccount},async request=>{
    const state=await getState(db,request.realmSession!.account_id!,config);const query=request.query as {feed?:string;after?:string};
    return activityFeed(db,state.id,feedCategory(query.feed),query.after);
  });
  app.get('/api/v1/land', { preHandler: requireAccount }, async request => {
    const state = await getState(db, request.realmSession!.account_id!,config);
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
