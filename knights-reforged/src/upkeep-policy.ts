import {readFileSync} from 'node:fs';
export const automaticUpkeep=JSON.parse(readFileSync(new URL('../rulesets/automatic-upkeep-1/rules.json',import.meta.url),'utf8')) as {
 id:string;reserveHours:number;paymentOrder:string[];vaultFunding:boolean;futureIncomeAdvance:boolean;newIncomeClock:boolean;
};
if(automaticUpkeep.id!=='automatic-upkeep-1'||automaticUpkeep.reserveHours!==1||automaticUpkeep.vaultFunding||automaticUpkeep.futureIncomeAdvance||automaticUpkeep.newIncomeClock||
 automaticUpkeep.paymentOrder.join(',')!=='earned_land_income,existing_accrued_maintenance,arrears,one_hour_reserve,remaining_wallet')throw new Error('Invalid automatic upkeep policy.');
