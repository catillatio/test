import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import ejs from 'ejs';
import {createApp} from '../src/app.js';
import {loadConfig,projectRoot} from '../src/config.js';
import type {Database} from '../src/db.js';
import {rules} from '../src/rules.js';
import {landRules} from '../src/land-rules.js';
import {alpha} from '../src/alpha-rules.js';
import {strategy} from '../src/strategy-rules.js';
import {community} from '../src/community-rules.js';
import {navigation} from '../src/http-contracts.js';
import {realm,testDatabaseUrl} from './helpers.js';

// Deliberately omit Phase 4.1's page locals: this is the previously valid
// anonymous render contract used by an older compiled/in-memory renderer.
const anonymousLocals=(screen='auth',authMode='login')=>({screen,authMode,state:null,title:'Enter the realm',
  nav:navigation,rules,landRules,alpha,strategy,community,notice:null,error:null,csrf:'a'.repeat(64),
  accountName:'',formValues:{username:'',name:''},commandId:randomUUID});
const unavailableDatabase:Database={
  async query(){throw new Error('Synthetic database failure; private diagnostic must not be rendered.');},
  async connect(){throw new Error('Rendering must not open a database connection.');},
  async end(){},
};
const html=(response:{statusCode:number;body:string;headers:Record<string,unknown>},status=200)=>{
  assert.equal(response.statusCode,status,response.body);
  assert.match(String(response.headers['content-type']),/text\/html/);
  assert.match(response.body,/^<!doctype html>/);
  assert.doesNotMatch(response.body,/ReferenceError|is not defined|<%/);
};

test('shared layout renders login, registration and error HTML with no refinements page local',async()=>{
  const file=join(projectRoot,'views/layout.ejs'),source=await readFile(file,'utf8');
  for(const [screen,mode] of [['auth','login'],['auth','register'],['error','login']]){
    const rendered=ejs.render(source,anonymousLocals(screen,mode),{filename:file});
    assert.match(rendered,/^<!doctype html>/);assert.match(rendered,/\/assets\/realm-iron-brass\.css\?v=realm-beta-1/);assert.doesNotMatch(rendered,/\/assets\/phase41\.css/);
    const legacy=ejs.render(source,{...anonymousLocals(screen,mode),uiTheme:false},{filename:file});assert.match(legacy,/^<!doctype html>/);assert.match(legacy,/\/assets\/phase41\.css\?v=/);
  }
});
test('application view defaults supply Phase 4.1 rules to direct rendering, including public rules',async()=>{
  const app=await createApp({db:unavailableDatabase,config:loadConfig({NODE_ENV:'test'})});
  try{
    for(const screen of ['auth','rules','error']){
      const rendered=await app.view('layout.ejs',anonymousLocals(screen));
      assert.match(rendered,/^<!doctype html>/);assert.doesNotMatch(rendered,/ReferenceError|is not defined/);
      if(screen==='rules')assert.match(rendered,/refinements-0\.1/);
    }
  }finally{await app.close();}
});
test('anonymous internal errors render the shared HTML layout without masking the error or exposing diagnostics',async()=>{
  const app=await createApp({db:unavailableDatabase,config:loadConfig({NODE_ENV:'test'})});
  try{
    const result=await app.inject({method:'GET',url:'/healthz'});html(result,500);
    assert.match(result.body,/The realm could not complete that request/);
    assert.doesNotMatch(result.body,/Synthetic database failure|private diagnostic/);
  }finally{await app.close();}
});

test('anonymous HTTP pages and authentication validation/CSRF errors render full HTML',{skip:!testDatabaseUrl},async()=>{
  const r=await realm({isolated:true});try{
    for(const url of ['/login','/register','/rules'])html(await r.app.inject({method:'GET',url}));
    html(await r.app.inject({method:'GET',url:'/unknown-anonymous-page'}),404);
    const initial=await r.app.inject({method:'GET',url:'/'});assert.equal(initial.statusCode,302);assert.equal(initial.headers.location,'/login');
    for(const mode of ['register','login']){
      const form=await r.app.inject({method:'GET',url:'/'+mode});html(form);
      const cookie=String(form.headers['set-cookie']).split(';')[0]!;
      const csrf=/name="csrf" value="([a-f0-9]{64})"/.exec(form.body)![1]!;
      const invalid=await r.app.inject({method:'POST',url:'/'+mode,headers:{cookie,origin:'http://localhost:3000'},
        payload:{csrf,username:mode==='register'?'!':'missing_account',name:'Test Knight',password:'short'}});
      html(invalid,mode==='register'?422:401);assert.match(invalid.body,/class="auth-form"/);
      const rejected=await r.app.inject({method:'POST',url:'/'+mode,headers:{cookie,origin:'http://localhost:3000'},payload:{csrf:'0'.repeat(64)}});
      html(rejected,403);assert.match(rejected.body,/Your session changed or the form expired/);
    }
    const created=await r.player('Rendering Knight');
    const signedIn=await r.app.inject({method:'GET',url:'/game/home',headers:{cookie:created.cookie}});html(signedIn);
  }finally{await r.close();}
});
test('authenticated screens and error paths share a complete rendering context',{skip:!testDatabaseUrl},async()=>{
  const r=await realm({isolated:true});try{
    const p=await r.player('Rendering Knight'),other=await r.player('Other Knight'),headers={cookie:p.cookie};
    for(const page of ['home','profile','profile?tab=skills','profile?tab=comments','profile?tab=battles','quests','battle','bounties','vault','armory','army','land','settings','players/'+other.id,'bounties/new?target='+other.id]){
      const result=await r.app.inject({method:'GET',url:'/game/'+page,headers});html(result);
      assert.match(result.body,/\/assets\/realm\.js\?v=/);
    }
    html(await r.app.inject({method:'GET',url:'/rules',headers}));
    for(const url of ['/unknown-authenticated-page','/game/battles/'+randomUUID(),'/game/players/'+randomUUID()]){
      html(await r.app.inject({method:'GET',url,headers}),404);
    }
    const rejected=await r.app.inject({method:'POST',url:'/game/quests/border-patrol/run',headers:{...headers,origin:'http://localhost:3000'},payload:{csrf:'0'.repeat(64)}});
    html(rejected,403);
    const foreign=await r.app.inject({method:'POST',url:'/game/quests/border-patrol/run',headers:{...headers,origin:'https://foreign.invalid'},payload:{csrf:p.csrf}});
    html(foreign,403);assert.match(foreign.body,/different realm address/);
  }finally{await r.close();}
});
test('battle reports and bounty review render after real commands without missing shared locals',{skip:!testDatabaseUrl},async()=>{
  const r=await realm({isolated:true});try{
    const p=await r.player('Rendering Hunter'),other=await r.player('Rendering Rival');
    for(const player of [p,other]){
      await r.prepare(player,2000,30);for(let i=0;i<5;i++)await r.ok(player,'/api/v1/quests/border-patrol/runs');
    }
    const preview=await r.command(p,'/game/bounties/preview',{targetCharacterId:other.id,amount:1});html(preview);
    assert.match(preview.body,/Confirm bounty — 2 gold/);
    const battle=await r.ok(p,'/api/v1/battles',{targetCharacterId:other.id});
    html(await r.app.inject({method:'GET',url:'/game/battles/'+battle.battleId,headers:{cookie:p.cookie}}));
    html(await r.app.inject({method:'GET',url:'/game/battles/'+battle.battleId,headers:{cookie:other.cookie}}));
  }finally{await r.close();}
});
