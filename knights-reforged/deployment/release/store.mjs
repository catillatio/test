// Controller only. The private job receives scoped, short-lived object grants,
// never bucket credentials. Use the official S3 SDK with ordinary TLS checking.
import assert from 'node:assert/strict';
import {S3Client,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {httpsOrigin} from './protocol.mjs';
export function recoveryStore(env=process.env){
 const endpoint=httpsOrigin(env.KINGDOM_BACKUP_ENDPOINT);
 assert.match(env.KINGDOM_BACKUP_BUCKET??'',/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/);
 assert.ok(env.KINGDOM_BACKUP_ACCESS_KEY_ID&&env.KINGDOM_BACKUP_SECRET_ACCESS_KEY,'Configure private recovery-bucket credentials.');
 assert.ok(env.KINGDOM_BACKUP_REGION&&env.KINGDOM_BACKUP_REGION.length<100);
 const pathStyle=env.KINGDOM_BACKUP_PATH_STYLE||'false';assert.ok(['true','false'].includes(pathStyle));
 assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 const client=new S3Client({endpoint,region:env.KINGDOM_BACKUP_REGION,forcePathStyle:pathStyle==='true',
  credentials:{accessKeyId:env.KINGDOM_BACKUP_ACCESS_KEY_ID,secretAccessKey:env.KINGDOM_BACKUP_SECRET_ACCESS_KEY},
  requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:2});
 return {
  async grant(key,method){
   assert.match(key,/^kingdom-releases\/[a-f0-9]{40}\/gh_[0-9]+_[0-9]+_[a-f0-9]{32}\/(?:realm\.dump\.age|prepare\.json|verify\.json)$/);
   assert.ok(['PUT','GET'].includes(method));
   const command=method==='PUT'?new PutObjectCommand({Bucket:env.KINGDOM_BACKUP_BUCKET,Key:key,IfNoneMatch:'*'}):new GetObjectCommand({Bucket:env.KINGDOM_BACKUP_BUCKET,Key:key});
   return getSignedUrl(client,command,{expiresIn:3600,unhoistableHeaders:new Set(['if-none-match']),signableHeaders:new Set(['if-none-match'])});
  },
  close(){client.destroy();}
 };
}
