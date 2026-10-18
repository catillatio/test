import {createHash} from 'node:crypto';
import {type Sql} from './db.js';
import {GameError} from './errors.js';
// Durable, username-independent response behavior; forged forwarding headers
// cannot change these account keys. No credentials or raw account names stored.
export async function authenticationAttempt(sql:Sql,scope:'login'|'registration',identity:unknown){
 const canonical=typeof identity==='string'?identity.trim().toLowerCase().slice(0,128):'invalid';
 const key=createHash('sha256').update(scope+':'+canonical).digest('hex');
 const row=(await sql.query(`INSERT INTO authentication_limits(scope,key_hash,window_start,attempts)
 VALUES($1,$2,clock_timestamp(),1) ON CONFLICT(scope,key_hash) DO UPDATE SET
 attempts=CASE WHEN authentication_limits.window_start<=clock_timestamp()-interval '15 minutes' THEN 1 ELSE authentication_limits.attempts+1 END,
 window_start=CASE WHEN authentication_limits.window_start<=clock_timestamp()-interval '15 minutes' THEN clock_timestamp() ELSE authentication_limits.window_start END RETURNING attempts`,[scope,key])).rows[0]!;
 if(row.attempts>10)throw new GameError('AUTHENTICATION_THROTTLED','Too many attempts for these account details. Please wait 15 minutes.',429);
}
