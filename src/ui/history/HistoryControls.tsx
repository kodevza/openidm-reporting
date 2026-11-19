// SPDX-License-Identifier: CDDL-1.1
import {messages} from '../locales/en';
import type {Catalog} from './types';
import {columnId as idFor} from './useColumnVisibility';
import type {HistoryTableModel} from './useHistoryTable';

interface ToolbarProps {
  workflows: Catalog['workflows'];
  myTasks: boolean;
  selected: string;
  onSelectWorkflow: (workflow: string) => void;
  showColumns: boolean;
  onToggleColumns: () => void;
  downloading: boolean;
  downloadDisabled: boolean;
  download: () => void;
}

export function HistoryToolbar({
  workflows, myTasks, selected, onSelectWorkflow, showColumns, onToggleColumns,
  downloading, downloadDisabled, download,
}: ToolbarProps) {
  return (
    <div className="row history-toolbar">
      {!myTasks&&<div className="col-sm-6"><label htmlFor="history-workflow">{messages.history.workflow}</label>
        <select id="history-workflow" className="form-control" value={selected} onChange={event => onSelectWorkflow(event.currentTarget.value)}>
          <option value="">{messages.history.selectWorkflow}</option><option value="*">{messages.history.allWorkflows}</option>
          {workflows.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </div>}
      <div className={myTasks?"col-sm-12 text-right history-actions":"col-sm-6 text-right history-actions history-actions-with-workflow"}>
        <button className="btn btn-default" aria-expanded={showColumns} aria-controls="history-columns" onClick={onToggleColumns}>{messages.history.configureColumns}</button>
        <button className="btn btn-primary" disabled={downloadDisabled} onClick={download}>{downloading?messages.csv.downloading:messages.csv.download}</button>
      </div>
    </div>
  );
}

export function ActiveHistoryFilters({columns, model}: {columns: Catalog['columns']; model: HistoryTableModel}) {
  const {columnFilters, visibility, removeFilter, clearFilters} = model;
  if (columnFilters.length === 0) return null;

  return (
    <div role="group" aria-label={messages.filters.active} className="history-active-filters">
      {columnFilters.map(filter=>{
        const column=columns.find(c=>idFor(c)===filter.id)!;
        return <button className="btn btn-default btn-sm" key={filter.id} aria-label={messages.filters.remove(column.header)} onClick={() => removeFilter(column)}>{messages.filters.chip(column.header, visibility[filter.id]===false)}</button>;
      })}
      <button className="btn btn-link btn-sm" onClick={clearFilters}>{messages.filters.clear}</button>
    </div>
  );
}

export function HistoryColumnChoices({model}: {model: HistoryTableModel}) {
  const {table, resetVisibility} = model;
  return (
    <fieldset id="history-columns" className="well"><legend>{messages.history.visibleColumns}</legend>
      {table.getAllLeafColumns().map(column=><label className="checkbox-inline history-column-choice" key={column.id}>
        <input type="checkbox" checked={column.getIsVisible()} onChange={e=>column.toggleVisibility(e.currentTarget.checked)}/>{String(column.columnDef.header)}
      </label>)}
      <button className="btn btn-link" onClick={resetVisibility}>{messages.history.resetColumns}</button>
    </fieldset>
  );
}

export function HistoryPagination({model}: {model: HistoryTableModel}) {
  const {table, loading, invalidRange, following, selected, refreshPage} = model;
  return (
    <div className="btn-toolbar history-pagination" role="group" aria-label={messages.history.pagination}>
      <button className="btn btn-default" disabled={loading||!table.getCanPreviousPage()||!!invalidRange} onClick={()=>table.previousPage()}>{messages.history.previous}</button>
      <button className="btn btn-default" disabled={loading||!following||!table.getCanNextPage()||!!invalidRange} onClick={()=>table.nextPage()}>{messages.history.next}</button>
      <button className="btn btn-default" disabled={loading||!selected||!!invalidRange} onClick={refreshPage}>{messages.common.refresh}</button>
    </div>
  );
}
