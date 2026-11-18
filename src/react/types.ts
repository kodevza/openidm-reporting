// SPDX-License-Identifier: CDDL-1.1
export interface HistoryColumn {
  header:string; visible:boolean; key?:string;
  filterType?:'text'|'enum'|'person'|'date'; filterValues?:{id:string;title:string}[];
}
export interface Choice {id:string;title:string;description?:string}
export interface Catalog {columns:HistoryColumn[]; workflows:Choice[]}
export type FilterValue = string | {from?:string;to?:string};
export type Filters = Record<string,FilterValue>;
export interface Cursor {offset:number;sourceIndex:number}
export type Value = string | number | boolean | null;
export interface Page {
  report:string; columns:string[]; rows:Value[][]; rawRows?:Value[][]; links?:(string|null)[][];
  header:string;csv:string;filename:string;nextOffset:number|null;nextSourceIndex:number|null;
}
export interface TableRow {values:Value[];raw:Value[];links:(string|null)[]}
export type Request = (uri:string)=>PromiseLike<unknown>;
export const initialCursor:Cursor = {offset:0,sourceIndex:0};
export function pageUri(cursor:Cursor, workflow:string, filters:Filters, size=50) {
  const params = new URLSearchParams({report:'workflow-history',offset:String(cursor.offset),
    sourceIndex:String(cursor.sourceIndex),pageSize:String(size),filters:JSON.stringify(filters)});
  if(workflow!=='*') params.set('workflow',workflow);
  return 'endpoint/governanceReport?'+params;
}
export function validatePage(value:unknown):Page {
  const page=value as Page;
  if(!page || page.report!=='workflow-history' || !Array.isArray(page.columns) || !Array.isArray(page.rows) ||
    typeof page.header!=='string' || typeof page.csv!=='string' || typeof page.filename!=='string') throw Error('Invalid report page');
  return page;
}
export function nextCursor(page:Page,current:Cursor):Cursor|null {
  if(page.nextOffset===null) return null;
  const source=page.nextSourceIndex,offset=page.nextOffset;
  if(!Number.isInteger(source)||source===null||source<current.sourceIndex||source>current.sourceIndex+1||
    !Number.isInteger(offset)||offset<0||(source===current.sourceIndex&&offset<=current.offset)||
    (source>current.sourceIndex&&offset!==0)) throw Error('Invalid report paging');
  return {offset,sourceIndex:source};
}
