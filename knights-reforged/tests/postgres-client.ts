import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {join,isAbsolute} from 'node:path';

// Test-only real PostgreSQL clients. CI keeps its existing client image;
// a constrained local workstation can explicitly select compatible host tools.
// No fallback, SQL mocking or connection to a non-disposable database.
export function postgresClient(command:'pg_dump'|'pg_restore',databaseUrl:string,args:string[],input?:Buffer){
 const url=new URL(databaseUrl);
 assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname.endsWith('_test')&&!url.search&&!url.hash);
 const values={PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};
 const env={PATH:process.env.PATH,...values};
 const options={env,input,timeout:30000,maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe'] as ['pipe','pipe','pipe']};
 const native=process.env.POSTGRES_TEST_BIN;
 if(native){assert.ok(isAbsolute(native));return execFileSync(join(native,command),args,options)}
 return execFileSync('docker',['--host=unix:///var/run/docker.sock','run','--rm','-i','--network=host',...Object.keys(values).flatMap(k=>['--env',k]),'--entrypoint',command,'postgres:18-bookworm',...args],options);
}
