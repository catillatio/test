# Owner-only live bot-loot acceptance

Use this **after the protected deployment succeeds**. In Railway open **merry-patience → production → test → Console**. This is the running Kingdom Come game service, **not** KingdomReleaseCopy, Postgres, or a retention worker. Paste the entire command below once. No local PC software, credentials, edits or extra deployment are needed.

The command uses the existing game connection privately, checks the exact service context and installed immutable policy, and opens a repeatable-read **read-only** transaction. It samples at most ten v3 bot victories from the last **24 hours**, using each bot's existing defender/time index. It recalculates saved rewards and checks the corresponding wallet/retained-credit journals and absence of Vault movements. It changes no data or configuration, creates no battles and always rolls back its read transaction. Each SQL statement is limited to 15 seconds and lock waits to two seconds. Read-only queries take ordinary shared read locks; they do not take an exclusive/advisory lock or interrupt connections.

Return only the `owner_summary` JSON. It contains public commit/policy identifiers, a bounded observation count, Boolean checks and fixed failure metadata. It prints no wallet amounts, account/database identifiers, credentials, URLs, raw rows or provider errors. Compare its `commit` with the approved deployed merge commit.

- `PASS`: actual saved v3 victories and their financial transfers matched.
- `WAITING_FOR_OBSERVATION`: no qualifying victory exists in the bounded window. This is not evidence of failure. Wait for ordinary play/autonomous duels; do not create an extra recovery or replenish a wallet for verification.
- `FAILURE`: stop and return only this sanitized summary. Do not retry a release, alter a balance or modify credentials. A statement timeout or ambiguous reused command key is a verification limitation, not by itself evidence of an incorrect payout.

`above_threshold_observed` and `above_old_cap_observed` describe the sample, rather than manufacturing a high-value battle. The automated tests separately cover wealthy wallets and exact rounding.

```bash
(
set +x
if ! cd /app 2>/dev/null; then
  printf '%s\n' '{"owner_summary":{"result":"FAILURE","stage":"GAME_DIRECTORY","sqlstate":null,"read_only":false,"count":0,"all_checks":false}}'
  exit 1
fi
node --input-type=module <<'KINGDOM_BOT_LOOT_VERIFY'
const summary={result:'FAILURE',stage:'RUNTIME_CONTEXT',sqlstate:null,read_only:false,policy:'bot-combat-rewards-3',commit:null,count:0,all_checks:false,above_threshold_observed:false,above_old_cap_observed:false,checks:{}};
let client,transactionOpen=false;
const check=(name,value)=>{summary.checks[name]=value===true;if(!summary.checks[name])throw Error('VERIFICATION_CHECK_FAILED');};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
try{
 const env=process.env;
 check('runtime_context_matches',env.NODE_ENV==='production'&&env.RAILWAY_PROJECT_ID==='41a664f1-06bb-492e-90ef-cfd9635fc67f'&&env.RAILWAY_ENVIRONMENT_ID==='8ced8aef-352e-4ea9-931d-8963ff352c1c'&&env.RAILWAY_SERVICE_ID==='47a56e8e-aa72-40df-a5c4-0e5feb0f5cdd');
 check('commit_is_bound',/^[a-f0-9]{40}$/.test(env.KINGDOM_RELEASE_SHA??''));summary.commit=env.KINGDOM_RELEASE_SHA;
 const source=new URL(env.DATABASE_URL);check('postgres_connection_present',['postgres:','postgresql:'].includes(source.protocol)&&source.pathname.length>1);
 summary.stage='POLICY_IMPORT';
 const [{default:pg},{botCombat,botVictoryRewards},{isDeepStrictEqual}]=await Promise.all([import('pg'),import('./dist/bot-combat-rules.js'),import('node:util')]);
 check('code_policy_matches',botCombat.id===summary.policy&&botCombat.fullXpPercent===65);
 // Session-only, in-memory URL options: the saved environment is not changed.
 source.searchParams.set('options','-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=30000');
 summary.stage='CONNECTION';client=new pg.Client({connectionString:source.href,connectionTimeoutMillis:10000,application_name:'kingdom-bot-loot-read-only-acceptance'});
 client.on('error',()=>{summary.checks.connection_healthy=false;});await client.connect();summary.checks.connection_healthy=true;
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');transactionOpen=true;summary.stage='READ_ONLY';
 const identity=(await client.query("SELECT current_setting('transaction_read_only') AS read_only,current_database() AS database,clock_timestamp() AS observed_at")).rows[0];
 summary.read_only=identity.read_only==='on';check('read_only',summary.read_only);check('database_matches_connection',identity.database===decodeURIComponent(source.pathname.slice(1)));
 summary.stage='INSTALLED_POLICY';
 const installed=(await client.query('SELECT definition FROM public.rulesets WHERE id=$1',[botCombat.id])).rows;
 check('installed_policy_matches',installed.length===1&&isDeepStrictEqual(installed[0].definition,botCombat));
 const since=new Date(+identity.observed_at-86400000),through=identity.observed_at;
 summary.stage='OBSERVATION_QUERY';
 const rows=(await client.query(`SELECT b.id,b.attacker_id,b.defender_id,b.snapshot,b.result
  FROM public.development_bots d CROSS JOIN LATERAL (
   SELECT b.id,b.attacker_id,b.defender_id,b.snapshot,b.result,b.created_at
   FROM public.battles b WHERE b.defender_id=d.character_id AND b.created_at>=$2 AND b.created_at<=$3 AND b.outcome='attacker_win'
    AND (b.result->>'pvpRulesetId'=$1 OR b.result->>'botRewardEligibilityPolicy'=$1 OR b.result->'lootDetails'->>'rulesetId'=$1)
   ORDER BY b.created_at DESC,b.id DESC LIMIT 10
  ) b ORDER BY b.created_at DESC,b.id DESC LIMIT 10`,[botCombat.id,since,through])).rows;
 summary.count=rows.length;
 if(!rows.length){summary.result='WAITING_FOR_OBSERVATION';summary.stage='NO_RECENT_OBSERVATION';}
 else{
  summary.stage='REWARD_VALIDATION';
  check('saved_identity_matches',rows.every(b=>b.result.id===b.id&&b.result.attackerId===b.attacker_id&&b.result.defenderId===b.defender_id&&uuid.test(b.result.commandId??'')));
  check('saved_policy_matches',rows.every(b=>b.result.pvpRulesetId===botCombat.id&&b.result.botRewardEligibilityPolicy===botCombat.id&&b.result.lootDetails?.rulesetId===botCombat.id));
  check('saved_rewards_match',rows.every(b=>{
   const a=b.snapshot.attacker,d=b.snapshot.defender,result=b.result;
   const expected=botVictoryRewards(d.gold,a.level,d.level,result.lootDetails.victory,a.attack,d.defense);
   return result.loot===expected.loot.amount&&result.lootDetails.amount===expected.loot.amount&&result.lootDetails.base===expected.loot.base&&result.lootDetails.unreducedAmount===expected.loot.unreducedAmount&&result.lootDetails.multiplier===expected.loot.multiplier&&result.lootDetails.botCap===null&&result.xpDetails?.amount===expected.xp.amount&&result.xpDetails?.fullXpPercent===65;
  }));
  summary.above_threshold_observed=rows.some(b=>b.result.lootDetails.base>20000);summary.above_old_cap_observed=rows.some(b=>b.result.loot>3000);
  const commands=rows.map(b=>b.result.commandId),actors=[...new Set(rows.map(b=>b.attacker_id))],characters=[...new Set(rows.flatMap(b=>[b.attacker_id,b.defender_id]))];
  summary.stage='JOURNAL_IDENTITY';
  check('sample_commands_unique',new Set(commands).size===commands.length);
  // Attacker/time predicates use the existing index. Never count command keys
  // by scanning the complete global battle history.
  const commandRows=(await client.query(`SELECT b.result->>'commandId' AS command_id,count(*)::int AS matches
   FROM public.battles b WHERE b.attacker_id=ANY($1::uuid[]) AND b.created_at>=$2 AND b.created_at<=$3 AND b.result->>'commandId'=ANY($4::text[])
   GROUP BY b.result->>'commandId'`,[actors,since,through,commands])).rows;
  check('command_attribution_unambiguous',commandRows.length===commands.length&&commandRows.every(r=>r.matches===1));
  summary.stage='FINANCIAL_QUERY';
  // Start with indexed character entries, then join transaction primary keys.
  const entries=(await client.query(`SELECT t.command_id,e.character_id,e.amount::text AS amount,t.ruleset_id
   FROM public.economy_entries e JOIN public.economy_transactions t ON t.id=e.transaction_id
   WHERE e.character_id=ANY($1::uuid[]) AND t.command_id=ANY($2::uuid[]) AND t.reason='battle_loot'`,[characters,commands])).rows;
  // There is no retained-event command index. One bounded-command query is used
  // for the whole sample, protected by the same statement timeout.
  const retained=(await client.query("SELECT command_id,character_id,amount::text AS amount FROM public.treasury_retained_events WHERE command_id=ANY($1::uuid[]) AND reason='battle_loot'",[commands])).rows;
  const vault=(await client.query('SELECT count(*)::int AS matches FROM public.vault_entries WHERE character_id=ANY($1::uuid[]) AND command_id=ANY($2::uuid[])',[characters,commands])).rows[0];
  summary.stage='FINANCIAL_VALIDATION';
  check('ledger_policy_matches',entries.every(e=>e.ruleset_id===botCombat.id));
  check('exact_gold_transfer',rows.every(b=>{
   const key=b.result.commandId,paid=BigInt(b.result.loot),saved=entries.filter(e=>e.command_id===key),overflow=retained.filter(e=>e.command_id===key);
   if(saved.some(e=>e.character_id!==b.attacker_id&&e.character_id!==b.defender_id)||overflow.some(e=>e.character_id!==b.attacker_id||BigInt(e.amount)<0n))return false;
   const debit=saved.filter(e=>e.character_id===b.defender_id).reduce((n,e)=>n+BigInt(e.amount),0n);
   const credit=saved.filter(e=>e.character_id===b.attacker_id).reduce((n,e)=>n+BigInt(e.amount),0n)+overflow.reduce((n,e)=>n+BigInt(e.amount),0n);
   return debit===-paid&&credit===paid;
  }));
  check('vault_untouched',vault.matches===0);check('connection_healthy',summary.checks.connection_healthy);
  summary.all_checks=Object.values(summary.checks).every(Boolean);summary.result='PASS';summary.stage='COMPLETE';
 }
}catch(error){summary.result='FAILURE';summary.all_checks=false;summary.sqlstate=/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:null;}
finally{
 if(client){
  if(transactionOpen)try{await client.query('ROLLBACK');}catch(error){summary.result='FAILURE';summary.all_checks=false;summary.stage='ROLLBACK';summary.sqlstate=/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:null;}
  await client.end().catch(()=>{summary.result='FAILURE';summary.all_checks=false;summary.stage='CONNECTION_END';});
 }
}
console.log(JSON.stringify({owner_summary:summary}));
KINGDOM_BOT_LOOT_VERIFY
)
```

The exact Node payload was exercised against an owned disposable PostgreSQL 18 fixture: no observations returned `WAITING_FOR_OBSERVATION`; a matching saved victory including retained overflow returned `PASS`; wrong journal credit, wrong service context and a changed installed policy were rejected; a missing fixture table returned only the fixed failure stage and SQLSTATE `42P01`. The fixture was removed. No production query was executed during preparation.
