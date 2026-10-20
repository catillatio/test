// Bot-only policy calculation: scale the existing difficulty award first, then
// apply the fixed-window pair percentage. Neither step can remove the 1-XP win.
export function scaleBotExperience(fullAward:number,fullPercent:number,pairPercent:number){
 if(!Number.isSafeInteger(fullAward)||fullAward<1||![100,65,40].includes(fullPercent)||![100,85,70,55,40].includes(pairPercent))throw new RangeError('Invalid bot experience calculation.');
 const scaledFullAmount=Math.max(1,Math.floor(fullAward*fullPercent/100));
 return {scaledFullAmount,amount:Math.max(1,Math.floor(scaledFullAmount*pairPercent/100))};
}
