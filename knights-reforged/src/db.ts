import pg, { type QueryResult, type QueryResultRow } from 'pg';

export interface Sql {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
}
export interface Connection extends Sql { release(): void; }
export interface Database extends Sql { connect(): Promise<Connection>; end(): Promise<void>; }

export function createDatabase(url: string): Database {
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  return new pg.Pool({ connectionString: url, max: 12, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, application_name: 'knights-reforged' });
}

export async function transaction<T>(db: Database, work: (client: Connection) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      const code = (error as { code?: string }).code;
      if (attempt < 2 && (code === '40P01' || code === '40001')) continue;
      throw error;
    } finally { client.release(); }
  }
}
