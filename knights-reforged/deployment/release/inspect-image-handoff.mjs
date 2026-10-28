// Two authenticated reads; no mutation, source upload, image pull, DB or backup.
// Historical signature verification is forensic only: it never renews a proof
// or creates an approval/continuation artifact, even when every check matches.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {railwayClient,failureCategory} from './registrar-config.mjs';
import {imageInspectQuery,imageReceiptQuery,imageTargetSnapshot,checkImagePatch,appliedImageVariables,imageReleaseKeys,imageHandoffFailure} from './image-deploy.mjs';
import {canonical,imageRepository} from './image-policy.mjs';
import {verifyProof} from './proof.mjs';
import {uuid} from './protocol.mjs';

const incident=JSON.parse(readFileSync(new URL('./image-handoff-40629780333.json',import.meta.url),'utf8'));
// Official Railway CLI VariablesForServiceDeployment query. Resolve the
// existing private DB reference variables only inside the authenticated read;
// no DB URL/host needs to be passed through a publicly logged workflow env.
const resolved='resolved:variablesForServiceDeployment(projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId)';
export const handoffInspectQuery=imageInspectQuery.slice(0,-1)+' '+resolved+'}';
export const handoffReceiptQuery=imageReceiptQuery.slice(0,-1)+' '+resolved+'}';
const redacted=value=>typeof value==='string'&&/^(?:\*+|\[redacted\]|<redacted>|redacted|\[masked\]|<masked>)$/i.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function credentialCategory(value,expected){
 if(!object(value)||Object.keys(value).sort().join(',')!=='password,username')return 'CREDENTIAL_SHAPE_UNVERIFIED';
 if(redacted(value.username)||redacted(value.password))return 'CREDENTIAL_REDACTED';
 if(typeof value.username!=='string'||typeof value.password!=='string')return 'CREDENTIAL_NONSTRING';
 return value.username===expected.username&&value.password===expected.password?'CREDENTIAL_EXACT_MATCH':'CREDENTIAL_STRING_MISMATCH';
}
function deltaCategory(value){
 if(!object(value)||!Object.keys(value).every(name=>imageReleaseKeys.includes(name)))return 'VARIABLE_DELTA_UNEXPECTED';
 const names=Object.keys(value);
 if(names.length===7)return 'VARIABLE_DELTA_SEVEN';
 if(names.length===6&&!Object.hasOwn(value,'KINGDOM_AUTOMATED_RELEASES'))return 'VARIABLE_DELTA_SIX';
 return 'VARIABLE_DELTA_OTHER_ALLOWED_SUBSET';
}
function signedValues(data,target,env,expected,now){
 const changes=data.pending.patch.services[target.serviceId].variables;
 assert.ok(object(changes));
 const effective={...appliedImageVariables(data,target),...changes};
 const encoded=effective.KINGDOM_RELEASE_BACKUP_PROOF?.value;
 // Decode only to supply the independently signature-checked image identity.
 // None of these fields is accepted until verifyProof validates the signature.
 const envelope=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
 const untrusted=JSON.parse(Buffer.from(envelope.payload,'base64url').toString('utf8'));
 const reference=imageRepository+'@'+expected.imageManifestDigest;
 const proofEnv={KINGDOM_RELEASE_ARTIFACT_KIND:'oci-image-v1',KINGDOM_RELEASE_SHA:expected.sourceSha,
  KINGDOM_RELEASE_IMAGE_REFERENCE:reference,KINGDOM_RELEASE_IMAGE_DIGEST:expected.imageManifestDigest,
  RAILWAY_PROJECT_ID:target.projectId,RAILWAY_ENVIRONMENT_ID:target.environmentId,RAILWAY_SERVICE_ID:target.serviceId,
  APP_ORIGIN:data.resolved?.APP_ORIGIN,DATABASE_URL:data.resolved?.DATABASE_URL,
  KINGDOM_RESTORE_DATABASE_URL:data.resolved?.KINGDOM_RESTORE_DATABASE_URL,
  KINGDOM_RESTORE_TEST_DATABASE:effective.KINGDOM_RESTORE_TEST_DATABASE?.value};
 // Deliberately validate AT the bound stage revision for forensic inspection.
 // Normal release/runtime verification still uses current time, unchanged.
 const stagedAt=Date.parse(expected.patchUpdatedAt);
 const proof=verifyProof(encoded,env.KINGDOM_RELEASE_VERIFY_KEY,proofEnv,untrusted.candidateDigest,{now:stagedAt,imageIdentity:untrusted.image?.candidate?.identity});
 assert.match(proof.jobId,new RegExp('^gh_'+expected.releaseRunId+'_1_[a-f0-9]{32}$'));
 assert.equal(proof.artifactId,expected.recoveryArtifactId);
 assert.equal(proof.image.artifactId,expected.imageArtifactId);assert.equal(proof.image.artifactDigest,expected.imageArtifactDigest);
 assert.equal(proof.image.candidate.prepareRunId,expected.imagePrepareRunId);assert.equal(proof.image.candidate.prepareRunAttempt,'1');
 const values={KINGDOM_AUTOMATED_RELEASES:'1',KINGDOM_RELEASE_SHA:proof.sha,KINGDOM_RESTORE_TEST_DATABASE:proof.copy,
  KINGDOM_RELEASE_BACKUP_PROOF:encoded,KINGDOM_RELEASE_ARTIFACT_KIND:'oci-image-v1',KINGDOM_RELEASE_IMAGE_REFERENCE:reference,KINGDOM_RELEASE_IMAGE_DIGEST:expected.imageManifestDigest};
 return {values,reference,evidence:Date.parse(proof.expiresAt)>now?'SIGNED_CURRENT':'SIGNED_HISTORICAL_ONLY'};
}
export async function inspectImageHandoff(env,{api,expected=incident,now=Date.now()}={}){
 let category='INSPECTION_REQUEST',legacy='UNVERIFIED',corrected='UNVERIFIED',credentials='CREDENTIAL_UNVERIFIED',delta='VARIABLE_DELTA_UNVERIFIED',evidence='SIGNED_UNVERIFIED';
 try{
  assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_REF,'refs/heads/release/production');
  assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.KINGDOM_IMAGE_HANDOFF_INSPECTION,'true');assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
  assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
  category='INSPECTION_CREDENTIALS';
  assert.ok(typeof env.RAILWAY_TOKEN==='string'&&/^[\x21-\x7e]+$/.test(env.RAILWAY_TOKEN)&&!env.RAILWAY_API_TOKEN);
  const password=env.KINGDOM_IMAGE_REGISTRY_READ_TOKEN;assert.ok(typeof password==='string'&&password.trim()&&password===password.trim()&&password.length<=8192&&!/[\r\n]/.test(password));
  const expectedCredentials={username:'catillatio',password};
  const target={projectId:env.RAILWAY_PROJECT_ID,environmentId:env.RAILWAY_ENVIRONMENT_ID,serviceId:env.RAILWAY_GAME_SERVICE_ID};
  category='INSPECTION_TARGET';for(const value of Object.values(target))assert.match(value??'',uuid);
  const client=api??railwayClient(env.RAILWAY_TOKEN);let reads=0;
  const read=async(query,variables)=>{
   assert.ok([handoffInspectQuery,handoffReceiptQuery].includes(query));assert.ok(++reads<=2);
   assert.equal(variables.projectId,target.projectId);assert.equal(variables.environmentId,target.environmentId);assert.equal(variables.serviceId,target.serviceId);
   if(query===handoffReceiptQuery)assert.equal(variables.patchId,expected.patchId);
   return client(query,variables);
  };
  category='INSPECTION_PROVIDER';const data=await read(handoffInspectQuery,target);
  category='INSPECTION_PATCH_BINDING';
  assert.equal(data.pending?.id,expected.patchId);assert.equal(data.pending.updatedAt,expected.patchUpdatedAt);assert.equal(data.pending.status,'STAGED');
  category='INSPECTION_RUNNING_TARGET';const baseline=imageTargetSnapshot(data,target);
  assert.equal(data.game.activeDeployments[0].id,expected.activeDeploymentId);assert.deepEqual(data.game.source,{image:null,repo:'catillatio/test'});
  const svc=data.pending?.patch?.services?.[target.serviceId];
  credentials=credentialCategory(svc?.deploy?.registryCredentials,expectedCredentials);delta=deltaCategory(svc?.variables);
  category='INSPECTION_SIGNED_EVIDENCE';const signed=signedValues(data,target,env,expected,now);evidence=signed.evidence;
  try{checkImagePatch(data.pending,target,signed.reference,signed.values,expectedCredentials,{requireAllChanged:true});legacy='LEGACY_MATCH';}
  catch(error){legacy=imageHandoffFailure(error);}
  try{checkImagePatch(data.pending,target,signed.reference,signed.values,expectedCredentials,{appliedVariables:appliedImageVariables(data,target)});corrected='CORRECTED_MATCH';}
  catch(error){corrected=imageHandoffFailure(error);}
  category='INSPECTION_PROVIDER';const fresh=await read(handoffReceiptQuery,{...target,patchId:expected.patchId});
  category='INSPECTION_REVISION_BINDING';
  assert.equal(imageTargetSnapshot(fresh,target),baseline);assert.deepEqual(fresh.game.source,data.game.source);
  assert.equal(canonical(fresh.pending),canonical(data.pending));assert.equal(canonical(fresh.receipt),canonical(data.pending));
  assert.equal(canonical(fresh.environment.config),canonical(data.environment.config));
  for(const name of ['APP_ORIGIN','DATABASE_URL','KINGDOM_RESTORE_DATABASE_URL'])assert.equal(fresh.resolved?.[name],data.resolved?.[name]);
  return {result:corrected==='CORRECTED_MATCH'?'MATCH':'REJECTED',failure:corrected==='CORRECTED_MATCH'?'NONE':corrected,
   legacyFirstRejection:legacy,correctedFirstRejection:corrected,credentials,variableDelta:delta,signedEvidence:evidence,revision:'EXACT_MATCH',authorizesRelease:false};
 }catch(error){
  const provider=failureCategory(error);
  return {result:'UNVERIFIED',failure:provider==='UNCLASSIFIED'?category:provider,legacyFirstRejection:'UNVERIFIED',correctedFirstRejection:'UNVERIFIED',
   credentials,variableDelta:delta,signedEvidence:evidence,revision:'UNVERIFIED',authorizesRelease:false};
 }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 let result;try{result=await inspectImageHandoff(process.env);}catch{result={result:'UNVERIFIED',failure:'UNVERIFIED',authorizesRelease:false};}
 console.log('IMAGE_HANDOFF_INSPECTION: '+JSON.stringify(result));process.exitCode=result.result==='MATCH'?0:1;
}
