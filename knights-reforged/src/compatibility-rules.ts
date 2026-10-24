import {readFileSync} from 'node:fs';

export function deepFreeze<T>(value:T):T {if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;}
export const compatibility=deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/expansion-compatibility-1/rules.json',import.meta.url),'utf8')) as {
 id:string;provenance:string;active:{army:ArmyPolicy;inventory:InventoryPolicy;progression:ProgressionPolicy;catalog:string};
 army:Record<ArmyPolicy,{perLevel:number;leader:number;ceiling:number|null;selectionLimit:number;rosterLimit:number}>;
 inventory:Record<InventoryPolicy,number>;progression:Record<ProgressionPolicy,{afterLevel:number;increment:number}>;
});
export type ArmyPolicy='army-legacy-1'|'army-five-per-level-1';
export type InventoryPolicy='inventory-legacy-1'|'inventory-large-1';
export type ProgressionPolicy='xp-legacy-1'|'xp-post50-150-1';
export function safeCount(n:number,min=0,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(n)||n<min||n>max)throw new RangeError('Invalid compatibility count.');return n;}
export function armyPolicy(id:ArmyPolicy=compatibility.active.army){if(!Object.hasOwn(compatibility.army,id))throw new RangeError('Unknown army policy.');return compatibility.army[id];}
export function inventoryLimit(id:InventoryPolicy=compatibility.active.inventory){if(!Object.hasOwn(compatibility.inventory,id))throw new RangeError('Unknown inventory policy.');return compatibility.inventory[id];}
export function resolveArmyCapacity(level:number,legacyFloor=1,id:ArmyPolicy=compatibility.active.army){
 const rule=armyPolicy(id);safeCount(level,1,Math.floor((Number.MAX_SAFE_INTEGER-rule.leader)/rule.perLevel));safeCount(legacyFloor,1,101);
 const maximum=Math.max(rule.leader+rule.perLevel*level,legacyFloor);return rule.ceiling===null?maximum:Math.min(rule.ceiling,maximum);
}
export function resolveArmy(level:number,militia:number,allies:number,legacyFloor=1,id:ArmyPolicy=compatibility.active.army){
 safeCount(militia);safeCount(allies);const total=safeCount(1+militia+allies),capacity=resolveArmyCapacity(level,legacyFloor,id);
 return {capacity,participants:Math.min(capacity,total),total};
}
