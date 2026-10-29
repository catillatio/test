// Public diagnostics are fixed categories only. Never retain a provider cause.
const codes=new Set(['UNCLASSIFIED','DELIVERY_CLEANUP',
 ...['CONFIGURATION','GITHUB_RUN','GITHUB_JOBS','TOKEN_IDENTITY','PREFLIGHT','BUNDLE','UPLOAD','STARTUP','COMPLETION','CLEANUP','RESET','CANCELLED'].map(s=>'INSTALLATION_'+s),
 ...['CONFIGURATION','API','IDENTITY','STATE','TERMINAL','EXITED','TIMEOUT','CANCELLED'].map(s=>'STARTUP_'+s),
 ...['CONFIGURATION','API','IDENTITY','STATE','ACK_UNCONFIRMED','TIMEOUT','CANCELLED'].map(s=>'CLEANUP_'+s)]);
export class DeliveryFailure extends Error {
 constructor(code){const safe=codes.has(code)?code:'UNCLASSIFIED';super('RETENTION_DELIVERY_FAILURE: '+safe);this.code=safe;}
}
export const failureCategory=error=>error instanceof DeliveryFailure&&codes.has(error.code)?error.code:'UNCLASSIFIED';
export const asDeliveryFailure=(error,fallback)=>error instanceof DeliveryFailure?error:new DeliveryFailure(fallback);
export async function deliveryStep(code,operation){try{return await operation();}catch(error){throw asDeliveryFailure(error,code);}}
export function reportDeliveryFailure(error,log=console.error){
 log('RETENTION_DELIVERY_FAILURE: '+failureCategory(error));
 log('RETENTION_DELIVERY: FAIL — no automatic retry; inspect exact jobs and durable journals.');
}
