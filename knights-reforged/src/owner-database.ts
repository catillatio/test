import pg from 'pg';
import type {Database} from './db.js';

// Only the private operator uses these session bounds. Game configuration is
// unchanged. A canceled GitHub job cannot leave an unbounded SQL transaction.
export function createOperatorDatabase(connectionString:string):Database {
 const url=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Operator database protocol rejected.');
 return new pg.Pool({connectionString,max:2,connectionTimeoutMillis:5000,
  idleTimeoutMillis:5000,statement_timeout:15000,lock_timeout:5000,
  idle_in_transaction_session_timeout:20000,query_timeout:20000,
  application_name:'kingdom-owner-operator'});
}
