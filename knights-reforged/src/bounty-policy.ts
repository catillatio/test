// Owner-confirmed placement policy. Historical financial rulesets stay frozen;
// existing placement rows remain the source of truth, regardless of settlement.
export const bountyPlacementPolicy=Object.freeze({id:'historical-bounty-1',windowSeconds:86400,sponsorTargetLimit:25,targetLimit:250});

export function placementQuota(placements:Date[],limit:number,now:Date){
 const times=placements.map(value=>+new Date(value)).filter(at=>at>+now-bountyPlacementPolicy.windowSeconds*1000&&at<=+now).sort((a,b)=>a-b);
 const expiry=(at:number|undefined)=>at===undefined?null:new Date(at+bountyPlacementPolicy.windowSeconds*1000).toISOString();
 return {limit,used:times.length,remaining:Math.max(0,limit-times.length),nextReleaseAt:expiry(times[0]),
  nextAvailableAt:times.length>=limit?expiry(times[times.length-limit]):null};
}
