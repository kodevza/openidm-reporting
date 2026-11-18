// SPDX-License-Identifier: CDDL-1.1
import {createRoot} from 'react-dom/client';
import {HistoryApp} from './HistoryApp';
import {Request} from './types';
export function mount(element:HTMLElement,request:Request) {
  const root=createRoot(element);
  root.render(<HistoryApp request={request}/>);
  return ()=>root.unmount();
}
