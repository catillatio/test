import {realm} from './helpers.js';
export async function competitionFixture(){let now=new Date('2032-02-01T12:00:00Z');const r=await realm({isolated:true,clock:()=>now});
 async function player(name:string,level=5){const p=await r.player(name);await r.prepare(p,25000,30);for(let i=0;i<5;i++)await r.ok(p,'/api/v1/quests/border-patrol/runs');await r.db.query('UPDATE characters SET attained_level=$2 WHERE id=$1',[p.id,level]);return p;}
 return {...r,player,now:()=>now,advance:(seconds:number)=>{now=new Date(+now+seconds*1000);}};
}

import type {RecoveryReference} from '../src/rarity-activation.js';
export const syntheticRecovery=():RecoveryReference=>({artifactId:'123456',encryptedSha256:'a'.repeat(64),sha:'b'.repeat(40),candidateDigest:'c'.repeat(64),expiresAt:new Date(Date.now()+7200000).toISOString()});
