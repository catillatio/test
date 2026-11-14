import assert from 'node:assert/strict';
import {z} from 'zod';
import {authenticate,scopeContract,sha256,type SignedRecord} from './authorization.js';
import {graveyardDefinitionDigest,graveyardWorld} from './graveyard-roster.js';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const populationPolicyContract=z.object({protocol:z.literal('kingdom-graveyard-population-policy-v1'),policyId:z.uuid(),
 repository:z.literal('catillatio/test'),approved:z.literal(true),approvedAt:z.iso.datetime(),scope:scopeContract,
 definitionDigest:digest,targetPopulation:z.number().int().min(0).max(graveyardWorld.limits.maximumPopulation),
 maximumPopulation:z.number().int().min(1).max(graveyardWorld.limits.maximumPopulation),
 maximumNewPerOperation:z.number().int().min(1).max(graveyardWorld.limits.maximumNewPerOperation)}).strict().refine(p=>p.targetPopulation<=p.maximumPopulation);
export const constructionContract=z.object({protocol:z.literal('kingdom-graveyard-construction-v2'),operationId:z.uuid(),policyDigest:digest,
 definitionDigest:digest,catalogId:z.enum(['alpha-0.3','level100-content-1']),scope:scopeContract,codeSha:z.string().regex(/^[a-f0-9]{40}$/),candidateDigest:digest,
 targetDatabase:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,62}$/),targetOid:z.string().regex(/^[1-9][0-9]*$/),targetClusterDigest:digest,
 expectedPopulation:z.number().int().nonnegative(),expectedOperationCount:z.number().int().nonnegative(),
 slots:z.array(z.number().int().min(0).max(graveyardWorld.limits.maximumPopulation-1)).min(1).max(graveyardWorld.limits.maximumNewPerOperation),
 issuedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),externalHoldsCleared:z.literal(true),restoreGuardInstalled:z.literal(true),
 independentRecoveryVerified:z.literal(true),encryptedBackupSha256:digest,recoveryEvidenceSha256:digest,recoveryVerifiedAt:z.iso.datetime()}).strict();
export function authenticateConstruction(policy:SignedRecord,permit:SignedRecord,key:string){
 const p=authenticate(policy,key,populationPolicyContract),v=authenticate(permit,key,constructionContract);
 assert.equal(v.policyDigest,sha256(policy.payload));assert.equal(v.definitionDigest,graveyardDefinitionDigest());assert.equal(p.definitionDigest,v.definitionDigest);assert.deepEqual(v.scope,p.scope);
 assert.equal(v.targetDatabase,p.scope.database);assert.equal(v.targetClusterDigest,p.scope.clusterDigest);
 assert.ok(v.slots.length<=p.maximumNewPerOperation&&v.expectedPopulation+v.slots.length<=p.maximumPopulation);
 assert.equal(new Set(v.slots).size,v.slots.length);assert.deepEqual([...v.slots].sort((a,b)=>a-b),v.slots);
 assert.ok(v.slots.every(s=>s<p.targetPopulation));
 const issued=Date.parse(v.issuedAt),expires=Date.parse(v.expiresAt);
 assert.ok(expires>issued&&expires-issued<=900000&&Date.parse(p.approvedAt)<=issued);
 assert.ok(Date.parse(v.recoveryVerifiedAt)<=issued+30000&&issued-Date.parse(v.recoveryVerifiedAt)<=7200000);
 return {policy:p,permit:v};
}
export function authorizeConstruction(policy:SignedRecord,permit:SignedRecord,key:string,now=Date.now()){
 const result=authenticateConstruction(policy,permit,key),v=result.permit;
 assert.ok(Date.parse(v.issuedAt)<=now+30000&&Date.parse(v.issuedAt)>=now-900000&&Date.parse(v.expiresAt)>now,'Fresh bounded construction approval required.');
 assert.ok(Date.parse(v.recoveryVerifiedAt)<=now&&Date.parse(v.recoveryVerifiedAt)>=now-7200000);
 return result;
}
