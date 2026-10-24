import type {Sql} from './db.js';
export async function expansionTarget(sql:Sql){
 const row=(await sql.query(`SELECT current_database() AS database,d.oid::text AS "databaseOid",s.system_identifier::text AS cluster FROM pg_database d CROSS JOIN pg_control_system() s WHERE d.datname=current_database()`)).rows[0];
 if(!row||!/^\d+$/.test(row.cluster)||!/^\d+$/.test(row.databaseOid))throw new Error('Database identity unavailable.');return {database:String(row.database),databaseOid:String(row.databaseOid),cluster:String(row.cluster)};
}
