import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../src/config.js';
import {requestOriginAllowed,urlOrigin} from '../src/request-origin.js';

const environment={PORT:'3001',CODESPACE_NAME:'origin-fixture',CODESPACES:'true'};
const config=loadConfig(environment);
const headers={origin:'http://localhost:3001',referer:config.origin+'/game/quests?area=nearby','sec-fetch-site':'same-origin'};

test('exact configured Origins and the existing CSRF-only non-browser policy remain supported',()=>{
  assert.equal(requestOriginAllowed(config,{origin:config.origin}),true);
  assert.equal(requestOriginAllowed(config,{}),true);
  assert.equal(requestOriginAllowed(config,{origin:config.origin,'x-forwarded-host':'evil.invalid','x-forwarded-proto':'http'}),true);
});
test('only the current Codespace localhost rewrite plus canonical Referer and browser metadata is accepted',()=>{
  for(const origin of ['http://localhost:3001','https://localhost:3001']){
    assert.equal(requestOriginAllowed(config,{...headers,origin}),true);
    // No general trust of request Host or forwarding headers is required.
    assert.equal(requestOriginAllowed(config,{...headers,origin,host:'127.0.0.1:3001','x-forwarded-host':'evil.invalid'}),true);
  }
});
test('foreign, opaque, malformed and wrong-port Origins cannot use the Referer exception',()=>{
  for(const origin of ['null','https://evil.app.github.dev','http://localhost:3000','http://localhost',
    'http://127.0.0.1:3001','http://localhost:3001/','https://origin-fixture-3001.app.github.dev.evil.invalid',
    config.origin+':3001',config.origin+', '+config.origin,'garbage']){
    assert.equal(requestOriginAllowed(config,{...headers,origin,'x-forwarded-host':new URL(config.origin).host,'x-forwarded-proto':'https'}),false,origin);
  }
});
test('missing, cross-origin or credential-bearing Referers fail closed for rewritten Origins',()=>{
  for(const referer of [undefined,'null','not a URL','https://evil.invalid/game/home',
    config.origin.replace('https:','http:')+'/register',config.origin+':3001/register',
    config.origin+'.evil.invalid/register',config.origin.replace('https://','https://user:password@')+'/register']){
    assert.equal(requestOriginAllowed(config,{...headers,referer}),false,String(referer));
  }
});
test('rewritten requests require same-origin browser Fetch Metadata',()=>{
  for(const site of [undefined,'cross-site','same-site','none','same-origin, same-origin']){
    assert.equal(requestOriginAllowed(config,{...headers,'sec-fetch-site':site}),false,String(site));
  }
});
test('Codespaces rewrite handling cannot be enabled by spoofed forwarding headers in other deployments',()=>{
  for(const other of [loadConfig({PORT:'3001',APP_ORIGIN:config.origin}),
    loadConfig({...environment,APP_ORIGIN:'https://custom.example'}),
    loadConfig({...environment,APP_ORIGIN:'https://other-space-3001.app.github.dev'}),
    loadConfig({PORT:'3001',APP_ORIGIN:'http://localhost:4000'})]){
    assert.equal(requestOriginAllowed(other,{...headers,referer:other.origin+'/register',
      host:new URL(config.origin).host,'x-forwarded-host':new URL(config.origin).host,'x-forwarded-proto':'https'}),false);
  }
});
test('origin diagnostics omit URL paths, queries and credentials',()=>{
  assert.equal(urlOrigin(config.origin+'/login?csrf=secret#token'),config.origin);
  for(const value of [undefined,['https://example.com'],'https://user:secret@example.com/path','null','data:text/plain,secret']){
    assert.equal(urlOrigin(value),null);
  }
});
