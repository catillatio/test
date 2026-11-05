import {type Sql,transactionMemo} from '../db.js';
import {GameError} from '../errors.js';
const key=Symbol('privacy-schema');
export function privacySchema(sql:Sql):Promise<boolean>{return transactionMemo(sql,key,async()=>{
 const row=(await sql.query(`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name='028_account_erasure.sql') AS installed,
 to_regclass('account_erasures') IS NOT NULL AS receipts,to_regclass('account_erasure_checkpoints') IS NOT NULL AS checkpoints,to_regclass('abandoned_kingdoms') IS NOT NULL AS world,to_regclass('graveyard_batches') IS NOT NULL AS batches`)).rows[0]!;
 if(row.receipts!==row.installed||row.checkpoints!==row.installed||row.world!==row.installed||row.batches!==row.installed)throw Error('Incomplete privacy erasure schema.');
 return row.installed;
});}
export async function assertAccountNotErased(sql:Sql,accountId:string){
 if(await privacySchema(sql)&&(await sql.query('SELECT 1 FROM account_erasures WHERE account_id=$1',[accountId])).rowCount)
  throw new GameError('ACCOUNT_ERASED','This account has been deleted. Its old sessions and commands cannot be reused.',401);
}
