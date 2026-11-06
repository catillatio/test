import assert from 'node:assert/strict';
import type {Sql} from '../db.js';
import {privacyColumns} from './schema.js';
export async function assertReviewedColumns(sql:Sql){
 const rows=(await sql.query(`SELECT c.relname AS table_name,a.attname AS column_name,t.typname AS udt_name,
 CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped JOIN pg_type t ON t.oid=a.atttypid
 WHERE n.nspname=current_schema() AND c.relkind IN ('r','p','m','f') ORDER BY c.relname,a.attnum`)).rows;
 const actual:Record<string,string[]>={};for(const r of rows)(actual[r.table_name]??=[]).push([r.column_name,r.udt_name,r.is_nullable].join(':'));
 assert.deepEqual(Object.fromEntries(Object.entries(actual).map(([k,v])=>[k,v.join('|')])),privacyColumns,'Unreviewed privacy schema; no erasure authorized.');
}
