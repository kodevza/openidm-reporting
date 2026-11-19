// SPDX-License-Identifier: CDDL-1.1
import {messages} from '../locales/en';
import {useEffect,useRef,useState} from 'preact/hooks';
import type {Choice} from '../shared/reportingEndpoint';
import type {PeopleClient} from './PeopleClient';
import {useDebounced} from '../shared/useDebounced';
export function PeoplePicker({label,id,value,onChange,client}:{label:string;id:string;value:string;
  onChange:(value:string)=>void;client:PeopleClient}) {
  const [search,setSearch]=useState(''),debounced=useDebounced(search);
  const [items,setItems]=useState<Choice[]>([]),[offset,setOffset]=useState(0),[next,setNext]=useState<number|null>(null);
  const [message,setMessage]=useState(''),[loading,setLoading]=useState(false),[selected,setSelected]=useState<Choice>();
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0,width:280});
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),input=useRef<HTMLInputElement>(null);
  function close(){setOpen(false);trigger.current?.focus();}
  useEffect(()=>{
    if(!open)return;
    input.current?.focus();
    const outside=(event:Event)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const dismiss=()=>setOpen(false);
    document.addEventListener('mousedown',outside);
    window.addEventListener('resize',dismiss);
    // The menu is fixed so it can extend beyond the horizontally scrolling table.
    const scroll=(event:Event)=>{if(!root.current?.contains(event.target as Node))dismiss();};
    window.addEventListener('scroll',scroll,true);
    return()=>{document.removeEventListener('mousedown',outside);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',scroll,true);};
  },[open]);
  useEffect(()=>{
    if(!open)return;
    let active=true;
    if(search!==debounced){setLoading(true);return;}
    setLoading(true);setMessage(messages.people.loading);
    client.getPeople(debounced, offset).then(data=>{if(!active)return;setItems(old=>offset===0?data.items:[...old,...data.items]);setNext(data.nextOffset);
      setLoading(false);setMessage(data.items.length?'':messages.people.noMatches);},()=>{if(active){setLoading(false);setMessage(messages.people.loadError);}});
    return()=>{active=false;};
  },[open,search,debounced,offset,client]);
  function choose(item?:Choice){setSelected(item);onChange(item?.id||'');close();}
  const options=selected&&value===selected.id&&!items.some(item=>item.id===value)?[selected,...items]:items;
  return <div ref={root} className="history-person-picker" onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab')setOpen(false);
    if(open&&(event.key==='ArrowDown'||event.key==='ArrowUp')){
      event.preventDefault();
      const nodes=Array.from(root.current!.querySelectorAll<HTMLElement>('[role="option"]'));
      const index=nodes.indexOf(document.activeElement as HTMLElement);
      nodes[(index+(event.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length]?.focus();
    }
  }}>
    <button ref={trigger} id={id} type="button" className="form-control history-person-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={id+'-options'}
      onClick={()=>{
        if(open){setOpen(false);return;}
        const rect=trigger.current!.getBoundingClientRect(),width=Math.min(Math.max(rect.width,300),window.innerWidth-24);
        setPosition({left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:rect.bottom+4,width});setOpen(true);
      }}><span className="history-person-label">{value?(selected?.title||options.find(item=>item.id===value)?.title||value):messages.common.all}</span><span aria-hidden="true">▾</span></button>
    {open&&<div className="history-person-menu" style={{
      '--history-person-left':position.left+'px',
      '--history-person-top':position.top+'px',
      '--history-person-width':position.width+'px',
    }}>
      <input ref={input} className="form-control" type="search" aria-label={messages.people.search(label)} placeholder={messages.people.searchPlaceholder} value={search}
        onInput={e=>{setSearch(e.currentTarget.value);setOffset(0);}}/>
      <div id={id+'-options'} role="listbox" aria-label={label} aria-busy={loading} className="history-person-options">
        <button type="button" role="option" aria-selected={!value} className="btn btn-default history-person-option" onClick={()=>choose()}>{messages.common.all}</button>
        {!loading&&options.map(item=><button key={item.id} type="button" role="option" aria-selected={value===item.id} className="btn btn-default history-person-option history-person-match"
          onClick={()=>choose(item)}>{item.title}{item.description&&<small className="history-person-description">{item.description}</small>}</button>)}
      </div>
      {next!==null&&!loading&&<button type="button" className="btn btn-link" onClick={()=>setOffset(next)}>{messages.people.more}</button>}
      {message&&<small role="status" className="text-muted history-person-status">{message}</small>}
    </div>}
  </div>;
}
