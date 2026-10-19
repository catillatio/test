// Extend the offline controller fixture with real local ciphertext/manifest
// writes. The provider, database and worker boundaries remain blocked/mocked.
import './release-controller.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {registerHooks} from 'node:module';
import {getFile} from '../../deployment/release/transfer.mjs';

const fixture=globalThis.releaseFixture,out=join(process.env.GITHUB_WORKSPACE,'.release-artifacts');
const ciphertext=Buffer.alloc(200500,47),digest=createHash('sha256').update(ciphertext).digest('hex');
const previous={mkdir:fixture.mkdir,writeFile:fixture.writeFile,getReport:fixture.getReport,fetch:globalThis.fetch};
fixture.mkdir=async(path,options)=>path===out?mkdir(path,options):previous.mkdir(path,options);
fixture.writeFile=async(path,text)=>{
 assert.equal(path,join(out,'backup-manifest.json'));await previous.writeFile(path,text);await writeFile(path,text);
};
fixture.getReport=async()=>{
 const report=await previous.getReport();report.backup.encryptedSha256=digest;return report;
};
fixture.getFile=async(url,path,expected)=>{
 assert.equal(path,join(out,'realm.dump.age'));assert.deepEqual(expected,{sha256:digest,bytes:ciphertext.length});
 return getFile(url,path,expected);
};
globalThis.fetch=async(url,options)=>{
 if(new URL(url).origin==='https://recovery.fixture.invalid'){
  assert.equal(options.method,undefined);assert.equal(options.redirect,'error');
  return new Response(ciphertext,{headers:{'content-length':String(ciphertext.length)}});
 }
 return previous.fetch(url,options);
};
// Let the real independent checker compare its real candidate fingerprint.
registerHooks({
 resolve(specifier,context,next){
  if(context.parentURL===process.env.FIXTURE_CONTROLLER_URL&&specifier==='./candidate.mjs')return {url:'artifact-fixture:digest',shortCircuit:true};
  return next(specifier,context);
 },
 load(url,context,next){
  if(url==='artifact-fixture:digest')return {format:'module',source:'export const candidateDigest=async()=>process.env.FIXTURE_CANDIDATE_DIGEST;',shortCircuit:true};
  return next(url,context);
 }
});
