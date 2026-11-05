import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {z} from 'zod';
// Purpose-separated approval protocol using the existing Ed25519 architecture. No private key is
// accepted by this application, stored in the database, or generated here.
export const sha256=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const uuid=z.uuid(),digest=z.string().regex(/^[a-f0-9]{64}$/);
export const scopeContract=z.object({projectId:uuid,environmentId:uuid,gameServiceId:uuid,
 database:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,62}$/),clusterDigest:digest}).strict();
export const policyContract=z.object({protocol:z.literal('kingdom-erasure-policy-v1'),policyId:uuid,
 repository:z.literal('catillatio/test'),approved:z.literal(true),approvedAt:z.iso.datetime(),
 // Explicitly proposed exceptions. No implicit legal policy or default approval.
 sharedRecords:z.literal('pseudonymous-integrity-anchors-until-service-closure'),
 backupRecords:z.literal('suppress-on-restore-until-protected-backups-expire'),
 journalRetention:z.literal('last-relevant-backup-destruction-plus-30-days'),
 personalData:z.literal('erase-at-fulfillment'),sharedRecordClosureGraceDays:z.literal(30),routineBackupMaximumDays:z.literal(30),protectedBackupReviewDays:z.literal(30),erasureLedgerGraceDays:z.literal(30),scope:scopeContract}).strict();
export const intentContract=z.object({protocol:z.literal('kingdom-erasure-intent-v1'),operationId:uuid,
 accountId:uuid,characterId:uuid,requestId:uuid,policyDigest:digest,sourceScope:scopeContract,
 issuedAt:z.iso.datetime()}).strict();
export const permitContract=z.object({protocol:z.literal('kingdom-erasure-execution-v1'),
 mode:z.enum(['fulfill','restore']),operationId:uuid,intentDigest:digest,policyDigest:digest,
 journalSequence:z.number().int().nonnegative(),journalRoot:digest,targetDatabase:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,62}$/),
 targetOid:z.string().regex(/^[1-9][0-9]*$/),targetClusterDigest:digest,candidateDigest:digest,codeSha:z.string().regex(/^[a-f0-9]{40}$/),
 issuedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),externalHoldsCleared:z.literal(true),
 restoreGuardInstalled:z.literal(true),independentRecoveryVerified:z.literal(true),encryptedBackupSha256:digest,
 recoveryEvidenceSha256:digest,recoveryVerifiedAt:z.iso.datetime()}).strict();
export type ErasureIntent=z.infer<typeof intentContract>;
export type ErasurePolicy=z.infer<typeof policyContract>;
export type ErasurePermit=z.infer<typeof permitContract>;
export interface SignedRecord {payload:string;signature:string;}
export function authenticate<T>(record:SignedRecord,pem:string,contract:z.ZodType<T>):T{
 assert.deepEqual(Object.keys(record).sort(),['payload','signature']);
 assert.match(record.payload,/^[A-Za-z0-9_-]{1,16000}$/);assert.match(record.signature,/^[A-Za-z0-9_-]{86}$/);
 assert.ok(pem.startsWith('-----BEGIN PUBLIC KEY-----'));
 const key=createPublicKey(pem);assert.equal(key.asymmetricKeyType,'ed25519');
 assert.equal(key.export({format:'pem',type:'spki'}).toString(),pem,'Canonical public key required; private material is never accepted.');
 const bytes=Buffer.from(record.payload,'base64url');assert.equal(bytes.toString('base64url'),record.payload);
 assert.equal(Buffer.from(record.signature,'base64url').toString('base64url'),record.signature);
 assert.ok(verify(null,bytes,key,Buffer.from(record.signature,'base64url')),'Invalid erasure authorization.');
 return contract.parse(JSON.parse(bytes.toString('utf8')));
}
export function authorize(policyRecord:SignedRecord,intentRecord:SignedRecord,permitRecord:SignedRecord,publicKey:string,now=Date.now()){
 const policy=authenticate(policyRecord,publicKey,policyContract),intent=authenticate(intentRecord,publicKey,intentContract),permit=authenticate(permitRecord,publicKey,permitContract);
 const policyDigest=sha256(policyRecord.payload),intentDigest=sha256(intentRecord.payload);
 assert.equal(intent.policyDigest,policyDigest);assert.equal(permit.policyDigest,policyDigest);assert.equal(permit.intentDigest,intentDigest);
 assert.equal(permit.operationId,intent.operationId);assert.deepEqual(intent.sourceScope,policy.scope);
 const issued=Date.parse(permit.issuedAt),expires=Date.parse(permit.expiresAt);
 assert.ok(issued<=now+30000&&issued>=now-900000&&expires>now&&expires>issued&&expires-issued<=900000,'Fresh, bounded execution approval required.');
 assert.ok(Date.parse(policy.approvedAt)<=now&&Date.parse(intent.issuedAt)>=Date.parse(policy.approvedAt)&&Date.parse(intent.issuedAt)<=issued+30000);
 assert.ok(Date.parse(permit.recoveryVerifiedAt)<=now&&Date.parse(permit.recoveryVerifiedAt)>=now-7200000,'Current independently verified recovery evidence required.');
 if(permit.mode==='fulfill'){assert.equal(permit.targetDatabase,policy.scope.database);assert.equal(permit.targetClusterDigest,policy.scope.clusterDigest);}
 return {policy,intent,permit,policyDigest,intentDigest};
}
