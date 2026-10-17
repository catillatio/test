import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../src/config.js';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';

const codespace={CODESPACES:'true',CODESPACE_NAME:'fantasy-realm-abc123',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev',PORT:'3000'};
const expected='https://fantasy-realm-abc123-3000.app.github.dev';
test('an explicitly configured HTTPS Codespace origin takes precedence over inferred metadata',()=>{
  const origin='https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev';
  const config=loadConfig({...codespace,APP_ORIGIN:origin});
  assert.equal(config.origin,origin);
  assert.equal(config.originSource,'explicit');
  assert.equal(config.secureCookies,true);
});
test('normal Codespaces startup replaces the copied localhost origin with its canonical HTTPS address',()=>{
  const config=loadConfig({...codespace,APP_ORIGIN:'http://localhost:3000'});
  assert.equal(config.origin,expected);assert.equal(config.secureCookies,true);
});
test('Codespaces startup works without the preview helper or an explicit application origin',()=>{
  assert.equal(loadConfig(codespace).origin,expected);
  assert.equal(loadConfig({...codespace,GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:undefined}).origin,expected);
});
test('explicit preview URLs are authoritative; copied loopback origins still use the forwarded port',()=>{
  assert.equal(loadConfig({...codespace,APP_ORIGIN:'https://previous-realm-3000.app.github.dev'}).origin,'https://previous-realm-3000.app.github.dev');
  assert.equal(loadConfig({...codespace,PORT:'4000',APP_ORIGIN:'http://127.0.0.1:4000'}).origin,'https://fantasy-realm-abc123-4000.app.github.dev');
});
test('an explicit custom HTTPS realm is preserved; ordinary local development still works',()=>{
  assert.equal(loadConfig({...codespace,APP_ORIGIN:'https://realm.example'}).origin,'https://realm.example');
  assert.equal(loadConfig({APP_ORIGIN:'http://localhost:3000'}).origin,'http://localhost:3000');
});
test('untrusted or malformed deployment metadata fails closed',()=>{
  for(const CODESPACE_NAME of ['bad/name','bad@name','x.evil.example','bad name'])assert.throws(()=>loadConfig({...codespace,CODESPACE_NAME}),/Codespace/);
  for(const domain of ['app.github.dev/attack','app.github.dev@evil.example','app.github.dev:443','https://app.github.dev'])assert.throws(()=>loadConfig({...codespace,GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:domain}),/forwarding domain/);
  for(const APP_ORIGIN of ['ftp://localhost:3000','http://user:pass@localhost:3000'])assert.throws(()=>loadConfig({...codespace,APP_ORIGIN}),/HTTP\(S\) origin without credentials/);
  assert.throws(()=>loadConfig({APP_ORIGIN:'https://bluepawgames.com'}),/historical/);
  assert.throws(()=>loadConfig({APP_ORIGIN:'https://storm8.com'}),/historical/);
});
test('exported origin and port take precedence over .env values at process startup',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'kc-origin-env-'));
  try{
    const envPath=join(folder,'.env');
    await writeFile(envPath,'PORT=3000\nAPP_ORIGIN=https://copied-space-3000.app.github.dev\n');
    const origin='https://super-winner-4r7ppp6g7p4hq4rv-3001.app.github.dev';
    const code=`import {loadConfig} from ${JSON.stringify(new URL('../src/config.ts',import.meta.url).href)}; const {port,origin,originSource,secureCookies}=loadConfig(); console.log(JSON.stringify({port,origin,originSource,secureCookies}));`;
    const output=execFileSync(process.execPath,['--import=tsx','--input-type=module','-e',code],{
      env:{...process.env,...codespace,NODE_ENV:'test',CODESPACE_NAME:'super-winner-4r7ppp6g7p4hq4rv',
        PORT:'3001',APP_ORIGIN:origin,DOTENV_CONFIG_PATH:envPath},encoding:'utf8'});
    assert.deepEqual(JSON.parse(output),{port:3001,origin,originSource:'explicit',secureCookies:true});
  }finally{await rm(folder,{recursive:true,force:true});}
});
test('preview helper reads .env before exporting a default port to its child',
  {skip:process.platform==='win32'?'Executable fixture uses a POSIX shebang.':false},async()=>{
  const folder=await mkdtemp(join(tmpdir(),'kc-preview-env-'));
  try{
    const envPath=join(folder,'.env'),origin='https://preview-fixture-3001.app.github.dev';
    await writeFile(envPath,'PORT=3001\nAPP_ORIGIN='+origin+'\n');
    // Observe the launch environment without starting a server or opening a DB.
    await writeFile(join(folder,'npm'),'#!'+process.execPath+'\nconsole.log(JSON.stringify({port:process.env.PORT,origin:process.env.APP_ORIGIN}));\n',{mode:0o700});
    const env:NodeJS.ProcessEnv={...process.env,DOTENV_CONFIG_PATH:envPath,PATH:folder+delimiter+process.env.PATH};
    delete env.PORT;delete env.APP_ORIGIN;
    const output=execFileSync(process.execPath,[fileURLToPath(new URL('../deployment/preview.mjs',import.meta.url))],{env,encoding:'utf8'});
    assert.deepEqual(JSON.parse(output.trim().split('\n').at(-1)!),{port:'3001',origin});
  }finally{await rm(folder,{recursive:true,force:true});}
});
