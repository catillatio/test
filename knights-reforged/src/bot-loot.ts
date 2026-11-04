// Deterministic integer evaluation of the approved ordinary bot-loot curve.
// No floating logarithms or wallet-sized Number multiplication is used here.
const threshold=20000n,scale=10000n;
interface Bounds {lower:bigint;upper:bigint;}
const binaryLogs=new Map<number,Bounds>();
const ceilDivide=(numerator:bigint,denominator:bigint)=>(numerator+denominator-1n)/denominator;

// For 1 <= numerator/denominator <= 2, z=(x-1)/(x+1) is in [0,1/3].
// ln(x)=2*sum(z^(2j+1)/(2j+1)). Every term is rounded DOWN, then an
// explicit rounding allowance and geometric upper bound cover the entire tail.
function reducedLog(numerator:bigint,denominator:bigint,bits:number):Bounds{
 const a=numerator-denominator,b=numerator+denominator;
 if(a===0n)return {lower:0n,upper:0n};
 const fixed=1n<<BigInt(bits),terms=Math.ceil(bits/3)+16;
 const aSquared=a*a,bSquared=b*b;let powerA=a,powerB=b,lower=0n;
 for(let j=0;j<terms;j++){
  lower+=2n*fixed*powerA/(powerB*BigInt(2*j+1));
  powerA*=aSquared;powerB*=bSquared;
 }
 // After N terms, remaining denominators are at least 2N+1. Replacing
 // them by that first denominator bounds the remaining geometric series.
 const tail=ceilDivide(2n*fixed*powerA*bSquared,powerB*BigInt(2*terms+1)*(bSquared-aSquared));
 return {lower,upper:lower+BigInt(terms)+tail};
}

export function progressiveBotLoot(raw:number):number{
 if(!Number.isSafeInteger(raw)||raw<0)throw new RangeError('Invalid uncapped bot gold reward.');
 if(raw<=Number(threshold))return raw;
 // x=1+(R-20000)/10000=(R-10000)/10000. Reduce by powers of two
 // so the convergent series always has z <= 1/3, even at MAX_SAFE_INTEGER.
 const numerator=BigInt(raw)-scale;let denominator=scale,powers=0n;
 while(numerator>=2n*denominator){denominator*=2n;powers++;}
 for(const bits of [128,256,512]){
  let logTwo=binaryLogs.get(bits);
  if(!logTwo){logTwo=reducedLog(2n,1n,bits);binaryLogs.set(bits,logTwo);}
  const remainder=reducedLog(numerator,denominator,bits),fixed=1n<<BigInt(bits);
  const lower=threshold+scale*(powers*logTwo.lower+remainder.lower)/fixed;
  const upper=threshold+scale*(powers*logTwo.upper+remainder.upper)/fixed;
  if(lower===upper){
   // The logarithmic curve never exceeds R. This is an invariant check,
   // not a compensating cap: refuse an invalid calculation rather than pay it.
   if(lower>BigInt(raw))throw new RangeError('Invalid progressive bot gold result.');
   return Number(lower);
  }
 }
 // Bounded fail-closed fallback; never guess at a numerical floor boundary.
 throw new RangeError('Progressive bot gold floor could not be established.');
}
