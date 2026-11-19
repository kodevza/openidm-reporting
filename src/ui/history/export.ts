// SPDX-License-Identifier: CDDL-1.1
import {messages} from '../locales/en';
import type {Choice,Request} from '../shared/reportingEndpoint';
import {Filters,initialCursor,nextCursor} from './types';
import {ReportingClient} from './ReportingClient';

function cell(value:string) {
  let text=value;
  if(/^[\s\u0000-\u001f]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export async function exportHistory(request:Request | ReportingClient, selection:Choice, filters:Filters, signal:AbortSignal) {
  const client = typeof request === 'function' ? new ReportingClient(request) : request;
  // Capture both selection and filters before the first asynchronous request.
  selection={...selection};
  const snapshot=JSON.parse(JSON.stringify(filters)) as Filters;
  const parts=['\ufeff'+cell(messages.csv.selectedWorkflow)+';'+cell(selection.title)+'\r\n'+cell(messages.csv.workflowKey)+';'+cell(selection.id)+'\r\n'];
  let cursor=initialCursor, header='',filename='workflow-history.csv';
  for(;;) {
    if(signal.aborted) throw new DOMException('Export canceled','AbortError');
    const page=await client.getPage(cursor, selection.id, snapshot, {size:500});
    if(signal.aborted) throw new DOMException('Export canceled','AbortError');
    if(header && header!==page.header)throw Error('Report schema changed during export');
    if(!header){header=page.header;filename=page.filename;parts.push(header+'\r\n');}
    if(page.csv)parts.push(page.csv+'\r\n');
    const next=nextCursor(page,cursor);
    if(!next)break;
    cursor=next;
  }
  return {blob:new Blob(parts,{type:'text/csv;charset=utf-8'}),filename};
}
