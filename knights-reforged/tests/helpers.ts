import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDatabase, transaction,type Database,type Sql } from '../src/db.js';
import type {QueryResultRow} from 'pg';
import { migrate } from '../src/migrate.js';
import { lockCharacters, clock, type CharacterState } from '../src/game.js';
import { ledger } from '../src/economy.js';
import { grantExperience } from '../src/progression.js';
import { alpha } from '../src/alpha-rules.js';

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) {
  const url = new URL(testDatabaseUrl);
  if (!['127.0.0.1','localhost','[::1]',process.env.ALLOWED_TEST_DATABASE_HOST].includes(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error('Use a local/designated disposable *_test database.');
  }
}
export interface Player { id:string; cookie:string; csrf:string; accountId:string; }
export async function realm(options:{clock?:()=>Date;logger?:boolean}={}) {
  const pool=createDatabase(testDatabaseUrl!);await migrate(pool);
  // Test-only clock adapter. All gameplay SQL/transactions are real PostgreSQL;
  // only the server's explicit clock read is replaced. No production endpoint,
  // environment switch, balance grant or historical timestamp rewrite exists.
  const wrap=(sql:Sql):Sql=>({query:<T extends QueryResultRow>(statement:string,values?:unknown[])=>
    statement==='SELECT clock_timestamp() AS now'?sql.query<T>('SELECT $1::timestamptz AS now',[options.clock!().toISOString()]):sql.query<T>(statement,values)});
  const db:Database=options.clock?{...wrap(pool),connect:async()=>{const client=await pool.connect();return {...wrap(client),release:()=>client.release()};},end:()=>pool.end()}:pool;
  const config=loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',DATABASE_URL:testDatabaseUrl});
  const app=await createApp({db,config,logger:options.logger});
  const session=(response:{headers:Record<string,unknown>}) => {
    const value=response.headers['set-cookie'];
    const line=(Array.isArray(value)?value.map(String):[String(value)]).find(cookie=>cookie.startsWith('kr_session='));
    assert.ok(line);return line.split(';')[0]!;
  };
  async function player(name='Alpha Warrior'):Promise<Player> {
    const form=await app.inject({method:'GET',url:'/register'});
    const csrf=/name="csrf" value="([a-f0-9]{64})"/.exec(form.body)![1]!;
    const registered=await app.inject({method:'POST',url:'/register',headers:{cookie:session(form),origin:config.origin},
      payload:{csrf,username:'a_'+randomUUID().replaceAll('-','').slice(0,20),name,password:'AlphaTest!2026'}});
    assert.equal(registered.statusCode,303,registered.body);
    const cookie=session(registered);
    const state=await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie}});
    assert.equal(state.statusCode,200,state.body);
    const id=state.json().state.id;
    const accountId=(await db.query('SELECT account_id FROM characters WHERE id=$1',[id])).rows[0]!.account_id as string;
    return {id,cookie,csrf:state.json().csrfToken,accountId};
  }
  async function me(actor:Player):Promise<CharacterState> {
    const response=await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:actor.cookie}});
    assert.equal(response.statusCode,200,response.body);return response.json().state;
  }
  async function command(actor:Player,url:string,payload:Record<string,unknown>={},key=randomUUID()) {
    return app.inject({method:'POST',url,headers:{cookie:actor.cookie,origin:config.origin,'x-csrf-token':actor.csrf,'idempotency-key':key},payload});
  }
  async function ok(actor:Player,url:string,payload:Record<string,unknown>={},key=randomUUID()) {
    const response=await command(actor,url,payload,key);assert.equal(response.statusCode,200,response.body);return response.json();
  }
  // Explicit administrative fixtures. Normal playthroughs use only HTTP actions.
  async function prepare(actor:Player,gold=0,xp=0) {
    await transaction(db,async sql=>{
      await lockCharacters(sql,[actor.id]);
      if(gold)await ledger(sql,null,'test_fixture',[{characterId:actor.id,amount:gold}],alpha.id);
      if(xp)await grantExperience(sql,actor.id,xp,await clock(sql));
    });
  }
  return {db,app,player,me,command,ok,prepare,close:async()=>{await app.close();await db.end();}};
}
