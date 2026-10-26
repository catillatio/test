import {randomUUID} from 'node:crypto';
export function fixtureUrl(value) {
  if(!value)throw Error('Disposable PostgreSQL fixture required');
  let url;
  try {url=new URL(value);}catch {throw Error('Invalid disposable PostgreSQL fixture');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname)||url.search||url.hash) throw Error('Only local disposable *_test databases without overrides are allowed');
  return url;
}
export async function databaseLease(pool, base, nonce=randomUUID().replaceAll('-','')) {
  const url=fixtureUrl(base);
  if(!/^[a-f0-9]{32}$/.test(nonce))throw Error('Invalid fixture identity');
  const name='kc_ci_'+nonce+'_test';
  // Never adopt/drop an existing database, including after an interrupted run.
  await pool.query('CREATE DATABASE "'+name+'" TEMPLATE template0');
  url.pathname='/'+name;
  let released=false;
  return {url:url.href,async close(){if(!released){await pool.query('DROP DATABASE "'+name+'" WITH (FORCE)');released=true;}}};
}
