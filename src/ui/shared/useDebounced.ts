// SPDX-License-Identifier: CDDL-1.1
import {useEffect,useState} from 'preact/hooks';
export function useDebounced<T>(value:T,delay=350) {
  const [debounced,setDebounced]=useState(value);
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(value),delay);return()=>clearTimeout(timer);},[value,delay]);
  return debounced;
}
