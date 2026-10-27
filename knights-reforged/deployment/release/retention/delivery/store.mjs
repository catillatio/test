// Dedicated PRIVATE handoff bucket; never reuse recovery-bucket credentials.
import assert from 'node:assert/strict';
import {S3Client,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {httpsOrigin,uuid} from '../../protocol.mjs';
export function handoffStore(env=process.env){
 const endpoint=httpsOrigin(env.KINGDOM_RETENTION_STORE_ENDPOINT);assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 assert.match(env.KINGDOM_RETENTION_STORE_BUCKET??'',/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/);
 assert.ok(env.KINGDOM_RETENTION_STORE_ACCESS_KEY_ID&&env.KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY&&env.KINGDOM_RETENTION_STORE_REGION);
 assert.ok(!env.KINGDOM_BACKUP_ACCESS_KEY_ID&&!env.KINGDOM_BACKUP_SECRET_ACCESS_KEY);
 const pathStyle=env.KINGDOM_RETENTION_STORE_PATH_STYLE||'false';assert.ok(['true','false'].includes(pathStyle));
 let grantedOrigin;
 const c=new S3Client({endpoint,region:env.KINGDOM_RETENTION_STORE_REGION,forcePathStyle:pathStyle==='true',maxAttempts:1,
  credentials:{accessKeyId:env.KINGDOM_RETENTION_STORE_ACCESS_KEY_ID,secretAccessKey:env.KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
 return {get origin(){assert.ok(grantedOrigin);return grantedOrigin;},async grant(run,id,name,method){
  assert.match(run,/^[1-9][0-9]{0,19}_1$/);assert.match(id,uuid);
  assert.match(name,/^(?:input|signature|permit|context|probe|executor-(?:ready|arm|result)|authorizer-(?:ready|arm|result))\.json$/);
  assert.ok(['GET','PUT'].includes(method));const key='retention-delivery/'+run+'/'+id+'/'+name;
  const Command=method==='PUT'?PutObjectCommand:GetObjectCommand;
  const url=await getSignedUrl(c,new Command({Bucket:env.KINGDOM_RETENTION_STORE_BUCKET,Key:key,...(method==='PUT'?{IfNoneMatch:'*'}:{})}),{expiresIn:900,unhoistableHeaders:new Set(['if-none-match']),signableHeaders:new Set(['if-none-match'])});
  const origin=new URL(url).origin;if(grantedOrigin)assert.equal(origin,grantedOrigin);else grantedOrigin=origin;return url;
 },close(){c.destroy();}};
}
