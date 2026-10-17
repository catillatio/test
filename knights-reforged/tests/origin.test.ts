import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../src/config.js';

const codespace={CODESPACES:'true',CODESPACE_NAME:'fantasy-realm-abc123',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev',PORT:'3000'};
const expected='https://fantasy-realm-abc123-3000.app.github.dev';
test('normal Codespaces startup replaces the copied localhost origin with its canonical HTTPS address',()=>{
  const config=loadConfig({...codespace,APP_ORIGIN:'http://localhost:3000'});
  assert.equal(config.origin,expected);assert.equal(config.secureCookies,true);
});
test('Codespaces startup works without the preview helper or an explicit application origin',()=>{
  assert.equal(loadConfig(codespace).origin,expected);
  assert.equal(loadConfig({...codespace,GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:undefined}).origin,expected);
});
test('a previous Codespace URL cannot strand sessions after moving the checkout',()=>{
  assert.equal(loadConfig({...codespace,APP_ORIGIN:'https://previous-realm-3000.app.github.dev'}).origin,expected);
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
