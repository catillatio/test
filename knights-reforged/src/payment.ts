import {maintenanceBill} from './alpha-rules.js';
import type {MaintenanceRow} from './maintenance.js';
import type {LandState} from './land.js';
// Forecast the actual future purse movement if holdings/rates remain unchanged.
// Existing continuously charged upkeep, prepaid reserve and hourly cursors are retained.
export function upcomingPayment(land:LandState,maintenance:MaintenanceRow,gold:number,now:Date){
 const nextAt=land.nextPaymentAt,netProperty=BigInt(land.nextPropertyPaymentGold??'0'),gross=Number(land.nextPropertyGrossGold??netProperty),propertyUpkeep=Number(land.nextPropertyUpkeepGold??'0');
 if(!nextAt||!land.holdings.length)return {nextAt:null,gold:0,gross:0,propertyUpkeep:0,equipmentUpkeep:0,prepaidUpkeep:0,walletUpkeep:0,economicNet:0,retainedGold:'0',partial:false};
 const credit=netProperty<BigInt(2147483647-gold)?netProperty:BigInt(2147483647-gold);
 const bill=maintenanceBill(maintenance.paused?0:maintenance.hourly_rate,new Date(maintenance.settled_at),new Date(nextAt),BigInt(maintenance.remainder),BigInt(maintenance.reserve_gold),gold+Number(credit));
 return {nextAt,gold:Number(credit)-bill.fromWallet,gross,propertyUpkeep,equipmentUpkeep:Number(bill.paid),prepaidUpkeep:Number(bill.fromCredit),walletUpkeep:bill.fromWallet,economicNet:Number(netProperty-bill.paid),retainedGold:(netProperty-credit).toString(),partial:!!land.partialNextPayment};
}
