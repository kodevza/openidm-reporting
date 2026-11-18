// SPDX-License-Identifier: CDDL-1.1
import {useEffect,useState} from 'react';
import {Choice,Request} from './types';
export function useDebounced<T>(value:T,delay=350) {
  const [debounced,setDebounced]=useState(value);
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(value),delay);return()=>clearTimeout(timer);},[value,delay]);
  return debounced;
}
export function PeoplePicker({label,id,value,onChange,request,cache}:{label:string;id:string;value:string;
  onChange:(value:string)=>void;request:Request;cache:Map<string,Promise<{items:Choice[];nextOffset:number|null}>>}) {
  const [search,setSearch]=useState(''),debounced=useDebounced(search);
  const [items,setItems]=useState<Choice[]>([]),[offset,setOffset]=useState(0),[next,setNext]=useState<number|null>(null);
  const [message,setMessage]=useState(''),[loading,setLoading]=useState(false),[selected,setSelected]=useState<Choice>();
  useEffect(()=>{
    let active=true;
    const key=JSON.stringify([debounced,offset]);
    setLoading(true);setMessage('Loading people…');
    let promise=cache.get(key);
    if(!promise){
      promise=Promise.resolve(request('endpoint/governanceReport?dictionary=people&'+new URLSearchParams({search:debounced,peopleOffset:String(offset)})))
        .then(value=>{const data=value as {items:Choice[];nextOffset:number|null};if(!Array.isArray(data.items))throw Error('Invalid people dictionary');return data;});
      cache.set(key,promise);
    }
    promise.then(data=>{if(!active)return;setItems(old=>offset===0?data.items:[...old,...data.items]);setNext(data.nextOffset);
      setLoading(false);setMessage(data.items.length?'':'No matching people.');},()=>{cache.delete(key);if(active){setLoading(false);setMessage('Unable to load people. Search again to retry.');}});
    return()=>{active=false;};
  },[debounced,offset,cache,request]);
  const options=selected&&value===selected.id&&!items.some(item=>item.id===value)?[selected,...items]:items;
  return <div className="history-person-picker">
    <input className="form-control" type="search" aria-label={'Search '+label} placeholder="Search people…" value={search}
      onChange={e=>{setSearch(e.target.value);setOffset(0);}}/>
    <select id={id} className="form-control" value={value} onChange={e=>{setSelected(options.find(item=>item.id===e.target.value));onChange(e.target.value);}}>
      <option value="">All</option>{options.map(item=><option key={item.id} value={item.id}>{item.title}{item.description?' — '+item.description:''}</option>)}
    </select>
    {next!==null&&<button type="button" className="btn btn-link" disabled={loading} onClick={()=>setOffset(next)}>More people</button>}
    <small role="status" className="text-muted">{message}</small>
  </div>;
}
