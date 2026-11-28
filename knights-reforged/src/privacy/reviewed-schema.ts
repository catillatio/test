import assert from 'node:assert/strict';
import type {Sql} from '../db.js';
import {privacyColumns} from './schema.js';

export const dashboardObjects=['owner_dashboard_cases','owner_dashboard_operations','owner_console_activity'];
const dashboardColumns={
 owner_dashboard_cases:'report_id:uuid:NO|state:text:NO|version:int4:NO|changed_at:timestamptz:NO',
 owner_dashboard_operations:'id:uuid:NO|report_id:uuid:NO|target_id:uuid:NO|operator_label:varchar:NO|action:text:NO|reason:varchar:NO|intent_hash:bpchar:NO|before_state:jsonb:NO|after_state:jsonb:NO|result:jsonb:NO|created_at:timestamptz:NO'
};
const dashboardView='SELECT account_id, kind, created_at, true AS successful FROM command_receipts WHERE (result IS NOT NULL);';
const schemaError='Unreviewed privacy schema; no erasure authorized.';

export async function assertReviewedColumns(sql:Sql){
 const rows=(await sql.query<{name:string;kind:string;columns:string;definition:string|null;owner_ok:boolean}>(`SELECT c.relname AS name,c.relkind AS kind,
  coalesce(string_agg(a.attname||':'||t.typname||':'||CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,'|' ORDER BY a.attnum),'') AS columns,
  CASE WHEN c.relkind='v' THEN btrim(regexp_replace(pg_get_viewdef(c.oid,false),'[[:space:]]+',' ','g')) END AS definition,
  pg_get_userbyid(c.relowner)='postgres' OR c.relowner=(SELECT r.relowner FROM pg_class r
    WHERE r.relnamespace=c.relnamespace AND r.relname='command_receipts') AS owner_ok
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 LEFT JOIN pg_type t ON t.oid=a.atttypid
 WHERE n.nspname=current_schema() AND c.relkind IN ('r','p','m','f','v')
 GROUP BY c.oid,c.relname,c.relkind,c.relowner,c.relnamespace`)).rows;
 const application=rows.filter(row=>!dashboardObjects.includes(row.name));
 assert.ok(application.every(row=>row.kind!=='v'),schemaError);
 assert.deepEqual(Object.fromEntries(application.map(row=>[row.name,row.columns])),privacyColumns,schemaError);

 const dashboard=rows.filter(row=>dashboardObjects.includes(row.name));
 if(!dashboard.length)return false;
 assert.equal(dashboard.length,dashboardObjects.length,schemaError);
 for(const [name,columns] of Object.entries(dashboardColumns)){
  const table=dashboard.find(row=>row.name===name);
  assert.ok(table?.kind==='r'&&table.columns===columns,schemaError);
 }
 const view=dashboard.find(row=>row.name==='owner_console_activity');
 // A --no-owner restore assigns both the view and its base table to the restorer.
 assert.ok(view?.kind==='v'&&view.owner_ok&&view.definition===dashboardView,schemaError);
 return true;
}
