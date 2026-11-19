// SPDX-License-Identifier: CDDL-1.1
import "./history/HistoryApp.css";
import "./peoplePicker/PeoplePicker.css";
import {h,render} from 'preact';
import {HistoryApp} from './history/HistoryApp';
import type {Request} from './shared/reportingEndpoint';

// The legacy host owns the container. Preact renders only inside that node.
export function mount(element:HTMLElement,request:Request,myTasks=false) {
  render(h(HistoryApp,{request,myTasks}),element);
  return ()=>render(null,element);
}
