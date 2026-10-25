// Read-only public verification. No cookies, credentials, private records or
// administrative endpoint; intentionally distinguishes install from adoption.
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {coordinatedArtwork,coordinatedArtworkDigest,requireCoordinatedAdoption,approvedCoordinatedSelection} from '../src/coordinated-artwork.js';
export async function verifyPublicArtwork(origin:string,commit:string,stage:'installed'|'adopted',fetcher:typeof fetch=fetch){
 requireCoordinatedAdoption(approvedCoordinatedSelection);
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password||! /^[a-f0-9]{40}$/.test(commit)||!['installed','adopted'].includes(stage))throw new Error('Invalid public artwork verification target.');
 const options={redirect:'error' as const,cache:'no-store' as const,signal:AbortSignal.timeout(15000)};
 const response=await fetcher(origin+'/healthz',options);if(!response.ok)throw new Error('Public release identity unavailable.');
 const health=await response.json();
 if(health.status!=='ready'||health.commit!==commit||health.artwork?.installedId!==coordinatedArtwork.id||health.artwork?.installedDigest!==coordinatedArtworkDigest||health.artwork?.targets!==52||health.artwork?.adoptedId!==(stage==='adopted'?coordinatedArtwork.id:null)||health.artwork?.adoptedDigest!==(stage==='adopted'?coordinatedArtworkDigest:null))throw new Error('Public artwork stage or exact commit mismatch.');
 for(let i=0;i<coordinatedArtwork.entries.length;i+=4)await Promise.all(coordinatedArtwork.entries.slice(i,i+4).map(async entry=>{
  const res=await fetcher(origin+entry.path,{...options,signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error('Public artwork payload unavailable.');
  const bytes=Buffer.from(await res.arrayBuffer());if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('Public artwork payload mismatch.');
 }));
 return {passed:true,commit,stage,registryId:coordinatedArtwork.id,digest:coordinatedArtworkDigest,verifiedAssets:52,authenticatedArmoryAndLandViewsVerified:false};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 try{const [origin,commit,stage,...extra]=process.argv.slice(2);if(extra.length)throw 0;console.log(JSON.stringify(await verifyPublicArtwork(origin!,commit!,stage as 'installed'|'adopted')));}
 catch{console.error('ARTWORK_PUBLIC_VERIFICATION: FAIL');process.exitCode=1;}
}
