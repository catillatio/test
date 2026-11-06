import test from 'node:test';
import assert from 'node:assert/strict';
import {realm,testDatabaseUrl} from './helpers.js';
import {requestAccountDeletion,socialSafety,communityPolicyVersion} from '../src/account-safety.js';
import {activityFeed} from '../src/feeds.js';
assert.ok(testDatabaseUrl,'Disposable database required');
test('public and in-game deletion requests reauthenticate, require CSRF, deduplicate and preserve gameplay',async()=>{
 const r=await realm({isolated:true});
 try {
  const a=await r.player('Deletion Requester'),b=await r.player('Other Account');
  const snapshot=async()=>JSON.stringify((await r.db.query(`SELECT (SELECT jsonb_agg(w ORDER BY character_id) FROM wallets w) AS wallets,(SELECT jsonb_agg(e ORDER BY id) FROM economy_entries e) AS ledger,(SELECT jsonb_agg(c ORDER BY id) FROM characters c) AS characters,(SELECT jsonb_agg(s ORDER BY token_hash) FROM sessions s) AS sessions`)).rows);

  for(const path of ['/legal/privacy','/legal/terms','/legal/community','/legal/deletion','/account-deletion']){const page=await r.app.inject({url:path,headers:{cookie:a.cookie}});assert.equal(page.statusCode,200);assert.match(page.body,/OWNER REVIEW DRAFT/);assert.ok(!page.body.includes('AlphaTest!2026'));}
  const send=(payload:Record<string,unknown>,headers:Record<string,string>={})=>r.app.inject({method:'POST',url:'/account-deletion/requests',headers:{cookie:a.cookie,origin:'http://localhost:3000',...headers},payload:{csrf:a.csrf,...payload}});
  assert.equal((await send({username:'unknown',password:'wrong',confirm:'request-account-deletion'})).statusCode,401);
  assert.equal((await send({csrf:'0'.repeat(64),confirm:'request-account-deletion'})).statusCode,403);
  assert.equal((await send({confirm:'request-account-deletion'},{origin:'https://attacker.invalid'})).statusCode,403);
  const name=(await r.db.query('SELECT username FROM accounts WHERE id=$1',[a.accountId])).rows[0]!.username;
  const other=(await r.db.query('SELECT username FROM accounts WHERE id=$1',[b.accountId])).rows[0]!.username;
  assert.equal((await send({username:other,password:'AlphaTest!2026',confirm:'request-account-deletion'})).statusCode,401);
  const before=await snapshot();
  const response=await send({username:name,password:'AlphaTest!2026',confirm:'request-account-deletion'});assert.equal(response.statusCode,200);assert.match(response.body,/Deletion is not complete/);
  const results=await Promise.all(Array.from({length:5},()=>requestAccountDeletion(r.db,a.accountId)));
  assert.equal(new Set(results.map(x=>x.id)).size,1);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM account_deletion_requests')).rows[0]!.n,1);
  assert.equal(await snapshot(),before,'No account resource, financial, character or session mutation');
  assert.equal((await r.app.inject({url:'/game/settings',headers:{cookie:a.cookie}})).statusCode,200);
 }finally{await r.close();}
});
test('UGC consent, reporting and reversible social blocking are independent of game records',async()=>{
 const r=await realm({isolated:true});
 try {
  const a=await r.player('Blocker'),b=await r.player('Sender');
  await r.db.query('DELETE FROM community_policy_acceptances WHERE character_id=$1',[b.id]);
  const rejected=await r.command(b,'/api/v1/comments',{profileId:a.id,body:'Respectful message'});assert.equal(rejected.statusCode,409);assert.equal(rejected.json().error.code,'COMMUNITY_TERMS_REQUIRED');
  assert.equal((await r.command(b,'/api/v1/comments',{profileId:a.id,body:'Respectful message',communityPolicy:'stale'})).statusCode,409);
  await r.ok(b,'/api/v1/comments',{profileId:a.id,body:'Respectful message',communityPolicy:communityPolicyVersion});
  assert.ok((await activityFeed(r.db,a.id,'comments',undefined,a.id)).entries.some(e=>e.data.body==='Respectful message'));
  const before=(await r.db.query('SELECT count(*)::int AS n FROM realm_messages')).rows[0]!.n;
  await Promise.all([socialSafety(r.db,a.accountId,b.id,'block',''),socialSafety(r.db,a.accountId,b.id,'block','')]);
  assert.equal((await activityFeed(r.db,a.id,'comments',undefined,a.id)).entries.length,0);
  assert.equal((await activityFeed(r.db,b.id,'comments',undefined,a.id)).entries.length,1,'Authors can still see their own messages');
  assert.equal((await r.command(b,'/api/v1/comments',{profileId:a.id,body:'Blocked message'})).statusCode,403);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM realm_messages')).rows[0]!.n,before);
  await socialSafety(r.db,a.accountId,b.id,'report','abuse');await socialSafety(r.db,a.accountId,b.id,'report','abuse');
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM social_user_reports')).rows[0]!.n,1);
  await assert.rejects(socialSafety(r.db,a.accountId,a.id,'block',''));
  await socialSafety(r.db,a.accountId,b.id,'unblock','');assert.equal((await activityFeed(r.db,a.id,'comments',undefined,a.id)).entries.length,1);
 }finally{await r.close();}
});

test('current or partial safety schema cannot silently disable blocking checks',async()=>{
 const r=await realm({isolated:true});
 try{const a=await r.player('Schema Guard');await r.db.query('DROP TABLE social_blocks');await assert.rejects(activityFeed(r.db,a.id,'comments'),/Incomplete account-safety schema/);}
 finally{await r.close();}
});

test('public character creation requires explicit current Terms/Guidelines consent and records it atomically',async()=>{
 const r=await realm({isolated:true});try{
  const form=await r.app.inject({url:'/register'}),line=String(form.headers['set-cookie']).split(';')[0]!,csrf=/name="csrf" value="([a-f0-9]{64})"/.exec(form.body)![1]!;
  assert.match(form.body,/id="registration-policy"[^>]*type="checkbox"[^>]*required/);
  const username='consent_'+Date.now().toString(36),payload={csrf,username,name:'Consent Knight',password:'SyntheticConsent!2026'};
  for(const communityPolicy of [undefined,'stale']){const denied=await r.app.inject({method:'POST',url:'/register',headers:{cookie:line,origin:'http://localhost:3000'},payload:{...payload,communityPolicy}});assert.equal(denied.statusCode,409);}
  assert.equal((await r.db.query('SELECT 1 FROM accounts WHERE username=$1',[username])).rowCount,0);
  const ok=await r.app.inject({method:'POST',url:'/register',headers:{cookie:line,origin:'http://localhost:3000'},payload:{...payload,communityPolicy:communityPolicyVersion}});assert.equal(ok.statusCode,303,ok.body);
  const rows=(await r.db.query('SELECT p.policy_version FROM community_policy_acceptances p JOIN characters c ON c.id=p.character_id JOIN accounts a ON a.id=c.account_id WHERE a.username=$1',[username])).rows;
  assert.deepEqual(rows,[{policy_version:communityPolicyVersion}]);
 }finally{await r.close();}
});
