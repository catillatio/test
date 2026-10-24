// Deliberately separate from release/recovery/operator workflows. Nothing calls
// this at startup. Future owner-run private administration only, never this PR.
import {readFile,writeFile,realpath} from 'node:fs/promises';import {resolve,sep,dirname} from 'node:path';
import {createDatabase} from '../dist/db.js';import {inspectExpansion,activateExpansion} from '../dist/expansion-activation.js';
import {inspectHudson,provisionHudson} from '../dist/hudson-provision.js';import {definitionDigest} from '../dist/expansion-content.js';
let db;try{
 if(process.env.ALLOW_EXPANSION_OPERATOR!=='1')throw 0;
 const url=new URL(process.env.DATABASE_URL??'');if(!['postgres:','postgresql:'].includes(url.protocol)||!/(^|\.)railway\.internal$/.test(url.hostname))throw 0;
 const [mode,file,...extra]=process.argv.slice(2);if(extra.length||!['inspect-expansion','activate-expansion','inspect-hudson','grant-hudson'].includes(mode)||!file)throw 0;
 const path=resolve(file),publicRoot=await realpath(new URL('../public',import.meta.url));const parent=await realpath(dirname(path));if(path===publicRoot||path.startsWith(publicRoot+sep)||parent===publicRoot||parent.startsWith(publicRoot+sep))throw 0;
 db=createDatabase(url.href);
 if(mode.startsWith('inspect-')){
  const plan=mode==='inspect-hudson'?await inspectHudson(db):await inspectExpansion(db,{storageReviewed:false,recoveryReviewed:false,opponentPlanReviewed:false,rareDrops:false});
  await writeFile(path,JSON.stringify(plan,null,2)+'\n',{mode:0o600,flag:'wx'});console.log('EXPANSION_PLAN_CREATED: PASS');
 }else{
  const plan=JSON.parse(await readFile(path,'utf8')),approved=process.env.APPROVED_EXPANSION_PLAN_SHA256;
  if(!/^[a-f0-9]{64}$/.test(approved??'')||definitionDigest(plan)!==approved)throw 0;
  if(mode==='grant-hudson')await provisionHudson(db,plan,approved);else await activateExpansion(db,plan,approved);
  console.log('EXPANSION_EXACT_OPERATION: PASS');
 }
}catch{console.error('EXPANSION_OPERATOR: FAIL');process.exitCode=1;}finally{try{await db?.end();}catch{console.error('EXPANSION_OPERATOR: FAIL');process.exitCode=1;}}
