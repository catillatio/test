import pg, { type QueryResult, type QueryResultRow } from 'pg';
import {expansionWriter,expansionLock} from './expansion-contract.js';

export interface Sql {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
}
export interface Connection extends Sql { release(): void; }
export interface Database extends Sql { connect(): Promise<Connection>; end(): Promise<void>; }

export function createDatabase(url: string): Database {
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  return new pg.Pool({ connectionString: url, max: 12, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, application_name: 'kingdom-come' });
}

const scopes=new WeakMap<Sql,Map<symbol,Promise<unknown>>>();
export function transactionMemo<T>(sql:Sql,key:symbol,read:()=>Promise<T>):Promise<T>{const scope=scopes.get(sql);if(!scope)return read();if(!scope.has(key))scope.set(key,read());return scope.get(key) as Promise<T>;}
export function clearTransactionMemo(sql:Sql,key:symbol){scopes.get(sql)?.delete(key);}
export async function transaction<T>(db: Database, work: (client: Connection) => Promise<T>,options:{expansionLock?:'exclusive'}={}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const client = await db.connect();
    const scoped:Connection={query:client.query.bind(client),release:()=>client.release()};scopes.set(scoped,new Map());
    try {
      await client.query('BEGIN');
      if(options.expansionLock==='exclusive')await client.query("SET LOCAL lock_timeout='10s'");
      await client.query(options.expansionLock==='exclusive'?'SELECT pg_advisory_xact_lock($1)':'SELECT pg_advisory_xact_lock_shared($1)',[expansionLock]);
      await client.query("SELECT set_config('kingdom.expansion_writer',$1,true)",[expansionWriter]);
      const result = await work(scoped);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      const code = (error as { code?: string }).code;
      if (attempt < 2 && (code === '40P01' || code === '40001')) continue;
      throw error;
    } finally {scopes.delete(scoped);client.release(); }
  }
}
