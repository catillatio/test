import assert from 'node:assert/strict';
import {z} from 'zod';
import {authenticate,policyContract,scopeContract,sha256,type SignedRecord} from './authorization.js';
import {graveyardDefinitionDigest} from './graveyard-roster.js';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const constructionContract=z.object({protocol:z.literal('kingdom-graveyard-construction-v1'),batchId:z.uuid(),policyDigest:digest,
 definitionDigest:digest,catalogId:z.enum(['alpha-0.3','level100-content-1']),sourceScope:scopeContract,codeSha:z.string().regex(/^[a-f0-9]{40}$/),candidateDigest:digest,
 targetDatabase:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,62}$/),targetOid:z.string().regex(/^[1-9][0-9]*$/),targetClusterDigest:digest,
 expectedMatureDeletions:z.number().int().nonnegative(),expectedBatchCount:z.number().int().nonnegative(),
 expectedErasureCount:z.number().int().nonnegative(),creditCutoff:z.iso.datetime(),sourceErasureFenceVerified:z.literal(true),
 issuedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),externalHoldsCleared:z.literal(true),restoreGuardInstalled:z.literal(true),
 independentRecoveryVerified:z.literal(true),encryptedBackupSha256:digest,recoveryEvidenceSha256:digest,recoveryVerifiedAt:z.iso.datetime()}).strict();
export function authenticateConstruction(policy:SignedRecord,permit:SignedRecord,key:string){
 const p=authenticate(policy,key,policyContract),v=authenticate(permit,key,constructionContract);
 assert.equal(v.policyDigest,sha256(policy.payload));assert.equal(v.definitionDigest,graveyardDefinitionDigest());assert.deepEqual(v.sourceScope,p.scope);
 assert.equal(v.targetDatabase,p.scope.database);assert.equal(v.targetClusterDigest,p.scope.clusterDigest);
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
