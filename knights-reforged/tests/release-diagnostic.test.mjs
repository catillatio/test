import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const app=fileURLToPath(new URL('../',import.meta.url));
const script=join(app,'deployment/release/diagnose.mjs');
const wrapper=join(app,'deployment/release/diagnose.sh');
const folder=mkdtempSync(join(tmpdir(),'release-diagnostic-'));
after(()=>rmSync(folder,{recursive:true,force:true}));
const networkFlag=join(folder,'network-attempt');
const preload=join(folder,'block-network.mjs');
writeFileSync(preload,`
import {appendFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import http from 'node:http';import https from 'node:https';
import net from 'node:net';import tls from 'node:tls';
import dns from 'node:dns';import dgram from 'node:dgram';
import child from 'node:child_process';import workers from 'node:worker_threads';
const block=()=>{appendFileSync(${JSON.stringify(networkFlag)},'blocked\\n');throw new Error('Blocked fixture operation');};
for(const [module,names] of [[http,['request','get']],[https,['request','get']],
 [net,['connect','createConnection']],[tls,['connect']],[dns,['lookup','resolve']],
 [dns.promises,['lookup','resolve']],[dgram,['createSocket']],
 [child,['spawn','exec','execFile','fork','spawnSync','execSync','execFileSync']],
 [workers,['Worker']]])for(const name of names)module[name]=block;
globalThis.fetch=block;syncBuiltinESMExports();
`);
const keys=generateKeyPairSync('ed25519');
const other=generateKeyPairSync('ed25519');
const rsa=generateKeyPairSync('rsa',{modulusLength:2048});
const privatePem=key=>key.privateKey.export({type:'pkcs8',format:'pem'});
const publicPem=key=>key.publicKey.export({type:'spki',format:'pem'});
const valid={
 PATH:dirname(process.execPath)+':/usr/bin:/bin',
 NODE_OPTIONS:'--import='+preload,
 KINGDOM_RELEASE_SIGNING_KEY:privatePem(keys),
 KINGDOM_RELEASE_VERIFY_KEY:publicPem(keys),
 KINGDOM_BACKUP_ENDPOINT:'https://offline.example.invalid',
 KINGDOM_BACKUP_BUCKET:'offline-fixture',KINGDOM_BACKUP_REGION:'auto',KINGDOM_BACKUP_PATH_STYLE:'false',
 KINGDOM_BACKUP_ACCESS_KEY_ID:'offline-fixture-only',KINGDOM_BACKUP_SECRET_ACCESS_KEY:'offline-fixture-only'
};
const labels=['SIGNING_KEY_ED25519','SIGNING_KEY_MATCH','BACKUP_STORE_PRESIGN'];
const output=states=>labels.map((label,i)=>label+': '+(states[i]?'PASS':'FAIL')).join('\n')+'\n';

function check(env,states){
 const result=spawnSync(process.execPath,[script],{env:{...valid,...env},encoding:'utf8',timeout:15000});
 assert.equal(result.status,states.every(Boolean)?0:1);
 assert.equal(result.stdout,output(states));
 assert.equal(result.stderr,'');
 assert.equal(existsSync(networkFlag),false,'No network, worker or subprocess operation is allowed.');
}

test('matching Ed25519 keys and a valid recovery store report three fixed PASS results offline',()=>check({},[true,true,true]));
test('different valid Ed25519 keys identify correspondence failure without exposing either key',()=>check({KINGDOM_RELEASE_VERIFY_KEY:publicPem(other)},[true,false,true]));
test('an RSA private key cannot satisfy the Ed25519 requirement',()=>check({KINGDOM_RELEASE_SIGNING_KEY:privatePem(rsa),KINGDOM_RELEASE_VERIFY_KEY:publicPem(rsa)},[false,false,true]));
test('a malformed private PEM never emits its input or exception',()=>check({KINGDOM_RELEASE_SIGNING_KEY:'private-fixture-must-never-appear'},[false,false,true]));
test('a missing private key fails the two key checks but preserves the independent store result',()=>check({KINGDOM_RELEASE_SIGNING_KEY:undefined},[false,false,true]));
test('a malformed or missing public PEM fails only key correspondence',()=>{
 check({KINGDOM_RELEASE_VERIFY_KEY:'public-fixture-must-never-appear'},[true,false,true]);
 check({KINGDOM_RELEASE_VERIFY_KEY:undefined},[true,false,true]);
});
test('path-style signing is also local and supported',()=>check({KINGDOM_BACKUP_PATH_STYLE:'true'},[true,true,true]));
for(const [name,change] of [
 ['plaintext endpoint',{KINGDOM_BACKUP_ENDPOINT:'http://offline.example.invalid'}],
 ['endpoint credentials',{KINGDOM_BACKUP_ENDPOINT:'https://fixture:fixture@offline.example.invalid'}],
 ['endpoint path',{KINGDOM_BACKUP_ENDPOINT:'https://offline.example.invalid/private-path'}],
 ['invalid bucket',{KINGDOM_BACKUP_BUCKET:'INVALID BUCKET'}],
 ['missing region',{KINGDOM_BACKUP_REGION:undefined}],
 ['invalid URL style',{KINGDOM_BACKUP_PATH_STYLE:'invalid'}],
 ['missing access key',{KINGDOM_BACKUP_ACCESS_KEY_ID:undefined}],
 ['missing secret key',{KINGDOM_BACKUP_SECRET_ACCESS_KEY:undefined}]
])test('invalid backup configuration: '+name,()=>check(change,[true,true,false]));

let transportNumber=0;
function transport(body){
 const dir=join(folder,'transport-'+transportNumber++);mkdirSync(dir);
 // Local tests emulate only sudo/unshare transport. The network tripwire above
 // remains enabled. The separate hosted-runner test uses the real namespace.
 writeFileSync(join(dir,'sudo'),'#!/usr/bin/env bash\nset -euo pipefail\n'
  +'[[ "$1" == --preserve-env=* ]] || exit 99\nshift\n'
  +'[[ "$1" == unshare && "$2" == --net && "$3" == -- ]] || exit 99\nshift 3\n'+body+'\n',{mode:0o700});
 return dir;
}
function runWrapper(body,states,env={}){
 const bin=transport(body);
 const result=spawnSync('/bin/bash',[wrapper],{env:{...valid,...env,PATH:bin+':'+valid.PATH},encoding:'utf8',timeout:15000});
 assert.equal(result.status,states.every(Boolean)?0:1);
 assert.equal(result.stdout,output(states));assert.equal(result.stderr,'');
 assert.equal(existsSync(networkFlag),false);
}
test('the wrapper preserves only fixed diagnostic output',()=>runWrapper('exec "$@"',[true,true,true]));
test('disabled TLS checking is preserved and rejected without logging the Node warning',()=>runWrapper('exec "$@"',[true,true,false],{NODE_TLS_REJECT_UNAUTHORIZED:'0'}));
test('unexpected stdout and stderr are discarded rather than logged',()=>runWrapper("printf '%s\\n' 'UNEXPECTED-SENSITIVE-FIXTURE'; printf '%s\\n' 'EXCEPTION-SENSITIVE-FIXTURE' >&2; exit 1",[false,false,false]));
test('namespace failure is closed and never prints provider-like error text',()=>runWrapper("printf '%s\\n' 'SENSITIVE-ERROR-FIXTURE' >&2; exit 1",[false,false,false]));
test('a nonzero process cannot report overall success even after printing three PASS lines',()=>runWrapper("printf '%s\\n' 'SIGNING_KEY_ED25519: PASS' 'SIGNING_KEY_MATCH: PASS' 'BACKUP_STORE_PRESIGN: PASS'; exit 1",[false,false,false]));
test('known failure results remain visible with a failed job status',()=>runWrapper("printf '%s\\n' 'SIGNING_KEY_ED25519: PASS' 'SIGNING_KEY_MATCH: FAIL' 'BACKUP_STORE_PRESIGN: PASS'; exit 1",[true,false,true]));

test('real hosted-runner network namespace executes synthetic checks without production secrets',{
 skip:process.env.GITHUB_ACTIONS!=='true'||!existsSync('/usr/bin/sudo')
},()=>{
 const env={...valid};delete env.NODE_OPTIONS;
 const result=spawnSync('/bin/bash',[wrapper],{env,encoding:'utf8',timeout:15000});
 assert.equal(result.status,0);assert.equal(result.stdout,output([true,true,true]));assert.equal(result.stderr,'');
});

test('diagnostic workflows require manual production-branch invocation and existing owner approval',()=>{
 const workflows=new URL('../../.github/workflows/',import.meta.url);
 const caller=readFileSync(new URL('release-configuration-diagnostic.yml',workflows),'utf8');
 const protectedJob=readFileSync(new URL('release-configuration-diagnostic-checks.yml',workflows),'utf8');
 assert.match(caller,/^  workflow_dispatch:/m);assert.match(protectedJob,/^  workflow_call:/m);
 for(const source of [caller,protectedJob]){
  assert.match(source,/github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/release\/production'/);
  assert.match(source,/permissions:\n  contents: read\n/);
  assert.doesNotMatch(source,/^  (push|pull_request|schedule|repository_dispatch):/m);
  assert.doesNotMatch(source,/RAILWAY_TOKEN|DATABASE_URL|run\.mjs|worker\.mjs|migrate\.mjs|secrets: inherit/);
 }
 assert.match(protectedJob,/environment: production/);
 assert.match(caller,/uses: \.\/\.github\/workflows\/release-configuration-diagnostic-checks\.yml/);
 for(const [input,variable] of [['verify_key','RELEASE_VERIFY_KEY'],['backup_endpoint','BACKUP_ENDPOINT'],['backup_bucket','BACKUP_BUCKET'],['backup_region','BACKUP_REGION'],['backup_path_style','BACKUP_PATH_STYLE']]){
  assert.ok(caller.includes('diagnostic_'+input+': ${{ vars.KINGDOM_'+variable+' }}'));
  assert.ok(protectedJob.includes('${{ secrets.diagnostic_'+input+' }}'));
 }
 assert.ok(protectedJob.indexOf('npm ci --ignore-scripts')<protectedJob.indexOf('KINGDOM_RELEASE_SIGNING_KEY: ${{ secrets.'));
 const shell=readFileSync(wrapper,'utf8');
 const preserved=shell.match(/--preserve-env=([^\s]+)/)[1].split(',');
 assert.deepEqual(preserved.sort(),[...Object.keys(valid).filter(key=>!['PATH','NODE_OPTIONS'].includes(key)),'NODE_TLS_REJECT_UNAUTHORIZED'].sort());
});
