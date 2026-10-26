import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {verifyPublicArtwork} from '../scripts/verify-coordinated-live.js';
import {coordinatedArtwork,coordinatedArtworkDigest,coordinatedArtworkStatus,activeCoordinatedArtwork} from '../src/coordinated-artwork.js';
const commit='a'.repeat(40),origin='https://realm.example';
function fixture(adopted:boolean,wrongCommit=false,tamper=false):typeof fetch{return (async(input,options)=>{
 assert.equal(options?.redirect,'error');assert.equal(options?.cache,'no-store');assert.equal(options?.headers,undefined,'no credentials sent');const url=String(input);
 if(url===origin+'/healthz')return Response.json({status:'ready',commit:wrongCommit?'b'.repeat(40):commit,artwork:{installedId:coordinatedArtwork.id,installedDigest:coordinatedArtworkDigest,targets:52,adoptedId:adopted?coordinatedArtwork.id:null,adoptedDigest:adopted?coordinatedArtworkDigest:null}});
 assert.ok(coordinatedArtwork.entries.some(e=>origin+e.path===url));return new Response(tamper?'tampered':await readFile('public/'+url.slice((origin+'/assets/').length)));
 }) as typeof fetch;}
test('public verification distinguishes complete installation and actual whole-set adoption without any credentials',async()=>{
 assert.equal((await verifyPublicArtwork(origin,commit,'installed',fixture(false))).verifiedAssets,52);
 assert.equal((await verifyPublicArtwork(origin,commit,'adopted',fixture(true))).stage,'adopted');
 assert.deepEqual(coordinatedArtworkStatus(),{installedId:coordinatedArtwork.id,installedDigest:coordinatedArtworkDigest,targets:52,adoptedId:activeCoordinatedArtwork?.id??null,adoptedDigest:activeCoordinatedArtwork?.digest??null});
});
test('public verification rejects wrong stages, stale commits and tampered assets without retries or fallback approval',async()=>{
 await assert.rejects(verifyPublicArtwork(origin,commit,'adopted',fixture(false)),/mismatch/);
 await assert.rejects(verifyPublicArtwork(origin,commit,'installed',fixture(false,true)),/mismatch/);
 await assert.rejects(verifyPublicArtwork(origin,commit,'adopted',fixture(true,false,true)),/mismatch/);
});
test('public verification refuses unsafe origins and invalid expected commit values before network access',async()=>{
 for(const [url,sha]of[['http://realm.example',commit],['https://user:password@realm.example',commit],['https://realm.example/private',commit],[origin,'short']])await assert.rejects(verifyPublicArtwork(url!,sha!,'installed',async()=>{throw new Error('Must not access network');}),/target/);
});
