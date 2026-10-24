import {maintenanceBill} from './alpha-rules.js';
import {automaticFunding,type MaintenanceRow} from './maintenance.js';
import type {LandState} from './land.js';
// Forecast the actual future purse movement if holdings/rates remain unchanged.
// Existing continuously charged upkeep, prepaid reserve and hourly cursors are retained.
export function upcomingPayment(land:LandState,maintenance:MaintenanceRow,gold:number,now:Date,automatic=true){
 const nextAt=land.nextPaymentAt,netProperty=BigInt(land.nextPropertyPaymentGold??'0'),gross=Number(land.nextPropertyGrossGold??netProperty),propertyUpkeep=Number(land.nextPropertyUpkeepGold??'0');
 if(!nextAt||!land.holdings.length)return {nextAt:null,gold:0,gross:0,propertyUpkeep:0,equipmentUpkeep:0,prepaidUpkeep:0,walletUpkeep:0,economicNet:0,retainedGold:'0',automaticReserve:0,arrearsPayment:0,partial:false};
 const credit=netProperty<BigInt(2147483647-gold)?netProperty:BigInt(2147483647-gold);
 const bill=maintenanceBill(maintenance.paused?0:maintenance.hourly_rate,new Date(maintenance.settled_at),new Date(nextAt),BigInt(maintenance.remainder),BigInt(maintenance.reserve_gold),gold+Number(credit));
 const funding=automatic?automaticFunding(maintenance.hourly_rate,bill.credit,maintenance.paused?BigInt(maintenance.arrears_gold):bill.arrears,gold+Number(credit)-bill.fromWallet):null;
 const funded=funding?.affordable?funding:null;
 return {nextAt,gold:Number(credit)-bill.fromWallet-Number(funded?.cost??0),gross,propertyUpkeep,
  equipmentUpkeep:Number(bill.paid)+Number(funded?.arrearsPaid??0),prepaidUpkeep:Number(bill.fromCredit)+Number(funded?.fromReserve??0),
  walletUpkeep:bill.fromWallet+Number(funded?funded.arrearsPaid-funded.fromReserve:0),automaticReserve:Number(funded?.topup??0),arrearsPayment:Number(funded?.arrearsPaid??0),
  economicNet:Number(netProperty-bill.paid-(funded?.arrearsPaid??0n)),retainedGold:(netProperty-credit).toString(),partial:!!land.partialNextPayment};
}
