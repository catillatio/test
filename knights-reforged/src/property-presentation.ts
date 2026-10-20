// Current display labels only. Immutable catalog definitions, stable property
// IDs, acquisition costs and historical receipt snapshots are never rewritten.
export function propertyName(id:string,recordedName:string):string {
  return id==='moonwell-sanctuary'?'Gold Mine':recordedName;
}
