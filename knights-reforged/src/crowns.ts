import {type Database,transaction} from './db.js';
import {GameError} from './errors.js';
// No env toggle, client receipt, admin/debug grant or active payment adapter.
export const crownsPurchasingEnabled=false;
export const crownOffers=Object.freeze([
 {id:'mana-refill',name:'Mana restoration',icon:'mana',description:'A future way to return to your quests. Your natural recovery remains free.'},
 {id:'stamina-refill',name:'Stamina restoration',icon:'spirit',description:'Prepare your company for another encounter. No attack allowance is changed.'},
 {id:'skill-reset',name:'Skill reset',icon:'help',description:'Reconsider your training. Earned levels and skill points would remain yours.'}
]);
export async function crownsView(db:Database,id:string){return transaction(db,async sql=>{
 const actor=(await sql.query('SELECT c.id FROM characters c JOIN accounts a ON a.id=c.account_id WHERE c.id=$1 AND NOT a.login_disabled AND NOT EXISTS(SELECT 1 FROM development_bots b WHERE b.character_id=c.id) FOR UPDATE OF c',[id])).rows[0];
 if(!actor)throw new GameError('CROWNS_UNAVAILABLE','Crowns are unavailable for this character.',403);
 await sql.query('INSERT INTO crown_wallets(character_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
 const row=(await sql.query('SELECT balance::text AS balance FROM crown_wallets WHERE character_id=$1',[id])).rows[0]!;
 return {balance:row.balance as string,offers:crownOffers,purchasingEnabled:crownsPurchasingEnabled};
});}
export function rejectCrownOperation():never{throw new GameError('CROWNS_DISABLED','Crowns purchases, grants and use are not available.',503);}
/** Pure future adapter accounting model; never mints or accepts a receipt. */
export function crownLedgerModel(balance:bigint,delta:bigint,kind:'purchase'|'consume'|'refund'|'reversal',original?:{amount:bigint;remaining:bigint}){
 if(balance<0n||delta===0n||(['purchase'].includes(kind)&&delta<0n)||(kind==='consume'&&delta>0n))throw new RangeError('Invalid Crown entry');
 if(kind==='refund'||kind==='reversal'){if(!original||original.amount<=0n||delta>=0n||-delta>original.remaining)throw new RangeError('Invalid Crown reversal');}
 if(balance+delta<0n||balance+delta>9223372036854775807n)throw new RangeError('Crown balance out of range');return balance+delta;
}
