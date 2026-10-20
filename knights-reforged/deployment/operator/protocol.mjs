// A separate domain and key. No imports, proofs, stores or messages from release.
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
export const protocol='kingdom-owner-operator-v1';
export const nameTarget='af025047-1c77-437a-8d5a-dd51eba71840',grayTarget='aff9d7b2-5044-4002-907a-60a9a273d375';
export const bodyHash='c4cb23c808234a16c1c32862e0128b875635eeb3d704c764767d9fd1d2e6f5ba';
export const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const sha=/^[a-f0-9]{40}$/,hash=/^[a-f0-9]{64}$/;
export const framePrefix='KINGDOM_OWNER_OPERATOR_V1:';
export function canonical(value){const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;return JSON.stringify(normalize(value));}
export const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
function keys(value,expected){assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),expected.sort());}
export function checkContext(c){
 keys(c,['projectId','environmentId','gameServiceId','pgServiceId','releaseServiceId','verifyPgServiceId','operatorServiceId','sourceHost','sourceDatabase']);
 const ids=['projectId','environmentId','gameServiceId','pgServiceId','releaseServiceId','verifyPgServiceId','operatorServiceId'];for(const k of ids)assert.match(c[k],uuid);
 assert.equal(new Set(ids.slice(2).map(k=>c[k])).size,5);
 assert.match(c.sourceHost,/^[a-z0-9.-]+\.railway\.internal$/);assert.match(c.sourceDatabase,/^[a-zA-Z0-9_-]{1,63}$/);assert.ok(!c.sourceDatabase.endsWith('_restore_test'));
 return c;
}
export function checkReview(r,{now=Date.now(),context,sourceSha,action,allowExpired=false}={}){
 const gray=r?.operation==='gray_broadcast_hide';
 keys(r,['operation','characterId','accountId','field','usernameHash','characterNameHash','authorization',...(gray?['messageId','bodyHash','createdAt','status']:[])]);
 assert.ok(['name_correction','gray_broadcast_hide'].includes(r.operation));if(action)assert.equal(r.operation,action);
 assert.match(r.accountId,uuid);assert.match(r.usernameHash,hash);assert.match(r.characterNameHash,hash);
 assert.equal(r.characterId,gray?grayTarget:nameTarget);
 if(gray){assert.equal(r.field,'message_status');assert.match(r.messageId,uuid);assert.equal(r.bodyHash,bodyHash);assert.ok(Number.isFinite(Date.parse(r.createdAt)));assert.ok(['visible','hidden','deleted'].includes(r.status));}
 else assert.ok([null,'account_username','character_name'].includes(r.field));
 const a=r.authorization;keys(a,['id','sourceSha','projectId','environmentId','operatorServiceId','sourceHost','sourceDatabase','createdAt','expiresAt','operator']);
 assert.match(a.id,uuid);assert.match(a.sourceSha,sha);assert.equal(a.operator,'catillatio');
 assert.ok(Date.parse(a.createdAt)<=now+60000&&(allowExpired||Date.parse(a.expiresAt)>now)&&Date.parse(a.expiresAt)>Date.parse(a.createdAt)&&Date.parse(a.expiresAt)-Date.parse(a.createdAt)<=86400000);
 if(sourceSha)assert.equal(a.sourceSha,sourceSha);
 for(const k of ['projectId','environmentId','operatorServiceId'])assert.match(a[k],uuid);
 assert.match(a.sourceHost,/^[a-z0-9.-]+\.railway\.internal$/);assert.match(a.sourceDatabase,/^[a-zA-Z0-9_-]{1,63}$/);
 if(context)for(const k of ['projectId','environmentId','operatorServiceId','sourceHost','sourceDatabase'])assert.equal(a[k],context[k]);
 return r;
}
export const setupConfirmation=(context,sourceSha)=>'INSTALL_OPERATOR_AUDIT_V1/'+sourceSha+'/'+context.projectId+'/'+context.environmentId;
export function confirmation(review){return review.operation+'/'+review.characterId+'/'+(review.operation==='gray_broadcast_hide'?review.messageId+'/':'')+review.field+'/'+digest(review);}
export function checkRequest(r,{now=Date.now()}={}){
 keys(r,['protocol','kind','mode','action','jobId','authorizationId','sourceSha','bundleDigest','context','owner','createdAt','expiresAt','recipient','field','messageId','review','confirmation']);
 assert.equal(r.protocol,protocol);assert.equal(r.kind,'request');assert.ok(['review','apply','verify','setup'].includes(r.mode));assert.ok(['name_correction','gray_broadcast_hide','audit_setup'].includes(r.action));
 assert.match(r.jobId,/^op_[0-9]{1,20}_[0-9]{1,5}_[a-f0-9]{32}$/);assert.match(r.authorizationId,uuid);assert.match(r.sourceSha,sha);assert.match(r.bundleDigest,hash);checkContext(r.context);assert.equal(r.owner,'catillatio');
 assert.ok(Date.parse(r.createdAt)<=now+60000&&Date.parse(r.expiresAt)>now&&Date.parse(r.expiresAt)>Date.parse(r.createdAt)&&Date.parse(r.expiresAt)-Date.parse(r.createdAt)<=900000);
 assert.match(r.recipient,/^age1[a-z0-9]{58}$/);assert.ok(['auto','account_username','character_name','message_status'].includes(r.field));assert.ok(r.messageId===null||uuid.test(r.messageId));
 if(r.action==='gray_broadcast_hide')assert.equal(r.field,'message_status');else assert.notEqual(r.field,'message_status');
 if(r.mode==='setup'){assert.equal(r.action,'audit_setup');assert.equal(r.field,'auto');assert.equal(r.messageId,null);assert.equal(r.review,null);assert.equal(r.confirmation,setupConfirmation(r.context,r.sourceSha));}
 else if(r.mode==='review'){assert.notEqual(r.action,'audit_setup');assert.equal(r.review,null);assert.equal(r.confirmation,null);}
 else{
  assert.notEqual(r.action,'audit_setup');checkReview(r.review,{now,context:r.context,sourceSha:r.sourceSha,action:r.action,allowExpired:r.mode==='verify'});
  assert.equal(r.review.authorization.id,r.authorizationId);assert.equal(r.review.field,r.field);assert.equal(r.messageId,r.review.messageId??null);
  assert.ok(r.review.field!==null&&(r.action!=='gray_broadcast_hide'||r.review.status==='visible'));
  if(r.mode==='apply')assert.equal(r.confirmation,confirmation(r.review));else assert.equal(r.confirmation,null);
 }
 return r;
}
export function signedRequest(request,pem){
 checkRequest(request);const key=createPrivateKey(pem);assert.equal(key.asymmetricKeyType,'ed25519');
 return JSON.stringify({protocol,kind:'signed-request',payload:request,signature:sign(null,Buffer.from(canonical(request)),key).toString('base64url')});
}
export function verifiedRequest(text,pem,{now=Date.now()}={}){
 assert.ok(typeof text==='string'&&Buffer.byteLength(text)<=16000);const e=JSON.parse(text);keys(e,['protocol','kind','payload','signature']);assert.equal(e.protocol,protocol);assert.equal(e.kind,'signed-request');
 const key=createPublicKey(pem);assert.equal(key.asymmetricKeyType,'ed25519');assert.match(e.signature,/^[A-Za-z0-9_-]{86}$/);
 assert.equal(verify(null,Buffer.from(canonical(e.payload)),key,Buffer.from(e.signature,'base64url')),true);
 return checkRequest(e.payload,{now});
}
export function checkReport(report,request,deploymentId){
 keys(report,['protocol','kind','jobId','sourceSha','bundleDigest','context','deploymentId','mode','action','passed','review','reviewSha256','eligible','encrypted','outcome']);
 assert.equal(report.protocol,protocol);assert.equal(report.kind,'report');assert.equal(report.passed,true);
 for(const k of ['jobId','sourceSha','bundleDigest','mode','action'])assert.equal(report[k],request[k]);assert.equal(canonical(report.context),canonical(request.context));
 assert.match(deploymentId,uuid);assert.equal(report.deploymentId,deploymentId);
 if(request.mode==='setup'){assert.equal(report.review,null);assert.equal(report.reviewSha256,null);assert.equal(report.eligible,true);assert.ok(['installed','already-installed'].includes(report.outcome));}
 else{checkReview(report.review,{context:request.context,sourceSha:request.sourceSha,action:request.action,allowExpired:request.mode==='verify'});
 assert.equal(report.review.authorization.id,request.authorizationId);assert.equal(report.reviewSha256,digest(report.review));assert.equal(typeof report.eligible,'boolean');}
 assert.ok(typeof report.encrypted==='string'&&/^[A-Za-z0-9+/=]+$/.test(report.encrypted)&&report.encrypted.length<14000);
 assert.equal(Buffer.from(report.encrypted,'base64').subarray(0,22).toString(),'age-encryption.org/v1\n');
 if(request.mode==='setup')return report;
 if(request.mode==='review'){assert.equal(report.outcome,null);if(request.field!=='auto')assert.equal(report.review.field,request.field);if(request.messageId)assert.equal(report.review.messageId,request.messageId);}
 else{assert.equal(canonical(report.review),canonical(request.review));assert.ok((request.mode==='verify'?['verified']:['applied','already-applied']).includes(report.outcome));assert.equal(report.eligible,true);}
 return report;
}
