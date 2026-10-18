// Production entrypoints must never fall back to a local development database
// or infer their browser address from a request's forwarded headers.
export function validateDeploymentEnvironment(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  if (!env.APP_ORIGIN || !env.DATABASE_URL) {
    throw new Error('Production requires explicit APP_ORIGIN and DATABASE_URL service variables.');
  }
  try {
    const origin = new URL(env.APP_ORIGIN);
    const database = new URL(env.DATABASE_URL);
    if (origin.protocol !== 'https:' || origin.username || origin.password ||
        origin.pathname !== '/' || origin.search || origin.hash) throw new Error();
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname ||
        database.pathname.length < 2) throw new Error();
  } catch {
    // Never include a database connection string or its password in diagnostics.
    throw new Error('Production requires an exact HTTPS APP_ORIGIN and a valid PostgreSQL DATABASE_URL.');
  }
}
