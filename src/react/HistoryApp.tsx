// SPDX-License-Identifier: CDDL-1.1
import {useEffect,useMemo,useRef,useState} from 'react';
import {useTable,tableFeatures,columnFilteringFeature,columnVisibilityFeature,rowPaginationFeature,functionalUpdate,
  type ColumnFiltersState,type ColumnVisibilityState,type PaginationState,type Updater} from '@tanstack/react-table';
import {Catalog,Choice,Cursor,Filters,FilterValue,HistoryColumn,Page,Request,TableRow,initialCursor,nextCursor,pageUri,validatePage} from './types';
import {PeoplePicker,useDebounced} from './PeoplePicker';
import {exportHistory} from './export';
const features=tableFeatures({columnFilteringFeature,columnVisibilityFeature,rowPaginationFeature});
const storageKey='openidm.workflow-history.columns.v1';
const idFor=(column:HistoryColumn)=>column.key||column.header;
function localTime(value?:string) {
  if(!value)return '';
  const date=new Date(value);
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function Cell({row,index}:{row:TableRow;index:number}) {
  const text=row.values[index]==null?'':String(row.values[index]),href=row.links[index],raw=row.raw[index];
  const title=raw&&raw!==text?String(raw):undefined;
  return <td style={{overflowWrap:'anywhere'}} title={title}>
    {href&&/^https:\/\/entra\.microsoft\.com\/[0-9a-f-]{36}\/#view\//i.test(href)
      ? <a href={href} target="_blank" rel="noopener noreferrer" title={'Open in Microsoft Entra'+(title?' · '+title:'')}>{text}</a>:text}
  </td>;
}
export function HistoryApp({request}:{request:Request}) {
  const [catalog,setCatalog]=useState<Catalog|null>(null),[catalogError,setCatalogError]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{
    let active=true;setCatalogError('');
    Promise.resolve(request('endpoint/governanceReport?capabilities=true&workflows=true')).then(value=>{
      const data=value as Catalog;
      if(!Array.isArray(data.workflows)||!Array.isArray(data.columns)||!data.columns.length)throw Error('Not configured');
      if(active)setCatalog(data);
    }).catch(()=>{if(active)setCatalogError('Unable to load workflows. Check your reporting access and try again.');});
    return()=>{active=false;};
  },[request,reload]);
  if(!catalog)return <div role="status">{catalogError||'Loading workflows…'}{catalogError&&<button className="btn btn-default" onClick={()=>setReload(n=>n+1)}>Retry</button>}</div>;
  return <Report catalog={catalog} request={request}/>;
}
function Report({catalog,request}:{catalog:Catalog;request:Request}) {
  const defaults=useMemo(()=>Object.fromEntries(catalog.columns.map(c=>[idFor(c),c.visible])),[catalog]);
  const [visibility,setVisibility]=useState<ColumnVisibilityState>(()=>{
    try {
      const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(saved&&JSON.stringify(saved.schema)===JSON.stringify(catalog.columns.map(c=>c.header))&&Array.isArray(saved.visible)&&saved.visible.length&&
        saved.visible.every((header:string)=>catalog.columns.some(c=>c.header===header))) {
        return Object.fromEntries(catalog.columns.map(c=>[idFor(c),saved.visible.includes(c.header)]));
      }
    }catch{/* Preferences are optional. */}
    return defaults;
  });
  const [columnFilters,setColumnFilters]=useState<ColumnFiltersState>([]);
  const [pagination,setPagination]=useState<PaginationState>({pageIndex:0,pageSize:50});
  const [position,setPosition]=useState<{cursor:Cursor;back:Cursor[]}>({cursor:initialCursor,back:[]});
  const [selected,setSelected]=useState(''),[showColumns,setShowColumns]=useState(false),[showFilters,setShowFilters]=useState(true);
  const [clearVersion,setClearVersion]=useState(0);
  const [page,setPage]=useState<Page|null>(null),[following,setFollowing]=useState<Cursor|null>(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const [downloading,setDownloading]=useState(false),[exportError,setExportError]=useState('');
  const exportController=useRef<AbortController|null>(null),mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false;exportController.current?.abort();},[]);
  const peopleCache=useMemo(()=>new Map<string,Promise<{items:Choice[];nextOffset:number|null}>>(),[]);
  const filters=useMemo(()=>Object.fromEntries(columnFilters.map(filter=>[filter.id,filter.value])) as Filters,[columnFilters]);
  const serialized=JSON.stringify(filters),debounced=useDebounced(serialized);
  const invalidRange=Object.values(filters).some(value=>typeof value==='object'&&value.from&&value.to&&value.from>value.to);
  function resetPage(){setPosition({cursor:initialCursor,back:[]});setPagination({pageIndex:0,pageSize:50});setFollowing(null);}
  function updateFilters(updater:Updater<ColumnFiltersState>){setColumnFilters(functionalUpdate(updater,columnFilters));resetPage();}
  function updateVisibility(updater:Updater<ColumnVisibilityState>){
    const next=functionalUpdate(updater,visibility);
    if(!catalog.columns.some(c=>next[idFor(c)]!==false))return;
    setVisibility(next);
    try{localStorage.setItem(storageKey,JSON.stringify({schema:catalog.columns.map(c=>c.header),visible:catalog.columns.filter(c=>next[idFor(c)]!==false).map(c=>c.header)}));}catch{/* optional */}
  }
  const data=useMemo<TableRow[]>(()=>page?page.rows.map((values,index)=>({values,raw:page.rawRows?.[index]||values,links:page.links?.[index]||[]})):[],[page]);
  const definitions=useMemo(()=>catalog.columns.map((column,index)=>({id:idFor(column),header:column.header,
    accessorFn:(row:TableRow)=>row.values[index],enableColumnFilter:!!column.filterType})),[catalog]);
  const table=useTable({features,columns:definitions,data,manualFiltering:true,manualPagination:true,
    state:{columnFilters,columnVisibility:visibility,pagination},onColumnFiltersChange:updateFilters,
    onColumnVisibilityChange:updateVisibility,onPaginationChange:(updater:Updater<PaginationState>)=>{
      const next=functionalUpdate(updater,pagination);
      if(next.pageIndex>pagination.pageIndex&&following){setPosition({cursor:following,back:[...position.back,position.cursor]});setPagination(next);}
      else if(next.pageIndex<pagination.pageIndex&&position.back.length){setPosition({cursor:position.back[position.back.length-1],back:position.back.slice(0,-1)});setPagination(next);}
    },pageCount:pagination.pageIndex+(following?2:1)});
  useEffect(()=>{
    let active=true;
    setPage(null);setFollowing(null);setError('');
    if(!selected||invalidRange){setLoading(false);return;}
    setLoading(true);
    if(serialized!==debounced)return;
    Promise.resolve(request(pageUri(position.cursor,selected,JSON.parse(debounced)))).then(value=>{
      const result=validatePage(value);
      if(JSON.stringify(result.columns)!==JSON.stringify(catalog.columns.map(c=>c.header)))throw Error('Report schema changed');
      const next=nextCursor(result,position.cursor);
      if(active){setPage(result);setFollowing(next);setLoading(false);}
    }).catch(()=>{if(active){setError('Unable to load workflow history. Select Refresh to try again.');setLoading(false);}});
    return()=>{active=false;};
  },[request,selected,debounced,serialized,position.cursor,refresh,catalog,invalidRange]);
  function setFilter(column:HistoryColumn,value:FilterValue|undefined){table.getColumn(idFor(column))!.setFilterValue(value);}
  async function download(){
    if(!selected||downloading||invalidRange)return;
    const selection=selected==='*'?{id:'*',title:'All workflows'}:catalog.workflows.find(item=>item.id===selected)!;
    const controller=new AbortController();exportController.current=controller;setDownloading(true);setExportError('');
    try{
      const file=await exportHistory(request,selection,filters,controller.signal);
      if(!mounted.current)return;
      const url=URL.createObjectURL(file.blob),anchor=document.createElement('a');anchor.href=url;anchor.download=file.filename;
      document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){if(mounted.current&&!controller.signal.aborted)setExportError('CSV export failed. Please try again.');}
    finally{if(mounted.current)setDownloading(false);}
  }
  return <div data-table-engine="tanstack-react-table" className="workflow-history-react">
    <div className="row" style={{marginBottom:20}}>
      <div className="col-sm-6"><label htmlFor="history-workflow">Workflow</label>
        <select id="history-workflow" className="form-control" value={selected} onChange={e=>{setSelected(e.target.value);resetPage();}}>
          <option value="">Select a workflow</option><option value="*">All workflows</option>
          {catalog.workflows.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </div>
      <div className="col-sm-6 text-right" style={{paddingTop:25,display:'flex',justifyContent:'flex-end',gap:8,flexWrap:'wrap'}}>
        <button className="btn btn-default" aria-expanded={showFilters} aria-controls="history-filters" onClick={()=>setShowFilters(v=>!v)}>Filters</button>
        <button className="btn btn-default" aria-expanded={showColumns} aria-controls="history-columns" onClick={()=>setShowColumns(v=>!v)}>Configure columns</button>
        <button className="btn btn-primary" disabled={!selected||downloading||!!invalidRange} onClick={download}>{downloading?'Downloading…':'Download CSV'}</button>
      </div>
    </div>
    {showFilters&&<fieldset id="history-filters" className="well"><legend>Column filters</legend>
      <div className="row" style={{display:'flex',flexWrap:'wrap',alignItems:'flex-start'}}>
        {catalog.columns.map((column,index)=>{
          if(!column.filterType)return null;
          const id='history-filter-'+index,value=table.getColumn(idFor(column))!.getFilterValue() as FilterValue|undefined;
          return <div className="col-sm-6 col-lg-3" key={id} style={{marginBottom:15}}>
            <label htmlFor={id}>{column.header==='Subject'?'Subject ID':column.header}</label>
            {column.filterType==='text'&&<input id={id} className="form-control" type="search" placeholder="Starts with…" value={typeof value==='string'?value:''} onChange={e=>setFilter(column,e.target.value.trim()?e.target.value:undefined)}/>}
            {column.filterType==='enum'&&<select id={id} className="form-control" value={typeof value==='string'?value:''} onChange={e=>setFilter(column,e.target.value||undefined)}><option value="">All</option>{column.filterValues?.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select>}
            {column.filterType==='person'&&<PeoplePicker key={id+clearVersion} id={id} label={column.header} value={typeof value==='string'?value:''} onChange={next=>setFilter(column,next||undefined)} request={request} cache={peopleCache}/>}
            {column.filterType==='date'&&(['from','to'] as const).map(part=><div key={part}>
              <label className="small" htmlFor={id+'-'+part}>{part==='from'?'From (local time)':'To (local time)'}</label>
              <input id={id+'-'+part} aria-label={column.header+' '+part} type="datetime-local" className="form-control" value={localTime(typeof value==='object'?value[part]:undefined)} onChange={e=>{
                const range={...(typeof value==='object'?value:{})};
                if(e.target.value){const date=new Date(e.target.value);if(!isFinite(date.getTime()))return;range[part]=date.toISOString();}else delete range[part];
                setFilter(column,Object.keys(range).length?range:undefined);
              }}/>
            </div>)}
          </div>;
        })}
      </div>
      <button className="btn btn-default" onClick={()=>{table.resetColumnFilters(true);setClearVersion(v=>v+1);}}>Clear filters</button>
      <span role="status" className="text-muted" style={{marginLeft:12}}>{invalidRange?'The From date must be earlier than or equal to the To date.':columnFilters.length?columnFilters.length+' active column filters':''}</span>
    </fieldset>}
    {showColumns&&<fieldset id="history-columns" className="well"><legend>Visible columns</legend>
      {table.getAllLeafColumns().map(column=><label className="checkbox-inline" key={column.id} style={{margin:'6px 18px 6px 0'}}>
        <input type="checkbox" checked={column.getIsVisible()} onChange={e=>column.toggleVisibility(e.target.checked)}/>{String(column.columnDef.header)}
      </label>)}
      <button className="btn btn-link" onClick={()=>{setVisibility(defaults);try{localStorage.removeItem(storageKey);}catch{/* optional */}}}>Reset to defaults</button>
    </fieldset>}
    <p role="status" className="text-muted">{!selected?'Select a workflow to view its history.':invalidRange?'Correct the date range to load history.':loading?'Loading workflow history…':error||(!data.length?'No workflow history found.':`${data.length} rows on this page · Page ${pagination.pageIndex+1}`)}</p>
    {exportError&&<p role="alert" className="text-danger">{exportError}</p>}
    <div className="panel panel-default table-responsive"><table className="table table-striped table-hover">
      <caption>Workflow History</caption>
      <thead>{table.getHeaderGroups().map(group=><tr key={group.id}>{group.headers.map(header=><th key={header.id} scope="col">{header.isPlaceholder?null:String(header.column.columnDef.header)}</th>)}</tr>)}</thead>
      <tbody>{table.getRowModel().rows.map(row=><tr key={row.id}>{row.getVisibleCells().map(cell=><Cell key={cell.id} row={row.original} index={catalog.columns.findIndex(c=>idFor(c)===cell.column.id)}/>)}</tr>)}</tbody>
    </table></div>
    <div className="btn-toolbar" role="group" aria-label="Report pagination">
      <button className="btn btn-default" disabled={loading||!table.getCanPreviousPage()||!!invalidRange} onClick={()=>table.previousPage()}>Previous</button>
      <button className="btn btn-default" disabled={loading||!following||!table.getCanNextPage()||!!invalidRange} onClick={()=>table.nextPage()}>Next</button>
      <button className="btn btn-default" disabled={loading||!selected||!!invalidRange} onClick={()=>setRefresh(n=>n+1)}>Refresh</button>
    </div>
  </div>;
}
