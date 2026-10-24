import {alpha,type ItemDefinition} from './alpha-rules.js';
import {safeCount,deepFreeze,compatibility} from './compatibility-rules.js';

export interface EquipmentCatalogPolicy {id:string;items:readonly ItemDefinition[];historicalItems?:readonly ItemDefinition[];purchaseLevels?:Readonly<Record<string,number>>;equivalents?:readonly (readonly string[])[];}
// Only server-authored definitions construct a catalog. Neither command payloads
// nor environment variables can register a catalog, retiering or substitution.
export function equipmentCatalog(policy:EquipmentCatalogPolicy){
 if(!/^[a-z0-9.-]+$/.test(policy.id))throw new Error('Invalid catalog policy.');
 const definitions=new Map<string,Readonly<ItemDefinition>>(),unlocks=new Map<string,number>(),groups=new Map<string,readonly string[]>();
 for(const item of [...policy.items,...(policy.historicalItems??[])]){if(!/^[a-z0-9-]+$/.test(item.id)||definitions.has(item.id)||!['weapon','armor','spell'].includes(item.category))throw new Error('Invalid catalog item.');
  for(const n of [item.attack,item.defense,item.upkeep])safeCount(n,0,2147483647);safeCount(item.level,1,2147483647);safeCount(item.price,1,2147483647);
  definitions.set(item.id,deepFreeze(structuredClone(item)));}
 for(const item of policy.items)unlocks.set(item.id,item.level);
 for(const [id,level]of Object.entries(policy.purchaseLevels??{})){if(!unlocks.has(id))throw new Error('Unknown purchase override.');unlocks.set(id,safeCount(level,1,2147483647));}
 for(const group of policy.equivalents??[]){if(group.length<2||new Set(group).size!==group.length)throw new Error('Invalid equivalent group.');
  const category=definitions.get(group[0]!)?.category;
  for(const id of group)if(!definitions.has(id)||groups.has(id)||definitions.get(id)!.category!==category)throw new Error('Unknown, overlapping or incompatible equivalent.');
  const ids=Object.freeze([...group].sort());for(const id of ids)groups.set(id,ids);}
 const definition=(id:string)=>definitions.get(id);
 const purchaseLevel=(id:string)=>{const level=unlocks.get(id);if(level===undefined)throw new Error('Unknown purchase item.');return level;};
 function requirements(required:Readonly<Record<string,number>>,owned:readonly {id:string;quantity:number}[],level:number){
  safeCount(level,1);const quantities=new Map<string,number>();for(const i of owned)quantities.set(i.id,safeCount((quantities.get(i.id)??0)+safeCount(i.quantity)));
  const demands=new Map<string,{ids:readonly string[];quantity:number}>();
  for(const [id,n]of Object.entries(required)){if(!definitions.has(id))throw new Error('Unknown requirement.');safeCount(n,1,alpha.limits.transaction);const ids=groups.get(id)??[id],key=ids.join('|'),old=demands.get(key);demands.set(key,{ids,quantity:safeCount((old?.quantity??0)+n)});}
  const missing:Record<string,number>={};let missingCost=0;
  for(const {ids,quantity}of demands.values()){
   const needed=Math.max(0,quantity-ids.reduce((sum,id)=>safeCount(sum+(quantities.get(id)??0)),0));if(!needed)continue;
   const candidates=ids.filter(id=>unlocks.has(id)&&purchaseLevel(id)<=level).sort((a,b)=>definitions.get(a)!.price-definitions.get(b)!.price||a.localeCompare(b));
   // Keep the authoritative original requirement if none is purchasable yet;
   // normal level validation rejects it. Never invent a reachable substitute.
   const id=candidates[0]??ids[0]!;missing[id]=needed;missingCost=safeCount(missingCost+needed*definitions.get(id)!.price,0,2147483647);
  }
  return {missing,missingCost};
 }
 return Object.freeze({id:policy.id,definition,purchaseLevel,purchasableDefinition:(id:string)=>unlocks.has(id)?definition(id):undefined,canPurchase:(id:string,level:number)=>safeCount(level,1)>=(unlocks.get(id)??Infinity),requirements});
}
// No E1 candidates, legendary retierings or equivalences are active in E2a.
if(compatibility.active.catalog!==alpha.id)throw new Error('An approved catalog registration cutover is required.');
export const activeEquipmentCatalog=equipmentCatalog({id:alpha.id,items:alpha.items});
