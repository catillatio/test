// Deployment authorization only. No gameplay rules or credentials live here.
export const privateAlphaInitializationId='railway-phase43-private-alpha-v1';
export const privateAlphaConfirmation='INITIALIZE_EMPTY_PRIVATE_ALPHA';

export function privateAlphaEnabled(env:NodeJS.ProcessEnv):boolean {
  if(env.KINGDOM_PRIVATE_ALPHA===undefined||env.KINGDOM_PRIVATE_ALPHA==='0')return false;
  if(env.KINGDOM_PRIVATE_ALPHA!=='1')throw new Error('KINGDOM_PRIVATE_ALPHA must be 0 or 1.');
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(env.NODE_ENV!=='production'||!uuid.test(env.RAILWAY_SERVICE_ID??'')||!uuid.test(env.RAILWAY_ENVIRONMENT_ID??'')||
    env.CODESPACE_NAME||env.CODESPACES==='true') {
    throw new Error('Private alpha requires production Railway service/environment metadata; Codespaces is prohibited.');
  }
  try {
    const url=new URL(env.DATABASE_URL??'');
    const overrides=['host','hostaddr','port','database','dbname','user','service','servicefile','options'];
    if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.railway.internal')||
      !/^[a-z0-9.-]+$/.test(url.hostname)||url.pathname.length<2||
      [...url.searchParams.keys()].some(key=>overrides.includes(key.toLowerCase())))throw new Error();
  } catch {
    throw new Error('Private alpha requires a Railway private PostgreSQL URL without connection-target overrides.');
  }
  return true;
}

export function requirePrivateAlphaInitialization(env:NodeJS.ProcessEnv) {
  if(!privateAlphaEnabled(env)||env.KINGDOM_ALPHA_INITIALIZE!==privateAlphaConfirmation) {
    throw new Error('Private alpha initialization requires explicit INITIALIZE_EMPTY_PRIVATE_ALPHA confirmation.');
  }
}
